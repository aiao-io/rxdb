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
import type { Results, Transaction } from '@electric-sql/pglite';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import rxdb_adapter_mutations from '../rxdb_adapter_mutations.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 把适配器包装成「所有 `query()` 都落在指定事务里」的门面。
 *
 * @remarks
 * 与 sqlite-core 的 `createExecutorAdapterFacade` 必须保持同一口径 —— 两包是仅有的两处
 * `transaction()` 实现，语义分叉会让共享契约套件在其中一边悄悄失效。
 *
 * 绑定规则同 sqlite 侧：除 `query` / `getRepository` 外一律绑定到**真实适配器**
 * （适配器方法访问 `#private` 字段，而 `#` 字段不走 Proxy 的 `get` 陷阱，绑到门面上会
 * 直接 `TypeError`）；`getRepository` 返回新建且不入缓存的仓库。
 */
const createExecutorAdapterFacade = (
  adapter: RxDBAdapterPGlite,
  executor: PGliteTransactionExecutor
): RxDBAdapterPGlite =>
  new Proxy(adapter, {
    get(target, property) {
      if (property === 'query') {
        return <T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> =>
          executor.queryRaw<T>(sql, bindings);
      }
      if (property === 'writeQuery') {
        return <T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> =>
          executor.queryRaw<T>(sql, bindings);
      }
      if (property === 'internalQuery') {
        return <T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> =>
          executor.queryRaw<T>(sql, bindings);
      }
      if (property === 'getRepository') {
        return (EntityType: EntityType): unknown => executor.getRepository(EntityType);
      }
      if (property === 'runInTransaction') {
        // 已经在本事务里：复用，绝不新开也绝不入队（同 sqlite 侧）
        return (fun: (executor: TransactionExecutor) => Promise<unknown>): Promise<unknown> => executor.run(fun);
      }
      if (property === 'mergeChanges') {
        // `this` 必须绑到门面，否则内部 helper 的 query 走队列 —— 翻转后即自锁
        const mergeChanges = Reflect.get(target, property, target) as (...args: unknown[]) => unknown;
        return (...args: unknown[]): unknown => mergeChanges.apply(executor.adapter, args);
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });

/**
 * PGlite 侧的 {@link TransactionExecutor} 实现。
 *
 * @remarks
 * 状态由 executor **自持**，绝不从驱动的 `tx.closed` 派生 —— 该标志在**失败路径上不翻转**
 * （驱动 catch 分支是 `throw e||await ROLLBACK, d(this,p,!1), i` 这样的逗号表达式，没有赋值），
 * 因此回滚后逃逸出去的 tx 仍然 `closed === false`，其 `query()` 会以 autocommit 执行：
 * 调用方以为写在已回滚的事务里，实际被永久提交。
 */
export class PGliteTransactionExecutor implements TransactionExecutor {
  #state: TransactionExecutorState = 'active';
  readonly #adapter: RxDBAdapterPGlite;
  readonly #tx: Transaction;
  readonly #facade: RxDBAdapterPGlite;
  readonly #repositories = new Map<EntityType, unknown>();

  readonly id: string;

  get state(): TransactionExecutorState {
    return this.#state;
  }

  /**
   * 事务作用域内的适配器门面。
   *
   * @internal
   */
  get adapter(): RxDBAdapterPGlite {
    return this.#facade;
  }

  constructor(adapter: RxDBAdapterPGlite, tx: Transaction, id: string) {
    this.id = id;
    this.#adapter = adapter;
    this.#tx = tx;
    this.#facade = createExecutorAdapterFacade(adapter, this);
  }

  /**
   * 直接在本事务上执行查询，返回 PGlite 原生结果。
   *
   * @remarks
   * PGlite 侧特有的透传入口；跨适配器可移植的入口是 {@link query}。
   */
  async queryRaw<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>> {
    // 必须是 async：声明返回 Promise 的方法同步抛错会绕过调用方的 .catch()
    this.#assertActive('query');
    return this.#tx.query<T>(sql, bindings);
  }

  async query(sql: string, params?: readonly unknown[]): Promise<RawQueryResult> {
    const result = await this.queryRaw(sql, params as unknown[] | undefined);
    const columns = (result.fields ?? []).map(field => field.name);
    const rows: unknown[][] =
      columns.length > 0 && result.rows.length > 0 ?
        (result.rows as Record<string, unknown>[]).map(row => columns.map(column => row?.[column] ?? null))
      : [];
    return { rowsAffected: result.affectedRows ?? 0, rows, columns };
  }

  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    this.#assertActive('mutations');
    return rxdb_adapter_mutations(this.#facade, options);
  }

  getRepository<T extends EntityType>(EntityType: T): IRepository<T> {
    this.#assertActive('getRepository');
    const cached = this.#repositories.get(EntityType);
    if (cached) return cached as IRepository<T>;
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
    // 与 sqlite 侧同口径：委派到适配器自身的 mergeChanges，`this` 绑到门面。
    // 重实现那两步会让 `vi.spyOn(adapter, 'mergeChanges')` 注入的失败点失效。
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
    throw new RxdbAdapterPGliteError(
      `TransactionExecutor(${this.id}).${operation}() called after the transaction was ${this.#state}. ` +
        `事务结束后 executor 不得再使用——需要新的写入请重新发起 transaction()。`
    );
  }
}
