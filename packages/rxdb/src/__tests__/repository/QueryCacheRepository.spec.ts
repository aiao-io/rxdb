/**
 * @fileoverview QueryCacheRepository 单元测试（QueryCache 同步策略）。
 *
 * 测试 QueryCache 仓库实现：
 * - find() - 首次查询缓存流程
 * - findById() - 单实体缓存
 * - 零 pull 的缓存命中（所有数据都是最新的）
 * - 并发查询去重
 */

import { delay, firstValueFrom, Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityBaseType } from '../../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import {
  QueryCacheLocalAdapter,
  QueryCacheRemoteAdapter,
  QueryCacheRepository,
  SyncStats
} from '../../repository/QueryCacheRepository.js';
import { NetworkOfflineError } from '../../RxDBError.js';

/**
 * 用于测试的模拟类型。
 */
class MockProduct {
  id!: string;
  name!: string;
  status?: string;
  createdAt?: Date;
  updatedAt!: string;
}

type MockProductEntityType = EntityBaseType & (new () => MockProduct);

/**
 * 创建用于测试 QueryCacheRepository 的模拟适配器。
 */
function createMockAdapters() {
  const remoteAdapter: QueryCacheRemoteAdapter = {
    fetchMetadata: vi.fn().mockReturnValue(of([])),
    findByIds: vi.fn().mockReturnValue(of([]))
  };

  const localAdapter: QueryCacheLocalAdapter = {
    getMetadataByIds: vi.fn().mockReturnValue(of(new Map())),
    upsertMany: vi.fn().mockReturnValue(of(undefined)),
    deleteByIds: vi.fn().mockReturnValue(of(undefined)),
    findByIds: vi.fn().mockReturnValue(of([])),
    findAll: vi.fn().mockReturnValue(of([]))
  };

  return { remoteAdapter, localAdapter };
}

describe('QueryCacheRepository', () => {
  let remoteAdapter: QueryCacheRemoteAdapter;
  let localAdapter: QueryCacheLocalAdapter;
  let repo: QueryCacheRepository<MockProductEntityType>;

  beforeEach(() => {
    const adapters = createMockAdapters();
    remoteAdapter = adapters.remoteAdapter;
    localAdapter = adapters.localAdapter;
    repo = new QueryCacheRepository<MockProductEntityType>('Product', remoteAdapter, localAdapter);
  });

  describe('find() - 首次查询自动缓存 (T017)', () => {
    it('T017.1 首次查询应该从远程获取元数据', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const result = await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledWith('Product', expect.any(Object));
      expect(remoteAdapter.findByIds).toHaveBeenCalledWith('Product', ['p1']);
      expect(localAdapter.upsertMany).toHaveBeenCalled();
      expect(result).toEqual(remoteData);
    });

    it('T017.2 应该只拉取缺失的数据', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'p1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p3', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const localMetadataMap = new Map([
        ['p1', '2024-01-01T00:00:00Z'],
        ['p2', '2024-01-01T00:00:00Z']
      ]);
      const localCachedData: MockProduct[] = [
        { id: 'p1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', name: 'Product 2', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const remoteP3: MockProduct[] = [{ id: 'p3', name: 'Product 3', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteP3));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(localCachedData));

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(remoteAdapter.findByIds).toHaveBeenCalledWith('Product', ['p3']);
    });

    it('T017.3 应该只拉取过时的数据', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-02T00:00:00Z' }];
      const localMetadataMap = new Map([['p1', '2024-01-01T00:00:00Z']]);
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'Updated Product', updatedAt: '2024-01-02T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(remoteAdapter.findByIds).toHaveBeenCalledWith('Product', ['p1']);
    });

    it('T017.4 拉取的数据应该写入本地缓存', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'New Product', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(localAdapter.upsertMany).toHaveBeenCalledWith('Product', remoteData);
    });
  });

  describe('cache hit with zero pull (T017.5)', () => {
    it('T017.5.1 所有数据都是新鲜时不应该调用 findByIds', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'p1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const localMetadataMap = new Map([
        ['p1', '2024-01-01T00:00:00Z'],
        ['p2', '2024-01-01T00:00:00Z']
      ]);

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(remoteAdapter.findByIds).not.toHaveBeenCalled();
    });

    it('T017.5.2 零拉取时应该直接返回本地缓存数据', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadataMap = new Map([['p1', '2024-01-01T00:00:00Z']]);
      const localCachedData: MockProduct[] = [{ id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(localCachedData));

      const result = await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(result).toEqual(localCachedData);
    });
  });

  describe('findById() - 单实体查询 (T018)', () => {
    it('T018.1 本地有最新数据时直接返回', async () => {
      const localCachedData: MockProduct[] = [{ id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(localCachedData));
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }]));

      const result = await firstValueFrom(repo.findById('p1'));

      expect(remoteAdapter.findByIds).not.toHaveBeenCalled();
      expect(result).toEqual(localCachedData[0]);
    });

    it('T018.2 本地没有数据时从远程获取', async () => {
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'Remote Product', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }]));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

      const result = await firstValueFrom(repo.findById('p1'));

      expect(remoteAdapter.findByIds).toHaveBeenCalledWith('Product', ['p1']);
      expect(localAdapter.upsertMany).toHaveBeenCalledWith('Product', remoteData);
      expect(result).toEqual(remoteData[0]);
    });

    it('T018.3 本地数据过时时从远程更新', async () => {
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'Updated Product', updatedAt: '2024-01-02T00:00:00Z' }];

      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([{ id: 'p1', updatedAt: '2024-01-02T00:00:00Z' }]));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

      const result = await firstValueFrom(repo.findById('p1'));

      expect(remoteAdapter.findByIds).toHaveBeenCalledWith('Product', ['p1']);
      expect(result).toEqual(remoteData[0]);
    });
  });

  describe('concurrent query deduplication (T024.5)', () => {
    it('T024.5.1 并发相同查询应该共享请求', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      const remoteData: MockProduct[] = [{ id: 'p1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(10)));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const query = { combinator: 'and' as const, rules: [] };

      const promise1 = firstValueFrom(repo.find({ where: query }));
      const promise2 = firstValueFrom(repo.find({ where: query }));

      await Promise.all([promise1, promise2]);

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);
    });

    it('T024.5.2 不同查询不应该共享请求', async () => {
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([]));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const query1 = {
        combinator: 'and' as const,
        rules: [{ field: 'status', operator: '=' as const, value: 'active' }]
      } as RuleGroup<MockProduct>;
      const query2 = {
        combinator: 'and' as const,
        rules: [{ field: 'status', operator: '=' as const, value: 'inactive' }]
      } as RuleGroup<MockProduct>;

      await firstValueFrom(repo.find({ where: query1 }));
      await firstValueFrom(repo.find({ where: query2 }));

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
    });

    it('T024.5.3 请求完成后再次查询应该发起新请求', async () => {
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([]));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const query = { combinator: 'and' as const, rules: [] };

      await firstValueFrom(repo.find({ where: query }));
      await firstValueFrom(repo.find({ where: query }));

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
    });

    // US-020 AC#13 / AC#24：指纹至少覆盖 where + localCacheFirst + offlineFallback。
    // 只按 where 去重时，要 SWR 的调用会拿到标准模式那条流（反之亦然），模式参数形同虚设。
    it('T024.5.5 同 where 不同 localCacheFirst 不共用 inflight key', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(10)));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of([]));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const query = { combinator: 'and' as const, rules: [] };

      await Promise.all([
        firstValueFrom(repo.find({ where: query })),
        firstValueFrom(repo.find({ where: query, localCacheFirst: true }))
      ]);

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
    });

    it('T024.5.6 同 where 不同 offlineFallback 不共用 inflight key', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(10)));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of([]));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const query = { combinator: 'and' as const, rules: [] };

      await Promise.all([
        firstValueFrom(repo.find({ where: query })),
        firstValueFrom(repo.find({ where: query, offlineFallback: true }))
      ]);

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
    });

    it('T024.5.4 不同 Date 查询值不应该共享请求或结果', async () => {
      const firstDate = new Date('2026-01-01T00:00:00.000Z');
      const secondDate = new Date('2026-01-02T00:00:00.000Z');
      const firstMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2026-01-01T00:00:00.000Z' }];
      const secondMetadata: QueryCacheEntityMetadata[] = [{ id: 'p2', updatedAt: '2026-01-02T00:00:00.000Z' }];
      const firstData: MockProduct[] = [
        { id: 'p1', name: 'First Date', createdAt: firstDate, updatedAt: '2026-01-01T00:00:00.000Z' }
      ];
      const secondData: MockProduct[] = [
        { id: 'p2', name: 'Second Date', createdAt: secondDate, updatedAt: '2026-01-02T00:00:00.000Z' }
      ];
      const firstQuery: RuleGroup<MockProduct> = {
        combinator: 'and',
        rules: [{ field: 'createdAt', operator: '>=', value: firstDate }]
      };
      const secondQuery: RuleGroup<MockProduct> = {
        combinator: 'and',
        rules: [{ field: 'createdAt', operator: '>=', value: secondDate }]
      };

      vi.mocked(remoteAdapter.fetchMetadata)
        .mockReturnValueOnce(of(firstMetadata).pipe(delay(10)))
        .mockReturnValueOnce(of(secondMetadata).pipe(delay(20)));
      vi.mocked(remoteAdapter.findByIds).mockReturnValueOnce(of(firstData)).mockReturnValueOnce(of(secondData));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      const [firstResult, secondResult] = await Promise.all([
        firstValueFrom(repo.find({ where: firstQuery })),
        firstValueFrom(repo.find({ where: secondQuery }))
      ]);

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
      expect(firstResult).toEqual(firstData);
      expect(secondResult).toEqual(secondData);
    });

    it('查询消费完成后应释放上游订阅（不留死引用）', async () => {
      // 防止 shareReplay 不带 refCount 导致上游订阅常驻：
      // 用自定义 Observable 显式计数 subscribe / teardown，
      // 验证 firstValueFrom 拿到值后 upstream 真的被释放。
      let subscribeCount = 0;
      let teardownCount = 0;
      const countingSource = new Observable<QueryCacheEntityMetadata[]>(subscriber => {
        subscribeCount += 1;
        subscriber.next([]);
        subscriber.complete();
        return () => {
          teardownCount += 1;
        };
      });

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(countingSource);
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(subscribeCount).toBe(1);
      expect(teardownCount).toBe(1);
    });
  });

  describe('SyncStats 性能日志 (T030)', () => {
    it('T030.1 首次查询应该报告完整拉取统计', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'p1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const remoteData: MockProduct[] = [
        { id: 'p1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'p2', name: 'Product 2', updatedAt: '2024-01-01T00:00:00Z' }
      ];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

      let syncStats: SyncStats | undefined;
      await firstValueFrom(
        repo.find({
          where: { combinator: 'and', rules: [] },
          onSyncStats: stats => {
            syncStats = stats;
          }
        })
      );

      expect(syncStats).toBeDefined();
      expect(syncStats!.remoteCount).toBe(2);
      expect(syncStats!.missingCount).toBe(2);
      expect(syncStats!.staleCount).toBe(0);
      expect(syncStats!.freshCount).toBe(0);
      expect(syncStats!.pulledCount).toBe(2);
      expect(syncStats!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('T030.2 缓存命中时应该报告零拉取统计', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadataMap = new Map([['p1', '2024-01-01T00:00:00Z']]);
      const localData: MockProduct[] = [{ id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(localData));

      let syncStats: SyncStats | undefined;
      await firstValueFrom(
        repo.find({
          where: { combinator: 'and', rules: [] },
          onSyncStats: stats => {
            syncStats = stats;
          }
        })
      );

      expect(syncStats).toBeDefined();
      expect(syncStats!.remoteCount).toBe(1);
      expect(syncStats!.freshCount).toBe(1);
      expect(syncStats!.pulledCount).toBe(0);
    });

    it('T030.3 增量同步时应该区分 stale 和 missing', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'p1', updatedAt: '2024-01-02T00:00:00Z' }, // 过时
        { id: 'p2', updatedAt: '2024-01-01T00:00:00Z' }, // 新鲜
        { id: 'p3', updatedAt: '2024-01-01T00:00:00Z' } // 缺失
      ];
      const localMetadataMap = new Map([
        ['p1', '2024-01-01T00:00:00Z'],
        ['p2', '2024-01-01T00:00:00Z']
      ]);
      const pulledData: MockProduct[] = [
        { id: 'p1', name: 'Updated', updatedAt: '2024-01-02T00:00:00Z' },
        { id: 'p3', name: 'New', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const freshData: MockProduct[] = [{ id: 'p2', name: 'Fresh', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(pulledData));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(freshData));

      let syncStats: SyncStats | undefined;
      await firstValueFrom(
        repo.find({
          where: { combinator: 'and', rules: [] },
          onSyncStats: stats => {
            syncStats = stats;
          }
        })
      );

      expect(syncStats).toBeDefined();
      expect(syncStats!.remoteCount).toBe(3);
      expect(syncStats!.staleCount).toBe(1);
      expect(syncStats!.missingCount).toBe(1);
      expect(syncStats!.freshCount).toBe(1);
      expect(syncStats!.pulledCount).toBe(2);
    });

    it('T030.4 空结果查询应该报告零计数', async () => {
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([]));

      let syncStats: SyncStats | undefined;
      await firstValueFrom(
        repo.find({
          where: { combinator: 'and', rules: [] },
          onSyncStats: stats => {
            syncStats = stats;
          }
        })
      );

      expect(syncStats).toBeDefined();
      expect(syncStats!.remoteCount).toBe(0);
      expect(syncStats!.pulledCount).toBe(0);
      expect(syncStats!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('远程删除排除 (T026.5)', () => {
    it('T026.5.1 远程已删除的数据不应出现在结果中', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadataMap = new Map([
        ['id1', '2024-01-01T00:00:00Z'],
        ['id2', '2024-01-01T00:00:00Z']
      ]);
      const localCachedData: MockProduct[] = [{ id: 'id1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' }];

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(of(localCachedData));

      const result = await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('id1');
    });

    it('T026.5.2 孤儿数据采用惰性保留策略', async () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadataMap = new Map([
        ['id1', '2024-01-01T00:00:00Z'],
        ['orphan', '2024-01-01T00:00:00Z']
      ]);

      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
      vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(localMetadataMap));
      vi.mocked(localAdapter.findByIds!).mockReturnValue(
        of([{ id: 'id1', name: 'Product 1', updatedAt: '2024-01-01T00:00:00Z' }])
      );

      await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }));

      expect(localAdapter.deleteByIds).not.toHaveBeenCalled();
    });
  });

  describe('写操作 - create/update/delete (T031-T034)', () => {
    /**
     * 创建带写操作能力的 mock adapters
     */
    function createWriteAdapters() {
      const writeRemoteAdapter: QueryCacheRemoteAdapter = {
        fetchMetadata: vi.fn().mockReturnValue(of([])),
        findByIds: vi.fn().mockReturnValue(of([])),
        create: vi.fn().mockReturnValue(of({})),
        update: vi.fn().mockReturnValue(of({})),
        delete: vi.fn().mockReturnValue(of(undefined))
      };

      const writeLocalAdapter: QueryCacheLocalAdapter = {
        getMetadataByIds: vi.fn().mockReturnValue(of(new Map())),
        upsertMany: vi.fn().mockReturnValue(of(undefined)),
        deleteByIds: vi.fn().mockReturnValue(of(undefined)),
        findByIds: vi.fn().mockReturnValue(of([]))
      };

      return { writeRemoteAdapter, writeLocalAdapter };
    }

    describe('create() - T031', () => {
      it('T031.1 create() 应该先写入远程再写入本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const newProduct: MockProduct = {
          id: 'p-new',
          name: 'New Product',
          updatedAt: '2024-01-01T00:00:00Z'
        };
        const createdProduct: MockProduct = {
          id: 'p-new',
          name: 'New Product',
          updatedAt: '2024-01-01T00:00:00Z'
        };

        vi.mocked(writeRemoteAdapter.create!).mockReturnValue(of(createdProduct));

        const result = await firstValueFrom(writeRepo.create(newProduct));

        expect(writeRemoteAdapter.create).toHaveBeenCalledWith('Product', newProduct);
        expect(writeLocalAdapter.upsertMany).toHaveBeenCalledWith('Product', [createdProduct]);
        expect(result).toEqual(createdProduct);
      });

      it('T031.2 远程返回的数据应该缓存到本地（可能带服务器生成的字段）', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const inputProduct = { name: 'New Product' } as MockProduct;
        const serverProduct: MockProduct = {
          id: 'server-generated-id',
          name: 'New Product',
          updatedAt: '2024-01-01T12:00:00Z'
        };

        vi.mocked(writeRemoteAdapter.create!).mockReturnValue(of(serverProduct));

        const result = await firstValueFrom(writeRepo.create(inputProduct));

        expect(writeLocalAdapter.upsertMany).toHaveBeenCalledWith('Product', [serverProduct]);
        expect(result.id).toBe('server-generated-id');
      });
    });

    describe('update() - T032', () => {
      it('T032.1 update() 应该先更新远程再更新本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const updateData = { name: 'Updated Name' };
        const updatedProduct: MockProduct = {
          id: 'p1',
          name: 'Updated Name',
          updatedAt: '2024-01-02T00:00:00Z'
        };

        vi.mocked(writeRemoteAdapter.update!).mockReturnValue(of(updatedProduct));

        const result = await firstValueFrom(writeRepo.update('p1', updateData));

        expect(writeRemoteAdapter.update).toHaveBeenCalledWith('Product', 'p1', updateData);
        expect(writeLocalAdapter.upsertMany).toHaveBeenCalledWith('Product', [updatedProduct]);
        expect(result).toEqual(updatedProduct);
      });

      it('T032.2 更新应该使用服务器返回的最新 updatedAt', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const serverResponse: MockProduct = {
          id: 'p1',
          name: 'Updated',
          updatedAt: '2024-01-02T12:34:56Z'
        };

        vi.mocked(writeRemoteAdapter.update!).mockReturnValue(of(serverResponse));

        const result = await firstValueFrom(writeRepo.update('p1', { name: 'Updated' }));

        expect(result.updatedAt).toBe('2024-01-02T12:34:56Z');
      });
    });

    describe('delete() - T033', () => {
      it('T033.1 delete() 应该先删除远程再删除本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        vi.mocked(writeRemoteAdapter.delete!).mockReturnValue(of(undefined));

        await firstValueFrom(writeRepo.delete('p1'));

        expect(writeRemoteAdapter.delete).toHaveBeenCalledWith('Product', 'p1');
        expect(writeLocalAdapter.deleteByIds).toHaveBeenCalledWith('Product', ['p1']);
      });

      it('T033.2 删除多个 ID 应该批量处理', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        vi.mocked(writeRemoteAdapter.delete!).mockReturnValue(of(undefined));

        await firstValueFrom(writeRepo.delete(['p1', 'p2', 'p3']));

        expect(writeRemoteAdapter.delete).toHaveBeenCalledWith('Product', ['p1', 'p2', 'p3']);
        expect(writeLocalAdapter.deleteByIds).toHaveBeenCalledWith('Product', ['p1', 'p2', 'p3']);
      });
    });

    describe('错误处理 - T034', () => {
      it('T034.1 远程 create 失败时不应该写入本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const error = new Error('Remote create failed');
        vi.mocked(writeRemoteAdapter.create!).mockReturnValue(throwError(() => error));

        await expect(firstValueFrom(writeRepo.create({ id: 'p-new', name: 'Test', updatedAt: '' }))).rejects.toThrow(
          'Remote create failed'
        );

        expect(writeLocalAdapter.upsertMany).not.toHaveBeenCalled();
      });

      it('T034.2 远程 update 失败时不应该更新本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const error = new Error('Remote update failed');
        vi.mocked(writeRemoteAdapter.update!).mockReturnValue(throwError(() => error));

        await expect(firstValueFrom(writeRepo.update('p1', { name: 'Test' }))).rejects.toThrow('Remote update failed');

        expect(writeLocalAdapter.upsertMany).not.toHaveBeenCalled();
      });

      it('T034.3 远程 delete 失败时不应该删除本地', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const error = new Error('Remote delete failed');
        vi.mocked(writeRemoteAdapter.delete!).mockReturnValue(throwError(() => error));

        await expect(firstValueFrom(writeRepo.delete('p1'))).rejects.toThrow('Remote delete failed');

        expect(writeLocalAdapter.deleteByIds).not.toHaveBeenCalled();
      });

      it('T034.4 远程成功但本地失败应该抛出错误（数据已在远程）', async () => {
        const { writeRemoteAdapter, writeLocalAdapter } = createWriteAdapters();
        const writeRepo = new QueryCacheRepository<MockProductEntityType>(
          'Product',
          writeRemoteAdapter,
          writeLocalAdapter
        );

        const createdProduct: MockProduct = { id: 'p-new', name: 'Test', updatedAt: '' };
        vi.mocked(writeRemoteAdapter.create!).mockReturnValue(of(createdProduct));
        vi.mocked(writeLocalAdapter.upsertMany).mockReturnValue(throwError(() => new Error('Local cache failed')));

        await expect(firstValueFrom(writeRepo.create(createdProduct))).rejects.toThrow('Local cache failed');
      });
    });
  });

  describe('Stale-While-Revalidate 模式 (T040-T041)', () => {
    describe('T040 - SWR 立即返回缓存', () => {
      it('T040.1 localCacheFirst=true 时应该立即返回本地缓存', async () => {
        const localCachedData: MockProduct[] = [
          { id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }
        ];
        const remoteMetadata: QueryCacheEntityMetadata[] = [
          { id: 'p1', updatedAt: '2024-01-02T00:00:00Z' } // 远程有更新
        ];

        // 模拟本地有缓存
        vi.mocked(localAdapter.findAll!).mockReturnValue(of(localCachedData));
        // 远程请求需要一些时间
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(50)));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(
          of([{ id: 'p1', name: 'Updated Product', updatedAt: '2024-01-02T00:00:00Z' }])
        );
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        // 使用 toArray 收集所有发射值
        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 应该先发射缓存数据
        expect(emissions.length).toBeGreaterThanOrEqual(1);
        expect(emissions[0]).toEqual(localCachedData);
      });

      it('T040.2 localCacheFirst=true 且无本地缓存时应该只发射远程数据', async () => {
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
        const remoteData: MockProduct[] = [{ id: 'p1', name: 'Remote Product', updatedAt: '2024-01-01T00:00:00Z' }];

        // 本地无缓存
        vi.mocked(localAdapter.findAll!).mockReturnValue(of([]));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 应该只发射远程数据（无空缓存发射）
        expect(emissions.length).toBe(1);
        expect(emissions[0]).toEqual(remoteData);
      });

      it('T040.3 localCacheFirst=false（默认）时应该只发射一次', async () => {
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];
        const remoteData: MockProduct[] = [{ id: 'p1', name: 'Remote Product', updatedAt: '2024-01-01T00:00:00Z' }];

        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        expect(emissions.length).toBe(1);
        expect(emissions[0]).toEqual(remoteData);
      });

      it('T040.4 localCacheFirst=true 时缓存发射应该按 where 条件过滤', async () => {
        const localCachedData = [
          { id: 'p1', name: 'Active Product', status: 'active', updatedAt: '2024-01-01T00:00:00Z' },
          { id: 'p2', name: 'Inactive Product', status: 'inactive', updatedAt: '2024-01-01T00:00:00Z' }
        ];
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(localCachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(50)));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of([]));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));
        vi.mocked(localAdapter.findByIds!).mockReturnValue(of([localCachedData[0]]));

        const emissions: MockProduct[][] = [];
        const query: RuleGroup<MockProduct> = {
          combinator: 'and',
          rules: [{ field: 'status', operator: '=', value: 'active' }]
        };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 第一次发射（本地缓存）不能包含 inactive 数据
        expect(emissions.length).toBeGreaterThanOrEqual(1);
        expect(emissions[0]).toEqual([localCachedData[0]]);
      });

      it('T040.5 SWR 验证应该检测出 updatedAt 相同但实体集合不同的变化', async () => {
        const sameTimestamp = '2024-01-01T00:00:00Z';
        // 本地缓存是 p1，远端集合已换成 p2，但 updatedAt 相同
        const localCachedData = [{ id: 'p1', name: 'Old Entity', updatedAt: sameTimestamp }];
        const remoteData = [{ id: 'p2', name: 'New Entity', updatedAt: sameTimestamp }];
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p2', updatedAt: sameTimestamp }];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(localCachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(10)));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 先发射缓存 p1，再发射远端 p2（updatedAt 相同也必须发射）
        expect(emissions.length).toBe(2);
        expect(emissions[0]).toEqual(localCachedData);
        expect(emissions[1]).toEqual(remoteData);
      });

      it('T040.6 SWR 验证应该检测出 id 和 updatedAt 相同但内容不同的变化', async () => {
        const sameTimestamp = '2024-01-01T00:00:00Z';
        const localCachedData = [{ id: 'p1', name: 'Old Name', updatedAt: sameTimestamp }];
        const remoteData = [{ id: 'p1', name: 'New Name', updatedAt: sameTimestamp }];
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: sameTimestamp }];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(localCachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata).pipe(delay(10)));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map()));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(remoteData));

        const emissions: MockProduct[][] = [];
        await new Promise<void>(resolve => {
          repo.find({ where: { combinator: 'and', rules: [] }, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        expect(emissions).toEqual([localCachedData, remoteData]);
      });
    });

    describe('T041 - SWR 异步验证更新', () => {
      it('T041.1 缓存过时时应该发射两次（缓存 + 更新后数据）', async () => {
        const cachedData: MockProduct[] = [{ id: 'p1', name: 'Old Name', updatedAt: '2024-01-01T00:00:00Z' }];
        const updatedData: MockProduct[] = [{ id: 'p1', name: 'New Name', updatedAt: '2024-01-02T00:00:00Z' }];
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-02T00:00:00Z' }];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(cachedData));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));
        vi.mocked(remoteAdapter.findByIds).mockReturnValue(of(updatedData));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 应该发射两次：第一次是缓存，第二次是更新后的数据
        expect(emissions.length).toBe(2);
        expect(emissions[0][0].name).toBe('Old Name');
        expect(emissions[1][0].name).toBe('New Name');
      });

      it('T041.2 缓存新鲜时应该只发射一次（无需更新）', async () => {
        const cachedData: MockProduct[] = [{ id: 'p1', name: 'Fresh Product', updatedAt: '2024-01-01T00:00:00Z' }];
        const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'p1', updatedAt: '2024-01-01T00:00:00Z' }];

        vi.mocked(localAdapter.findByIds!).mockReturnValue(of(cachedData));
        vi.mocked(localAdapter.getMetadataByIds).mockReturnValue(of(new Map([['p1', '2024-01-01T00:00:00Z']])));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of(remoteMetadata));

        const emissions: MockProduct[][] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true }).subscribe({
            next: data => emissions.push(data),
            complete: () => resolve()
          });
        });

        // 缓存新鲜，只发射一次
        expect(emissions.length).toBe(1);
        expect(emissions[0][0].name).toBe('Fresh Product');
      });

      it('T041.3 远程验证失败时应该返回缓存数据（降级）', async () => {
        const cachedData: MockProduct[] = [{ id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(cachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        const emissions: MockProduct[][] = [];
        const errors: Error[] = [];
        const query = { combinator: 'and' as const, rules: [] };

        await new Promise<void>(resolve => {
          repo.find({ where: query, localCacheFirst: true, offlineFallback: true }).subscribe({
            next: data => emissions.push(data),
            error: err => {
              errors.push(err);
              resolve();
            },
            complete: () => resolve()
          });
        });

        expect(emissions).toEqual([cachedData]);
        expect(errors).toEqual([]);
      });
    });
  });

  describe('离线降级模式 (T046-T047)', () => {
    describe('T046 - 离线时返回缓存', () => {
      it('T046.1 网络错误时应该返回本地缓存', async () => {
        const cachedData: MockProduct[] = [{ id: 'p1', name: 'Cached Product', updatedAt: '2024-01-01T00:00:00Z' }];

        // 模拟本地有缓存
        vi.mocked(localAdapter.findAll!).mockReturnValue(of(cachedData));
        // 模拟网络错误
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        const result = await firstValueFrom(
          repo.find({ where: { combinator: 'and', rules: [] }, offlineFallback: true })
        );

        expect(result).toEqual(cachedData);
      });

      it('T046.4 网络错误时返回的缓存应该按 where 条件过滤', async () => {
        const cachedData = [
          { id: 'p1', name: 'Active Product', status: 'active', updatedAt: '2024-01-01T00:00:00Z' },
          { id: 'p2', name: 'Inactive Product', status: 'inactive', updatedAt: '2024-01-01T00:00:00Z' }
        ];

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(cachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        const result = await firstValueFrom(
          repo.find({
            where: { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'active' }] },
            offlineFallback: true
          })
        );

        expect(result).toEqual([cachedData[0]]);
      });

      it('T046.2 offlineFallback=false 时网络错误应该抛出', async () => {
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        await expect(
          firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] }, offlineFallback: false }))
        ).rejects.toThrow('Network error');
      });

      it('T046.3 默认情况下网络错误应该抛出', async () => {
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        await expect(firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] } }))).rejects.toThrow(
          'Network error'
        );
      });
    });

    describe('T047 - 无缓存时抛出 NetworkOfflineError', () => {
      it('T047.1 离线且无缓存时应该抛出 NetworkOfflineError', async () => {
        // 本地无缓存
        vi.mocked(localAdapter.findAll!).mockReturnValue(of([]));
        // 网络错误
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('Network error')));

        await expect(
          firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] }, offlineFallback: true }))
        ).rejects.toThrow('NetworkOfflineError');
      });

      it('T047.2 NetworkOfflineError 应该包含原始错误信息', async () => {
        vi.mocked(localAdapter.findAll!).mockReturnValue(of([]));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => new Error('fetch failed: ENOTFOUND')));

        try {
          await firstValueFrom(repo.find({ where: { combinator: 'and', rules: [] }, offlineFallback: true }));
          expect.fail('Should have thrown');
        } catch (err) {
          expect((err as Error).message).toContain('NetworkOfflineError');
          expect((err as Error).message).toContain('fetch failed');
        }
      });

      it('T047.3 SWR where 无匹配缓存且远端失败时应该进入 offline fallback', async () => {
        const networkError = new Error('fetch failed: offline');
        const cachedData: MockProduct[] = [
          { id: 'p1', name: 'Inactive Product', status: 'inactive', updatedAt: '2024-01-01T00:00:00Z' }
        ];
        const where: RuleGroup<MockProduct> = {
          combinator: 'and',
          rules: [{ field: 'status', operator: '=', value: 'active' }]
        };

        vi.mocked(localAdapter.findAll!).mockReturnValue(of(cachedData));
        vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => networkError));

        try {
          await firstValueFrom(repo.find({ where, localCacheFirst: true, offlineFallback: true }));
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(NetworkOfflineError);
          expect((error as NetworkOfflineError).originalError).toBe(networkError);
        }
      });
    });
  });
});
