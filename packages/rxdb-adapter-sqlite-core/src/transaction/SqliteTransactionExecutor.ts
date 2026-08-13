import type {
  EntityType,
  IRepository,
  RawQueryResult,
  RxDBChange,
  RxDBMutationsMap,
  SwitchVersionActions,
  TransactionExecutor,
  TransactionExecutorState
} from '@aiao/rxdb';
import { getEntityMutations } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase, SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { rxdb_adapter_mutations } from '../rxdb_adapter_mutations.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

/**
 * 把一个适配器包装成「所有 `query()` 都落在指定事务里」的门面。
 *
 * @remarks
 * 这是 C2 的关键简化：仓库与内部 helper（`rxdb_adapter_mutations` / `execute_switch_actions` …）
 * 一律通过 `adapter.query()` 访问数据库。给它们一个 `query` 被改写过的门面，就等于把整段调用链
 * 拉进事务，**不需要给每个 helper 逐个加 executor 形参**。
 *
 * 绑定规则（两条都必须遵守，否则运行时会炸）：
 * - 除 `query` / `getRepository` 外的所有成员一律取自并绑定到**真实适配器**。
 *   适配器方法内部大量访问 `#private` 字段，而 `#` 字段访问不走 Proxy 的 `get` 陷阱 ——
 *   绑到门面上会直接 `TypeError: Cannot read private member`。
 * - `getRepository` 必须返回**新建**且绑定到门面的仓库，且**绝不写入** `repository_cache`：
 *   写进去的话事务结束后缓存里会留着一个指向已提交/已回滚连接的仓库，
 *   之后的**外部**写会打到那个死连接上。
 */
const createExecutorAdapterFacade = (
  adapter: RxDBAdapterSqliteBase,
  executor: SqliteTransactionExecutor
): RxDBAdapterSqliteBase =>
  new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === 'query') {
        return (sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> =>
          executor.execute(sql, bindings);
      }
      if (property === 'writeQuery') {
        return (sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> =>
          executor.execute(sql, bindings);
      }
      if (property === 'getRepository') {
        return (EntityType: EntityType): unknown => executor.getRepository(EntityType);
      }
      if (property === 'runInTransaction') {
        // 已经在本事务里了：复用，绝不新开也绝不入队，否则内部 helper 会在自己持槽时再入队而永久挂起。
        return (fun: (executor: TransactionExecutor) => Promise<unknown>): Promise<unknown> => executor.run(fun);
      }
      if (property === 'mergeChanges') {
        // `this` 必须绑到门面：mergeChanges 把收到的 adapter 一路传给内部 helper，
        // 绑到真实适配器会让它们的 query 走队列（翻转后即自锁）。
        const mergeChanges = Reflect.get(target, property, target) as (...args: unknown[]) => unknown;
        return (...args: unknown[]): unknown => mergeChanges.apply(executor.adapter, args);
      }
      const value: unknown = Reflect.get(target, property, receiver === undefined ? target : target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });

/**
 * SQLite 侧的 {@link TransactionExecutor} 实现。
 *
 * @remarks
 * 持有它 = 有权在该事务内执行；未持有的调用一律重新排队。事务身份由**对象标识**表示，
 * 不再由适配器实例上的 `#transaction_lock` 布尔环境态推断
 * （设计见 `code-reviews/transaction-executor-design.md` §4）。
 */
export class SqliteTransactionExecutor implements TransactionExecutor {
  #state: TransactionExecutorState = 'active';
  readonly #adapter: RxDBAdapterSqliteBase;
  readonly #client: SqliteClientLike;
  readonly #facade: RxDBAdapterSqliteBase;
  readonly #repositories = new Map<EntityType, unknown>();

  readonly id: string;

  get state(): TransactionExecutorState {
    return this.#state;
  }

  /**
   * 事务作用域内的适配器门面：把它交给内部 helper，helper 的每次 `query()` 都落在本事务里。
   *
   * @internal
   */
  get adapter(): RxDBAdapterSqliteBase {
    return this.#facade;
  }

  constructor(adapter: RxDBAdapterSqliteBase, client: SqliteClientLike, id: string) {
    this.id = id;
    this.#adapter = adapter;
    this.#client = client;
    this.#facade = createExecutorAdapterFacade(adapter, this);
  }

  /**
   * 直接在本事务的连接上执行语句。
   *
   * @remarks
   * SQLite 侧特有的透传入口，与既有的 `transaction(async tx => tx.execute(sql))` 写法保持兼容。
   * 跨适配器可移植的入口是 {@link query}。
   */
  async execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    // 必须是 async：声明返回 Promise 的方法同步抛错，会绕过调用方的 .catch()/rejects
    this.#assertActive('execute');
    return this.#client.execute(sql, bindings);
  }

  async query(sql: string, params?: readonly unknown[]): Promise<RawQueryResult> {
    const result = await this.execute(sql, params as SQLiteCompatibleType[] | undefined);
    return {
      rowsAffected: result.rowsAffected,
      rows: result.results[0]?.rows ?? [],
      columns: result.results[0]?.columns ?? []
    };
  }

  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    this.#assertActive('mutations');
    return rxdb_adapter_mutations(this.#facade, options);
  }

  getRepository<T extends EntityType>(EntityType: T): IRepository<T> {
    this.#assertActive('getRepository');
    const cached = this.#repositories.get(EntityType);
    if (cached) return cached as IRepository<T>;
    // 绑定到门面而非真实适配器：该仓库的每次读写都属于本事务
    const repository = this.#adapter.createUncachedRepository<T>(EntityType, this.#facade);
    this.#repositories.set(EntityType, repository);
    return repository;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    this.#assertActive('saveMany');
    return this.mutations(getEntityMutations({ need_save_entities: entities, need_remove_entities: [] }));
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    this.#assertActive('removeMany');
    return this.mutations(getEntityMutations({ need_save_entities: [], need_remove_entities: entities }));
  }

  async mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers = false
  ): Promise<void> {
    this.#assertActive('mergeChanges');
    // 委派到适配器自身的 mergeChanges，但把 `this` 绑到门面：
    //  - 门面作为 adapter 传给内部 helper → 它们发出的每条 query 都落在本事务里；
    //  - **保留**子类与测试对 `adapter.mergeChanges` 的覆写 —— 在这里重实现那两步会让
    //    `vi.spyOn(adapter, 'mergeChanges')` 注入的失败点失效（实测抓到过：
    //    「normal 合并中途失败」用例本该 reject 却变成 resolve）。
    await this.#adapter.mergeChanges.call(this.#facade, actions, localChanges, disableTriggers);
  }

  async run<T>(fun: (executor: TransactionExecutor) => Promise<T>): Promise<T> {
    this.#assertActive('run');
    return fun(this);
  }

  /**
   * 把 executor 推入终态。只允许适配器的事务执行体调用。
   *
   * @internal
   */
  settle(state: Exclude<TransactionExecutorState, 'active'>): void {
    this.#state = state;
    this.#repositories.clear();
  }

  #assertActive(operation: string): void {
    if (this.#state === 'active') return;
    throw new RxDBAdapterSqliteError(
      `TransactionExecutor(${this.id}).${operation}() called after the transaction was ${this.#state}. ` +
        `事务结束后 executor 不得再使用——需要新的写入请重新发起 transaction()。`
    );
  }
}
