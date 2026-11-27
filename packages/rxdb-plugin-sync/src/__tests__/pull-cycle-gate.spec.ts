/**
 * @fileoverview `pull()` 挡下拉取补不齐的外键环与它的下游（US-038 AC#17）
 *
 * @remarks
 * 环上有按条件（`SyncType.Filter`）或按授权分区同步的成员时，这些仓库逐仓、逐区拉取，凑不进同一个本地事务。
 * `pull()` 把整个环与依赖它的下游排除出这一轮的批量、分区与条件拉取，环上每个成员记一条 `pull-unsupported-member`，
 * 下游记依赖失败；环外的仓库照常拉。批量拉取与单仓拉取都是替身，这里只看 `pull()` 交给它们的范围与汇总的失败。
 * 真实 PGlite 上的端到端在 `rxdb-adapter-pglite` 的 `fk-cycle-push.spec.ts`（AC#17）。
 */
import {
  createEntitySyncResolver,
  Entity,
  EntityBase,
  type EntityMetadata,
  getEntityMetadata,
  type PullResult,
  RelationKind,
  RxDBDependencyFailedError,
  type SyncFailure,
  type SyncOptions,
  SyncType
} from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBForeignKeyCycleError } from '../foreign-key-cycle-error.js';
import { pullBatch } from '../pull-batch.js';
import { pullRepository } from '../pull-repository.js';
import { pull } from '../pull.js';
import type { SyncManager } from '../SyncManager.js';

vi.mock('../pull-batch.js', () => ({ pullBatch: vi.fn() }));
vi.mock('../pull-repository.js', () => ({ pullRepository: vi.fn() }));

/** 同步关着的仓库键：同步记录在本地库里，替身按这个集合回答，原因与核心的 `pullIneligibility` 同口径 */
const disabledRepositories = vi.hoisted(() => new Set<string>());
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  resolvePullIneligibility: vi.fn(async (_rxdb: unknown, namespace: string, entity: string, syncType: string) => {
    if (syncType === 'none' || syncType === 'local') return `syncType ${syncType} does not pull`;
    return disabledRepositories.has(`${namespace}:${entity}`) ?
        'sync is disabled (RxDBSync.enabled = false)'
      : undefined;
  })
}));

// 双向一对一：GateUser.card 可空 ↔ GateCard.owner 非空（与 shop 的 User.idCard ↔ IdCard.owner 同形）
@Entity({
  name: 'GateUser',
  namespace: 'gate',
  relations: [
    { name: 'card', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'GateCard', mappedProperty: 'owner', nullable: true }
  ]
})
class GateUser extends EntityBase {}

@Entity({
  name: 'GateCard',
  namespace: 'gate',
  relations: [{ name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'GateUser', mappedProperty: 'card' }]
})
class GateCard extends EntityBase {}

/** 环的下游：引用证件 */
@Entity({
  name: 'GateStamp',
  namespace: 'gate',
  relations: [{ name: 'card', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'GateCard', mappedProperty: 'stamps' }]
})
class GateStamp extends EntityBase {}

/** 与环无关 */
@Entity({ name: 'GateNote', namespace: 'gate' })
class GateNote extends EntityBase {}

const FULL: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };
const NONE: SyncOptions = { type: SyncType.None, local: { adapter: 'local' } };
const FILTER: SyncOptions = {
  type: SyncType.Filter,
  local: { adapter: 'local' },
  remote: { adapter: 'remote', filter: () => ({ combinator: 'and', rules: [] }) }
};

const emptyPull = (): PullResult => ({
  pulled: 0,
  compacted: 0,
  applied: 0,
  hasMore: false,
  conflictsResolved: 0,
  conflictsDeferred: 0,
  failures: [],
  persistedProgress: true,
  historyInvalidated: false
});

/**
 * 同步管理器替身
 *
 * @param overrides - 实例级覆盖（实体 → 同步配置）
 * @param bucketed - 远端登记为分区的仓库键；不传时远端不支持按区同步
 */
const syncManagerOf = (overrides: Map<EntityMetadata, SyncOptions> = new Map(), bucketed?: string[]) => {
  const remote =
    bucketed ?
      {
        getEntitySyncInfo: vi.fn(async (namespace: string, entity: string) => ({
          bucketed: bucketed.includes(`${namespace}:${entity}`)
        }))
      }
    : {};
  return {
    rxdb: {
      config: { entities: [GateCard, GateUser, GateStamp, GateNote], sync: FULL },
      entitySync: createEntitySyncResolver(FULL, overrides),
      dispatchEvent: vi.fn()
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remote }))
  } as unknown as SyncManager;
};

/** 失败归成（实体，原因）：环上的报 `pull-unsupported-member`，下游报依赖的那个成员 */
const describeFailures = (failures: readonly SyncFailure[]) =>
  failures.map(failure => {
    const error = failure.error;
    if (error instanceof RxDBForeignKeyCycleError) return [failure.repository?.entity, error.reason];
    if (error instanceof RxDBDependencyFailedError)
      return [failure.repository?.entity, `depends on ${error.dependency.entity}`];
    return [failure.repository?.entity, String(error)];
  });

const excludedOf = () => vi.mocked(pullBatch).mock.calls[0][1]?.excludedRepositories;

describe('pull() 挡下拉取补不齐的外键环（US-038）', () => {
  beforeEach(() => {
    vi.mocked(pullBatch)
      .mockReset()
      .mockImplementation(async () => emptyPull());
    vi.mocked(pullRepository).mockReset();
    disabledRepositories.clear();
  });

  it('AC#17：环上有按条件同步的成员：整个环与下游这一轮不拉，各记一条失败；环外的仓库照常进批量拉取', async () => {
    const sm = syncManagerOf(new Map([[getEntityMetadata(GateUser), FILTER]]));

    const result = await pull(sm);

    expect(describeFailures(result.failures)).toEqual([
      ['GateUser', 'pull-unsupported-member'],
      ['GateCard', 'pull-unsupported-member'],
      ['GateStamp', 'depends on GateUser']
    ]);
    expect(excludedOf()).toEqual(new Set(['gate:GateUser', 'gate:GateCard', 'gate:GateStamp']));
    // 按条件同步的成员也不单独补拉
    expect(pullRepository).not.toHaveBeenCalled();
  });

  it('环上有按授权分区同步的成员：同样整个环不拉，失败指出是哪个成员；分区成员也不逐区拉', async () => {
    const sm = syncManagerOf(new Map(), ['gate:GateCard']);

    const result = await pull(sm);

    expect(describeFailures(result.failures)).toEqual([
      ['GateUser', 'pull-unsupported-member'],
      ['GateCard', 'pull-unsupported-member'],
      ['GateStamp', 'depends on GateCard']
    ]);
    expect(String(result.failures[0].error)).toContain('gate:GateCard is synced by filter or by bucket');
    expect(excludedOf()).toEqual(new Set(['gate:GateUser', 'gate:GateCard', 'gate:GateStamp']));
    expect(pullRepository).not.toHaveBeenCalled();
  });

  // 分支深度评审 #3：批量拉取只写能拉且同步开着的仓库。环上有别的成员时，续拉补进来的引用在提交时撞外键、整批回滚，
  // 下一次拉取重演同一序列，永远拉不下来，报的还是裸外键错误
  it('环上有只存本地（不能拉取）的成员：整个环与下游这一轮不拉，失败说明这个成员不拉进本地', async () => {
    const sm = syncManagerOf(new Map([[getEntityMetadata(GateUser), NONE]]));

    const result = await pull(sm);

    expect(describeFailures(result.failures)).toEqual([
      ['GateUser', 'pull-unsupported-member'],
      ['GateCard', 'pull-unsupported-member'],
      ['GateStamp', 'depends on GateUser']
    ]);
    expect(String(result.failures[0].error)).toContain(
      'gate:GateUser is not pulled into the local database: syncType local does not pull'
    );
    expect(excludedOf()).toEqual(new Set(['gate:GateUser', 'gate:GateCard', 'gate:GateStamp']));
  });

  it('环上有同步关着的成员：同样整个环与下游不拉，失败说明同步关着', async () => {
    disabledRepositories.add('gate:GateCard');

    const result = await pull(syncManagerOf());

    expect(describeFailures(result.failures)).toEqual([
      ['GateUser', 'pull-unsupported-member'],
      ['GateCard', 'pull-unsupported-member'],
      ['GateStamp', 'depends on GateCard']
    ]);
    expect(String(result.failures[0].error)).toContain(
      'gate:GateCard is not pulled into the local database: sync is disabled (RxDBSync.enabled = false)'
    );
    expect(excludedOf()).toEqual(new Set(['gate:GateUser', 'gate:GateCard', 'gate:GateStamp']));
  });

  it('环上的成员都是整仓同步：什么都不挡，环在批量拉取里一起拉', async () => {
    const result = await pull(syncManagerOf());

    expect(result.failures).toEqual([]);
    expect(excludedOf()).toEqual(new Set());
  });
});
