/**
 * @fileoverview 同步插件对核心 {@link BranchMaterializationSource} 契约的实现
 *
 * `syncBranches()` 只把远端分支的**元数据**拉到本地（`local: false, remote: true`），一条变更都不带。
 * 工作树插件把这样的分支判成 metadata-only，第一次切过去之前要先按本来源交出的分页快照物化。
 * 本文件回答四件事：远端「到哪为止」（冻结水位）、「哪些表」（冻结 scope）、「怎么分页续拉」
 * （游标写在 payload 里）、「屏障里怎么落」（投影 + 结算水位）。
 *
 * 口径与 {@link pullSingleRepository} 对齐——同一套仓库枚举、同一条祖先链、同一份行级 filter。
 * 物化出来的数据与「先切过去再 pull」必须是同一份，否则切换之后第一次 pull 会把差异当成新变更。
 */

import {
  type BranchMaterializationBarrierContext,
  type BranchMaterializationIntent,
  branchMaterializationPageFingerprint,
  type BranchMaterializationPagePayload,
  type BranchMaterializationPageRequest,
  type BranchMaterializationProjectionContext,
  type BranchMaterializationSource,
  canonicalMaterializationJson,
  compactChanges,
  type EntityMetadata,
  type EntityStaticType,
  getEntityMetadata,
  getOrCreateSyncRecord,
  getSyncCapability,
  getSyncType,
  isRepositorySyncEnabled,
  type RemoteChange,
  repositoryKey,
  type RuleGroup,
  RxDB,
  type RxDBAdapterRemoteBase,
  RxDBBranch,
  RxDBError,
  RxDBSync,
  type SwitchVersionActions,
  type TransactionExecutor
} from '@aiao/rxdb';
import type { SyncManager } from './SyncManager.js';
import { ancestorBranchIdsFrom, type BranchLineageReader } from './branch-utils.js';
import { buildDependencyGraph } from './dependency-graph.js';
import { pullAncestorBranchChanges } from './pull-ancestor-changes.js';
import { resolveCascadeFilter } from './pull-repository.js';
import { topologicalSortForPull } from './topological-sort.js';

/** 每页最多向远端要多少条；与 `pullRepository` 的默认批量同值 */
const MATERIALIZATION_PAGE_LIMIT = 1000;

/** 读同步水位记录所需的最小仓库能力；本地仓库与事务执行器给出的仓库都接得住 */
interface SyncRecordReader {
  /**
   * 按条件查同步记录
   *
   * @param options - 查询选项
   * @returns 命中的记录
   */
  find(options: EntityStaticType<typeof RxDBSync, 'findOptions'>): Promise<RxDBSync[]>;
}

/** 算本地 scope 要读的两张系统表 */
interface ScopeReaders {
  /** 分支表：算血缘 */
  readonly branchRepository: BranchLineageReader;

  /** 同步水位表：判 `enabled` */
  readonly syncRepository: SyncRecordReader;
}

/** 本地此刻认定的物化范围：拉哪些表、沿哪条祖先链、每张表带什么行级条件 */
interface LocalScope {
  /** 目标分支及其全部祖先，与 {@link getAncestorBranchIds} 同一口径 */
  readonly lineage: string[];

  /** 按拉取拓扑序排好的仓库键 */
  readonly syncScope: string[];

  /** 每张表的行级条件；`null` 表示不带条件 */
  readonly filters: Record<string, RuleGroup | null>;
}

/** 冻结在 staging 行上的水位；`frozenRemoteWatermark` 的实际形状 */
interface FrozenWatermark {
  /** 冻结时的血缘 */
  readonly lineage: string[];

  /** 每张表的远端截止 id：只物化 `id <= cutoff` 的变更 */
  readonly cutoffs: Record<string, number>;

  /** 冻结时每张表的行级条件 */
  readonly filters: Record<string, RuleGroup | null>;
}

/** 冻结意图解出来的完整形状 */
interface FrozenIntent extends FrozenWatermark {
  /** 冻结时的仓库键，顺序即拉取顺序 */
  readonly syncScope: readonly string[];
}

/**
 * 一页的 payload：既是要投影的变更，也是续拉游标。
 *
 * @remarks
 * 游标写在 payload 里而不是按页号推算：页号说不出「拉到了哪」，而同一张表可能占好几页、
 * 被 cutoff 截掉的那一页又比满页短。续拉时工作树把最后落库的那一页原样交还。
 */
interface MaterializationPage {
  /** 这一页属于哪张表 */
  readonly repository: string;

  /** 这一页请求时用的水位 */
  readonly sinceId: number;

  /** 这一页之后该表的水位；空页时等于 `sinceId` */
  readonly lastId: number;

  /** 这张表拉完了吗；`true` 时下一页换下一张表 */
  readonly done: boolean;

  /** 这一页的远端变更，id 升序，全部 `<= cutoff` */
  readonly changes: RemoteChange[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

/**
 * 从意图里解出冻结值。
 *
 * @throws {@link RxDBError} 形状不是本来源冻结的那一种时
 *
 * @remarks
 * 意图落库之后是 JSON 往返回来的，类型信息早就丢了；在这里验一次形状，下游才敢按字段取。
 * 不对就抛——一份别人冻结的意图没有「差不多能用」的读法。
 */
const readFrozenIntent = (intent: BranchMaterializationIntent): FrozenIntent => {
  const watermark = intent.frozenRemoteWatermark;
  const { lineage, cutoffs, filters } = watermark;
  const wellFormed =
    isStringArray(lineage) &&
    isRecord(cutoffs) &&
    isRecord(filters) &&
    intent.syncScope.every(key => typeof cutoffs[key] === 'number' && key in filters);
  if (!wellFormed) {
    throw new RxDBError(`分支物化意图不是同步插件冻结的形状：${canonicalMaterializationJson(watermark)}`);
  }
  return {
    syncScope: intent.syncScope,
    lineage,
    cutoffs: cutoffs as Record<string, number>,
    filters: filters as Record<string, RuleGroup | null>
  };
};

/**
 * 从一页 payload 里解出游标与变更。
 *
 * @throws {@link RxDBError} 形状不对时
 */
const readPage = (payload: Record<string, unknown>): MaterializationPage => {
  const { repository, sinceId, lastId, done, changes } = payload;
  const wellFormed =
    typeof repository === 'string' &&
    typeof sinceId === 'number' &&
    typeof lastId === 'number' &&
    typeof done === 'boolean' &&
    Array.isArray(changes);
  if (!wellFormed) {
    throw new RxDBError(`分支物化分页不是同步插件交出的形状：${canonicalMaterializationJson(payload)}`);
  }
  // `createdAt` / `updatedAt` 落库往返后是字符串；投影只读 id / 类型 / 补丁，不碰它们。
  return { repository, sinceId, lastId, done, changes: changes as RemoteChange[] };
};

/** 按仓库键找实体元数据；配置里没有这张表时抛 */
const metadataOf = (rxdb: RxDB, key: string): EntityMetadata => {
  for (const EntityClass of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityClass);
    if (repositoryKey({ namespace: metadata.namespace, entity: metadata.name }) === key) return metadata;
  }
  throw new RxDBError(`分支物化范围里的仓库 ${key} 不在当前实体配置里`);
};

/** 按主键读一条同步记录，只读不创建 */
const findSyncRecord = async (reader: SyncRecordReader, syncId: string): Promise<RxDBSync | undefined> =>
  (
    await reader.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: syncId }] },
      limit: 1
    })
  )[0];

/**
 * 算本地此刻认定的物化范围。
 *
 * @param rxdb - 宿主实例
 * @param readers - 事务外传适配器仓库，屏障里传执行器仓库
 * @param targetBranchId - 目标分支
 * @returns 见 {@link LocalScope}
 *
 * @remarks
 * 仓库枚举与 `pullBatch` 同一口径：能力矩阵判 pull、`RxDBSync.enabled` 判开关，顺序取拉取拓扑序。
 * 开关读的是**目标分支**那条记录——物化之后的水位也结算在它上面。
 *
 * 不走 `resolvePullIneligibility`：它读的是绑在适配器上的仓库，屏障里用会死锁。
 */
const readLocalScope = async (rxdb: RxDB, readers: ScopeReaders, targetBranchId: string): Promise<LocalScope> => {
  const lineage = await ancestorBranchIdsFrom(readers.branchRepository, targetBranchId);
  const ordered = topologicalSortForPull(buildDependencyGraph(rxdb.config.entities.map(e => getEntityMetadata(e))));
  const syncScope: string[] = [];
  const filters: Record<string, RuleGroup | null> = {};
  for (const repository of ordered) {
    const key = repositoryKey(repository);
    const metadata = metadataOf(rxdb, key);
    const syncType = getSyncType(metadata, rxdb.entitySync);
    if (!getSyncCapability(syncType).pull) continue;
    const record = await findSyncRecord(readers.syncRepository, `${key}:${targetBranchId}`);
    if (!isRepositorySyncEnabled(record)) continue;
    syncScope.push(key);
    filters[key] = resolveCascadeFilter(key, metadata, syncType, undefined) ?? null;
  }
  return { lineage, syncScope, filters };
};

/** 执行器上的两张系统表 */
const executorReaders = (executor: TransactionExecutor): ScopeReaders => ({
  branchRepository: executor.getRepository(RxDBBranch),
  syncRepository: executor.getRepository(RxDBSync)
});

/**
 * 取远端适配器。
 *
 * @throws {@link RxDBError} 没配远端时——`remoteAdapter$` 在那种库上永远不发值，等下去就是挂死
 */
const remoteAdapterOf = async (sm: SyncManager): Promise<RxDBAdapterRemoteBase> => {
  if (!sm.rxdb.config.sync?.remote?.adapter) throw new RxDBError('Remote adapter not configured.');
  const { adapter } = await sm.getRemoteRepositories();
  return adapter;
};

/**
 * 冻结一张表的远端截止 id：血缘上每条分支各问一次，取最大。
 *
 * @remarks
 * `getChangeCount` 不带行级条件，截止 id 可能落在一条被 filter 掉的变更上——
 * 截止 id 只用来划「到哪为止」，落在哪条上都不影响取到的集合。
 */
const freezeCutoff = async (
  remote: RxDBAdapterRemoteBase,
  key: string,
  lineage: readonly string[]
): Promise<number> => {
  const counts = await Promise.all(lineage.map(branchId => remote.getChangeCount(0, [key], branchId)));
  return Math.max(0, ...counts.map(count => count.latestChangeId));
};

/** 续拉起点：第几张表、从哪个水位接 */
interface ResumePoint {
  readonly index: number;
  readonly sinceId: number;
}

/**
 * 从最后落库的那一页推出续拉起点。
 *
 * @throws {@link RxDBError} 那一页的表不在冻结范围里时——staging 与意图对不上，接不下去
 */
const resumePointOf = (
  intent: FrozenIntent,
  previous: BranchMaterializationPageRequest['previousPage']
): ResumePoint => {
  if (!previous) return { index: 0, sinceId: 0 };
  const page = readPage(previous.payload);
  const index = intent.syncScope.indexOf(page.repository);
  if (index < 0) throw new RxDBError(`续拉游标指向的仓库 ${page.repository} 不在冻结范围里`);
  return page.done ? { index: index + 1, sinceId: 0 } : { index, sinceId: page.lastId };
};

/**
 * 向远端要一页：同一个水位对整条血缘各拉一次，合并排序后截到 cutoff。
 *
 * @remarks
 * 空页也照交：它把「这张表拉完了」落进 staging，续拉时不必再为同一张表白跑一趟。
 */
const pullPage = async (
  rxdb: RxDB,
  remote: RxDBAdapterRemoteBase,
  intent: FrozenIntent,
  key: string,
  sinceId: number
): Promise<BranchMaterializationPagePayload> => {
  const metadata = metadataOf(rxdb, key);
  const cutoff = intent.cutoffs[key];
  const pulled = await pullAncestorBranchChanges(
    remote,
    {
      namespace: metadata.namespace,
      entity: metadata.name,
      sinceId,
      limit: MATERIALIZATION_PAGE_LIMIT,
      filter: intent.filters[key] ?? undefined
    },
    intent.lineage
  );
  const changes = pulled.filter(change => change.id <= cutoff);
  const lastId = changes.at(-1)?.id ?? sinceId;
  const done = pulled.length < MATERIALIZATION_PAGE_LIMIT || changes.length < pulled.length || lastId >= cutoff;
  const payload = { repository: key, sinceId, lastId, done, changes: changes.map(toPageChange) };
  return { payload, fingerprint: branchMaterializationPageFingerprint(payload) };
};

/** 只留投影与诊断要用的字段；`clientId` / `transactionId` 之类不进 staging */
const toPageChange = (change: RemoteChange): RemoteChange => ({
  id: change.id,
  namespace: change.namespace,
  entity: change.entity,
  entityId: change.entityId,
  branchId: change.branchId,
  type: change.type,
  patch: change.patch ?? null,
  inversePatch: change.inversePatch ?? null,
  createdAt: change.createdAt,
  updatedAt: change.updatedAt
});

/**
 * 比对冻结值与此刻本地的范围；不一致时给出原因。
 *
 * @remarks
 * 三项各比各的，而不是整体比一次：原因要说得出是哪一项漂了，诊断才有抓手。
 */
const describeDrift = (frozen: FrozenIntent, current: LocalScope): string | undefined => {
  if (canonicalMaterializationJson(frozen.syncScope) !== canonicalMaterializationJson(current.syncScope)) {
    return `同步范围变了：冻结时 ${frozen.syncScope.join(', ')}，现在 ${current.syncScope.join(', ')}`;
  }
  if (canonicalMaterializationJson(frozen.lineage) !== canonicalMaterializationJson(current.lineage)) {
    return `分支血缘变了：冻结时 ${frozen.lineage.join(' → ')}，现在 ${current.lineage.join(' → ')}`;
  }
  const changed = frozen.syncScope.filter(
    key => canonicalMaterializationJson(frozen.filters[key]) !== canonicalMaterializationJson(current.filters[key])
  );
  if (changed.length > 0) return `行级过滤条件变了：${changed.join(', ')}`;
  return undefined;
};

/**
 * 造同步插件的分支物化来源。
 *
 * @param sm - 本纪元的同步管理器
 * @returns 交给 `rxdb.branchMaterializationSource()` 登记的来源
 *
 * @remarks
 * 各成员的调用时机由工作树插件决定，这里只守契约：
 *
 * - `freezeIntent` / `pages` 在任何事务之外跑，可以碰远端；
 * - `resolveIntentDrift` / `projectPage` / `settle` 跑在切换事务里，只用传进来的执行器，
 *   一次远端都不碰——绑在适配器上的仓库在那里会排在那笔事务自己后面，死锁。
 *
 * 投影**不区分**自己推上去的变更与别人的：metadata-only 分支在本地一行数据都没有，
 * `pull` 跳过自己那份的前提（「本地已经有了」）在这里不成立。
 *
 * @internal
 */
export const createSyncBranchMaterializationSource = (sm: SyncManager): BranchMaterializationSource => {
  const rxdb = sm.rxdb;
  return {
    async freezeIntent(targetBranchId: string): Promise<BranchMaterializationIntent> {
      const { adapter } = await sm.getLocalRepositories();
      const scope = await readLocalScope(
        rxdb,
        { branchRepository: adapter.getRepository(RxDBBranch), syncRepository: adapter.getRepository(RxDBSync) },
        targetBranchId
      );
      const remote = await remoteAdapterOf(sm);
      const cutoffs: Record<string, number> = {};
      for (const key of scope.syncScope) cutoffs[key] = await freezeCutoff(remote, key, scope.lineage);
      const frozenRemoteWatermark: FrozenWatermark = { lineage: scope.lineage, cutoffs, filters: scope.filters };
      return { syncScope: scope.syncScope, frozenRemoteWatermark: { ...frozenRemoteWatermark } };
    },

    async *pages(request: BranchMaterializationPageRequest): AsyncIterable<BranchMaterializationPagePayload> {
      const intent = readFrozenIntent(request.intent);
      const start = resumePointOf(intent, request.previousPage);
      const remote = await remoteAdapterOf(sm);
      let sinceId = start.sinceId;
      for (let index = start.index; index < intent.syncScope.length; index++, sinceId = 0) {
        const key = intent.syncScope[index];
        let done = sinceId >= intent.cutoffs[key];
        while (!done) {
          const page = await pullPage(rxdb, remote, intent, key, sinceId);
          yield page;
          done = page.payload['done'] === true;
          sinceId = page.payload['lastId'] as number;
        }
      }
    },

    async resolveIntentDrift(context: BranchMaterializationBarrierContext): Promise<string | undefined> {
      let frozen: FrozenIntent;
      try {
        frozen = readFrozenIntent(context.intent);
      } catch (error) {
        // 形状不对的意图接不下去，唯一的出路是作废重冻；报成漂移正是让工作树这么做。
        return error instanceof Error ? error.message : String(error);
      }
      const current = await readLocalScope(rxdb, executorReaders(context.executor), context.targetBranchId);
      return describeDrift(frozen, current);
    },

    async projectPage(context: BranchMaterializationProjectionContext): Promise<SwitchVersionActions> {
      return compactChanges(readPage(context.page.payload).changes);
    },

    async settle(context: BranchMaterializationBarrierContext): Promise<void> {
      const intent = readFrozenIntent(context.intent);
      const syncRepository = context.executor.getRepository(RxDBSync);
      const now = new Date();
      for (const key of intent.syncScope) {
        const metadata = metadataOf(rxdb, key);
        const record = await getOrCreateSyncRecord(
          syncRepository,
          {
            namespace: metadata.namespace,
            entity: metadata.name,
            branchId: context.targetBranchId,
            syncType: getSyncType(metadata, rxdb.entitySync)
          },
          () => rxdb.entityManager.instantiate(RxDBSync)
        );
        // 水位结算到冻结的截止 id：物化交出的正是 `<= cutoff` 的全部变更，之后的交给普通 pull。
        await syncRepository.update(record, {
          lastPullRemoteChangeId: intent.cutoffs[key],
          lastPulledAt: now,
          updatedAt: now
        });
      }
    }
  };
};
