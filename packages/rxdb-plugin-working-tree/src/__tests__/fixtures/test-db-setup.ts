/**
 * @fileoverview 插件 unit 层用的本地适配器替身（假适配器）。
 *
 * @remarks
 * 这是 `@aiao/rxdb` 的 `__tests__/fixtures/test-db-setup.ts` 的**同源副本**，只留插件这一侧
 * 真正用到的四样东西：仓库桩、能力行、{@link MockLocalAdapter}、{@link createMockAdapter}。
 *
 * 为什么是副本而不是共享一份：`@aiao/rxdb-test` 是本仓库放跨包夹具的地方，但它
 * **依赖 `@aiao/rxdb`**，核心包再反过来依赖它就成环，于是核心的 20 条用例够不着那里；
 * 而核心包自己的 `__tests__/` 不在它的 `exports` 上，包外也够不着。两头都够不着的结果就是
 * 这一份副本——它是依赖图逼出来的，不是偷懒。
 *
 * 两份的分工是清楚的：核心那一份**不认识任何一个插件实体**（它的能力行是由用例经
 * `stubEntityRepository()` 现场登记的）；这一份认识 {@link CommitCapabilityState}，因为
 * 那张表就在本包里。所以两边不是逐字复制，改动也不必同步——真正要一起改的只有
 * {@link MockLocalAdapter} 随 {@link RxDBAdapterLocalBase} 抽象成员变动的那部分，
 * 而那种变动在两边都是**编译错误**，不会静默漂移。
 */

import type { EntityType, IRepository, RxDBChange, SwitchVersionActions, TransactionExecutor } from '@aiao/rxdb';
import {
  type IRxDBAdapter,
  RxDB,
  RXDB_CHANGE_CODEC_VERSION,
  RxDBAdapterLocalBase,
  type RxDBMutationsMap,
  type SwitchBranchOptions,
  type TransactionFun
} from '@aiao/rxdb';
import { type Observable, of } from 'rxjs';
import { type Mock, vi } from 'vitest';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../commit/commit-capability-state.entity.js';
import { fakeTableRef } from './fake-table-ref.js';

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
 * 未启用的能力行——`connect()` 的 active 分支握手要先读它。
 *
 * @remarks
 * 这是「只保留形状、不保留存储」的唯一例外，理由是**缺这一行不等于空结果，而是一个错误**：
 * `readCommitCapability` 在读不到时抛 `RxDBError`，于是替身若照常返回 `[]`，每一条走
 * 本地引导的用例都会在握手那一步炸掉——炸的还是一个与被测行为毫无关系的原因。
 *
 * 真库里这一行由 `createWorkingTreeCommitsInitialRows` 随建表写入，`enabled` 同样是
 * `false`（FR-046：建表不改变任何行为）。要验证启用态握手的用例自己把它换掉。
 *
 * 写成**对象字面量**而不是 `new CommitCapabilityState()`：装饰器给实体装了一对访问器，
 * 它们在读写时要解析 `EntityManager`，而这一行是在适配器的字段初始化里造的——
 * 那时 `rxdb.init()` 还没跑，构造出来的实例一碰就抛「needs an initialized RxDB」。
 * 字面量不经过访问器，而返回类型仍是实体本身，字段少一个照样编译失败。
 */
export const createCapabilityStateRow = (): CommitCapabilityState => ({
  id: COMMIT_CAPABILITY_STATE_ID,
  enabled: false,
  protocolVersion: COMMIT_PROTOCOL_VERSION,
  schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
  codecVersion: RXDB_CHANGE_CODEC_VERSION,
  enabledAt: null
});

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

  /** 能力行专用仓库；理由见 {@link createCapabilityStateRow}。 */
  readonly #capabilityRepository = createStubRepository([createCapabilityStateRow()]);

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
    EntityType => (EntityType === CommitCapabilityState ? this.#capabilityRepository : this.#repository)
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
