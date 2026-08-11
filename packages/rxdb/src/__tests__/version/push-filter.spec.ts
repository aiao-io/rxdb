import { describe, expect, it, vi } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { push } from '../../version/push.js';
import { VersionManager } from '../../version/VersionManager.js';

describe('push', () => {
  it('should handle string repositoryFilter (backward compatibility)', async () => {
    const mockRxDB = {
      config: { sync: { remote: { adapter: 'mock-adapter' } } },
      dispatchEvent: vi.fn()
    } as unknown as RxDB;

    const mockBulkSync = vi.fn().mockResolvedValue({ results: [] });
    const mockVm = {
      rxdb: mockRxDB,
      bulkSync: mockBulkSync,
      getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' }),
      historyManager: {
        syncing: vi.fn(fn => fn()),
        clearUndoHistory: vi.fn()
      }
    } as unknown as VersionManager;

    await push(mockVm, { repositoryFilter: ['Todo', 'User'] });

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
      bulkSync: mockBulkSync,
      getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' }),
      historyManager: {
        syncing: vi.fn(fn => fn()),
        clearUndoHistory: vi.fn()
      }
    } as unknown as VersionManager;

    await push(mockVm, {
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
      bulkSync: mockBulkSync,
      getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' }),
      historyManager: {
        syncing: vi.fn(fn => fn()),
        clearUndoHistory: vi.fn()
      }
    } as unknown as VersionManager;

    await push(mockVm, {
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
});
