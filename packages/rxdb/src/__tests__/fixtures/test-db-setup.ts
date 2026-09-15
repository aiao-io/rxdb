/**
 * @fileoverview 测试数据库配置（unit 层假适配器）
 *
 * ## 测试分层说明（重要 — 避免误判重构）
 *
 * RxDB 项目采用两层测试架构：
 *
 * 1. **Unit 层（本包内 `__tests__/`）**：使用 {@link createMockAdapter} —— 只有形状、没有存储的假适配器
 *    - 跑得快、零外部依赖、覆盖**纯逻辑**：query merging / scope filter / entity status / patch 计算 等
 *    - 不验证真实存储行为（SQL/事务/并发/序列）
 *
 * 2. **Integration 层（位于 `packages/rxdb-adapter-pglite/__tests__/`，41 个 spec）**：使用真 PGlite
 *    - 覆盖**真实业务流**：shop / tree-incremental / cascade-delete / relation-cache / cursor / change-queue
 *    - 适配器特定行为也由各自 adapter 包内 spec 覆盖（wa-sqlite / sqlite / sqliteai / supabase）
 *
 * 共享 fixtures（实体定义 / 清理工具 / Observable 断言）由 `@aiao/rxdb-test` 提供。
 *
 * **不要把 unit 层的 mock 测试改为真集成测试** —— 它们各司其职，
 * mock 是为了快速验证纯逻辑，真行为在 adapter 包里已充分覆盖。
 */

import { type Observable, of } from 'rxjs';
import { type Mock, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import {
  type IRxDBAdapter,
  RxDBAdapterLocalBase,
  type RxDBMutationsMap,
  type SwitchBranchOptions,
  type TransactionFun
} from '../../rxdb-adapter.js';
import type { RxDBOptions } from '../../rxdb.interface.js';
import { RxDB } from '../../RxDB.js';
import type { RxDBChange } from '../../system/change.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import { fakeTableRef } from './fake-table-ref.js';
import { TEST_ENTITIES } from './test-entities.js';

/**
 * 假适配器交给 `getRepository()` 的仓库桩。
 *
 * @remarks
 * 类型是**真的** {@link IRepository}，不是 `as never` 糊出来的：该接口只有五个成员，
 * 全部实现的成本几乎为零，而换来的是「仓库接口一旦加成员，这里立刻编译失败」。
 */
function createStubRepository(rows: InstanceType<EntityType>[] = []): IRepository<EntityType> {
  return {
    find: vi.fn(async () => rows),
    count: vi.fn(async () => rows.length),
    create: vi.fn(async entity => entity),
    update: vi.fn(async entity => entity),
    remove: vi.fn(async entity => entity)
  };
}

/**
 * 替换**未登记专用仓库的那些**实体的仓库。
 *
 * @param adapter - 要打桩的替身
 * @param repository - 用例自己那份仓库
 *
 * @remarks
 * `getRepository` 是通用入口，用例惯用的 `mockReturnValue(x)` 会把**每一个**实体都换成 `x`，
 * 连同用例自己先前经 {@link MockLocalAdapter.stubEntityRepository} 登记的那些一起盖掉。
 * 而那些行往往是「读不到不等于空结果，而是一个错误」的引导行（贡献系统能力的插件几乎都有
 * 一行这样的状态行），于是用例会挂在一个与被测行为毫无关系的地方。用例真正想换的从来只是
 * 自己那张表。
 */
export const stubAdapterRepository = (adapter: MockLocalAdapter, repository: unknown): void => {
  const dedicated = adapter.dedicatedRepositories;
  adapter.getRepository.mockImplementation(EntityType => (dedicated.get(EntityType) ?? repository) as never);
};

/**
 * unit 层用的本地适配器替身。
 *
 * @remarks
 * **它是 {@link RxDBAdapterLocalBase} 的真子类，而不是一个被 `as unknown as IRxDBAdapter`
 * 强行认领的对象字面量。** 这一条是本文件唯一重要的设计决定：
 *
 * - 强转版本长期实现着 `create` / `update` / `remove` / `findOne` / `findMany` / `count`
 *   —— 真适配器接口里**根本没有这六个方法**，任何依赖它们的用例验证的都是替身自己；
 *   同时缺着 `name` / `version` / `saveMany` / `removeMany` / `mutations` 和本地基类的
 *   全部抽象成员，而 tsc 被那句强转堵住了嘴。
 * - 现在基类往接口里加一个抽象成员，**编译在这里就断**，而不是等到某个用例在运行时
 *   撞见 `undefined is not a function`。
 * - `bootstrapTransaction()` / `migrateSystemSchema()` / `completeBootstrap()` 直接**继承**
 *   基类的真实现。从前是手抄一份并注释「与基类同口径」—— 口径是否真的一致，没有任何东西在保证。
 *
 * 只保留形状，不保留存储：这里没有 Map 后备表。真正的读写语义由 PGlite / wa-sqlite 等
 * adapter 包的集成层验证，unit 层复制一份内存实现只会多出一个谁都不信的第三方版本。
 *
 * 不实现可选的 `rawQuery` —— 它在接口里就是可选的，而 `Repository.rawQuery()` 在适配器
 * 没有它时抛「not supported」。补一个假的等于把那条路径永久遮住。
 */
export class MockLocalAdapter extends RxDBAdapterLocalBase implements IRxDBAdapter {
  /**
   * 所有 `getRepository()` 调用共享同一个仓库桩。
   *
   * @remarks
   * 稳定的对象标识是用例依赖的：多处用例先取一次默认仓库，再用
   * `mockImplementation` 只替换某个实体的仓库、其余原样返回。每次新建会让这种
   * 「只替换一个」的写法退化成「每次都换」。
   */
  readonly #repository = createStubRepository();

  /**
   * 按实体登记的专用仓库；未登记的实体一律拿 `#repository`。
   *
   * @remarks
   * 存在的理由是**有些行读不到不等于空结果，而是一个错误**：贡献系统能力的插件在引导时
   * 要读自己那一行状态行，读不到就抛。核心这一侧不认识任何具体的那种行——谁需要谁在
   * `beforeEach` 里 {@link MockLocalAdapter.stubEntityRepository} 登记一份，本文件就不必
   * 为了一个插件的实体去 import 那个插件。
   */
  readonly #dedicatedRepositories = new Map<EntityType, IRepository<EntityType>>();

  name = 'mock';

  connect: Mock<() => Promise<IRxDBAdapter>> = vi.fn(async () => this);

  disconnect = vi.fn<() => Promise<void>>(async () => undefined);

  version = vi.fn<() => Promise<string>>(async () => 'mock');

  isTableExisted = vi.fn<(EntityType: EntityType) => Promise<boolean>>(async () => false);

  createTables = vi.fn<(EntityTypes: EntityType[], entities?: InstanceType<EntityType>[]) => Promise<boolean>>(
    async () => true
  );

  switchBranch = vi.fn<(options: SwitchBranchOptions) => Promise<void>>(async () => undefined);

  getRxDBChangeSequence = vi.fn<() => Promise<number>>(async () => 0);

  mergeChanges = vi.fn<
    (
      actions: SwitchVersionActions,
      localChanges?: Omit<RxDBChange, 'id'>[],
      disableTriggers?: boolean
    ) => Promise<number | void>
  >(async () => undefined);

  getMetadataByIds = vi.fn<(entityName: string, ids: string[]) => Observable<Map<string, string>>>(() => of(new Map()));

  upsertMany = vi.fn<(entityName: string, data: unknown[]) => Observable<void>>(() => of(undefined));

  deleteByIds = vi.fn<(entityName: string, ids: string[]) => Observable<void>>(() => of(undefined));

  saveMany = vi.fn<(entities: InstanceType<EntityType>[]) => Promise<InstanceType<EntityType>[]>>(
    async entities => entities
  );

  removeMany = vi.fn<(entities: InstanceType<EntityType>[]) => Promise<InstanceType<EntityType>[]>>(
    async entities => entities
  );

  mutations = vi.fn<(options: RxDBMutationsMap<EntityType>) => Promise<InstanceType<EntityType>[]>>(async options =>
    [...options.create.values(), ...options.update.values(), ...options.remove.values()].flatMap(set => [...set])
  );

  /**
   * 全包唯一一处「窄转」，理由在类型系统本身，不在这个替身。
   *
   * @remarks
   * 真签名的返回值是**调用方**挑的类型参数（`getRepository<T, RT>(…): RT`），而 vitest 的
   * `Mock<T>` 把调用签名重写成 `(...args: MockParameters<T>) => MockReturnType<T>` ——
   * 泛型在这一步就被抹平了，任何 `Mock<…>` 都不可能满足一个返回 `RT` 的成员。
   *
   * 所以这里把两半拼起来：调用签名取**真接口上的那一个**（`IRxDBAdapter['getRepository']`，
   * 接口一改这里就崩），mock 那套方法取 `Mock<…>`。转换发生在两个描述同一个值的类型之间，
   * 不是拿它盖住某个缺失的成员 —— 与被删掉的 `as unknown as IRxDBAdapter` 完全是两回事。
   */
  getRepository: IRxDBAdapter['getRepository'] & Mock<(EntityType: EntityType) => IRepository<EntityType>> = vi.fn(
    EntityType => this.#dedicatedRepositories.get(EntityType) ?? this.#repository
  ) as IRxDBAdapter['getRepository'] & Mock<(EntityType: EntityType) => IRepository<EntityType>>;

  /**
   * 事务替身：把回调放进一个最小 {@link TransactionExecutor} 里同步跑掉，不做任何隔离。
   *
   * @remarks
   * executor 的 `getRepository` / `saveMany` / `removeMany` / `mutations` 一律转发回适配器
   * 自身，因此「打桩 `adapter.getRepository` 再断言事务内读写」的既有用例语义不变。
   */
  transaction = vi.fn<(fun: TransactionFun, transactionLog?: boolean) => Promise<unknown>>(async fun => {
    const executor: TransactionExecutor = {
      id: 'mock-executor',
      state: 'active',
      query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
      tableRef: fakeTableRef,
      mutations: options => this.mutations(options as RxDBMutationsMap<EntityType>),
      getRepository: EntityType => this.getRepository(EntityType),
      saveMany: entities => this.saveMany(entities),
      removeMany: entities => this.removeMany(entities),
      mergeChanges: async (actions, localChanges, disableTriggers) => {
        await this.mergeChanges(actions, localChanges, disableTriggers);
      },
      run: fn => fn(executor)
    };
    return fun(executor);
  });

  /**
   * 已登记专用仓库的实体表，只读。
   *
   * @remarks
   * 转出去是给 {@link stubAdapterRepository} 用的：它要在替换默认仓库时把这些绕过去，
   * 而它是个自由函数，够不着私有字段。
   */
  get dedicatedRepositories(): ReadonlyMap<EntityType, IRepository<EntityType>> {
    return this.#dedicatedRepositories;
  }

  /**
   * 给单个实体登记一份专用仓库。
   *
   * @param EntityType - 实体类
   * @param rows - 该实体 `find()` 要返回的行；不传即空表
   * @returns 登记进去的那份仓库，便于用例直接在它的 `find` / `create` 上断言
   *
   * @remarks
   * 登记后即使用例再调 {@link stubAdapterRepository} 换掉其余实体的仓库，这一份仍然生效——
   * 「引导要读的那一行」与「用例想观察的那张表」因此可以同时成立。
   */
  stubEntityRepository(EntityType: EntityType, rows: InstanceType<EntityType>[] = []): IRepository<EntityType> {
    const repository = createStubRepository(rows);
    this.#dedicatedRepositories.set(EntityType, repository);
    return repository;
  }
}

/**
 * 创建假适配器。
 *
 * @param rxdb - 该适配器所属的数据库实例
 *
 * @remarks
 * `rxdb` 是**必填**的，因为 {@link RxDBAdapterLocalBase} 的构造函数就要它，而真适配器
 * 一律经 `AdapterFactory`（`rxdb.adapter(name, db => new XxxAdapter(db))`）拿到同一个实例。
 * 替身自己造一个占位数据库会让 `adapter.rxdb` 指向一个谁都没在用的对象 —— 那比 `undefined`
 * 更难查。注册时照真适配器的写法传工厂参数即可：`db => createMockAdapter(db)`。
 */
export function createMockAdapter(rxdb: RxDB): MockLocalAdapter {
  return new MockLocalAdapter(rxdb);
}

/**
 * 测试数据库选项
 */
export interface TestDBOptions {
  /** 数据库名称（默认生成唯一名称） */
  dbName?: string;
  /** 要注册的实体类（默认使用 TEST_ENTITIES） */
  entities?: EntityType[];
}

/**
 * 创建测试用 RxDB 实例
 *
 * @example
 * ```ts
 * const { rxdb, cleanup } = await createTestDB();
 * // ... run tests
 * await cleanup();
 * ```
 */
export async function createTestDB(options: TestDBOptions = {}): Promise<{
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  cleanup: () => Promise<void>;
}> {
  const { dbName = `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`, entities = TEST_ENTITIES } = options;

  const rxdbOptions: RxDBOptions = {
    dbName,
    entities,
    sync: {
      local: {
        adapter: 'sqlite'
      },
      type: SyncType.None
    }
  };

  const rxdb = new RxDB(rxdbOptions);
  const adapter = createMockAdapter(rxdb);

  rxdb.adapter('sqlite', () => adapter);
  rxdb.init();

  // 经 `rxdb.disconnectAll()` 拆，而不是直接叫 `adapter.disconnect()`：
  // 后者只关了连接，插件销毁、gateway、versionManager、全局监听器全部留在原地，
  // 泄漏会跨用例累积到下一个 spec 里去。
  const cleanup = async (): Promise<void> => {
    await rxdb.disconnectAll();
  };

  return { rxdb, adapter, cleanup };
}

/**
 * 创建带有远程同步配置的测试数据库
 */
export async function createTestDBWithRemote(options: TestDBOptions = {}): Promise<{
  rxdb: RxDB;
  localAdapter: MockLocalAdapter;
  remoteAdapter: MockLocalAdapter;
  cleanup: () => Promise<void>;
}> {
  const { dbName = `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`, entities = TEST_ENTITIES } = options;

  const rxdbOptions: RxDBOptions = {
    dbName,
    entities,
    sync: {
      local: {
        adapter: 'sqlite'
      },
      remote: {
        adapter: 'remote'
      },
      type: SyncType.Full
    }
  };

  const rxdb = new RxDB(rxdbOptions);
  const localAdapter = createMockAdapter(rxdb);
  const remoteAdapter = createMockAdapter(rxdb);

  rxdb.adapter('sqlite', () => localAdapter);
  rxdb.adapter('remote', () => remoteAdapter);
  rxdb.init();

  const cleanup = async (): Promise<void> => {
    await rxdb.disconnectAll();
  };

  return { rxdb, localAdapter, remoteAdapter, cleanup };
}

/**
 * 等待微任务队列清空
 */
export function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
