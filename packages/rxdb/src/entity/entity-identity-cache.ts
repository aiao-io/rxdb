/**
 * @fileoverview 实体身份缓存（identity map）
 *
 * 按 id 保存实体实例，保证「同一条记录在同一个 EntityManager 里只有一个实例」。
 * 与普通 Map 的唯一区别：持有的是 {@link WeakRef}，缓存本身不构成保活理由。
 */

import { RxDBEntityId } from './entity.interface.js';

/**
 * 触发死槽扫描的最小槽位数
 *
 * @remarks
 * 低于这个规模，全表扫的开销不值得，占的内存也不可能是问题。
 * 导出是为了让测试从常量推算阈值，而不是写死数字——写死的话调整下限会让
 * 「阈值生效」的断言变成「阈值没生效也能过」。
 */
export const ENTITY_IDENTITY_CACHE_SWEEP_FLOOR = 512;

/**
 * 实体身份缓存
 *
 * @typeParam V - 缓存的实体实例类型
 *
 * @remarks
 * **为什么是 WeakRef 而不是强引用 Map**：
 * 强引用下，任何进过缓存的实体到进程结束都不会被回收——列表反复翻页、长期在线的
 * 编辑器，内存只增不减。
 *
 * **为什么不在删除时驱逐**：保留引用正是为了让已订阅的 UI 读到 `removed=true`。
 * 删除即驱逐会让删除态在界面上表现为「这行凭空消失了」。用 WeakRef 恰好分开了
 * 这两件事：还有订阅者持有 → 留着；没人看了 → 连同删除态一起消失，反正没人会问。
 *
 * **为什么不用 FinalizationRegistry**：批量 hydrate 时每个实体都要注册一次，
 * 代价压在最热的路径上；而且回调时机不确定，id 复用（删除后同 id 重建）时迟到的
 * 回调会把新实例的槽位误删。这里改成惰性清理：{@link get} 顺手删掉读到的死槽，
 * 槽位总数翻倍时扫一遍（阈值随存活规模上浮，摊还 O(1)）。
 */
export class EntityIdentityCache<V extends object> {
  readonly #refs = new Map<RxDBEntityId, WeakRef<V>>();

  #sweepAt = ENTITY_IDENTITY_CACHE_SWEEP_FLOOR;

  /**
   * 槽位总数
   *
   * @remarks
   * 含尚未清理的死槽，因此**不等于**存活实体数。它反映的是缓存自身占的空间，
   * 也是扫描阈值的判定量。
   */
  get size(): number {
    return this.#refs.size;
  }

  /**
   * 下一次触发全量扫描的槽位数
   */
  get sweepThreshold(): number {
    return this.#sweepAt;
  }

  /**
   * 读取实体实例
   *
   * @param id - 实体 id
   * @returns 实例；已被回收或从未缓存时返回 `undefined`
   */
  get(id: RxDBEntityId): V | undefined {
    const entity = this.#refs.get(id)?.deref();
    // 读到死槽就顺手删掉：反正已经付了一次查找的钱
    if (entity === undefined) this.#refs.delete(id);
    return entity;
  }

  /**
   * 判断实体是否仍在缓存中且未被回收
   *
   * @param id - 实体 id
   */
  has(id: RxDBEntityId): boolean {
    return this.get(id) !== undefined;
  }

  /**
   * 写入实体实例
   *
   * @param id - 实体 id
   * @param entity - 实体实例
   */
  set(id: RxDBEntityId, entity: V): void {
    this.#refs.set(id, new WeakRef(entity));
    this.#sweep_if_needed();
  }

  /**
   * 移除指定 id 的槽位
   *
   * @param id - 实体 id
   */
  delete(id: RxDBEntityId): void {
    this.#refs.delete(id);
  }

  /**
   * 清空全部槽位
   */
  clear(): void {
    this.#refs.clear();
    // 阈值一并复位：不复位的话清空后要再攒到旧阈值才肯扫，白留一倍死槽
    this.#sweepAt = ENTITY_IDENTITY_CACHE_SWEEP_FLOOR;
  }

  /**
   * 槽位数达到阈值时扫掉死槽，并把下次阈值抬到存活规模的两倍
   *
   * 阈值跟着存活数走，摊还下来每次 set 是 O(1)；固定阈值会在缓存本就很大时
   * 每写一条都全表扫一遍。
   */
  #sweep_if_needed(): void {
    if (this.#refs.size < this.#sweepAt) return;
    for (const [id, ref] of this.#refs) {
      if (ref.deref() === undefined) this.#refs.delete(id);
    }
    this.#sweepAt = Math.max(ENTITY_IDENTITY_CACHE_SWEEP_FLOOR, this.#refs.size * 2);
  }
}
