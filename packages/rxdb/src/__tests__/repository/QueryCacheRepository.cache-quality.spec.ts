/**
 * @fileoverview QueryCache 的缓存质量约束（US-020 阶段 B，AC#11 / #12 / #14 / #15 / #16）。
 *
 * 与 `QueryCacheRepository.spec.ts` 的分工：那份覆盖同步流程本身（拉什么、写什么），
 * 这份覆盖「缓存不许骗人」的四件事 ——
 * 孤儿必须真删、本地读必须走 SQL 下推、没有「读不到就当没有」的降级、
 * 离线降级只吞网络错误。
 */

import { firstValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityBaseType } from '../../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../../entity/metadata-options.interface.js';
import { isEntityMatchWhere } from '../../query/query-matching.utils.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import {
  QueryCacheLocalAdapter,
  QueryCacheLocalReader,
  QueryCacheRemoteAdapter,
  QueryCacheRepository,
  SyncStats
} from '../../repository/QueryCacheRepository.js';
import { NetworkOfflineError } from '../../RxDBError.js';
import { noPendingWrites } from '../fixtures/pending-writes.js';

class Product {
  id!: string;
  name!: string;
  status?: string;
  updatedAt!: string;
}

type ProductType = EntityBaseType & (new () => Product);

const row = (id: string, updatedAt: string, status = 'active'): Product => ({
  id,
  name: `product-${id}`,
  status,
  updatedAt
});

const meta = (id: string, updatedAt: string): QueryCacheEntityMetadata => ({ id, updatedAt });

/** 匹配所有行 */
const ALL: RuleGroup<Product> = { combinator: 'and', rules: [] };

/** 只匹配 `status = 'active'` 的行 */
const ACTIVE: RuleGroup<Product> = {
  combinator: 'and',
  rules: [{ field: 'status', operator: '=', value: 'active' }]
};

/**
 * 站在真实行仓储位置的内存替身。
 *
 * 用真的 `isEntityMatchWhere` 求值，是为了让「`where` 被下推到本地读」这件事可断言：
 * 断言 `find` 收到的 `where` 是什么，而不是断言「读了全表再在内存里筛」。
 */
function createLocalReader(rows: Product[]) {
  const store = new Map(rows.map(item => [item.id, item]));
  return {
    store,
    find: vi.fn(({ where }: { where: RuleGroup<Product> }): Promise<Product[]> =>
      Promise.resolve([...store.values()].filter(entity => isEntityMatchWhere(entity, where)))
    )
  };
}

function createAdapters() {
  const remoteAdapter: QueryCacheRemoteAdapter = {
    fetchMetadata: vi.fn().mockReturnValue(of([])),
    findByIds: vi.fn().mockReturnValue(of([]))
  };
  const localAdapter: QueryCacheLocalAdapter = {
    getMetadataByIds: vi.fn().mockReturnValue(of(new Map())),
    upsertMany: vi.fn().mockReturnValue(of(undefined)),
    deleteByIds: vi.fn().mockReturnValue(of(undefined))
  };
  return { remoteAdapter, localAdapter };
}

describe('QueryCacheRepository 缓存质量（US-020 阶段 B）', () => {
  let remoteAdapter: QueryCacheRemoteAdapter;
  let localAdapter: QueryCacheLocalAdapter;
  let localReader: ReturnType<typeof createLocalReader>;

  const build = (rows: Product[]): QueryCacheRepository<ProductType> => {
    localReader = createLocalReader(rows);
    return new QueryCacheRepository<ProductType>(
      'Product',
      remoteAdapter,
      localAdapter,
      localReader as unknown as QueryCacheLocalReader<Product>,
      noPendingWrites
    );
  };

  beforeEach(() => {
    const adapters = createAdapters();
    remoteAdapter = adapters.remoteAdapter;
    localAdapter = adapters.localAdapter;
  });

  describe('AC#11 孤儿必须真删', () => {
    it('远端结果集里没有的本地行被 deleteByIds 清掉', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z'), row('gone', '2024-01-01T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      await firstValueFrom(repo.find({ where: ALL }));

      expect(localAdapter.deleteByIds).toHaveBeenCalledWith('Product', ['gone']);
    });

    it('orphanCount 等于实际删除条数，不再是恒为 0 的摆设', async () => {
      const repo = build([
        row('p1', '2024-01-01T00:00:00Z'),
        row('x', '2024-01-01T00:00:00Z'),
        row('y', '2024-01-01T00:00:00Z')
      ]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));
      const stats: SyncStats[] = [];

      await firstValueFrom(repo.find({ where: ALL, onSyncStats: value => stats.push(value) }));

      const deleted = vi.mocked(localAdapter.deleteByIds).mock.calls[0][1];
      expect(deleted).toEqual(['x', 'y']);
      expect(stats[0].orphanCount).toBe(deleted.length);
    });

    it('没有孤儿时不发多余的 deleteByIds', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      await firstValueFrom(repo.find({ where: ALL }));

      expect(localAdapter.deleteByIds).not.toHaveBeenCalled();
    });

    it('删除范围限定在本次 where 的本地投影内，范围外的行不受牵连', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z'), row('archived', '2024-01-01T00:00:00Z', 'done')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      await firstValueFrom(repo.find({ where: ACTIVE }));

      // `archived` 不匹配 `status = 'active'`，压根不在本次投影里，不能算孤儿
      expect(localAdapter.deleteByIds).not.toHaveBeenCalled();
    });

    it('结果里不含已删除的孤儿', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z'), row('gone', '2024-01-01T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      const result = await firstValueFrom(repo.find({ where: ALL }));

      expect(result.map(item => item.id)).toEqual(['p1']);
    });
  });

  describe('AC#12 远端返回空集不是「什么都不做」', () => {
    it('远端空集时本地投影整体清空', async () => {
      const repo = build([row('a', '2024-01-01T00:00:00Z'), row('b', '2024-01-01T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([]));
      const stats: SyncStats[] = [];

      const result = await firstValueFrom(repo.find({ where: ALL, onSyncStats: value => stats.push(value) }));

      expect(localAdapter.deleteByIds).toHaveBeenCalledWith('Product', ['a', 'b']);
      expect(stats[0].orphanCount).toBe(2);
      expect(result).toEqual([]);
    });

    it('远端空集且本地也空时不发 deleteByIds', async () => {
      const repo = build([]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([]));

      const result = await firstValueFrom(repo.find({ where: ALL }));

      expect(localAdapter.deleteByIds).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('AC#14 / AC#15 本地读走 IRepository，没有「读不到就当没有」', () => {
    it('本地元数据来自 where 下推的行读取，而不是 getMetadataByIds', async () => {
      const repo = build([row('p1', '2024-01-02T00:00:00Z', 'active')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      await firstValueFrom(repo.find({ where: ACTIVE }));

      expect(localReader.find).toHaveBeenCalledWith({ where: ACTIVE });
      expect(localAdapter.getMetadataByIds).not.toHaveBeenCalled();
    });

    it('新鲜数据按 id in (...) 下推读取，不做全表扫描', async () => {
      const repo = build([row('p1', '2024-01-09T00:00:00Z'), row('p2', '2024-01-09T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      const result = await firstValueFrom(repo.find({ where: ALL }));

      expect(result.map(item => item.id)).toEqual(['p1']);
      expect(remoteAdapter.findByIds).not.toHaveBeenCalled();
    });

    it('SWR 的缓存首发来自同一个 where 下推读取', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z'), row('archived', '2024-01-01T00:00:00Z', 'done')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));

      const first = await firstValueFrom(repo.find({ where: ACTIVE, localCacheFirst: true }));

      expect(first.map(item => item.id)).toEqual(['p1']);
      expect(localReader.find).toHaveBeenCalledWith({ where: ACTIVE });
    });

    it('本地读失败在标准模式下上抛，不静默变成空结果', async () => {
      const repo = build([]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(of([meta('p1', '2024-01-01T00:00:00Z')]));
      localReader.find.mockRejectedValue(new Error('sqlite disk I/O error'));

      await expect(firstValueFrom(repo.find({ where: ALL }))).rejects.toThrow('sqlite disk I/O error');
    });
  });

  describe('AC#16 offlineFallback 只吞网络错误', () => {
    const networkDown = () => new TypeError('Failed to fetch');

    it('网络错误 + 有缓存 → 返回缓存', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z')]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(networkDown));

      const result = await firstValueFrom(repo.find({ where: ALL, offlineFallback: true }));

      expect(result.map(item => item.id)).toEqual(['p1']);
    });

    it('网络错误 + 无缓存 → NetworkOfflineError', async () => {
      const repo = build([]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(networkDown));

      await expect(firstValueFrom(repo.find({ where: ALL, offlineFallback: true }))).rejects.toBeInstanceOf(
        NetworkOfflineError
      );
    });

    it('401 原样上抛，不被换成缓存', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z')]);
      const unauthorized = Object.assign(new Error('JWT expired'), { status: 401 });
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => unauthorized));

      await expect(firstValueFrom(repo.find({ where: ALL, offlineFallback: true }))).rejects.toBe(unauthorized);
    });

    it('业务/校验错误原样上抛，即便本地有缓存', async () => {
      const repo = build([row('p1', '2024-01-01T00:00:00Z')]);
      const invalid = Object.assign(new Error('invalid filter column "colour"'), { code: '42703' });
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(() => invalid));

      await expect(firstValueFrom(repo.find({ where: ALL, offlineFallback: true }))).rejects.toBe(invalid);
    });

    it('本地读自己出错时不冒充离线', async () => {
      const repo = build([]);
      vi.mocked(remoteAdapter.fetchMetadata).mockReturnValue(throwError(networkDown));
      localReader.find.mockRejectedValue(new Error('sqlite disk I/O error'));

      await expect(firstValueFrom(repo.find({ where: ALL, offlineFallback: true }))).rejects.toThrow(
        'sqlite disk I/O error'
      );
    });
  });
});
