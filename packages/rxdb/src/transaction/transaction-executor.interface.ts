import type { EntityType } from '../entity/entity.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import type { RawQueryResult, RxDBMutationsMap } from '../rxdb-adapter.js';
import type { RxDBChange } from '../system/change.js';
import type { SwitchVersionActions } from '../version/VersionManager.interface.js';

/**
 * 事务生命周期状态。
 *
 * @remarks
 * 终态（`committed` / `rolled-back`）之后再使用该 executor 必须抛错，不得静默降级成
 * 「开一个新事务」或「直接走队列」—— 那会让调用方以为写入仍在原子边界内。
 */
export type TransactionExecutorState = 'active' | 'committed' | 'rolled-back';

/**
 * 一次事务的作用域句柄。
 *
 * @remarks
 * **持有它 = 有权在该事务内执行；未持有 = 必须重新排队。**
 * 事务身份由**对象标识**表示，不再由适配器实例上的布尔环境态（`#transaction_lock`）推断。
 *
 * 存在的理由：布尔环境态跨 `await` 无法区分两类调用 —— 事务体内的合法嵌套
 * （`record.save()` → `entityManager.mutations` → `adapter.mutations`）与外部并发写
 * （QueryCache / 远端同步在事务窗口内的独立写入）。两者走同一个入口，一律按「嵌套」处理
 * 会让外部写入被卷进他人事务并跟着 ROLLBACK 一起丢失（`SQLC-001` / `PGL-001`），
 * 一律按「外部」处理又会把启动流程锁死。
 *
 * 设计见 `code-reviews/transaction-executor-design.md` §4。
 *
 * @example
 * ```ts
 * await adapter.transaction(async executor => {
 *   // 走 executor 的读写归属本事务
 *   const repository = executor.getRepository(Todo);
 *   const todos = await repository.find({ where: { combinator: 'and', rules: [] } });
 *   await repository.update(todos[0], { done: true });
 * });
 * ```
 */
export interface TransactionExecutor {
  /**
   * 事务标识，用于日志与断言。
   *
   * @remarks
   * **不要**用它判断两个 executor 是否同一个事务 —— 用对象标识（`a === b`）。
   */
  readonly id: string;

  /** 生命周期状态。 */
  readonly state: TransactionExecutorState;

  /**
   * 在本事务内执行原始查询，不再入队。
   *
   * @param sql - SQL 语句
   * @param params - 绑定参数
   */
  query(sql: string, params?: readonly unknown[]): Promise<RawQueryResult>;

  /**
   * 在本事务内执行实体变更。
   *
   * @param options - 批量变更集合
   */
  mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]>;

  /**
   * 在本事务内取仓库。
   *
   * @param EntityType - 实体类型
   *
   * @remarks
   * 由该仓库发出的读写一律归属本事务，**读也一样** —— 事务体内经普通 `adapter.query()`
   * 的读会排在自己这个事务后面，造成挂起（队列并发度为 1）。
   *
   * 该仓库创建或加载出的实体会被登记到本 executor 名下，因此这些实体的
   * `entity.save()` / `entity.remove()` 也自动走本事务；用 `new X()` 直接建的实体
   * 不带这个身份，会走普通队列。
   */
  getRepository<T extends EntityType>(EntityType: T): IRepository<T>;

  /**
   * 在本事务内保存多个实体。
   *
   * @param entities - 待保存的实体
   *
   * @remarks
   * 与 `adapter.saveMany()` 同语义，区别只在归属：这一份属于本事务。
   * 事务体内调 `adapter.saveMany()` 是**外部调用**，会重新排队并排在本事务之后。
   */
  saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  /**
   * 在本事务内删除多个实体。
   *
   * @param entities - 待删除的实体
   */
  removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]>;

  /**
   * 在本事务内应用压缩后的变更。
   *
   * @param actions - 压缩后的变更操作集合
   * @param localChanges - 需要一并写入本地 `RxDBChange` 表的记录
   * @param disableTriggers - 是否禁用变更触发器（pull 等场景）
   *
   * @remarks
   * 之所以放在 executor 上而不是给 `adapter.mergeChanges()` 加一个 executor 形参：
   * 「持有 executor 才算在本事务内」这条判据必须只有**一处**。散成两处之后，
   * 「传了 executor 形参」与「调的是 executor 的方法」会各自演化出不同的边界。
   *
   * 同步链路里 4 个事务体的主力写就是它（`merge-branch` / `cleanup-expired` /
   * `pull-batch` / `pull-repository`）。
   */
  mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<RxDBChange, 'id'>[],
    disableTriggers?: boolean
  ): Promise<void>;

  /**
   * 嵌套内层工作：复用本事务，不新开，也不入队。
   *
   * @param fun - 内层工作，参数是同一个事务的 executor
   *
   * @remarks
   * 取代旧的 `runInTransaction()` —— 后者靠环境态判断「是否已在事务中」，
   * 拿它开一个语义上独立的并发事务会被静默并进当前事务。
   */
  run<T>(fun: (executor: TransactionExecutor) => Promise<T>): Promise<T>;
}

/**
 * 事务回调：参数是本次事务的 executor。
 */
export type TransactionExecutorFun<T = unknown> = (executor: TransactionExecutor) => Promise<T>;

/**
 * `transaction()` 的可选项。
 */
export interface TransactionOptions {
  /**
   * 是否写事务日志（变更历史用的 transactionId）。默认 `true`。
   */
  readonly transactionLog?: boolean;
}
