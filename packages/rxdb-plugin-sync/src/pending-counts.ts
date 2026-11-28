/**
 * @fileoverview 一轮数清全部仓库的待拉数（US-236）
 *
 * @remarks
 * 同步状态统计（`getAllRepositorySyncStatus`，实时订阅恢复后的 `refreshPullableCount` 也经它）此前逐个仓库调
 * `checkRepositoryUpdates`：每个仓库各核一次远端身份、各问一次登记信息、各数一次日志，N 个仓库约 3N 次串行往返，
 * 打开一个页面就是上百个请求。这里一轮只核一次远端身份、一次问齐登记信息与可读分区，把要数的拼成探针：
 * 适配器能一次数完（`PendingChangeCountAdapter`）就一次数完，否则逐个探针数，最多同时问 {@link PROBE_CONCURRENCY} 个。
 *
 * 口径与单仓的 `checkRepositoryUpdates` 相同：游标之后、当前分支及其祖先上、不是本库推上去的变更；分区实体按当前
 * 同步规则指纹的进度逐区数，快照没拉完（或还没有进度）的区算 1，表示下一次拉取要先补快照。
 */

import {
  type EntityMetadata,
  getSyncType,
  type IRepository,
  needsPull,
  type RepositoryIdentifier,
  repositoryKey,
  type RxDB,
  type RxDBAdapterRemoteBase,
  RxDBChange,
  type RxDBSync
} from '@aiao/rxdb';
import { getAncestorBranchIds } from './branch-utils.js';
import { batchesOf, countLogOthers, ownRemoteIdsAfter, unlessBucketRevoked } from './check-repository-updates.js';
import { resolveConfiguredFilter } from './pull-repository.js';
import { assertRemoteBackend } from './remote-backend.js';
import { RxDBSyncBucketProgress } from './scoped-sync.entity.js';
import {
  entitySyncInfosOf,
  filterFingerprint,
  type PendingChangeProbe,
  pendingCountAdapterOf,
  type ScopedStatusAdapter,
  scopedStatusAdapterOf
} from './scoped-sync.js';

/** 适配器不能一次数完时，逐个探针最多同时问几个 */
const PROBE_CONCURRENCY = 4;

/** 一轮统计共用的、只问一次的东西 */
interface PendingRound {
  readonly rxdb: RxDB;
  readonly branchId: string;
  /** 当前分支及其祖先：与拉取同口径 */
  readonly branchIds: readonly string[];
  /** 本地全部同步记录（核对远端身份时一并读出） */
  readonly records: readonly RxDBSync[];
  readonly changes: IRepository<typeof RxDBChange>;
  /** 远端登记为分区的仓库键 */
  readonly bucketed: ReadonlySet<string>;
  /** 调用者此刻可读的分区（去重）；没有分区仓库时为空 */
  readonly buckets: readonly string[];
  /** 当前分支上、属于当前远端的分区进度 */
  readonly progresses: readonly RxDBSyncBucketProgress[];
}

/** 一个仓库这一轮要数什么：要问远端的探针，加上不用问就知道的条数 */
interface PendingPlan {
  readonly key: string;
  readonly probes: readonly PendingChangeProbe[];
  readonly known: number;
}

/**
 * 数一批仓库的待拉数
 *
 * @param rxdb - RxDB 实例
 * @param metadatas - 要数的仓库；不能拉取的（`local` / `none`）跳过
 * @returns 仓库键（`namespace:entity`）→ 待拉数，只含能拉取的仓库；没有能拉取的仓库时不碰远端
 * @throws Error 有能拉取的仓库却没配远端适配器
 * @throws {@link RemoteBackendMismatchError} 同步记录绑在别的远端身份上；同时写进 `SyncState.lastError`
 *
 * @remarks
 * 调用方只交接入方的实体：系统表跟随库级配置会被判成能拉取，它们的远端日志永远是空的。
 *
 * @internal
 */
export async function countPendingByRepository(
  rxdb: RxDB,
  metadatas: readonly EntityMetadata[]
): Promise<Map<string, number>> {
  const pullable = metadatas.filter(metadata => needsPull(metadata, rxdb.entitySync));
  if (pullable.length === 0) return new Map();

  const { adapter: remoteAdapter } = await rxdb.syncManager.getRemoteRepositories();
  if (!remoteAdapter) {
    throw new Error('Remote adapter not configured');
  }
  const scoped = scopedStatusAdapterOf(remoteAdapter);
  const round = await openRound(rxdb, scoped, pullable);
  const plans = await Promise.all(pullable.map(metadata => planRepository(round, metadata)));
  const counts = await countProbes(
    remoteAdapter,
    scoped,
    plans.flatMap(plan => plan.probes),
    round.branchIds
  );
  return tally(plans, counts);
}

const repositoryOf = (metadata: EntityMetadata): RepositoryIdentifier => ({
  namespace: metadata.namespace,
  entity: metadata.name
});

/**
 * 读这一轮共用的状态：远端身份核一次，登记信息与可读分区各问一次
 */
async function openRound(
  rxdb: RxDB,
  scoped: ScopedStatusAdapter | undefined,
  pullable: readonly EntityMetadata[]
): Promise<PendingRound> {
  const sm = rxdb.syncManager;
  const branch = await sm.getCurrentBranch();
  const { adapter: localAdapter } = await sm.getLocalRepositories();
  // 游标属于另一个远端时，拿它去数只会数出一个看似可信的 0。状态查询只读，只比对、不绑定
  const { backendId, records } = await assertRemoteBackend(sm);
  const branchIds = await getAncestorBranchIds(sm, branch.id);
  const bucketed = scoped ? await bucketedRepositoriesOf(scoped, pullable) : new Set<string>();
  const buckets = scoped && bucketed.size > 0 ? [...new Set(await scoped.getCallerBuckets())] : [];
  // 只认当前远端的进度：换了远端、旧远端的进度行因为清理被挡还留着时，pull() 认得出它属于别的远端、会从头重拉
  const progresses =
    bucketed.size > 0 ?
      (
        await localAdapter.getRepository(RxDBSyncBucketProgress).find({
          where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branch.id }] }
        })
      ).filter(item => item.remoteBackendId === backendId)
    : [];
  return {
    rxdb,
    branchId: branch.id,
    branchIds,
    records,
    changes: localAdapter.getRepository(RxDBChange),
    bucketed,
    buckets,
    progresses
  };
}

/** 远端登记为分区的仓库键：一次问齐 */
async function bucketedRepositoriesOf(
  scoped: ScopedStatusAdapter,
  pullable: readonly EntityMetadata[]
): Promise<Set<string>> {
  const repositories = pullable.map(repositoryOf);
  const infos = await entitySyncInfosOf(scoped, repositories);
  return new Set(repositories.filter((_, index) => infos[index].bucketed).map(repositoryKey));
}

function planRepository(round: PendingRound, metadata: EntityMetadata): Promise<PendingPlan> {
  const repository = repositoryOf(metadata);
  return round.bucketed.has(repositoryKey(repository)) ?
      planBucketed(round, metadata, repository)
    : planUnbucketed(round, metadata, repository);
}

/** 未分区：游标之后、不是本库推上去的日志 */
async function planUnbucketed(
  round: PendingRound,
  metadata: EntityMetadata,
  repository: RepositoryIdentifier
): Promise<PendingPlan> {
  const syncId = `${repository.namespace}:${repository.entity}:${round.branchId}`;
  const afterId = round.records.find(record => record.id === syncId)?.lastPullRemoteChangeId ?? 0;
  const excludeIds = await ownRemoteIdsAfter(round.rxdb, metadata, round.changes, repository, round.branchIds, afterId);
  return { key: repositoryKey(repository), probes: [{ ...repository, bucket: null, afterId, excludeIds }], known: 0 };
}

/**
 * 分区：每个可读分区按当前同步规则指纹的进度数
 *
 * @remarks
 * 快照没拉完或还没有进度的区不用问远端：下一次拉取要先补快照，各算 1。进度按同步规则指纹分开记，
 * 规则改过、旧指纹的进度还没清（某个区拉失败时会留下）时，只看 pull() 会用的那一份。
 */
async function planBucketed(
  round: PendingRound,
  metadata: EntityMetadata,
  repository: RepositoryIdentifier
): Promise<PendingPlan> {
  const key = repositoryKey(repository);
  const fingerprint = filterFingerprint(
    resolveConfiguredFilter(round.rxdb, metadata, getSyncType(metadata, round.rxdb.entitySync))
  );
  const complete = round.buckets
    .map(bucket =>
      round.progresses.find(
        item =>
          item.namespace === repository.namespace &&
          item.entity === repository.entity &&
          item.bucket === bucket &&
          item.filterFingerprint === fingerprint
      )
    )
    .filter((item): item is RxDBSyncBucketProgress => item?.snapshotComplete === true);
  const known = round.buckets.length - complete.length;
  if (complete.length === 0) return { key, probes: [], known };

  const ownIds = await ownRemoteIdsAfter(
    round.rxdb,
    metadata,
    round.changes,
    repository,
    round.branchIds,
    Math.min(...complete.map(item => item.cursor))
  );
  const probes = complete.map(item => ({
    ...repository,
    bucket: item.bucket,
    afterId: item.cursor,
    excludeIds: ownIds.filter(id => id > item.cursor)
  }));
  return { key, probes, known };
}

/**
 * 数清全部探针：适配器能一次数完就一次数完，否则逐个数，最多同时问 {@link PROBE_CONCURRENCY} 个
 */
async function countProbes(
  remote: RxDBAdapterRemoteBase,
  scoped: ScopedStatusAdapter | undefined,
  probes: readonly PendingChangeProbe[],
  branchIds: readonly string[]
): Promise<number[]> {
  if (probes.length === 0) return [];
  const batch = pendingCountAdapterOf(remote);
  if (batch) return batch.countPendingChanges(probes, branchIds);
  // 分区探针只在远端支持按区同步时才会有
  return mapConcurrently(probes, PROBE_CONCURRENCY, probe =>
    scoped && probe.bucket !== null ?
      countBucketProbe(scoped, probe, probe.bucket, branchIds)
    : countLogProbe(remote, probe, branchIds)
  );
}

/** 逐个数未分区日志：与单仓的 `checkRepositoryUpdates` 同一个原语，逐分支数再交给 {@link countLogOthers} */
async function countLogProbe(
  remote: RxDBAdapterRemoteBase,
  probe: PendingChangeProbe,
  branchIds: readonly string[]
): Promise<number> {
  const perBranch = await Promise.all(
    branchIds.map(branchId => remote.getChangeCount(probe.afterId, [`${probe.namespace}:${probe.entity}`], branchId))
  );
  return countLogOthers(remote, probe, branchIds, perBranch);
}

/**
 * 逐个数一个区：先数游标之后的，再按本库推上去的远端 id 分批数落在这个区的，两次相减（US-233）
 *
 * @remarks
 * 问的时候分区已被撤销、重读可读分区确认它已不在时按 0 算，与单仓的 `checkRepositoryUpdates` 同口径。
 */
async function countBucketProbe(
  scoped: ScopedStatusAdapter,
  probe: PendingChangeProbe,
  bucket: string,
  branchIds: readonly string[]
): Promise<number> {
  const countOthers = async (): Promise<number> => {
    const { namespace, entity, afterId } = probe;
    const total = await scoped.getBucketChangeCount(namespace, entity, bucket, afterId, branchIds);
    let own = 0;
    for (const batch of batchesOf(probe.excludeIds)) {
      own += await scoped.getBucketChangeCount(namespace, entity, bucket, afterId, branchIds, batch);
    }
    return total - own;
  };
  return (await unlessBucketRevoked(countOthers, () => scoped.getCallerBuckets(), bucket)) ?? 0;
}

/** 按并发上限逐个处理，结果与输入同序 */
async function mapConcurrently<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) results[index] = await run(items[index]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** 把探针的条数按仓库加起来，再加上不用问就知道的那部分 */
function tally(plans: readonly PendingPlan[], counts: readonly number[]): Map<string, number> {
  const pending = new Map<string, number>();
  let offset = 0;
  for (const plan of plans) {
    const asked = counts.slice(offset, offset + plan.probes.length);
    offset += plan.probes.length;
    pending.set(
      plan.key,
      asked.reduce((sum, count) => sum + count, plan.known)
    );
  }
  return pending;
}
