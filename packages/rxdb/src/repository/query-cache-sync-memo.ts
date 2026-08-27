/**
 * @packageDocumentation
 * QueryCache 的「刚同步过」记忆（US-020 D13）。
 *
 * @remarks
 * QueryCache 的同步粒度是整个 `where`（`fetchMetadata` 的粒度就是 `where`），而翻页只改
 * `limit` / `offset`。没有这层记忆，翻第二页会为同一份 `where` 再问一次远端 —— 同步的
 * 结果一模一样，只是多了一个 round-trip（US-020 AC#23）。
 *
 * 它是**有界**的：三条失效路径缺一不可，否则「记得同步过」会退化成「永远新鲜」，
 * 而远端权威是 QueryCache 的立身之本。
 *
 * 1. **窗口到期** —— `syncStaleTime` 毫秒后自动忘记（默认
 *    {@link DEFAULT_QUERY_CACHE_SYNC_STALE_TIME}，配 `0` 即完全关闭记忆）。
 * 2. **本仓储发生写** —— 写之后本地投影已不是刚同步出来的那份，全表遗忘。
 * 3. **适配器实例更换** —— 断连重连换的是事实源本身（US-020 AC#22），全表遗忘。
 *
 * 记忆的**归属**是 `Repository`，不是 `QueryCachePrimaryRepository`：后者随适配器流的每次
 * 发射重建（订阅归零再订阅也会重建），把记忆放在它身上等于每次 `find` 都是新记忆。
 */
import { deterministicStringify } from '../rxdb-utils.js';

/**
 * `syncStaleTime` 的缺省窗口（毫秒）。
 *
 * @remarks
 * 取值口径是「一次用户交互」：翻页、换排序、同一屏里几个组件订阅同一个 `where`，都落在
 * 这个窗口内复用同一次同步；跨交互的重复读照常回远端校验。想要每次读都校验就显式配
 * `syncStaleTime: 0`。
 */
export const DEFAULT_QUERY_CACHE_SYNC_STALE_TIME = 1000;

/** 参与同步指纹的字段 */
export interface QueryCacheFingerprintInput {
  where: unknown;
  localCacheFirst?: boolean;
  offlineFallback?: boolean;
}

/**
 * 计算一次同步的指纹。
 *
 * @param options - 查询选项
 * @returns 确定性字符串，键顺序不同但语义相同的查询得到同一指纹
 *
 * @remarks
 * 与 `QueryCacheRepository` 的并发去重共用同一把尺（US-020 AC#13）：`where` 之外，
 * `localCacheFirst` / `offlineFallback` 也进指纹 —— 同一个 `where` 走 SWR 与走标准模式
 * 是两条不同的读路径，互相复用会把模式判定悄悄抹掉。`limit` / `offset` / `orderBy`
 * **不进**指纹：它们下推本地 `IRepository`，不改变同步范围。
 */
export const queryCacheFingerprint = (options: QueryCacheFingerprintInput): string =>
  deterministicStringify({
    where: options.where,
    localCacheFirst: options.localCacheFirst === true,
    offlineFallback: options.offlineFallback === true
  });

/**
 * 「刚同步过」的记忆表。
 *
 * @remarks
 * 只记「同步过没有」，不记同步的结果 —— 结果始终从本地 `IRepository` 现读（US-020 D8）。
 * 因此命中记忆的那次 `find` 不会再触发 `onSyncStats`：本次确实没有发生同步。
 */
export class QueryCacheSyncMemo {
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #staleTime: number;
  #adapters: readonly [unknown, unknown] | undefined;
  #generation = 0;

  /**
   * 当前记忆代次，每次 {@link QueryCacheSyncMemo.clear} 递增（US-023 D12）。
   *
   * @remarks
   * 同步是异步的，`clear()` 可能落在「已发出 `fetchMetadata`、还没回来」的窗口里。
   * 调用方在同步**开始前**取一次代次、结束后原样传回 {@link QueryCacheSyncMemo.remember}，
   * 代次对不上就说明这次同步的结果按定义已经不新鲜 —— 不许把刚清掉的记忆重新写回去。
   */
  get generation(): number {
    return this.#generation;
  }

  /**
   * @param staleTime - 记忆窗口毫秒数；`0` 或负数表示不记忆
   */
  constructor(staleTime: number = DEFAULT_QUERY_CACHE_SYNC_STALE_TIME) {
    this.#staleTime = staleTime;
  }

  /**
   * 绑定本次使用的两侧适配器，实例变了即全表遗忘。
   *
   * @param local - 本地适配器实例
   * @param remote - 远端适配器实例
   *
   * @remarks
   * 适配器流每次发射都会重建主仓储，但**实例没换**时那只是重新求值（订阅归零再订阅），
   * 不该清记忆；换了实例才是 US-020 AC#22 的重连语义。
   */
  bindAdapters(local: unknown, remote: unknown): void {
    const bound = this.#adapters;
    if (bound && bound[0] === local && bound[1] === remote) {
      return;
    }
    this.#adapters = [local, remote];
    this.clear();
  }

  /**
   * 该指纹是否在记忆窗口内。
   *
   * @param fingerprint - {@link queryCacheFingerprint} 的产物
   */
  has(fingerprint: string): boolean {
    return this.#timers.has(fingerprint);
  }

  /**
   * 记住一次已完成的同步，并安排窗口到期后遗忘。
   *
   * @param fingerprint - {@link queryCacheFingerprint} 的产物
   * @param generation - 同步**开始前**读到的 {@link QueryCacheSyncMemo.generation}；
   *   与当前代次不符时本次调用无效果（US-023 D12）
   */
  remember(fingerprint: string, generation: number): void {
    if (this.#staleTime <= 0 || generation !== this.#generation) {
      return;
    }
    this.#forget(fingerprint);
    this.#timers.set(
      fingerprint,
      setTimeout(() => this.#forget(fingerprint), this.#staleTime)
    );
  }

  /**
   * 全表遗忘：写入、换适配器、远端失效上报时调用。
   *
   * @remarks
   * 同时递增 {@link QueryCacheSyncMemo.generation}，作废所有此刻还在飞的同步 —— 它们
   * 回来时的 `remember` 会被拒（US-023 D12）。
   */
  clear(): void {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    this.#generation++;
  }

  #forget(fingerprint: string): void {
    const timer = this.#timers.get(fingerprint);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(fingerprint);
    }
  }
}
