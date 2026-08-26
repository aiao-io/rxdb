/**
 * @packageDocumentation
 * QueryCache 本地一侧的内存替身（US-213 AC#8）。
 *
 * @remarks
 * **只有 AC#8 需要它。** 其余 AC 都直驱适配器，快且断言直接；但 `idChunkSize` 分块
 * 只在 core 的 `QueryCacheRepository` 把**整份** id 列表交给 `findByIds` 时才显形——
 * 直驱构造不出那个场景，必须让真的 `RxDB` 跑一次完整的
 * `fetchMetadata → diffMetadata → findByIds → upsertMany`。
 *
 * 本文件是 `src/__tests__/integration.spec.ts` 里同名局部常量的**独立一份**，不是复用。
 * US-213 明令不改 `src/__tests__/` 下任何文件，而那个常量没有导出——把它提取出来共享
 * 会动到一个正在冻结契约的文件。两份各自演进的代价，小于为了 DRY 去改它。
 */

import { of } from 'rxjs';
import { vi } from 'vitest';

/** 本地存储里的一行；`updatedAt` 是适配器口径的 ISO 串，不是 `Date` */
export interface LocalRow {
  [field: string]: unknown;
  id: string;
  updatedAt: string;
}

/** {@link createLocalAdapter} 的返回值 */
export interface LocalAdapterFixture {
  /** 交给 `rxdb.adapter('sqlite', …)` 的适配器对象 */
  adapter: object;
  /** 行缓存，断言"落盘的是远端回执"时直接读它 */
  store: Map<string, LocalRow>;
  /**
   * 接上行 → 实体的物化函数。
   *
   * @remarks
   * 分两步是因为循环依赖：`createEntityRef` 挂在 `rxdb.entityManager` 上，而 `RxDB`
   * 的构造又需要本适配器已经注册。先建替身、`init()` 之后再回填。
   */
  attach(materialize: (data: LocalRow) => LocalRow): void;
}

/**
 * 造一个站在真实 sqlite 位置上的本地适配器替身。
 *
 * @remarks
 * `find` **不求值 `where`**，直接返回存储里的全部行。这不是偷懒——`isEntityMatchWhere`
 * 不在 core 的公开 API 上，为了测试去够它等于让测试依赖私有实现。
 *
 * 代价必须写明：**同一个库实例上只能跑一个 `where`**。多个查询共用这一张表时，本地投影
 * 会把别的查询的行喂给 `diffMetadata`，那些行随即被判成孤儿删掉，用例变成随机失败。
 * 每个用例各建一个库实例即可。
 *
 * @param initial - 预置行，缺省为空（AC#8 需要本地全空才会拉取全部 id）
 */
export const createLocalAdapter = (initial: LocalRow[] = []): LocalAdapterFixture => {
  const store = new Map(initial.map(item => [item.id, item]));
  let toEntity: (data: LocalRow) => LocalRow = data => data;

  const repository = {
    find: vi.fn(() => Promise.resolve([...store.values()].map(toEntity))),
    count: vi.fn(() => Promise.resolve(store.size)),
    create: vi.fn((entity: LocalRow) => Promise.resolve(entity)),
    update: vi.fn((entity: LocalRow) => Promise.resolve(entity)),
    remove: vi.fn((entity: LocalRow) => Promise.resolve(entity))
  };

  const adapter = {
    name: 'sqlite',
    connect: vi.fn(() => Promise.resolve(adapter)),
    disconnect: vi.fn(() => Promise.resolve()),
    isTableExisted: vi.fn(() => Promise.resolve(false)),
    createTables: vi.fn(() => Promise.resolve()),
    mutations: vi.fn(() => Promise.resolve([])),
    getRepository: () => repository,
    // 以下三个是 `assertQueryCacheCapabilities` 特性探测的 duck，缺任一个整条
    // QueryCache 读路径都装配不起来
    getMetadataByIds: vi.fn((_entityName: string, ids: string[]) =>
      of(new Map(ids.filter(id => store.has(id)).map(id => [id, store.get(id)!.updatedAt])))
    ),
    upsertMany: vi.fn((_entityName: string, data: LocalRow[]) => {
      for (const item of data) {
        store.set(item.id, item);
      }
      return of(undefined);
    }),
    deleteByIds: vi.fn((_entityName: string, ids: string[]) => {
      for (const id of ids) {
        store.delete(id);
      }
      return of(undefined);
    })
  };

  return { adapter, store, attach: materialize => void (toEntity = materialize) };
};
