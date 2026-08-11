import { EntityStaticType, EntityType, EntityUpdateData } from '../entity/entity.interface.js';
import { getEntityStatus } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';

/**
 * 数据仓库
 *
 * 所有 Repository（{@link Repository}、{@link TreeRepository}、以及适配器侧的
 * `AdapterRepository`）的公共基类。它只承担**实体引用的薄包装**：
 *
 * - 创建 / 查找 / 是否存在 —— 全部委托给 {@link EntityManager} 的 LRU 缓存；
 * - 更新 —— 走 {@link EntityStatus.replace}（有的话）或 fallback 到 `Object.assign`
 *   同时记下 `origin`，供下游 diff / change 反演使用。
 *
 * 真正的"查询 + 同步 + 变更编排"放子类或适配器侧，基类不沾这些业务，
 * 否则基类的复杂度会随每个仓库特性线性增长。
 *
 * @typeParam T - 实体类型构造器，决定 `findOptions` / `idType` 等静态类型的派生路径。
 */
export abstract class RepositoryBase<T extends EntityType> {
  /**
   * 子类声明的"静态方法名"清单，用于把 `User.findOne(...)` 这样的方法
   * 注入到实体类上（{@link EntityManager.init} 时挂）。
   *
   * @remarks
   * 用类字段 `static` 而非构造器里赋值 —— 字段初始化在 `extends` 链上是**自底向上**
   * 合并的，所以子类定义的 `_STATIC_METHODS` 不会丢；运行时反射取的是当前类的字段。
   */
  protected static _STATIC_METHODS: string[] = [];

  /**
   * 当前类（含继承链上各层）声明的全部静态方法名
   *
   * @remarks
   * **没有**沿原型链累加：每个子类自己写一份 `_STATIC_METHODS`，避免运行时
   * 反射出祖先的 `get` / `findOne` 这类名字后，再被后代意外覆盖一次。
   */
  static get staticMethods() {
    return this._STATIC_METHODS;
  }

  constructor(
    protected readonly rxdb: RxDB,
    public readonly EntityType: T
  ) {}

  /**
   * 创建（或复用）一个实体引用
   *
   * @param data - 字段初始值；其中 `id` 缺省时会自动生成
   * @returns 已挂到 {@link EntityManager} 缓存里的实体实例
   *
   * @remarks
   * 不管入参 `id` 是否已存在于缓存，都会**优先**返回缓存里的实例（覆盖式刷新）；
   * 走 `rxdb.entityManager.createEntityRef` 是为了复用同一份引用语义，避免
   * 不同调用栈里拿到的是两个状态不同步的克隆。
   */
  createEntityRef(data: EntityUpdateData<T>) {
    return this.rxdb.entityManager.createEntityRef(this.EntityType, data);
  }

  /**
   * 按 ID 在当前进程的实体缓存中查找实体
   *
   * @param id - 实体主键
   * @returns 缓存命中则返回实例，未命中返回 `undefined`（**不**触发数据库查询）
   */
  getEntityRef(id: EntityStaticType<T, 'idType'>): InstanceType<T> | undefined {
    return this.rxdb.entityManager.getEntityRef(this.EntityType, id);
  }

  /**
   * 判定当前进程的实体缓存里是否有指定 ID
   *
   * @param id - 实体主键
   * @returns 缓存命中返回 `true`，否则 `false`
   *
   * @remarks
   * 等价于 `getEntityRef(id) !== undefined`，单独提供是为了让"批量预热"和
   * "差异同步"等热点路径省掉一次引用创建 / 取状态的开销。
   */
  hasEntityRef(id: EntityStaticType<T, 'idType'>): boolean {
    return this.rxdb.entityManager.hasEntityRef(this.EntityType, id);
  }

  /**
   * 用 `update` 覆盖实体字段
   *
   * @param entity - 目标实体
   * @param update - 待写入的字段；主键 `id` 也会被赋值（用于 hydrate 场景）
   *
   * @remarks
   * 优先调用 {@link EntityStatus.replace}（若状态机支持），保证 dirty tracking
   * 与 patch 生成走的是同一条路径；否则降级为 `Object.assign` + 把 `origin`
   * 备份成 `update` 的浅拷贝，留给后续 {@link computeDiff} 反推旧值。
   */
  updateEntity(entity: InstanceType<T>, update: InstanceType<T>) {
    const state = getEntityStatus(entity);
    if (typeof state.replace === 'function') {
      state.replace(update);
      return;
    }

    state.origin = { ...update };
    Object.assign(entity, update);
  }
}
