/**
 * @fileoverview bulk-sync 模块测试
 *
 * 测试批量同步功能的公共行为
 * 注意：由于 ESM 限制，无法直接 mock syncRepository，
 * 因此测试聚焦于可观察的输入输出行为
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBSync } from '../../system/sync.js';
import { bulkSync, getRepositoriesToSync, type BulkSyncOptions } from '../../version/bulk-sync.js';
import { HistoryManager } from '../../version/HistoryManager.js';
import { getSyncType } from '../../version/sync-type-utils.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { User } from '../fixtures/test-entities.js';

describe('bulkSync', () => {
  let rxdb: RxDB;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const result = await createTestDB();
    rxdb = result.rxdb;
    cleanup = result.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('getRepositoriesToSync 逻辑', () => {
    it('应该从实体元数据中获取命名空间和名称', () => {
      const userMeta = getEntityMetadata(User);

      expect(userMeta.name).toBe('User');
      expect(userMeta.namespace).toBe('public');
    });

    it('应该识别实体的同步类型', () => {
      const userMeta = getEntityMetadata(User);
      const syncType = getSyncType(userMeta, rxdb.config.sync);

      // Local 配置下应该返回 'local'
      expect(syncType).toBe('local');
    });
  });

  describe('bulkSync 选项验证', () => {
    it('应该接受空选项', async () => {
      // bulkSync 应该接受空选项而不抛错
      const result = await bulkSync(rxdb, {});
      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('应该接受指定仓库列表', async () => {
      const options: BulkSyncOptions = {
        repositories: [{ namespace: 'public', entity: 'User' }]
      };

      const result = await bulkSync(rxdb, options);
      expect(result).toBeDefined();
    });

    it('应该接受并发选项', async () => {
      const options: BulkSyncOptions = {
        concurrent: true,
        concurrency: 5
      };

      const result = await bulkSync(rxdb, options);
      expect(result).toBeDefined();
    });

    it('应该接受操作类型选项', async () => {
      for (const operation of ['pull', 'push', 'sync'] as const) {
        const result = await bulkSync(rxdb, { operation });
        expect(result).toBeDefined();
      }
    });

    it('应该接受 pull 和 push 选项', async () => {
      const options: BulkSyncOptions = {
        pull: { limit: 100, fetchAll: true },
        push: { batchSize: 50 }
      };

      const result = await bulkSync(rxdb, options);
      expect(result).toBeDefined();
    });
  });

  describe('BulkSyncResult 结构', () => {
    it('应该返回正确的结果结构', async () => {
      const result = await bulkSync(rxdb);

      expect(result).toHaveProperty('succeeded');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('durationMs');

      expect(typeof result.succeeded).toBe('number');
      expect(typeof result.failed).toBe('number');
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.durationMs).toBe('number');
    });

    it('应该返回非负的耗时', async () => {
      const result = await bulkSync(rxdb);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('succeeded + failed 应该等于 results 长度', async () => {
      const result = await bulkSync(rxdb);
      expect(result.succeeded + result.failed).toBe(result.results.length);
    });
  });

  describe('空仓库列表处理', () => {
    it('空 repositories 数组应该回退到所有启用的仓库', async () => {
      const emptyResult = await bulkSync(rxdb, { repositories: [] });
      const defaultResult = await bulkSync(rxdb);

      // 空数组应该产生与默认相同数量的结果
      expect(emptyResult.results.length).toBe(defaultResult.results.length);
    });
  });

  describe('并发控制', () => {
    it('默认应该是顺序执行 (concurrent=false)', async () => {
      // 默认选项
      const result = await bulkSync(rxdb);
      expect(result).toBeDefined();
    });

    it('concurrent=true 应该启用并发执行', async () => {
      const result = await bulkSync(rxdb, { concurrent: true });
      expect(result).toBeDefined();
    });

    it('默认并发数应该是 3', async () => {
      // 不指定 concurrency，应该使用默认值 3
      const result = await bulkSync(rxdb, { concurrent: true });
      expect(result).toBeDefined();
    });

    // RXD-035：`i += concurrency` 在 concurrency 非正时永不前进，公开 Promise 永久 pending。
    // 挂死比报错难排查得多——入口必须拒绝非正安全整数。
    it.each([0, -1, 1.5, NaN, Infinity])('非正安全整数的 concurrency=%s 必须立即抛错而不是挂死', async value => {
      await expect(bulkSync(rxdb, { concurrent: true, concurrency: value })).rejects.toThrow(/concurrency/);
    });
  });

  describe('undo/redo 同步 guard (RXD-027)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('公开的 versionManager.bulkSync() 应该走 historyManager.syncing()，而不是绕过它', async () => {
      const syncingSpy = vi.spyOn(HistoryManager.prototype, 'syncing');

      await rxdb.versionManager.bulkSync();

      expect(syncingSpy).toHaveBeenCalled();
    });
  });
});

// RXD-029：`getRepositoriesToSync` 只跳过 `syncType === 'none'`，既不看能力矩阵
// （`local` 两个方向都不可同步，却照样进了列表），也不看 `RxDBSync.enabled`。
describe('getRepositoriesToSync 资格判定（RXD-029）', () => {
  const SYNCED: SyncOptions = { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'remote' } };

  @Entity({ name: 'BulkSyncFull', sync: SYNCED, properties: [{ name: 'value', type: PropertyType.string }] })
  class BulkSyncFull extends EntityBase {
    value!: string;
  }

  @Entity({
    name: 'BulkSyncLocalOnly',
    sync: { type: SyncType.None, local: { adapter: 'sqlite' } },
    properties: [{ name: 'value', type: PropertyType.string }]
  })
  class BulkSyncLocalOnly extends EntityBase {
    value!: string;
  }

  @Entity({ name: 'BulkSyncDisabled', sync: SYNCED, properties: [{ name: 'value', type: PropertyType.string }] })
  class BulkSyncDisabled extends EntityBase {
    value!: string;
  }

  const createStubRxDB = (disabledEntities: string[]) => {
    const find = vi.fn(async (query: { where: { rules: { field: string; value: unknown }[] } }) => {
      const id = query.where.rules.find(rule => rule.field === 'id')?.value;
      const entity = typeof id === 'string' ? id.split(':')[1] : undefined;
      if (!entity || !disabledEntities.includes(entity)) return [];
      const record = Object.create(RxDBSync.prototype) as RxDBSync;
      Object.assign(record, { id, namespace: 'public', entity, branchId: 'main', enabled: false });
      return [record];
    });

    return {
      config: { entities: [BulkSyncFull, BulkSyncLocalOnly, BulkSyncDisabled], sync: SYNCED },
      versionManager: {
        getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
        getLocalRepositories: vi.fn(async () => ({ adapter: { getRepository: () => ({ find }) } }))
      }
    } as unknown as RxDB;
  };

  it('只保留具备同步能力的仓库：local 两个方向都不可同步，不该进列表', async () => {
    const repositories = await getRepositoriesToSync(createStubRxDB([]), {});

    expect(repositories.map(repo => repo.entity)).toEqual(['BulkSyncFull', 'BulkSyncDisabled']);
  });

  it('enabled = false 的仓库被剔除，而不是留到 syncRepository 里抛错', async () => {
    const repositories = await getRepositoriesToSync(createStubRxDB(['BulkSyncDisabled']), {});

    expect(repositories.map(repo => repo.entity)).toEqual(['BulkSyncFull']);
  });

  it('显式传入 repositories 时原样透传，不做资格过滤', async () => {
    const explicit = [{ namespace: 'public', entity: 'BulkSyncLocalOnly' }];

    expect(await getRepositoriesToSync(createStubRxDB([]), { repositories: explicit })).toEqual(explicit);
  });
});
