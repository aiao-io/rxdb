/**
 * @packageDocumentation
 * QueryCache 的出站重放 —— 把离线期间攒下的本地改动按 REST 动词推回远端。
 *
 * @remarks
 * 这是 local-first 闭环的后半段。前半段是 `query-cache-primary.ts`：远端不可达时，写经
 * **实体仓储**落本地，触发器随之在 `rxdb_change` 里排出一条正常的出站行。本模块负责把
 * 那批行送回去。
 *
 * **为什么不复用 `pushRepository`**：那条路的提交出口是 `remoteAdapter.mergeChanges()`，
 * 而 QueryCache 的远端契约是纯 REST（`create` / `update` / `delete` / `findByIds` /
 * `fetchMetadata`），根本没有 changelog 端点 —— `RxDBAdapterHttp.mergeChanges()` 直接抛
 * `HttpChangelogUnsupportedError`。能力矩阵里 `querycache` 的 `push` 保持 `false`、
 * `offlineWrite` 取 `true`，正是为了让调度侧能把这两件事分开派发
 * （见 `sync-type-utils.ts` 的 `SYNC_CAPABILITY_MATRIX`）。
 *
 * 共用的是**队列与水位线**：出站行就是触发器已经在写的 `rxdb_change`，水位线就是
 * `RxDBSync.lastPushedChangeId`（`syncType` 的联合类型里本来就有 `'querycache'`）。
 * 不同的只有提交动作。
 */

import { firstValueFrom, type Observable } from 'rxjs';
import type { EntityType } from '../entity/entity.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBChange } from '../system/change.js';
import { RxDBSync } from '../system/sync.js';
import type { RxDBChangeRuleGroup } from '../system/types.js';
import { compactChanges } from '../version/compact-changes.js';
import type { ConflictResolver } from '../version/conflict.js';
import { LWWConflictResolver } from '../version/LWWConflictResolver.js';
import { buildOfflineWriteRepositoryRules } from '../version/pushable-repository-rules.js';
import { getOrCreateSyncRecord } from '../version/sync-record-utils.js';
import { getSyncType, isRepositorySyncEnabled, SYNC_DISABLED_REASON } from '../version/sync-type-utils.js';
import type { SwitchVersionActions, SwitchVersionChange } from '../version/VersionManager.interface.js';
import type { VersionManager } from '../version/VersionManager.js';
import { getRxDBChangeKey } from '../version/VersionManager.utils.js';
import { isNetworkError } from './network-error.js';
import type { QueryCacheRemoteAdapter } from './QueryCacheRepository.js';
import type { IRepository } from './repository.interface.js';

/** 压缩后每条净操作的类型 */
type OutboxKind = 'INSERT' | 'UPDATE' | 'DELETE';

/** 远端写动词，与 {@link QueryCacheRemoteAdapter} 上的可选方法名一一对应 */
type RemoteWriteVerb = 'create' | 'update' | 'delete';

/** 本模块用到的本地适配器切面：系统表仓储 + 两条不入队的裸 SQL 出口 */
interface OutboxLocalAdapter {
  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT;
  upsertMany<T>(entityName: string, data: T[]): Observable<void>;
  deleteByIds(entityName: string, ids: string[]): Observable<void>;
}

/** 一次重放失败 */
export interface QueryCacheOutboxFailure {
  /** 失败的实体 id；整批性失败（例如元数据探测失败）时为 `null` */
  entityId: string | null;
  error: Error;
}

/** 一轮出站重放的结果 */
export interface QueryCacheOutboxResult {
  /** 本轮处理的仓库 */
  repository: { namespace: string; entity: string };
  /** 读到的原始变更行数 */
  originalCount: number;
  /** 被本地压缩抵消掉的原始变更行数 */
  compacted: number;
  /** 真的发出去并成功的净操作数 */
  replayed: number;
  /** LWW 判负、本地改动被丢弃的净操作数 */
  discarded: number;
  /** 远端状态已经满足意图、一个请求都没发的净操作数 */
  noop: number;
  /** 水位线推进到的 change id；本轮没有推进时为 `null` */
  watermark: number | null;
  /**
   * 冲突判定中远端胜出的实体 id —— 也就是离线期间的本地改动被丢掉的那批。
   *
   * @remarks
   * 只收解决器明确判 `KEEP_REMOTE` 的。「远端这行已经不在了」不算冲突：那种情况没有
   * 竞争写可比，本地意图是被收敛掉而不是被判负（见 `MISSING_REMOTE`）。
   */
  conflicts: string[];
  /** 本轮的失败；非空即意味着水位线没有推进 */
  failures: QueryCacheOutboxFailure[];
  /** 整轮被跳过时的原因（例如同步开关被关掉） */
  skipped?: string;
}

/** 压缩后的一条净操作，连同它的原始变更行 */
interface OutboxEntry {
  /** `${namespace}:${entity}:${entityId}`，冲突判定的键 */
  key: string;
  entityId: string;
  kind: OutboxKind;
  action: SwitchVersionChange;
  /**
   * 该实体最后一条原始变更行。
   *
   * @remarks
   * 冲突的本地侧取**最后一条**而非压缩结果：LWW 比的是 `createdAt`，而压缩结果是一个
   * 合成对象、没有时间戳。取最后一条与拉取路径的 `resolveConflictsAndBuildActions` 一致。
   */
  lastChange: RxDBChange;
  /**
   * 该实体**最早**一条原始变更行的 id。
   *
   * @remarks
   * 部分推进水位线时的下界依据：本条净操作没结算掉，它名下最早的那一行就一步都不能被
   * 水位线越过（越过 = 永远查不出来 = 静默丢写）。
   */
  minChangeId: number;
}

/** 一条净操作的处置方式 */
type Disposition =
  | { kind: 'replay'; verb: RemoteWriteVerb }
  | { kind: 'discard'; repair: 'restore' | 'drop' }
  | { kind: 'noop' }
  | { kind: 'unresolved'; resolution: string };

/**
 * 远端已经没有这一行时的处置。
 *
 * @remarks
 * `fetchMetadata` 的契约里只有存活行的 `{ id, updatedAt }`，删除**不带时间戳**，
 * 所以这一格 LWW 无从比较，只能按语义定死：
 *
 * - `INSERT`：远端没有正是预期，照常创建。
 * - `UPDATE`：远端把这行删了。收敛到「两边都没有」，而不是把它重新创建出来 ——
 *   后者会让一次已经生效的删除自己复活，且删它的人永远不会知道。
 * - `DELETE`：意图已经达成，一个请求都不必发。
 */
const MISSING_REMOTE: Readonly<Record<OutboxKind, Disposition>> = {
  INSERT: { kind: 'replay', verb: 'create' },
  UPDATE: { kind: 'discard', repair: 'drop' },
  DELETE: { kind: 'noop' }
};

/**
 * 远端有这一行、且 LWW 判本地胜出时该用的动词。
 *
 * @remarks
 * `INSERT` 落在 `update` 上不是笔误：远端已经有同 id 的行了，再发一次 `create` 只会撞
 * 唯一键。用 `update` 把远端收敛到本地这份状态，才是「本地胜出」的实际含义。
 */
const PRESENT_REMOTE_VERB: Readonly<Record<OutboxKind, RemoteWriteVerb>> = {
  INSERT: 'update',
  UPDATE: 'update',
  DELETE: 'delete'
};

/**
 * 重放相位。
 *
 * @remarks
 * 与 `push-repository.ts` 的 `PUSH_PHASES` 同一个理由：DELETE 必须整体先于
 * INSERT/UPDATE，否则「删掉旧行 + 新建复用同一 id 的行」这种批次会在中途把刚建好的行删掉。
 */
const REPLAY_PHASES: readonly ReadonlySet<OutboxKind>[] = [
  new Set<OutboxKind>(['DELETE']),
  new Set<OutboxKind>(['INSERT', 'UPDATE'])
];

/**
 * 正在进行中的 flush，按 `VersionManager` + 仓库分组。
 *
 * @remarks
 * 恢复连接往往连着来好几个信号（`navigator` 的 `online` 事件、退避探测的第一次成功、
 * 用户手动重试），每个都起一轮 flush 会让同一批变更被并发重放两次 —— 第二轮读到的还是
 * 第一轮尚未推进的水位线。用 `WeakMap` 挂在 `VersionManager` 上，多实例互不串门，
 * 实例回收时这张表跟着走。
 */
const inflight = new WeakMap<VersionManager, Map<string, Promise<QueryCacheOutboxResult>>>();

/**
 * 把某个 QueryCache 仓库积压的离线改动重放回远端。
 *
 * @param vm - 版本管理器，用来取分支、本地/远端适配器与实体配置
 * @param namespace - 实体命名空间
 * @param entity - 实体名
 * @param options - 可选的冲突解决器；默认 {@link LWWConflictResolver}
 * @returns 本轮的重放结果
 * @throws {@link RxDBError} 该仓库不存在，或它的 `syncType` 不是 `'querycache'`
 *
 * @remarks
 * 同一仓库上的并发调用会复用同一个在飞的 Promise（见 {@link inflight}）。
 *
 * **失败即整轮中止、水位线不推进**：REST 没有批级原子性，也没有 per-change 的确认回执。
 * 已经成功发出去的那几条因此会在下一轮被重发 —— 这与 `pushRepository` 在批次中途失败时
 * 的暴露面相同。用一个哨兵值去写 `RxDBChange.remoteId` 能消除重发，但那个字段的语义是
 * 「本地变更对应的远端 changelog 行」，REST 路径根本没有这个 id，写进去会让
 * `pull-conflict-utils` 与待推计数读到一个不存在的引用。
 *
 * @example
 * ```ts
 * const result = await flushQueryCacheOutbox(rxdb.versionManager, 'public', 'Recipe');
 * if (result.failures.length === 0) {
 *   console.log(`replayed ${result.replayed}, watermark → ${result.watermark}`);
 * }
 * ```
 */
export function flushQueryCacheOutbox(
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: { conflictResolver?: ConflictResolver }
): Promise<QueryCacheOutboxResult> {
  const byRepository = inflight.get(vm) ?? new Map<string, Promise<QueryCacheOutboxResult>>();
  inflight.set(vm, byRepository);

  const key = `${namespace}:${entity}`;
  const running = byRepository.get(key);
  if (running) {
    return running;
  }

  const started = runOutboxFlush(vm, namespace, entity, options?.conflictResolver ?? new LWWConflictResolver()).finally(
    () => {
      byRepository.delete(key);
    }
  );
  byRepository.set(key, started);
  return started;
}

/** 一轮的空结果基线 */
const emptyResult = (namespace: string, entity: string): QueryCacheOutboxResult => ({
  repository: { namespace, entity },
  originalCount: 0,
  compacted: 0,
  replayed: 0,
  discarded: 0,
  noop: 0,
  watermark: null,
  conflicts: [],
  failures: []
});

async function runOutboxFlush(
  vm: VersionManager,
  namespace: string,
  entity: string,
  conflictResolver: ConflictResolver
): Promise<QueryCacheOutboxResult> {
  const rxdb = vm.rxdb;
  const syncType = resolveQueryCacheSyncType(vm, namespace, entity);

  const branch = await vm.getCurrentBranch();
  const { adapter } = await vm.getLocalRepositories();
  const localAdapter = adapter as unknown as OutboxLocalAdapter;
  const repoSyncRepo = localAdapter.getRepository(RxDBSync);

  const repoSync = await getOrCreateSyncRecord(repoSyncRepo, { namespace, entity, branchId: branch.id, syncType }, () =>
    rxdb.entityManager.instantiate(RxDBSync)
  );

  if (!isRepositorySyncEnabled(repoSync)) {
    return { ...emptyResult(namespace, entity), skipped: SYNC_DISABLED_REASON };
  }

  const changeRepo = localAdapter.getRepository(RxDBChange);
  const pending = await queryOutboxChanges(changeRepo, namespace, entity, branch.id, repoSync.lastPushedChangeId);
  if (pending.length === 0) {
    return emptyResult(namespace, entity);
  }

  const maxChangeId = pending.reduce((max, change) => (change.id > max ? change.id : max), pending[0].id);
  const entries = buildOutboxEntries(pending);
  const base = { ...emptyResult(namespace, entity), originalCount: pending.length };

  // 整批被本地压缩抵消（本地新建又删掉，远端从没见过）。一个请求都不发，
  // 但水位线必须推进：这些行的 `remoteId` 永远是 null，不推进的话每一轮都会把它们
  // 重新查出来重新压缩，还会被待推计数一直算作「待推」。
  // 不写 `lastPushedAt` —— 没有任何数据真的发出去，那是纯展示字段，不该被伪造。
  if (entries.length === 0) {
    await repoSyncRepo.update(repoSync, { lastPushedChangeId: maxChangeId, updatedAt: new Date() });
    return { ...base, compacted: pending.length, watermark: maxChangeId };
  }

  // 取适配器走 `remoteAdapter$` 而不是 `vm.getRemoteRepositories()`：后者除了给适配器，
  // 还会**急切**地建一对 changelog 仓储（`RxDBBranch` / `RxDBChange`），而这正是 QueryCache
  // 的远端明确不实现的东西 —— `RxDBAdapterHttp.getRepository()` 无条件抛。绕这一道会让
  // 整轮回推在发出第一个请求之前就死掉，本模块开头写明的「不复用 changelog 那条路」
  // 也就名存实亡。
  const remoteAdapter = (await firstValueFrom(rxdb.remoteAdapter$)) as unknown as QueryCacheRemoteAdapter;
  const run: RunState = {
    ...base,
    compacted: pending.length - entries.length,
    restoreIds: [],
    dropIds: [],
    settled: new Set<OutboxEntry>()
  };

  const metadata = await probeRemoteMetadata(remoteAdapter, entity, entries, vm, run);
  if (metadata) {
    await replayPhases(entries, metadata, { vm, entity, remoteAdapter, conflictResolver, run });
  }
  await repairLocalCache(localAdapter, remoteAdapter, entity, run);

  if (run.failures.length > 0) {
    // 整批没推完，但已经结算掉的那一段可以让水位线跟上去。不跟的话，下一轮会把这些
    // 已经推上去的行重新判定一次 —— 那时远端的 `updatedAt` 是我们自己写的，LWW 判本地输，
    // 一次成功的推送就被报成冲突。
    // 不写 `lastPushedAt`：本轮没推完，那是纯展示字段，不该记成一次完整的推送。
    const partial = settledWatermark(entries, run.settled, maxChangeId);
    if (partial <= (repoSync.lastPushedChangeId ?? 0)) return toResult(run);
    await repoSyncRepo.update(repoSync, { lastPushedChangeId: partial, updatedAt: new Date() });
    return { ...toResult(run), watermark: partial };
  }

  await repoSyncRepo.update(repoSync, {
    lastPushedChangeId: maxChangeId,
    lastPushedAt: new Date(),
    updatedAt: new Date()
  });
  return { ...toResult(run), watermark: maxChangeId };
}

/**
 * 累计中的一轮状态：计数 + 待修复的本地缓存 id
 *
 * @remarks
 * 刻意 `Omit` 掉 `conflicts`：那个字段是 `restoreIds` 的对外投影（见 {@link toResult}），
 * 留着会变成同一份事实的第二个可写副本，两边迟早对不上。
 */
interface RunState extends Omit<QueryCacheOutboxResult, 'conflicts'> {
  /** LWW 判负、需要用远端行覆盖本地缓存的 id */
  restoreIds: string[];
  /** 远端已消失、需要从本地缓存清掉的 id */
  dropIds: string[];
  /**
   * 本轮已经结算掉的净操作（重放成功 / 判负丢弃 / 无事可做）。
   *
   * @remarks
   * 失败轮次里靠它算出水位线还能往前挪多少。挪不动的那些必须原样留着 —— 见
   * {@link settledWatermark}。
   */
  settled: Set<OutboxEntry>;
}

/** 把累计状态收敛成对外结果，丢掉只在本轮内部用的修复清单 */
const toResult = (run: RunState): QueryCacheOutboxResult => ({
  repository: run.repository,
  originalCount: run.originalCount,
  compacted: run.compacted,
  replayed: run.replayed,
  discarded: run.discarded,
  noop: run.noop,
  watermark: run.watermark,
  // 判负的那批就是要用远端行覆盖回来的那批：解决器说 KEEP_REMOTE 才会进 restoreIds
  conflicts: run.restoreIds,
  failures: run.failures
});

/**
 * 数一遍所有 QueryCache 仓库在当前分支上还没推回远端的变更行。
 *
 * @param vm - 版本管理器
 * @returns 待重放的变更行数；没有这类仓库时为 0
 *
 * @remarks
 * 口径与 {@link flushQueryCacheOutbox} 的取行条件一致（同分支、未推送、未回滚、
 * 水位线之后），只是一次把所有 `offlineWrite && !push` 的仓库并成一个 OR 组来数，
 * 不必逐仓库往返。
 *
 * 与 `HistoryManager.pushableCount$` **不重叠**：那一侧按 `capability.push` 取仓库，
 * 这一侧取它的补集，因此 {@link SyncStateHub} 把两个数直接相加是安全的。
 */
export async function countQueryCacheOutbox(vm: VersionManager): Promise<number> {
  const branch = await vm.getCurrentBranch();
  const { adapter } = await vm.getLocalRepositories();
  const localAdapter = adapter as unknown as OutboxLocalAdapter;

  const repoSyncs = await localAdapter.getRepository(RxDBSync).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branch.id }] }
  });

  const repoRules = buildOfflineWriteRepositoryRules(vm.rxdb.config.entities, vm.rxdb.config.sync, repoSyncs);
  if (repoRules.length === 0) {
    return 0;
  }

  // 变更行走 `entityManager` 而不是本文件其他地方用的 `localAdapter.getRepository`：
  // 这一条与 `updatePushableCount` 数的是同一批行、用的是同一套 repoRules 类型，
  // 换一个入口就得给规则加一层断言 —— 那是把两个计数口径的同源关系藏进 cast 里。
  return firstValueFrom(
    vm.rxdb.entityManager.getRepository(RxDBChange).count({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: branch.id },
          { field: 'revertChangeId', operator: '=', value: null },
          { field: 'remoteId', operator: '=', value: null },
          { combinator: 'or', rules: repoRules }
        ]
      }
    })
  );
}

/**
 * 确认这个仓库确实走 QueryCache，并返回它的 syncType。
 *
 * @throws {@link RxDBError} 实体未注册，或它的 syncType 不是 `'querycache'`
 *
 * @remarks
 * 拦在最前面而不是让它安静地返回空结果：喂错仓库时，这里的每一步（读 `rxdb_change`、
 * 推进 `RxDBSync` 水位线）都会动到那个仓库**真正的**推送状态 —— 一次 Full 同步仓库的
 * 水位线被 REST 路径推过去，等于把它没推的变更全部标成已推。
 */
function resolveQueryCacheSyncType(vm: VersionManager, namespace: string, entity: string): 'querycache' {
  const EntityType = vm.rxdb.config.entities.find(candidate => {
    const meta = getEntityMetadata(candidate);
    return meta.namespace === namespace && meta.name === entity;
  });
  if (!EntityType) {
    throw new RxDBError(`Entity not found for QueryCache outbox flush: ${namespace}/${entity}`);
  }

  const syncType = getSyncType(getEntityMetadata(EntityType), vm.rxdb.config.sync);
  if (syncType !== 'querycache') {
    throw new RxDBError(
      `flushQueryCacheOutbox only handles syncType 'querycache'; ${namespace}/${entity} is '${syncType}'. ` +
        `Repositories with a changelog endpoint push through versionManager.push().`
    );
  }
  return syncType;
}

/**
 * 查该仓库在当前分支上尚未推送的变更行。
 *
 * @remarks
 * 规则形状与 `push-repository.ts` 的 `queryUnpushedChanges` 一致，只是不追祖先分支 ——
 * QueryCache 没有分支语义（它的远端是 REST 资源，不认 branchId），跨分支收集只会把
 * 别的分支的改动推到同一个远端资源上。
 *
 * 水位线为 `null` 时**不加** `id` 条件：`id > null` 在 SQL 里恒为 NULL，会把整批筛空，
 * 于是「从未推送过」的仓库永远推不出第一批。
 */
async function queryOutboxChanges(
  changeRepo: IRepository<typeof RxDBChange>,
  namespace: string,
  entity: string,
  branchId: string,
  lastPushedChangeId: number | null
): Promise<RxDBChange[]> {
  const rules: RxDBChangeRuleGroup['rules'] = [
    { field: 'namespace', operator: '=', value: namespace },
    { field: 'entity', operator: '=', value: entity },
    { field: 'branchId', operator: '=', value: branchId },
    { field: 'remoteId', operator: '=', value: null },
    { field: 'revertChangeId', operator: '=', value: null }
  ];

  if (lastPushedChangeId !== null) {
    rules.push({ field: 'id', operator: '>', value: lastPushedChangeId });
  }

  return changeRepo.find({
    where: { combinator: 'and', rules },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });
}

/**
 * 把原始变更行压成每个实体一条净操作。
 *
 * @remarks
 * 同一行在离线期间可能被改了很多次，中间态既没人看见过，逐条重放还会把那串往返全部压在
 * 恢复连接的那一瞬间。压缩规则（含「本地新建后删除完全抵消」）复用 `compactChanges`。
 */
function buildOutboxEntries(pending: RxDBChange[]): OutboxEntry[] {
  const changesByKey = new Map<string, RxDBChange[]>();
  for (const change of pending) {
    const key = getRxDBChangeKey(change);
    const group = changesByKey.get(key) ?? [];
    group.push(change);
    changesByKey.set(key, group);
  }

  const actions = compactChanges(pending);
  const entries: OutboxEntry[] = [];

  const collect = (map: SwitchVersionActions['inserts'], kind: OutboxKind): void => {
    for (const [key, action] of map) {
      const group = changesByKey.get(key);
      if (!group?.length) {
        throw new RxDBError(`Missing source changes for compacted QueryCache action: ${key}`);
      }
      const lastChange = group[group.length - 1];
      const minChangeId = group.reduce((min, change) => (change.id < min ? change.id : min), group[0].id);
      entries.push({ key, entityId: String(lastChange.entityId), kind, action, lastChange, minChangeId });
    }
  };

  collect(actions.deletes, 'DELETE');
  collect(actions.updates, 'UPDATE');
  collect(actions.inserts, 'INSERT');

  return entries;
}

/**
 * 元数据探测每次请求最多带多少个 id。
 *
 * @remarks
 * 与 HTTP / supabase 适配器的 `idChunkSize` 同一个数。core 不认识任何具体适配器，
 * 拿不到它们的配置，只能自己持一份同口径的常量。
 *
 * 为什么必须切：离线攒下的待推行没有上限，一次几千个 id 塞进 `id in (...)` 会把请求
 * 撑到网关 413 / URL 长度上限之外。适配器侧只有 `findByIds` 分了块
 * （`findByIdsInChunks`），`fetchMetadata` 分的是**响应**的页，请求里那串 id 原样透传。
 */
const METADATA_PROBE_CHUNK_SIZE = 100;

/** 按固定尺寸切分 id 列表 */
function chunkIds(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * 拉一次涉及实体的远端元数据，作为冲突判定的远端侧。
 *
 * @returns `id → updatedAt` 映射；探测失败时返回 `null`，调用方据此跳过整轮重放
 *
 * @remarks
 * 分块**串行**，首块出错即停 —— 与 `findByIdsInChunks` 同款理由：远端已经出问题时继续
 * 打后面几块只是加压，而结果反正是整轮跳过。半张表也绝不能拿去判冲突：缺席的 id 会被
 * {@link decide} 当成「远端没有这一行」，UPDATE 于是降级成 INSERT，DELETE 直接丢弃。
 */
async function probeRemoteMetadata(
  remoteAdapter: QueryCacheRemoteAdapter,
  entity: string,
  entries: OutboxEntry[],
  vm: VersionManager,
  run: RunState
): Promise<Map<string, string> | null> {
  const ids = entries.map(entry => entry.entityId);
  const found = new Map<string, string>();
  for (const batch of chunkIds(ids, METADATA_PROBE_CHUNK_SIZE)) {
    try {
      const metadata = await firstValueFrom(
        remoteAdapter.fetchMetadata(entity, {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: batch }]
        })
      );
      for (const row of metadata) found.set(row.id, row.updatedAt);
    } catch (error) {
      vm.rxdb.reachability.report(error);
      run.failures.push({ entityId: null, error: error instanceof Error ? error : new Error(String(error)) });
      return null;
    }
  }
  vm.rxdb.reachability.report(null);
  return found;
}

interface ReplayContext {
  vm: VersionManager;
  entity: string;
  remoteAdapter: QueryCacheRemoteAdapter;
  conflictResolver: ConflictResolver;
  run: RunState;
}

/** 按 DELETE → INSERT/UPDATE 的相位顺序判定并重放；任一失败即整轮中止 */
async function replayPhases(
  entries: OutboxEntry[],
  metadata: Map<string, string>,
  context: ReplayContext
): Promise<void> {
  for (const kinds of REPLAY_PHASES) {
    for (const entry of entries.filter(candidate => kinds.has(candidate.kind))) {
      if (context.run.failures.length > 0) return;
      const before = context.run.failures.length;
      await settleEntry(entry, metadata.get(entry.entityId), context);
      // 本条自己没添失败才算结算掉。结算过的净操作绝不能在下一轮再被判定一次：
      // 那时远端的 `updatedAt` 已经是**我们自己**这一次写进去的时刻，LWW 一比就判本地输，
      // 于是一次成功的推送被报成冲突，本地缓存还要被「修复」回远端行。
      if (context.run.failures.length === before) context.run.settled.add(entry);
    }
  }
}

/**
 * 失败轮次里水位线还能推到哪。
 *
 * @param entries - 本轮的全部净操作
 * @param maxChangeId - 本批变更行的最大 id
 * @returns 可安全写回的 `lastPushedChangeId`
 *
 * @remarks
 * 取「最早那条**没结算**的变更行 id 减一」：这个位置之前的行全都已经有了归宿，再查出来
 * 只会被重判一次；这个位置之后的行一条都不能被越过。全部结算完时直接给 `maxChangeId`。
 *
 * 残留的一段：同一批里 A、B 两个实体的变更行交错（A₁ B₁ A₂），B 没结算而 A 结算了，
 * 下界被 B₁ 钉住，A₂ 下一轮照样要重判一次。彻底消掉它需要**逐行**的已推标记，而
 * `RxDBChange.remoteId` 的语义是「这条变更是从远端同步过来的」，不是「这条已经推上去了」，
 * 借用它会污染拉取侧的判据。真正的出路是加一个属于出站的持久标记 —— 那是一次 schema
 * 变更，不在本次修复的范围里。
 */
function settledWatermark(entries: readonly OutboxEntry[], settled: ReadonlySet<OutboxEntry>, maxChangeId: number) {
  let lowestPending: number | undefined;
  for (const entry of entries) {
    if (settled.has(entry)) continue;
    if (lowestPending === undefined || entry.minChangeId < lowestPending) lowestPending = entry.minChangeId;
  }
  return lowestPending === undefined ? maxChangeId : lowestPending - 1;
}

/** 判定单条净操作的去向并执行 */
async function settleEntry(
  entry: OutboxEntry,
  remoteUpdatedAt: string | undefined,
  context: ReplayContext
): Promise<void> {
  const disposition = await decide(entry, remoteUpdatedAt, context.conflictResolver);
  const { run } = context;

  if (disposition.kind === 'noop') {
    run.noop += 1;
    return;
  }

  if (disposition.kind === 'discard') {
    run.discarded += 1;
    (disposition.repair === 'restore' ? run.restoreIds : run.dropIds).push(entry.entityId);
    return;
  }

  if (disposition.kind === 'unresolved') {
    run.failures.push({
      entityId: entry.entityId,
      error: new RxDBError(
        `Unsupported conflict resolution '${disposition.resolution}' during QueryCache outbox replay for ` +
          `${entry.key}. Only KEEP_LOCAL and KEEP_REMOTE can be applied over REST verbs.`
      )
    });
    return;
  }

  await replayEntry(entry, disposition.verb, context);
}

/**
 * 决定一条净操作的去向。
 *
 * @param entry - 压缩后的净操作
 * @param remoteUpdatedAt - 远端该行的 `updatedAt`；远端没有这一行时为 `undefined`
 * @param conflictResolver - 冲突解决器
 *
 * @remarks
 * 远端有这一行就一律过一遍解决器 —— 包括远端更旧的情况。这里不自己先比一次时间戳再决定
 * 要不要问：那会让「谁赢」由两处代码共同决定，自定义解决器只能在本模块已经认定有冲突的
 * 子集上生效。
 */
async function decide(
  entry: OutboxEntry,
  remoteUpdatedAt: string | undefined,
  conflictResolver: ConflictResolver
): Promise<Disposition> {
  if (remoteUpdatedAt === undefined) {
    return MISSING_REMOTE[entry.kind];
  }

  const resolution = await conflictResolver.resolve({
    entityKey: entry.key,
    local: entry.lastChange,
    remote: synthesizeRemoteChange(entry, remoteUpdatedAt)
  });

  if (resolution.type === 'KEEP_LOCAL') {
    return { kind: 'replay', verb: PRESENT_REMOTE_VERB[entry.kind] };
  }
  if (resolution.type === 'KEEP_REMOTE') {
    return { kind: 'discard', repair: 'restore' };
  }
  return { kind: 'unresolved', resolution: resolution.type };
}

/**
 * 用远端元数据合成一条 `IRxDBChange`，充当冲突的远端侧。
 *
 * @remarks
 * `Conflict` 两侧都要 `IRxDBChange`，而 REST 远端只给得出 `{ id, updatedAt }`。
 * `createdAt` 取远端的 `updatedAt` —— 那是远端这行最后一次被写的时刻，正是 LWW 要比的量。
 * `clientId` 留空：REST 不带写方身份，缺它意味着时间戳打平时 LWW 退回本地优先，
 * 这是解决器已文档化的既有约定（`LWWConflictResolver.resolve`）。
 * `id` 取 0：REST 没有远端变更 id，而本模块不走 `markLocalChangesSuperseded`，没人读它。
 */
function synthesizeRemoteChange(entry: OutboxEntry, remoteUpdatedAt: string): RxDBChange {
  const timestamp = new Date(remoteUpdatedAt);
  return {
    id: 0,
    namespace: entry.lastChange.namespace,
    entity: entry.lastChange.entity,
    entityId: entry.lastChange.entityId,
    branchId: entry.lastChange.branchId,
    type: entry.kind,
    patch: null,
    inversePatch: null,
    createdAt: timestamp,
    updatedAt: timestamp
  } as RxDBChange;
}

/** 发一次远端写，并把结果上报给可达性监视器 */
async function replayEntry(entry: OutboxEntry, verb: RemoteWriteVerb, context: ReplayContext): Promise<void> {
  const { entity, remoteAdapter, run, vm } = context;

  const write = remoteWrite(remoteAdapter, entity, entry, verb);
  if (!write) {
    run.failures.push({
      entityId: entry.entityId,
      error: new RxDBError(`Remote adapter does not support ${verb} operation for ${entity}`)
    });
    return;
  }

  try {
    await firstValueFrom(write);
    vm.rxdb.reachability.report(null);
    run.replayed += 1;
  } catch (error) {
    vm.rxdb.reachability.report(error);
    run.failures.push({ entityId: entry.entityId, error: error instanceof Error ? error : new Error(String(error)) });
  }
}

/**
 * 取该动词对应的远端写流。
 *
 * @returns 远端适配器没实现这个动词时返回 `null`
 *
 * @remarks
 * HTTP 适配器的写动词是按 handler 有无条件挂载的，漏配一个就少一个方法。缺动词不是网络
 * 问题，不能按不可达处理 —— 那样这条改动会一直排在队里、每轮重试都注定失败。
 */
function remoteWrite(
  remoteAdapter: QueryCacheRemoteAdapter,
  entity: string,
  entry: OutboxEntry,
  verb: RemoteWriteVerb
): Observable<unknown> | null {
  if (verb === 'delete') {
    return remoteAdapter.delete ? remoteAdapter.delete(entity, [entry.entityId]) : null;
  }
  const patch = entry.action.patch ?? {};
  if (verb === 'create') {
    // `id` 必须现补：触发器建 patch 时明确跳过它（`trigger_sql.ts` 的
    // `if (jsName === 'id') continue`），行的身份记在变更行自己的 `entityId` 列上。
    // 不补就是把一条**没有身份的新行**发给远端，远端只能自己造一个 id ——
    // 本地那份从此对不上远端，成了远端从不认识的孤儿行，下一轮元数据拉取把它当孤儿清掉。
    // 水位线照常推进，用户看着推上去了，其实丢了。
    const body = { id: entry.entityId, ...patch };
    return remoteAdapter.create ? remoteAdapter.create(entity, body) : null;
  }
  return remoteAdapter.update ? remoteAdapter.update(entity, entry.entityId, patch) : null;
}

/**
 * 把 LWW 判负的那些行在本地缓存里对齐远端。
 *
 * @remarks
 * **必须走 `localAdapter` 的裸 SQL 出口**（`upsertMany` / `deleteByIds`，触发器已被
 * `withTriggersDisabled` 抑制），不能走实体仓储。接受远端是「把远端投影抄到本地」，
 * 不是一次用户改动；走实体仓储会让触发器再排一条出站行，下一轮把远端刚赢下的值又覆盖
 * 回去 —— 一个自我供给的循环，而且每绕一圈都以远端的那次改动被丢弃告终。
 *
 * 修复失败不改判定：远端侧已经是权威状态了，这里只是本地投影没跟上，下一次读会同步回来。
 */
async function repairLocalCache(
  localAdapter: OutboxLocalAdapter,
  remoteAdapter: QueryCacheRemoteAdapter,
  entity: string,
  run: RunState
): Promise<void> {
  if (run.restoreIds.length > 0) {
    const rows = await firstValueFrom(remoteAdapter.findByIds(entity, run.restoreIds));
    await firstValueFrom(localAdapter.upsertMany(entity, rows));
  }
  if (run.dropIds.length > 0) {
    await firstValueFrom(localAdapter.deleteByIds(entity, run.dropIds));
  }
}

/** 重导出，方便调用方按同一口径判断 flush 失败是不是网络原因 */
export { isNetworkError };
