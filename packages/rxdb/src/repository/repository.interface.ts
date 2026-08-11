import { EntityStaticType, EntityType } from '../entity/entity.interface.js';

/**
 * 数据仓库管理接口
 *
 * 一个 {@link IRepository} 对应**一个**实体的所有 CRUD + 查询能力。
 * 适配器（`rxdb-adapter-sqlite` / `-pglite` / `-supabase` / `-sqliteai`）
 * 通过 {@link AdapterRepositoryConstructor} 提供本接口的实现，
 * `Repository`（{@link Repository}）则把"同步 + 事务 + 缓存"叠加上去。
 *
 * @remarks
 * **不做合并**：写入是逐实体的，调用方需要事务时走 {@link TransactionExecutor}；
 * **不做订阅**：本接口只承诺 `Promise` 形式的拉取结果，实时通知由 {@link QueryManager}
 * 的 `Observable` 单独承担 —— 让两套 API 各司其职，调用方按需挑选。
 */
export interface IRepository<T extends EntityType> {
  /**
   * 查询多个实体
   *
   * @param options 查询选项（详见 {@link FindOptions}）
   * @returns 满足条件的实体数组；无匹配返回空数组（**不**抛错）
   *
   * @remarks
   * 返回的是实体实例（带状态机），不是裸数据 —— 调用方后续 `save()` / `remove()`
   * 等操作会沿用同一个状态对象，避免"查询回来就丢上下文"。
   */
  find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]>;

  /**
   * 查询实体数量
   *
   * @param options 查询选项（详见 {@link CountOptions}）
   * @returns 满足条件的行数
   */
  count(options: EntityStaticType<T, 'countOptions'>): Promise<number>;

  /**
   * 创建实体
   *
   * @param entity 实体实例（通常由 {@link EntityManager.instantiate} 创建）
   * @returns 持久化完成后的实体；与入参**不是**同一引用（实现可换新实例）
   */
  create(entity: InstanceType<T>): Promise<InstanceType<T>>;

  /**
   * 更新实体
   *
   * @param entity 待更新的实体（提供 `id` 与最新字段）
   * @param patch 字段级 patch；未列出的字段不会被改动
   * @returns 持久化完成后的实体
   */
  update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>>;

  /**
   * 删除实体
   *
   * @param entity 待删除的实体（按 `id` 定位）
   * @returns 删除完成后的实体（字段清空、`local` 置为 `false`）
   */
  remove(entity: InstanceType<T>): Promise<InstanceType<T>>;
}

/**
 * 同步状态枚举
 *
 * - `Synced`：水位线已对齐或本地无未推送变更；
 * - `Syncing`：正在执行 `pull()` / `push()` 调用；
 * - `Never`：自上次初始化以来从未发起过同步。
 *
 * 由 {@link getRepositorySyncStatus} 计算，
 * 供 UI 展示"数据是不是最新"。
 */
export enum SyncStatus {
  /**
   * 已同步
   */
  Synced = 'Synced',

  /**
   * 同步中
   */
  Syncing = 'Syncing',

  /**
   * 从未同步
   */
  Never = 'Never'
}
