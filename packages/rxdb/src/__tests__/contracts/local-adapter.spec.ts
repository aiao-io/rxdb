/**
 * @fileoverview 契约测试：`QueryCacheLocalAdapter`（RXD-040）
 *
 * 这个文件原先自己抄了一份 `LocalAdapterQueryCacheContract<T>`，再拿自造的 mock 去断言那份抄件。
 * 抄件写的是 `getMetadataByIds(ids: string[])`，生产接口是 `getMetadataByIds(entityName, ids)`
 * ——少了一个参数，测试照样全绿。这正是 finding 说的「可在真实 API 漂移时继续全绿」。
 *
 * 改法两条：
 *
 * 1. 类型一律从包公开入口 `../../index.js` 取，用 `expectTypeOf` + `@ts-expect-error` 固定签名。
 *    这些断言在 vitest 运行时是 no-op，真正执行它们的是 `tsc -p tsconfig.spec.json --noEmit`
 *    ——签名再漂就是编译错误，而不是绿灯。
 * 2. 行为断言穿过真实 `QueryCacheRepository`，证明适配器是按 `(entityName, ids)` 被调用的，
 *    而不是只证明「我自己写的 mock 满足我自己写的接口」。
 */

import { firstValueFrom, map, Observable, of } from 'rxjs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  EntityBaseType,
  QueryCacheEntityMetadata,
  QueryCacheLocalAdapter,
  QueryCacheLocalReader,
  QueryCacheRemoteAdapter
} from '../../index.js';
import { QueryCacheRepository } from '../../index.js';

class Product {
  id!: string;
  name!: string;
  updatedAt!: string;
}

type ProductEntityType = EntityBaseType & (new () => Product);

const ENTITY_NAME = 'Product';
const ALL: { combinator: 'and'; rules: [] } = { combinator: 'and', rules: [] };

// 替身用接口类型声明（漏方法、签名错都会在 tsc 阶段炸）。返回值不含泛型的方法直接用
// `vi.fn<接口方法类型>()`——签名由接口给出，不是我另写一份。只有 `findByIds<T>` 得包一层：
// `Mock<F>` 会把泛型抹成 `unknown`，`Observable<unknown[]>` 不满足 `Observable<T[]>`，
// 直接赋值会让整个对象不再满足接口——那等于又把类型检查绕开了。
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

/**
 * 本地行仓储（US-020 D8 起 `find` 的本地读出口）。
 *
 * @remarks
 * 契约测试里它不是 `QueryCacheLocalAdapter` 的一部分 —— 生产上传进来的是
 * `localAdapter.getRepository(EntityType)` 的返回物，不是适配器本身。
 */
const createLocalReader = (rows: Product[] = []) => {
  const find = vi.fn<QueryCacheLocalReader<Product>['find']>(() => Promise.resolve(rows));
  return { reader: { find } satisfies QueryCacheLocalReader<Product>, find };
};

const createRemoteAdapter = (metadata: QueryCacheEntityMetadata[] = [], rows: Product[] = []) => {
  const fetchMetadata = vi.fn<QueryCacheRemoteAdapter['fetchMetadata']>(() => of(metadata));
  const remove = vi.fn<NonNullable<QueryCacheRemoteAdapter['delete']>>(() => of(undefined));
  const findByIds = vi.fn((entityName: string, ids: string[]) => rows.filter(row => ids.includes(row.id)));

  const adapter: QueryCacheRemoteAdapter = {
    fetchMetadata,
    delete: remove,
    findByIds: <T>(entityName: string, ids: string[]) => of(findByIds(entityName, ids) as T[])
  };

  return { adapter, fetchMetadata, findByIds, delete: remove };
};

const buildRepository = (
  remoteAdapter: QueryCacheRemoteAdapter,
  localAdapter: QueryCacheLocalAdapter,
  localReader: QueryCacheLocalReader<Product>
): QueryCacheRepository<ProductEntityType> =>
  new QueryCacheRepository<ProductEntityType>(ENTITY_NAME, remoteAdapter, localAdapter, localReader);

describe('QueryCacheLocalAdapter 公开契约', () => {
  describe('签名（由 tsconfig.spec.json --noEmit 强制，vitest 运行时是 no-op）', () => {
    it('三个必需方法的参数与返回值逐个钉死', () => {
      expectTypeOf<Parameters<QueryCacheLocalAdapter['getMetadataByIds']>>().toEqualTypeOf<[string, string[]]>();
      expectTypeOf<ReturnType<QueryCacheLocalAdapter['getMetadataByIds']>>().toEqualTypeOf<
        Observable<Map<string, string>>
      >();

      expectTypeOf<Parameters<QueryCacheLocalAdapter['deleteByIds']>>().toEqualTypeOf<[string, string[]]>();
      expectTypeOf<ReturnType<QueryCacheLocalAdapter['deleteByIds']>>().toEqualTypeOf<Observable<void>>();

      expectTypeOf<Parameters<QueryCacheLocalAdapter['upsertMany']>>().toEqualTypeOf<[string, unknown[]]>();
      expectTypeOf<ReturnType<QueryCacheLocalAdapter['upsertMany']>>().toEqualTypeOf<Observable<void>>();
    });

    it('历史抄件那套「漏掉 entityName」的签名不再满足接口（负编译）', () => {
      const driftedGetMetadataByIds = (ids: string[]): Observable<Map<string, string>> =>
        of(new Map(ids.map(id => [id, ''])));
      const driftedUpsertMany = (data: unknown[]): Observable<void> => of(data).pipe(map(() => undefined));
      const driftedDeleteByIds = (ids: string[]): Observable<void> => of(ids).pipe(map(() => undefined));

      // @ts-expect-error 首参是 entityName: string，不是 ids: string[]
      const badGetMetadataByIds: QueryCacheLocalAdapter['getMetadataByIds'] = driftedGetMetadataByIds;
      // @ts-expect-error 首参是 entityName: string，不是 data: T[]
      const badUpsertMany: QueryCacheLocalAdapter['upsertMany'] = driftedUpsertMany;
      // @ts-expect-error 首参是 entityName: string，不是 ids: string[]
      const badDeleteByIds: QueryCacheLocalAdapter['deleteByIds'] = driftedDeleteByIds;

      expect([badGetMetadataByIds, badUpsertMany, badDeleteByIds].every(fn => typeof fn === 'function')).toBe(true);
    });

    it('只有 findByIds / findAll 可选，三个必需方法一个都不能省（负编译）', () => {
      const minimal: QueryCacheLocalAdapter = {
        getMetadataByIds: () => of(new Map<string, string>()),
        upsertMany: () => of(undefined),
        deleteByIds: () => of(undefined)
      };

      // @ts-expect-error 少了 upsertMany
      const incomplete: QueryCacheLocalAdapter = {
        getMetadataByIds: () => of(new Map<string, string>()),
        deleteByIds: () => of(undefined)
      };

      expect(minimal.findByIds).toBeUndefined();
      expect(minimal.findAll).toBeUndefined();
      expect(incomplete.upsertMany).toBeUndefined();
    });
  });

  describe('真实 QueryCacheRepository 的调用形态', () => {
    // `find` 自 US-020 D8 起不再问 `getMetadataByIds`（那样问不出孤儿），
    // 但 `findById` 仍用它做单 id 的新鲜度判断 —— 这也是该方法留在必需集里的唯一理由。
    it('getMetadataByIds 收到 (entityName, 单 id 数组)', async () => {
      const local = createLocalAdapter();
      const remote = createRemoteAdapter(
        [{ id: 'p-1', updatedAt: '2026-08-01T00:00:00.000Z' }],
        [{ id: 'p-1', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' }]
      );
      const repository = buildRepository(remote.adapter, local.adapter, createLocalReader().reader);

      await firstValueFrom(repository.findById('p-1'));

      expect(local.getMetadataByIds).toHaveBeenCalledWith(ENTITY_NAME, ['p-1']);
    });

    it('upsertMany 收到 (entityName, 远端拉回的整行)', async () => {
      const pulled = { id: 'p-1', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' };
      const local = createLocalAdapter();
      const remote = createRemoteAdapter([{ id: 'p-1', updatedAt: '2026-08-01T00:00:00.000Z' }], [pulled]);
      const repository = buildRepository(remote.adapter, local.adapter, createLocalReader().reader);

      await firstValueFrom(repository.find({ where: ALL }));

      expect(local.upsertMany).toHaveBeenCalledWith(ENTITY_NAME, [pulled]);
    });

    it('本地已是最新时从本地行仓储读，不回源也不重复 upsert', async () => {
      const cached = { id: 'p-1', name: 'A', updatedAt: '2026-08-01T00:00:00.000Z' };
      const local = createLocalAdapter();
      const reader = createLocalReader([cached]);
      const remote = createRemoteAdapter([{ id: 'p-1', updatedAt: '2026-08-01T00:00:00.000Z' }]);
      const repository = buildRepository(remote.adapter, local.adapter, reader.reader);

      const rows = await firstValueFrom(repository.find({ where: ALL }));

      // 本地这一侧的新鲜度由 `where` 的本地投影给出，而不是「拿远端 id 回来问本地」
      expect(reader.find).toHaveBeenCalledWith({ where: ALL });
      expect(local.getMetadataByIds).not.toHaveBeenCalled();
      expect(remote.findByIds).not.toHaveBeenCalled();
      expect(local.upsertMany).not.toHaveBeenCalled();
      expect(rows).toEqual([cached]);
    });

    it('deleteByIds 收到 (entityName, id 数组)，单个 id 也归一成数组', async () => {
      const local = createLocalAdapter();
      const remote = createRemoteAdapter();
      const repository = buildRepository(remote.adapter, local.adapter, createLocalReader().reader);

      await firstValueFrom(repository.delete('p-1'));

      expect(remote.delete).toHaveBeenCalledWith(ENTITY_NAME, 'p-1');
      expect(local.deleteByIds).toHaveBeenCalledWith(ENTITY_NAME, ['p-1']);
    });

    it('远端删除失败时不碰本地缓存', async () => {
      const local = createLocalAdapter();
      const failure = new Error('remote delete failed');
      const remoteAdapter: QueryCacheRemoteAdapter = {
        ...createRemoteAdapter().adapter,
        delete: () => new Observable<void>(subscriber => subscriber.error(failure))
      };
      const repository = buildRepository(remoteAdapter, local.adapter, createLocalReader().reader);

      await expect(firstValueFrom(repository.delete(['p-1', 'p-2']))).rejects.toBe(failure);
      expect(local.deleteByIds).not.toHaveBeenCalled();
    });
  });
});
