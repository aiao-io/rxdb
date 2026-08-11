import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncBeginEvent, SyncCompleteEvent, SyncErrorEvent } from '../../rxdb-events.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import type { BulkSyncResult } from '../../version/bulk-sync.js';
import { pullBatch } from '../../version/pull-batch.js';
import type { PullRepositoryResult } from '../../version/pull-repository.js';
import { pull } from '../../version/pull.js';
import { pushBranch } from '../../version/push-branch.js';
import type { PushRepositoryResult } from '../../version/push-repository.js';
import { push } from '../../version/push.js';
import type { SyncRepositoryResult } from '../../version/sync-repository.js';
import type { PullResult } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';

vi.mock('../../version/pull-batch.js', () => ({ pullBatch: vi.fn() }));
vi.mock('../../version/push-branch.js', () => ({ pushBranch: vi.fn() }));

const repository = { namespace: 'public', entity: 'Todo' };

function createPullResult(overrides: Partial<PullRepositoryResult> = {}): PullRepositoryResult {
  return {
    repository,
    pulled: 0,
    compacted: 0,
    applied: 0,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: false,
    historyInvalidated: false,
    failures: [],
    ...overrides
  };
}

function createPushResult(overrides: Partial<PushRepositoryResult> = {}): PushRepositoryResult {
  return {
    repository,
    pushed: 0,
    failed: 0,
    compacted: 0,
    originalCount: 0,
    failures: [],
    ...overrides
  };
}

function createSyncResult(
  pullResult: PullRepositoryResult = createPullResult(),
  pushResult: PushRepositoryResult = createPushResult()
): SyncRepositoryResult {
  return {
    pullResult,
    pushResult,
    persistedProgress: pullResult.persistedProgress,
    historyInvalidated: pullResult.historyInvalidated
  };
}

function createHarness(adapter?: string) {
  const dispatchEvent = vi.fn();
  const rxdb = {
    config: { sync: { remote: { adapter } } },
    dispatchEvent
  } as unknown as RxDB;
  const bulkSync = vi.fn();
  const vm = { rxdb, bulkSync } as unknown as VersionManager;
  return { bulkSync, dispatchEvent, vm };
}

function createBulkResult(results: BulkSyncResult['results']): BulkSyncResult {
  return {
    succeeded: results.filter(result => result.success).length,
    failed: results.filter(result => !result.success).length,
    results,
    durationMs: 1
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pushBranch).mockResolvedValue({ synced: 0, skipped: [] });
});

describe('sync entrypoints coverage', () => {
  it('rejects pull and push before dispatch when no remote adapter is configured', async () => {
    const { dispatchEvent, vm } = createHarness();

    await expect(pull(vm)).rejects.toThrow('Remote adapter not configured.');
    await expect(push(vm)).rejects.toThrow('Remote adapter not configured.');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('uses pullBatch without a repository filter and dispatches begin and complete events', async () => {
    const { dispatchEvent, vm } = createHarness('remote');
    const result: PullResult = {
      pulled: 4,
      compacted: 1,
      applied: 3,
      hasMore: true,
      conflictsResolved: 2,
      conflictsDeferred: 1,
      persistedProgress: true,
      historyInvalidated: true,
      failures: []
    };
    vi.mocked(pullBatch).mockResolvedValue(result);

    await expect(pull(vm, { limit: 25, fetchAll: true })).resolves.toEqual(result);
    expect(pullBatch).toHaveBeenCalledWith(vm, { limit: 25, fetchAll: true });
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(SyncBeginEvent);
    expect(dispatchEvent.mock.calls[1]?.[0]).toBeInstanceOf(SyncCompleteEvent);
  });

  // RXD-031 B：失败仓库此前被静默跳过，聚合结果仍当作成功返回；
  // 现在必须抛出携带已应用进度的 RxDBPartialSyncError（success 但缺 result 的稀疏项仍照常忽略）
  it('aggregates pull results but surfaces a failed repository as RxDBPartialSyncError carrying accumulated progress', async () => {
    const { bulkSync, vm } = createHarness('remote');
    const repoError = new Error('failed');
    bulkSync.mockResolvedValue(
      createBulkResult([
        {
          repository,
          success: true,
          result: createSyncResult(
            createPullResult({
              pulled: 8,
              compacted: 2,
              applied: 6,
              hasMore: true,
              conflictsResolved: 3,
              conflictsDeferred: 1,
              persistedProgress: true,
              historyInvalidated: true
            })
          )
        },
        { repository, success: true, result: createSyncResult() },
        { repository, success: false, error: repoError },
        { repository, success: true }
      ])
    );

    const thrown: unknown = await pull(vm, { repositoryFilter: ['Todo'] }).catch(error => error);

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect((thrown as RxDBPartialSyncError).cause).toBe(repoError);
    expect((thrown as RxDBPartialSyncError<PullResult>).result).toEqual({
      pulled: 8,
      compacted: 2,
      applied: 6,
      hasMore: true,
      conflictsResolved: 3,
      conflictsDeferred: 1,
      persistedProgress: true,
      historyInvalidated: true,
      failures: [{ repository, error: repoError }]
    });
  });

  it('dispatches a pull error event and preserves the original rejection', async () => {
    const { dispatchEvent, vm } = createHarness('remote');
    const error = new Error('pull failed');
    vi.mocked(pullBatch).mockRejectedValue(error);

    await expect(pull(vm)).rejects.toBe(error);
    expect(dispatchEvent.mock.calls[1]?.[0]).toBeInstanceOf(SyncErrorEvent);
  });

  it('aggregates push results, applies batch size, and counts failed repositories', async () => {
    const { bulkSync, dispatchEvent, vm } = createHarness('remote');
    const sparseResult = {
      pullResult: createPullResult(),
      pushResult: { repository }
    } as unknown as SyncRepositoryResult;
    bulkSync.mockResolvedValue(
      createBulkResult([
        {
          repository,
          success: true,
          result: createSyncResult(
            undefined,
            createPushResult({ pushed: 7, failed: 2, compacted: 3, originalCount: 12 })
          )
        },
        { repository, success: true, result: sparseResult },
        { repository, success: false, error: new Error('failed') },
        { repository, success: true }
      ])
    );

    await expect(push(vm, { batchSize: 50 })).resolves.toEqual({
      pushed: 7,
      failed: 4,
      compacted: 3,
      originalCount: 12
    });
    expect(pushBranch).toHaveBeenCalledWith(vm);
    expect(bulkSync).toHaveBeenCalledWith({ operation: 'push', repositories: undefined, push: { batchSize: 50 } });
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(SyncBeginEvent);
    expect(dispatchEvent.mock.calls[1]?.[0]).toBeInstanceOf(SyncCompleteEvent);
  });

  it('dispatches a push error event and preserves the original rejection', async () => {
    const { bulkSync, dispatchEvent, vm } = createHarness('remote');
    const error = new Error('push failed');
    vi.mocked(pushBranch).mockRejectedValue(error);

    await expect(push(vm)).rejects.toBe(error);
    expect(bulkSync).not.toHaveBeenCalled();
    expect(dispatchEvent.mock.calls[1]?.[0]).toBeInstanceOf(SyncErrorEvent);
  });
});
