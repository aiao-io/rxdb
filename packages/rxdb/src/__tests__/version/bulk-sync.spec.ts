/**
 * @fileoverview bulk-sync 模块测试
 *
 * 测试批量同步功能的公共行为。并发语义没有别的观察点——`results` 的顺序在两种模式下
 * 都跟入参一致，`durationMs` 又只是墙钟——所以「并发控制」那组把 `syncRepository`
 * 换成可控实现来量并发窗口，其余各组仍走真实实现。
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { RxDBSync } from '../../system/sync.js';
import { bulkSync, getRepositoriesToSync, type BulkSyncOptions } from '../../version/bulk-sync.js';
import type { RepositoryIdentifier } from '../../version/dependency-graph.js';
import { HistoryManager } from '../../version/HistoryManager.js';
import { syncRepository, type SyncRepositoryResult } from '../../version/sync-repository.js';
import { getSyncType } from '../../version/sync-type-utils.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { User } from '../fixtures/test-entities.js';

// 默认转发到真实实现，只有「并发控制」那组临时改写它；`mockReset()` 会退回这里的 impl
vi.mock('../../version/sync-repository.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../version/sync-repository.js')>();
  return { ...actual, syncRepository: vi.fn(actual.syncRepository) };
});

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
    /**
     * 7 个假仓库：`concurrency=3` 下切成 3/3/1 三批，既量得出批内并发，也钉得住跨批不重叠
     * （真重叠的话峰值会是 7 而不是 3）。走 `repositories` 显式入口，`getRepositoriesToSync`
     * 原样透传，不碰真实元数据。
     */
    const probeRepositories: RepositoryIdentifier[] = Array.from({ length: 7 }, (_, index) => ({
      namespace: 'probe',
      entity: `Probe${index}`
    }));

    /** 返回值与本组用例无关，给个字段合法的空结果即可 */
    const emptySyncResult = (namespace: string, entity: string): SyncRepositoryResult => {
      const repository = { namespace, entity };
      return {
        persistedProgress: false,
        historyInvalidated: false,
        pullResult: {
          repository,
          pulled: 0,
          compacted: 0,
          applied: 0,
          hasMore: false,
          conflictsResolved: 0,
          conflictsDeferred: 0,
          persistedProgress: false,
          historyInvalidated: false,
          failures: []
        },
        pushResult: {
          repository,
          pushed: 0,
          failed: 0,
          compacted: 0,
          originalCount: 0,
          failures: []
        }
      };
    };

    /**
     * 跑一次 `bulkSync`，量出 `syncRepository` 的并发窗口峰值。
     *
     * 每次调用先自增在飞计数，让出一个宏任务再自减：顺序执行时窗口恒为 1，并发执行时
     * 同一批的调用会叠在一起，峰值即批大小。这是并发语义唯一的可观察量——`results`
     * 的顺序两种模式下都等于入参顺序，分不出模式。
     */
    const peakInFlight = async (options: BulkSyncOptions): Promise<number> => {
      let inFlight = 0;
      let peak = 0;
      vi.mocked(syncRepository).mockImplementation(async (_versionManager, namespace, entity) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        try {
          await new Promise<void>(resolve => setTimeout(resolve, 5));
          return emptySyncResult(namespace, entity);
        } finally {
          inFlight -= 1;
        }
      });

      const result = await bulkSync(rxdb, { ...options, repositories: probeRepositories });
      // 峰值只有在「每个仓库都真的被派发过」时才说明问题
      expect(result.succeeded).toBe(probeRepositories.length);
      return peak;
    };

    afterEach(() => {
      vi.mocked(syncRepository).mockReset();
    });

    it('默认应该是顺序执行 (concurrent=false)', async () => {
      expect(await peakInFlight({})).toBe(1);
    });

    it('concurrent=true 应该启用并发执行', async () => {
      expect(await peakInFlight({ concurrent: true })).toBeGreaterThan(1);
    });

    it('默认并发数应该是 3', async () => {
      expect(await peakInFlight({ concurrent: true })).toBe(3);
    });

    it('显式 concurrency 覆盖默认值', async () => {
      expect(await peakInFlight({ concurrent: true, concurrency: 5 })).toBe(5);
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
