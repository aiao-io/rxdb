/**
 * @fileoverview `pull()` 一轮只问一次远端登记信息（US-236）
 *
 * @remarks
 * 此前批量拉取之前逐个仓库并发问一次 `getEntitySyncInfo`（系统表也问），按区与按条件同步的仓库进 `pullRepository`
 * 时又各问一次。现在一轮问一次 `getEntitySyncInfos`、不问系统表，答案交给逐仓拉取。批量拉取与单仓拉取都是替身，
 * 这里只看问了几次、交了什么。
 */
import {
  createEntitySyncResolver,
  Entity,
  EntityBase,
  type EntityMetadata,
  getEntityMetadata,
  type PullRepositoryResult,
  type PullResult,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  type SyncOptions,
  SyncType
} from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pullBatch } from '../pull-batch.js';
import { pullRepository } from '../pull-repository.js';
import { pull } from '../pull.js';
import type { SyncManager } from '../SyncManager.js';

vi.mock('../pull-batch.js', () => ({ pullBatch: vi.fn() }));
vi.mock('../pull-repository.js', () => ({ pullRepository: vi.fn() }));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  // 同步记录还没建：视为开着，与核心的懒创建口径一致
  findCurrentSyncRecord: vi.fn(async () => undefined),
  resolvePullIneligibility: vi.fn(async () => undefined)
}));

/** 整仓同步、不分区：进批量拉取 */
@Entity({ name: 'InfoNote', namespace: 'info' })
class InfoNote extends EntityBase {}

/** 整仓同步、远端登记为分区：批量跳过，逐区拉 */
@Entity({ name: 'InfoShelf', namespace: 'info' })
class InfoShelf extends EntityBase {}

/** 按条件同步、远端登记为分区 */
@Entity({ name: 'InfoCatalog', namespace: 'info' })
class InfoCatalog extends EntityBase {}

/** 按条件同步、不分区 */
@Entity({ name: 'InfoTag', namespace: 'info' })
class InfoTag extends EntityBase {}

const FULL: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };
const FILTER: SyncOptions = {
  type: SyncType.Filter,
  local: { adapter: 'local' },
  remote: { adapter: 'remote', filter: () => ({ combinator: 'and', rules: [] }) }
};
const BUCKETED = new Set(['info:InfoShelf', 'info:InfoCatalog']);

const emptyPull = (): PullResult => ({
  pulled: 0,
  compacted: 0,
  applied: 0,
  hasMore: false,
  conflictsResolved: 0,
  conflictsDeferred: 0,
  failures: [],
  persistedProgress: false,
  historyInvalidated: false
});

const infoOf = (namespace: string, entity: string) => ({
  namespace,
  entity,
  tableName: null,
  bucketed: BUCKETED.has(`${namespace}:${entity}`)
});

/**
 * @param remoteMode - `batch`：能一次问齐；`one-by-one`：只能逐个问；`plain`：不支持按区同步
 */
const syncManagerOf = (remoteMode: 'batch' | 'one-by-one' | 'plain') => {
  const getEntitySyncInfo = vi.fn(async (namespace: string, entity: string) => infoOf(namespace, entity));
  const getEntitySyncInfos = vi.fn(async (entities: readonly { namespace: string; entity: string }[]) =>
    entities.map(({ namespace, entity }) => infoOf(namespace, entity))
  );
  const adapters = {
    batch: { getEntitySyncInfo, getEntitySyncInfos },
    'one-by-one': { getEntitySyncInfo },
    plain: {}
  };
  const overrides = new Map<EntityMetadata, SyncOptions>([
    [getEntityMetadata(InfoCatalog), FILTER],
    [getEntityMetadata(InfoTag), FILTER]
  ]);
  const sm = {
    rxdb: {
      // 系统表不带自己的 `sync`，跟随库级 Full
      config: { entities: [InfoNote, InfoShelf, InfoCatalog, InfoTag, RxDBBranch, RxDBChange, RxDBSync], sync: FULL },
      entitySync: createEntitySyncResolver(FULL, overrides),
      dispatchEvent: vi.fn()
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: adapters[remoteMode] }))
  } as unknown as SyncManager;
  return { sm, getEntitySyncInfo, getEntitySyncInfos };
};

/** `pullRepository` 收到的第五个参数：这一轮问到的登记信息 */
const syncInfoPassedFor = (entity: string) =>
  vi.mocked(pullRepository).mock.calls.find(call => call[2] === entity)?.[4];

describe('pull() 一轮只问一次远端登记信息（US-236）', () => {
  beforeEach(() => {
    vi.mocked(pullBatch)
      .mockReset()
      .mockImplementation(async () => emptyPull());
    vi.mocked(pullRepository)
      .mockReset()
      .mockImplementation(
        async (_sm, namespace, entity) =>
          ({ ...emptyPull(), repository: { namespace, entity }, success: true }) as PullRepositoryResult
      );
  });

  it('远端能一次问齐：只问一次，系统表不问，按条件同步的仓库也在里面', async () => {
    const { sm, getEntitySyncInfo, getEntitySyncInfos } = syncManagerOf('batch');

    await pull(sm);

    expect(getEntitySyncInfos).toHaveBeenCalledOnce();
    expect(getEntitySyncInfos).toHaveBeenCalledWith([
      { namespace: 'info', entity: 'InfoNote' },
      { namespace: 'info', entity: 'InfoShelf' },
      { namespace: 'info', entity: 'InfoCatalog' },
      { namespace: 'info', entity: 'InfoTag' }
    ]);
    expect(getEntitySyncInfo).not.toHaveBeenCalled();
    // 批量拉取跳过的只有整仓同步的分区仓库；按条件同步的本来就不进批量
    expect(vi.mocked(pullBatch).mock.calls[0][1]?.bucketedRepositories).toEqual(new Set(['info:InfoShelf']));
  });

  it('逐仓拉取的仓库带着这一轮的答案进 pullRepository，不再各自重问', async () => {
    const { sm } = syncManagerOf('batch');

    await pull(sm);

    expect(vi.mocked(pullRepository).mock.calls.map(call => call[2])).toEqual(['InfoShelf', 'InfoCatalog', 'InfoTag']);
    expect(syncInfoPassedFor('InfoShelf')).toEqual({ bucketed: true });
    expect(syncInfoPassedFor('InfoCatalog')).toEqual({ bucketed: true });
    expect(syncInfoPassedFor('InfoTag')).toEqual({ bucketed: false });
  });

  it('远端只能逐个问：照样只问能拉取的业务仓库', async () => {
    const { sm, getEntitySyncInfo } = syncManagerOf('one-by-one');

    await pull(sm);

    expect(getEntitySyncInfo.mock.calls.map(call => call[1])).toEqual([
      'InfoNote',
      'InfoShelf',
      'InfoCatalog',
      'InfoTag'
    ]);
    expect(syncInfoPassedFor('InfoCatalog')).toEqual({ bucketed: true });
  });

  it('远端不支持按区同步：一次都不问，逐仓拉取不带答案', async () => {
    const { sm } = syncManagerOf('plain');

    await pull(sm);

    expect(vi.mocked(pullBatch).mock.calls[0][1]?.bucketedRepositories).toEqual(new Set());
    expect(vi.mocked(pullRepository).mock.calls.map(call => call[2])).toEqual(['InfoCatalog', 'InfoTag']);
    expect(syncInfoPassedFor('InfoCatalog')).toBeUndefined();
  });
});
