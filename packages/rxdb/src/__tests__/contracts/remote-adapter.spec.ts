/**
 * @fileoverview 契约测试：`QueryCacheRemoteAdapter`（RXD-040）
 *
 * 同 `local-adapter.spec.ts`：原先自写一份 `RemoteAdapterQueryCacheContract<T>`，把
 * `fetchMetadata(query: Record<string, unknown>)` 当成契约——生产签名是
 * `fetchMetadata<TEntity>(entityName: string, query: RuleGroup<TEntity>)`。参数个数、
 * 顺序、类型三项全错，测试仍然全绿，因为它断言的是自己那份抄件。
 *
 * 现在：类型从公开入口 `../../index.js` 取并用 `expectTypeOf` / `@ts-expect-error` 固定
 * （由 `tsc -p tsconfig.spec.json --noEmit` 执行），行为断言穿真实 `QueryCacheRepository`。
 */

import { firstValueFrom, Observable, of } from 'rxjs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  EntityBaseType,
  QueryCacheEntityMetadata,
  QueryCacheLocalAdapter,
  QueryCacheRemoteAdapter,
  RuleGroup
} from '../../index.js';
import { QueryCacheRepository } from '../../index.js';

class Product {
  id!: string;
  name!: string;
  updatedAt!: string;
}

type ProductEntityType = EntityBaseType & (new () => Product);

const ENTITY_NAME = 'Product';
const ACTIVE_ONLY: RuleGroup<Product> = {
  combinator: 'and',
  rules: [{ field: 'name', operator: '=', value: 'A' }]
};

// 替身怎么搭、为什么 `findByIds` 得单独包一层，见 local-adapter.spec.ts 同处注释。
const createLocalAdapter = (cached: Product[] = [], metadata = new Map<string, string>()) => {
  const getMetadataByIds = vi.fn<QueryCacheLocalAdapter['getMetadataByIds']>(() => of(metadata));
  const upsertMany = vi.fn<QueryCacheLocalAdapter['upsertMany']>(() => of(undefined));
  const deleteByIds = vi.fn<QueryCacheLocalAdapter['deleteByIds']>(() => of(undefined));
  const findByIds = vi.fn((entityName: string, ids: string[]) => cached.filter(row => ids.includes(row.id)));

  const adapter: QueryCacheLocalAdapter = {
    getMetadataByIds,
    upsertMany,
    deleteByIds,
    findByIds: <T>(entityName: string, ids: string[]) => of(findByIds(entityName, ids) as T[])
  };

  return { adapter, getMetadataByIds, upsertMany, deleteByIds, findByIds };
};

const createRemoteAdapter = (metadata: QueryCacheEntityMetadata[] = [], rows: Product[] = []) => {
  const fetchMetadata = vi.fn<QueryCacheRemoteAdapter['fetchMetadata']>(() => of(metadata));
  const findByIds = vi.fn((entityName: string, ids: string[]) => rows.filter(row => ids.includes(row.id)));

  const adapter: QueryCacheRemoteAdapter = {
    fetchMetadata,
    findByIds: <T>(entityName: string, ids: string[]) => of(findByIds(entityName, ids) as T[])
  };

  return { adapter, fetchMetadata, findByIds };
};

describe('QueryCacheRemoteAdapter 公开契约', () => {
  describe('签名（由 tsconfig.spec.json --noEmit 强制，vitest 运行时是 no-op）', () => {
    it('两个必需方法的参数与返回值逐个钉死', () => {
      expectTypeOf<Parameters<QueryCacheRemoteAdapter['fetchMetadata']>>().toEqualTypeOf<
        [string, RuleGroup<unknown>]
      >();
      expectTypeOf<ReturnType<QueryCacheRemoteAdapter['fetchMetadata']>>().toEqualTypeOf<
        Observable<QueryCacheEntityMetadata[]>
      >();

      expectTypeOf<Parameters<QueryCacheRemoteAdapter['findByIds']>>().toEqualTypeOf<[string, string[]]>();
      expectTypeOf<ReturnType<QueryCacheRemoteAdapter['findByIds']>>().toEqualTypeOf<Observable<unknown[]>>();
    });

    it('历史抄件那套「单参数」签名不再满足接口（负编译）', () => {
      const driftedFetchMetadata = (query: Record<string, unknown>): Observable<QueryCacheEntityMetadata[]> =>
        of(Object.keys(query).map(id => ({ id, updatedAt: '' })));
      const driftedFindByIds = (ids: string[]): Observable<unknown[]> => of(ids);

      // @ts-expect-error 首参是 entityName: string，不是 query
      const badFetchMetadata: QueryCacheRemoteAdapter['fetchMetadata'] = driftedFetchMetadata;
      // @ts-expect-error 首参是 entityName: string，不是 ids
      const badFindByIds: QueryCacheRemoteAdapter['findByIds'] = driftedFindByIds;

      expect([badFetchMetadata, badFindByIds].every(fn => typeof fn === 'function')).toBe(true);
    });

    it('只有 create / update / delete 可选，fetchMetadata + findByIds 必需（负编译）', () => {
      const minimal: QueryCacheRemoteAdapter = {
        fetchMetadata: () => of([]),
        findByIds: () => of([])
      };

      // @ts-expect-error 少了 findByIds
      const incomplete: QueryCacheRemoteAdapter = {
        fetchMetadata: () => of([])
      };

      expect([minimal.create, minimal.update, minimal.delete].every(fn => fn === undefined)).toBe(true);
      expect(incomplete.findByIds).toBeUndefined();
    });
  });

  describe('真实 QueryCacheRepository 的调用形态', () => {
    it('fetchMetadata 收到 (entityName, 原样的 RuleGroup)，而不是被拆开的裸对象', async () => {
      const local = createLocalAdapter();
      const remote = createRemoteAdapter();
      const repository = new QueryCacheRepository<ProductEntityType>(ENTITY_NAME, remote.adapter, local.adapter);

      await firstValueFrom(repository.find({ where: ACTIVE_ONLY }));

      expect(remote.fetchMetadata).toHaveBeenCalledWith(ENTITY_NAME, ACTIVE_ONLY);
    });

    it('findById 把单个 id 也包成 RuleGroup 再交给 fetchMetadata', async () => {
      const row = { id: 'p-1', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' };
      const local = createLocalAdapter();
      const remote = createRemoteAdapter([{ id: 'p-1', updatedAt: '2026-08-01T00:00:00.000Z' }], [row]);
      const repository = new QueryCacheRepository<ProductEntityType>(ENTITY_NAME, remote.adapter, local.adapter);

      const found = await firstValueFrom(repository.findById('p-1'));

      expect(remote.fetchMetadata).toHaveBeenCalledWith(ENTITY_NAME, {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'p-1' }]
      });
      expect(remote.findByIds).toHaveBeenCalledWith(ENTITY_NAME, ['p-1']);
      expect(found).toEqual(row);
    });

    it('findByIds 只收 missing + stale 的 id，本地新鲜的那条不回源', async () => {
      const fresh = { id: 'p-1', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' };
      const stale = { id: 'p-2', name: 'B2', updatedAt: '2026-08-05T00:00:00.000Z' };
      const missing = { id: 'p-3', name: 'C', updatedAt: '2026-08-03T00:00:00.000Z' };
      const local = createLocalAdapter(
        [fresh],
        new Map([
          ['p-1', '2026-08-01T00:00:00.000Z'],
          ['p-2', '2026-08-02T00:00:00.000Z']
        ])
      );
      const remote = createRemoteAdapter(
        [
          { id: 'p-1', updatedAt: '2026-08-01T00:00:00.000Z' },
          { id: 'p-2', updatedAt: '2026-08-05T00:00:00.000Z' },
          { id: 'p-3', updatedAt: '2026-08-03T00:00:00.000Z' }
        ],
        [stale, missing]
      );
      const repository = new QueryCacheRepository<ProductEntityType>(ENTITY_NAME, remote.adapter, local.adapter);

      const rows = await firstValueFrom(repository.find({ where: ACTIVE_ONLY }));

      expect(remote.findByIds).toHaveBeenCalledWith(ENTITY_NAME, ['p-3', 'p-2']);
      expect(rows).toEqual([fresh, stale, missing]);
    });

    it('远端一条都没有时不查本地元数据、也不回源', async () => {
      const local = createLocalAdapter();
      const remote = createRemoteAdapter();
      const repository = new QueryCacheRepository<ProductEntityType>(ENTITY_NAME, remote.adapter, local.adapter);

      const rows = await firstValueFrom(repository.find({ where: ACTIVE_ONLY }));

      expect(rows).toEqual([]);
      expect(local.getMetadataByIds).not.toHaveBeenCalled();
      expect(remote.findByIds).not.toHaveBeenCalled();
    });

    it('可选的写方法缺席时，写操作抛出点名实体的错误而不是静默降级', () => {
      const repository = new QueryCacheRepository<ProductEntityType>(
        ENTITY_NAME,
        createRemoteAdapter().adapter,
        createLocalAdapter().adapter
      );

      expect(() => repository.create({ name: 'A' })).toThrow(
        `Remote adapter does not support create operation for ${ENTITY_NAME}`
      );
      expect(() => repository.update('p-1', { name: 'A' })).toThrow(
        `Remote adapter does not support update operation for ${ENTITY_NAME}`
      );
      expect(() => repository.delete('p-1')).toThrow(
        `Remote adapter does not support delete operation for ${ENTITY_NAME}`
      );
    });
  });
});
