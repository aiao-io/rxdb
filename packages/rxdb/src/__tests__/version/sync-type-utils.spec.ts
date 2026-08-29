/**
 * @fileoverview 同步策略识别测试
 */

import { describe, expect, it } from 'vitest';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import {
  getSyncCapability,
  getSyncType,
  getSyncableRepositories,
  groupBySyncType,
  isNoSync,
  needsOfflineWrite,
  needsPull,
  needsPush
} from '../../version/sync-type-utils.js';

describe('sync-type-utils', () => {
  describe('getSyncType', () => {
    it('should return "none" for entity without sync config', () => {
      const metadata = {
        name: 'Test',
        namespace: 'public',
        properties: [],
        sync: undefined
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('none');
    });

    it('should return "full" for SyncType.Full', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('full');
    });

    it('should return "filter" for SyncType.Filter', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({ combinator: 'and', rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('filter');
    });

    it('should return "remote" for SyncType.None with only remote', () => {
      const metadata = {
        name: 'User',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('remote');
    });

    it('should return "local" for SyncType.None with only local', () => {
      const metadata = {
        name: 'Draft',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('local');
    });

    it('should return "none" for SyncType.None with both local and remote', () => {
      const metadata = {
        name: 'RxDBBranch',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('none');
    });

    it('should return "querycache" for SyncType.QueryCache', () => {
      const metadata = {
        name: 'CachedData',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.QueryCache,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('querycache');
    });

    it('should return "full" for SyncType.None with inherited global sync having local + remote', () => {
      // 当实体没有 metadata.sync，但全局配置有 local + remote 时，默认使用 full
      const metadata = {
        name: 'InheritedEntity',
        namespace: 'public',
        properties: [],
        sync: undefined // 实体没有配置 sync
      } as unknown as EntityMetadata;

      // 提供全局同步配置
      const globalSync: SyncOptions = {
        type: SyncType.None,
        local: { adapter: 'sqlite' },
        remote: { adapter: 'supabase' }
      };

      expect(getSyncType(metadata, globalSync)).toBe('full');
    });

    it('should return "none" for SyncType.None with neither local nor remote', () => {
      const metadata = {
        name: 'Temp',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('none');
    });
  });

  describe('needsPull', () => {
    it('should return true for full sync', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(true);
    });

    it('should return true for filter sync', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({ combinator: 'and', rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(true);
    });

    it('should return true for remote sync', () => {
      const metadata = {
        name: 'User',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(true);
    });

    it('should return false for local sync', () => {
      const metadata = {
        name: 'Draft',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(false);
    });

    it('should return false for no sync', () => {
      const metadata = {
        name: 'Temp',
        namespace: 'public',
        properties: [],
        sync: undefined
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(false);
    });
  });

  describe('needsPush', () => {
    it('should return true for full sync', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(true);
    });

    it('should return true for filter sync (local changes not restricted by filter)', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({ combinator: 'and', rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(true);
    });

    it('should return false for remote sync', () => {
      const metadata = {
        name: 'User',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(false);
    });

    // local-only（SyncType.None + 只有 local adapter）契约上「只在本地」，
    // 算成可推等于把私有数据送出去，而且这类仓库连 remote adapter 都没有。
    it('should return false for local sync', () => {
      const metadata = {
        name: 'Draft',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' }
        }
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(false);
    });

    it('should return false for no sync', () => {
      const metadata = {
        name: 'Temp',
        namespace: 'public',
        properties: [],
        sync: undefined
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(false);
    });
  });

  // `offlineWrite` 与 `push` 是两件事：前者问「远端不可达时能不能先落本地、之后重放」，
  // 后者问「能不能走 changelog / mergeChanges 管道」。querycache 只满足前者 ——
  // 它的远端契约是纯 REST，适配器根本不实现 mergeChanges。
  describe('getSyncCapability offlineWrite', () => {
    it('should allow offline write for full / filter / querycache', () => {
      expect(getSyncCapability('full').offlineWrite).toBe(true);
      expect(getSyncCapability('filter').offlineWrite).toBe(true);
      expect(getSyncCapability('querycache').offlineWrite).toBe(true);
    });

    it('should not allow offline write for remote / local / none', () => {
      expect(getSyncCapability('remote').offlineWrite).toBe(false);
      expect(getSyncCapability('local').offlineWrite).toBe(false);
      expect(getSyncCapability('none').offlineWrite).toBe(false);
    });

    // 反转 querycache 的 offlineWrite 不能顺手把 push 也翻了：
    // push=true 会把它送进一条 HTTP 适配器抛 HttpChangelogUnsupportedError 的管道。
    it('should keep querycache out of the changelog push pipeline', () => {
      expect(getSyncCapability('querycache').push).toBe(false);
      expect(getSyncCapability('querycache').pull).toBe(true);
    });
  });

  describe('needsOfflineWrite', () => {
    it('should return true for querycache sync', () => {
      const metadata = {
        name: 'Recipe',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.QueryCache,
          local: { adapter: 'wa-sqlite' },
          remote: { adapter: 'http' }
        }
      } as unknown as EntityMetadata;

      expect(needsOfflineWrite(metadata)).toBe(true);
      expect(needsPush(metadata)).toBe(false);
    });

    it('should return true for full sync', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsOfflineWrite(metadata)).toBe(true);
    });

    it('should return false for remote sync (no local store to write into)', () => {
      const metadata = {
        name: 'User',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(needsOfflineWrite(metadata)).toBe(false);
    });

    it('should return false for local sync (nothing to replay to)', () => {
      const metadata = {
        name: 'Draft',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' }
        }
      } as unknown as EntityMetadata;

      expect(needsOfflineWrite(metadata)).toBe(false);
    });

    it('should return false for no sync', () => {
      const metadata = {
        name: 'Temp',
        namespace: 'public',
        properties: [],
        sync: undefined
      } as unknown as EntityMetadata;

      expect(needsOfflineWrite(metadata)).toBe(false);
    });
  });

  describe('isNoSync', () => {
    it('should return false for full sync', () => {
      const metadata = {
        name: 'Todo',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(isNoSync(metadata)).toBe(false);
    });

    it('should return false for remote sync', () => {
      const metadata = {
        name: 'User',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          remote: { adapter: 'supabase' }
        }
      } as unknown as EntityMetadata;

      expect(isNoSync(metadata)).toBe(false);
    });

    it('should return false for local sync', () => {
      const metadata = {
        name: 'Draft',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.None,
          local: { adapter: 'sqlite' }
        }
      } as unknown as EntityMetadata;

      expect(isNoSync(metadata)).toBe(false);
    });

    it('should return true for no sync', () => {
      const metadata = {
        name: 'Temp',
        namespace: 'public',
        properties: [],
        sync: undefined
      } as unknown as EntityMetadata;

      expect(isNoSync(metadata)).toBe(true);
    });
  });

  describe('getSyncableRepositories', () => {
    it('should filter out entities without sync', () => {
      const entities = [
        {
          name: 'Todo',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.Full,
            local: { adapter: 'sqlite' },
            remote: { adapter: 'supabase' }
          }
        },
        {
          name: 'User',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.None,
            remote: { adapter: 'supabase' }
          }
        },
        {
          name: 'RxDBBranch',
          namespace: 'public',
          properties: [],
          sync: undefined
        }
      ] as unknown as EntityMetadata[];

      const syncable = getSyncableRepositories(entities);

      expect(syncable).toHaveLength(2);
      expect(syncable.map(e => e.name)).toEqual(['Todo', 'User']);
    });

    it('should return empty array if all entities have no sync', () => {
      const entities = [
        {
          name: 'RxDBBranch',
          namespace: 'public',
          properties: [],
          sync: undefined
        },
        {
          name: 'RxDBChange',
          namespace: 'public',
          properties: [],
          sync: undefined
        }
      ] as unknown as EntityMetadata[];

      const syncable = getSyncableRepositories(entities);

      expect(syncable).toHaveLength(0);
    });
  });

  describe('groupBySyncType', () => {
    it('should group entities by sync type', () => {
      const entities = [
        {
          name: 'Todo',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.Full,
            local: { adapter: 'sqlite' },
            remote: { adapter: 'supabase' }
          }
        },
        {
          name: 'Comment',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.Full,
            local: { adapter: 'sqlite' },
            remote: { adapter: 'supabase' }
          }
        },
        {
          name: 'User',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.None,
            remote: { adapter: 'supabase' }
          }
        },
        {
          name: 'Draft',
          namespace: 'public',
          properties: [],
          sync: {
            type: SyncType.None,
            local: { adapter: 'sqlite' }
          }
        },
        {
          name: 'RxDBBranch',
          namespace: 'public',
          properties: [],
          sync: undefined
        }
      ] as unknown as EntityMetadata[];

      const grouped = groupBySyncType(entities);

      expect(grouped.full).toHaveLength(2);
      expect(grouped.full.map(e => e.name)).toEqual(['Todo', 'Comment']);

      expect(grouped.remote).toHaveLength(1);
      expect(grouped.remote[0].name).toBe('User');

      expect(grouped.local).toHaveLength(1);
      expect(grouped.local[0].name).toBe('Draft');

      expect(grouped.none).toHaveLength(1);
      expect(grouped.none[0].name).toBe('RxDBBranch');
    });

    it('should return empty groups if no entities', () => {
      const grouped = groupBySyncType([]);

      expect(grouped.full).toEqual([]);
      expect(grouped.remote).toEqual([]);
      expect(grouped.local).toEqual([]);
      expect(grouped.none).toEqual([]);
    });
  });
});
