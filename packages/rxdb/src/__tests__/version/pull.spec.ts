import { describe, expect, it, vi } from 'vitest';
import { SyncCompleteEvent, SyncErrorEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError, RxDBPartialSyncError } from '../../RxDBError.js';
import { pull } from '../../version/pull.js';
import type { PullResult } from '../../version/VersionManager.interface.js';
import { VersionManager } from '../../version/VersionManager.js';

describe('pull', () => {
  it('should handle string repositoryFilter (backward compatibility)', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const mockBulkSync = vi.fn().mockResolvedValue({ results: [] });
    const mockVm = {
      rxdb: mockRxDB,
      bulkSync: mockBulkSync
    } as unknown as VersionManager;

    await pull(mockVm, { repositoryFilter: ['Todo', 'User'] });

    expect(mockBulkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [
          { namespace: 'public', entity: 'Todo' },
          { namespace: 'public', entity: 'User' }
        ]
      })
    );
  });

  it('should handle RepositoryIdentifier repositoryFilter', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const mockBulkSync = vi.fn().mockResolvedValue({ results: [] });
    const mockVm = {
      rxdb: mockRxDB,
      bulkSync: mockBulkSync
    } as unknown as VersionManager;

    await pull(mockVm, {
      repositoryFilter: [
        { namespace: 'custom', entity: 'Settings' },
        { namespace: 'public', entity: 'Post' }
      ]
    });

    expect(mockBulkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [
          { namespace: 'custom', entity: 'Settings' },
          { namespace: 'public', entity: 'Post' }
        ]
      })
    );
  });

  it('should handle mixed repositoryFilter', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const mockBulkSync = vi.fn().mockResolvedValue({ results: [] });
    const mockVm = {
      rxdb: mockRxDB,
      bulkSync: mockBulkSync
    } as unknown as VersionManager;

    await pull(mockVm, {
      repositoryFilter: ['Todo', { namespace: 'custom', entity: 'Settings' }]
    });

    expect(mockBulkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [
          { namespace: 'public', entity: 'Todo' },
          { namespace: 'custom', entity: 'Settings' }
        ]
      })
    );
  });

  // RXD-031 A：指定 repositoryFilter 时降级走 bulkSync，此前 limit/fetchAll 没有一起传下去
  it('passes limit/fetchAll through to bulkSync when repositoryFilter is set', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const mockBulkSync = vi.fn().mockResolvedValue({ results: [] });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    await pull(mockVm, { repositoryFilter: ['Todo'], limit: 50, fetchAll: true });

    expect(mockBulkSync).toHaveBeenCalledWith(expect.objectContaining({ pull: { limit: 50, fetchAll: true } }));
  });

  // RXD-031 B：某个仓库拉取失败时，此前被静默跳过、聚合结果仍当作成功派发 Complete
  it('throws RxDBPartialSyncError carrying accumulated progress when a filtered repository fails after others already applied changes', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const repoError = new Error('Todo pull failed');
    const mockBulkSync = vi.fn().mockResolvedValue({
      results: [
        {
          repository: { namespace: 'public', entity: 'User' },
          success: true,
          result: {
            pullResult: {
              pulled: 3,
              compacted: 0,
              applied: 3,
              hasMore: false,
              conflictsResolved: 0,
              conflictsDeferred: 0,
              persistedProgress: true,
              historyInvalidated: true
            }
          }
        },
        {
          repository: { namespace: 'public', entity: 'Todo' },
          success: false,
          error: repoError
        }
      ]
    });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    const thrown: unknown = await pull(mockVm, { repositoryFilter: ['User', 'Todo'] }).catch(error => error);

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect((thrown as RxDBPartialSyncError).cause).toBe(repoError);
    expect((thrown as RxDBPartialSyncError).result).toMatchObject({ applied: 3 });
    // 失败仓库存在时不能再派发「成功」事件
    expect(mockRxDB.dispatchEvent).not.toHaveBeenCalledWith(expect.any(SyncCompleteEvent));
    expect(mockRxDB.dispatchEvent).toHaveBeenCalledWith(expect.any(SyncErrorEvent));
  });

  // RXD-031 B：一条都没应用成功时，包装成 RxDBPartialSyncError 只会多剥一层，原始错误直接抛出更有用
  it('rethrows the raw error when the failed repository is the only one and nothing was applied', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const repoError = new Error('Todo pull failed');
    const mockBulkSync = vi.fn().mockResolvedValue({
      results: [{ repository: { namespace: 'public', entity: 'Todo' }, success: false, error: repoError }]
    });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    await expect(pull(mockVm, { repositoryFilter: ['Todo'] })).rejects.toBe(repoError);
  });

  // RXD-066：失败仓库自己已提交的进度藏在 `RxDBPartialSyncError.result` 里，
  // 聚合时既没累加，也没解包 cause（调用方拿到的是「错误里套错误」），
  // 而且第二个之后的失败被整个丢弃。
  it('accumulates failed repositories own progress, unwraps the原始 cause, and keeps every failure', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const userRepo = { namespace: 'public', entity: 'User' };
    const todoRepo = { namespace: 'public', entity: 'Todo' };
    const postRepo = { namespace: 'public', entity: 'Post' };
    const todoCause = new Error('Todo page 2 failed');
    const todoPartialResult = {
      pullResult: {
        repository: todoRepo,
        pulled: 2,
        compacted: 0,
        applied: 2,
        hasMore: true,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated: true
      },
      pushResult: { repository: todoRepo, pushed: 0, failed: 0, compacted: 0, originalCount: 0 },
      persistedProgress: true,
      historyInvalidated: true
    };
    const todoError = new RxDBPartialSyncError(todoPartialResult, todoCause);
    const postError = new Error('Post pull failed');

    const mockBulkSync = vi.fn().mockResolvedValue({
      results: [
        {
          repository: userRepo,
          success: true,
          result: {
            pullResult: {
              repository: userRepo,
              pulled: 3,
              compacted: 0,
              applied: 3,
              hasMore: false,
              conflictsResolved: 0,
              conflictsDeferred: 0,
              persistedProgress: true,
              historyInvalidated: true
            }
          }
        },
        { repository: todoRepo, success: false, result: todoPartialResult, error: todoError },
        { repository: postRepo, success: false, error: postError }
      ]
    });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    const thrown = (await pull(mockVm, { repositoryFilter: ['User', 'Todo', 'Post'] }).catch(
      error => error as unknown
    )) as RxDBPartialSyncError<PullResult>;

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    // 嵌套的 partial error 必须解包成它自己的根因，而不是「错误里套错误」
    expect(thrown.cause).toBe(todoCause);
    expect(thrown.result.pulled).toBe(5);
    expect(thrown.result.applied).toBe(5);
    expect(thrown.result.persistedProgress).toBe(true);
    expect(thrown.result.historyInvalidated).toBe(true);
    expect(thrown.result.failures).toEqual([
      { repository: todoRepo, error: todoCause },
      { repository: postRepo, error: postError }
    ]);
  });

  // RXD-066：零进度时旧实现直接抛第一个错误，后面几个仓库的失败无处可查
  it('still wraps when several repositories failed without any progress so no failure is dropped', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const todoRepo = { namespace: 'public', entity: 'Todo' };
    const postRepo = { namespace: 'public', entity: 'Post' };
    const todoError = new Error('Todo pull failed');
    const postError = new Error('Post pull failed');
    const mockBulkSync = vi.fn().mockResolvedValue({
      results: [
        { repository: todoRepo, success: false, error: todoError },
        { repository: postRepo, success: false, error: postError }
      ]
    });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    const thrown = (await pull(mockVm, { repositoryFilter: ['Todo', 'Post'] }).catch(
      error => error as unknown
    )) as RxDBPartialSyncError<PullResult>;

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect(thrown.cause).toBe(todoError);
    expect(thrown.result.persistedProgress).toBe(false);
    expect(thrown.result.historyInvalidated).toBe(false);
    expect(thrown.result.failures).toEqual([
      { repository: todoRepo, error: todoError },
      { repository: postRepo, error: postError }
    ]);
  });

  // RXD-066：适配器只报 success:false 不带 error 时，失败也不能从 failures 里消失
  it('synthesizes an error for a failed repository that reported none', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const todoRepo = { namespace: 'public', entity: 'Todo' };
    const mockBulkSync = vi.fn().mockResolvedValue({
      results: [{ repository: todoRepo, success: false }]
    });
    const mockVm = { rxdb: mockRxDB, bulkSync: mockBulkSync } as unknown as VersionManager;

    const thrown = (await pull(mockVm, { repositoryFilter: ['Todo'] }).catch(error => error as unknown)) as RxDBError;

    // 单个失败 + 零进度：包装只会多剥一层，直接抛合成出来的错误
    expect(thrown).toBeInstanceOf(RxDBError);
    expect(thrown).not.toBeInstanceOf(RxDBPartialSyncError);
    expect(thrown.message).toBe('Repository pull failed: public:Todo');
  });
});
