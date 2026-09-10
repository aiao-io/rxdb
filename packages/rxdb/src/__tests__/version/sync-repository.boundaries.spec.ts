import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { RepositorySyncBeginEvent, RepositorySyncCompleteEvent, RepositorySyncErrorEvent } from '../../rxdb-events.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBError } from '../../RxDBError.js';
import type { PullRepositoryResult } from '../../version/pull-repository.js';
import type { PushRepositoryResult } from '../../version/push-repository.js';
import { syncRepository } from '../../version/sync-repository.js';
import type { RepositorySyncType } from '../../version/sync-type-utils.js';
import type { VersionManager } from '../../version/VersionManager.js';

type PullRepository = (
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: object
) => Promise<PullRepositoryResult>;
type PushRepository = (
  vm: VersionManager,
  namespace: string,
  entity: string,
  options?: object
) => Promise<PushRepositoryResult>;
type GetSyncType = () => RepositorySyncType;

const mocks = vi.hoisted(() => ({
  pullRepository: vi.fn<PullRepository>(),
  pushRepository: vi.fn<PushRepository>(),
  getSyncType: vi.fn<GetSyncType>()
}));

vi.mock('../../version/pull-repository.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../version/pull-repository.js')>()),
  pullRepository: mocks.pullRepository
}));

// 与上面 pull 同形：只替换 `pushRepository`，其余原样保留。
// 整模块替换会把 `partialPushProgressOf` 一并抹掉，而 sync-repository 靠它拆出
// 推送侧的部分进度 —— 抹掉即导入失败。
vi.mock('../../version/push-repository.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../version/push-repository.js')>()),
  pushRepository: mocks.pushRepository
}));

vi.mock('../../version/sync-type-utils.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../version/sync-type-utils.js')>()),
  getSyncType: mocks.getSyncType
}));

class SyncEntity {}

Object.assign(SyncEntity, {
  [METADATA]: {
    namespace: 'public',
    name: 'SyncEntity'
  }
});

const repository = { namespace: 'public', entity: 'SyncEntity' };
const createPullResult = (): PullRepositoryResult => ({
  repository,
  pulled: 2,
  compacted: 1,
  applied: 1,
  hasMore: false,
  conflictsResolved: 1,
  conflictsDeferred: 0,
  persistedProgress: true,
  historyInvalidated: true,
  failures: []
});
const createPushResult = (): PushRepositoryResult => ({
  repository,
  pushed: 3,
  failed: 0,
  compacted: 2,
  originalCount: 5,
  failures: []
});

const createVersionManager = (entities: EntityType[] = [SyncEntity]) => {
  const dispatchEvent =
    vi.fn<(event: RepositorySyncBeginEvent | RepositorySyncCompleteEvent | RepositorySyncErrorEvent) => void>();
  const vm = {
    rxdb: {
      config: { entities },
      dispatchEvent
    }
  } as unknown as VersionManager;

  return { dispatchEvent, vm };
};

describe('syncRepository runtime boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSyncType.mockReturnValue('full');
    mocks.pullRepository.mockResolvedValue(createPullResult());
    mocks.pushRepository.mockResolvedValue(createPushResult());
  });

  it('rejects an unknown repository and emits the matching error event', async () => {
    const { dispatchEvent, vm } = createVersionManager([]);

    await expect(syncRepository(vm, 'public', 'Missing')).rejects.toThrow('Entity not found: public:Missing');

    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(RepositorySyncBeginEvent);
    const errorEvent = dispatchEvent.mock.calls[1]?.[0];
    expect(errorEvent).toBeInstanceOf(RepositorySyncErrorEvent);
    if (!(errorEvent instanceof RepositorySyncErrorEvent)) throw new RxDBError('Expected repository sync error event');
    expect(errorEvent.error).toBeInstanceOf(RxDBError);
  });

  // 'local' 的定义是「SyncType.None + 只配了 local adapter、没有 remote」——
  // 公开契约把它写成「只在本地」。但 shouldPush 把 'local' 算成可推，
  // 于是私有本地数据会进入推送队列，对外泄露。没有 remote adapter 时推送本就无意义。
  it('never pushes a local-only repository', async () => {
    const { vm } = createVersionManager();
    mocks.getSyncType.mockReturnValue('local');

    const result = await syncRepository(vm, 'public', 'SyncEntity');

    expect(mocks.pushRepository).not.toHaveBeenCalled();
    expect(result.pushResult.pushed).toBe(0);
  });

  it('never pushes a local-only repository even when direction is explicitly push', async () => {
    const { vm } = createVersionManager();
    mocks.getSyncType.mockReturnValue('local');

    const result = await syncRepository(vm, 'public', 'SyncEntity', { direction: 'push' });

    expect(mocks.pushRepository).not.toHaveBeenCalled();
    expect(result.pushResult.pushed).toBe(0);
  });

  it.each(['full', 'filter'] as const)('still pushes %s repositories', async syncType => {
    const { vm } = createVersionManager();
    mocks.getSyncType.mockReturnValue(syncType);

    await syncRepository(vm, 'public', 'SyncEntity');

    expect(mocks.pushRepository).toHaveBeenCalledTimes(1);
  });

  it('rejects repositories whose effective sync type is none', async () => {
    const { dispatchEvent, vm } = createVersionManager();
    mocks.getSyncType.mockReturnValue('none');

    await expect(syncRepository(vm, 'public', 'SyncEntity')).rejects.toThrow("syncType is 'none'");

    expect(mocks.pullRepository).not.toHaveBeenCalled();
    expect(mocks.pushRepository).not.toHaveBeenCalled();
    expect(dispatchEvent.mock.calls[1]?.[0]).toBeInstanceOf(RepositorySyncErrorEvent);
  });

  // 两个子结果在 SyncRepositoryResult 上都是必填，跳过的方向由 emptyPullResult /
  // emptyPushResult 交出零值占位 —— 所以这里断言的是「原样透传 + compacted 取两侧之和」，
  // 而不是从前那种「适配器少给字段就当 0」的兜底。少给字段是类型错误，不该由运行时消化。
  it('runs both directions for full sync and forwards both adapter results verbatim', async () => {
    const { dispatchEvent, vm } = createVersionManager();
    const pullResult = createPullResult();
    const pushResult = createPushResult();
    mocks.pullRepository.mockResolvedValue(pullResult);
    mocks.pushRepository.mockResolvedValue(pushResult);

    const result = await syncRepository(vm, 'public', 'SyncEntity');

    expect(result).toEqual({
      pullResult,
      pushResult,
      // persistedProgress = `pullResult.persistedProgress || pushResult.pushed > 0`
      persistedProgress: true,
      // historyInvalidated 是 pull 侧的纯透传
      historyInvalidated: true
    });
    expect(mocks.pullRepository).toHaveBeenCalledOnce();
    expect(mocks.pushRepository).toHaveBeenCalledOnce();
    const completeEvent = dispatchEvent.mock.calls[1]?.[0];
    expect(completeEvent).toBeInstanceOf(RepositorySyncCompleteEvent);
    if (!(completeEvent instanceof RepositorySyncCompleteEvent)) {
      throw new RxDBError('Expected repository sync complete event');
    }
    expect(completeEvent.result).toEqual({
      pulled: 2,
      pushed: 3,
      // 只有 compacted 是合并量：拉取压缩 1 + 推送压缩 2
      compacted: 3,
      failed: 0,
      conflictsResolved: 1,
      conflictsDeferred: 0
    });
  });

  it('runs both directions for filter sync', async () => {
    const { vm } = createVersionManager();
    mocks.getSyncType.mockReturnValue('filter');

    await syncRepository(vm, 'public', 'SyncEntity', { direction: 'sync' });

    expect(mocks.pullRepository).toHaveBeenCalledOnce();
    expect(mocks.pushRepository).toHaveBeenCalledOnce();
  });
});
