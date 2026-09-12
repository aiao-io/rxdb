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
 * 本文件是 `src/__tests__/integration.spec.ts` 里同名局部常量的**独立一份**，不是复用：
 * 那个常量没有导出，而它所在的文件正在冻结 US-212 的类边界契约。
 *
 * **两份必须一起改。** 它们替的是同一个位置（QueryCache 的本地槽位），core 往那个位置上
 * 加一个必需成员时，只补一份的结果是另一份原地变红——`transaction` 这一条就是这么来的。
 */

import { isSystemEntity, type EntityType } from '@aiao/rxdb';
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
 * 系统实体（`RxDBBranch` / `RxDBChange` / `RxDBSync` …）的内存仓储。
 *
 * @remarks
 * 与行仓储**分开**：core 的 QueryCache 读路径会先问「这些 id 里哪些还被出站队列占着」
 * （`pendingQueryCacheWriteIds`），那一问要读 `RxDBChange`。所有类型共用一份存储时，
 * 缓存行会被当成变更行读出来，本该为空的待推集合于是装满了业务数据 —— 那些 id 随即
 * 被判成「本地有未推送的写」而排除在孤儿清理之外，断言看到的是一份沉默的错答案。
 *
 * `find` 同样**不求值 `where`**，理由见 {@link createLocalAdapter}：`isEntityMatchWhere`
 * 不在 core 的公开 API 上。每个系统类型各自一份存储、且本套件只涉及单分支，
 * 「返回全部」与「按条件返回」在这里同解。
 */
const createSystemRepository = () => {
  const rows: object[] = [];
  return {
    find: vi.fn(() => Promise.resolve([...rows])),
    count: vi.fn(() => Promise.resolve(rows.length)),
    create: vi.fn((entity: object) => {
      rows.push(entity);
      return Promise.resolve(entity);
    }),
    update: vi.fn((entity: object) => Promise.resolve(entity)),
    remove: vi.fn((entity: object) => Promise.resolve(entity))
  };
};

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

  // 系统实体各自一份存储，互不串场；业务实体共用上面那份行仓储
  const systemRepositories = new Map<unknown, ReturnType<typeof createSystemRepository>>();
  const getRepository = (type: unknown): object => {
    if (!isSystemEntity(type as EntityType)) {
      return repository;
    }
    const existing = systemRepositories.get(type);
    if (existing !== undefined) {
      return existing;
    }
    const created = createSystemRepository();
    systemRepositories.set(type, created);
    return created;
  };

  const adapter = {
    name: 'sqlite',
    connect: vi.fn(() => Promise.resolve(adapter)),
    disconnect: vi.fn(() => Promise.resolve()),
    isTableExisted: vi.fn(() => Promise.resolve(false)),
    createTables: vi.fn(() => Promise.resolve()),
    // 与 `src/__tests__/integration.spec.ts` 的同名替身同一口径：占 `sync.local` 槽位就得能跑完
    // `connect()` 的本地引导，两个都取 `RxDBAdapterLocalBase` 的默认 no-op。本套件今天不走
    // `rxdb.connect('sqlite')`，所以缺着也不会红——正因如此才要补上，别让下一个人踩。
    migrateSystemSchema: vi.fn(() => Promise.resolve()),
    completeBootstrap: vi.fn(),
    mutations: vi.fn(() => Promise.resolve([])),
    getRepository,
    // 真适配器在这里排队并开事务；替身同步执行，本套件没有并发窗口要验。
    // 缺了它，`getCurrentBranch()` 的冷路径（本地一张分支表都没有）当场 TypeError
    transaction: vi.fn((fun: (executor: { getRepository: (type: unknown) => object }) => unknown) =>
      Promise.resolve(fun({ getRepository }))
    ),
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
