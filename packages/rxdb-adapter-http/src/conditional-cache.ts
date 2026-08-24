/**
 * @packageDocumentation
 * ETag / If-None-Match 条件请求的**响应缓存**与 single-flight（US-212 AC#28）。
 *
 * @remarks
 * **这里缓存的是响应，不是行。** 两者容易被读成一件事，而它们的归属正相反：
 * 行缓存由 core 经 `localAdapter.upsertMany()` 落盘，本包按 AC#19 连碰都不能碰；
 * 本模块只在内存里留住「上次那个 200 的 JSON body」，好在远端回 304 时把它还回去。
 *
 * **为什么不需要跨包失效协议。** 服务端回 304 的前提就是它认为该 URL 的内容与请求方
 * 持有的 ETag 一致；一旦变了它会回 200 带新 body。缓存的正确性由 HTTP 协议本身担保，
 * 不依赖任何人来通知失效——这正是 AC#28 能归本包、而 AC#29 / #30 拿不到 owner 的分界。
 *
 * **缓存按适配器实例存活，且不进指纹的是 header。** auth hook 产出的 token 不参与键控，
 * 所以同一实例上**换用户**必须走 `disconnect()` / `connect()`：那会清空并重建缓存。
 * 把 header 塞进指纹会让每次 token 轮换都全量失效，等于没有缓存。
 */

/** 一条已校验过的响应缓存 */
export interface ConditionalCacheEntry {
  /** 远端给的校验令牌，原样回填进 `if-none-match` */
  readonly etag: string;
  /** 上次 200 的**已 JSON 解码**响应体 */
  readonly value: unknown;
}

/**
 * 计算请求指纹。
 *
 * @remarks
 * 三元组取 method + **已拼接的绝对 URL** + **序列化后的 body 字符串**，与真正发出去的
 * 字节一一对应。不自己再规范化一次 body：transport 发出的就是这个字符串，两处各算一遍
 * 迟早分叉，而分叉的表现是「换了个键」——那是缓存未命中，不是错误结果。
 *
 * headers 不进指纹，理由见模块头。
 *
 * 用 `JSON.stringify` 拼三元组而不是模板串：分隔符方案要额外论证「三段里都不含分隔符」，
 * 而论证失败的代价是**指纹碰撞**——拿 A 请求的缓存回答 B 请求，比缓存未命中严重得多。
 * 数组编码天然无歧义，顺带把 `undefined`（无 body）与 `''`（空 body）分成两个键。
 *
 * @param method - HTTP 方法
 * @param url - 已拼接的绝对 URL
 * @param body - 序列化后的请求体；无 body 时为 `undefined`
 */
export const requestFingerprint = (method: string, url: string, body?: string): string =>
  JSON.stringify([method, url, body ?? null]);

/**
 * 有界 LRU 响应缓存 + 按指纹的 single-flight 去重。
 *
 * @remarks
 * **有界是硬要求**（AC#28）：翻页会为每一页生成一个指纹，无界的 `Map` 会随查询范围
 * 单调增长——那正是被移出本故事的 AC#30 要解决的问题，不能在这里复制一份。
 *
 * **逐出按访问顺序，不按写入顺序。** 翻页时第 1 页被反复重放，按写入顺序会正好把最热的
 * 那条挤掉。`Map` 的迭代顺序即插入顺序，读命中时 delete + set 把条目移到队尾即可。
 */
export class ConditionalRequestCache {
  readonly #entries = new Map<string, ConditionalCacheEntry>();
  readonly #inFlight = new Map<string, Promise<unknown>>();

  /** 当前条目数 */
  get size(): number {
    return this.#entries.size;
  }

  /**
   * @param maxEntries - 条目上限，已由 `resolveHttpConfig` 校验为 finite 正整数
   */
  constructor(private readonly maxEntries: number) {}

  /**
   * 取条目并刷新 recency。
   *
   * @param key - {@link requestFingerprint} 的产出
   */
  get(key: string): ConditionalCacheEntry | undefined {
    const entry = this.#entries.get(key);
    if (!entry) {
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry;
  }

  /**
   * 写入条目，超出上限时逐出最久未用的一条。
   *
   * @param key - {@link requestFingerprint} 的产出
   * @param entry - 本次 200 的 ETag 与已解码响应体
   */
  set(key: string, entry: ConditionalCacheEntry): void {
    // 先 delete 再 set：同键覆盖时也要移到队尾，否则一条被反复刷新的热条目
    // 会停在它第一次写入的位置上，迟早被当成最旧的逐出
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    // 按插入序从队头逐出。写成 for-of 而不是 `while + keys().next()`，是因为后者拿到的
    // 是 `IteratorResult`，越界时 `value` 为 `undefined`，逼出一个「空 Map 还要逐出」的
    // 不可能分支——而 for-of 在空 Map 上根本不进循环体，判据只剩一条
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.maxEntries) {
        break;
      }
      this.#entries.delete(oldest);
    }
  }

  /** 丢弃单个条目：远端停发 ETag 时用，留着会拿一个再也换不到 304 的令牌去问 */
  delete(key: string): void {
    this.#entries.delete(key);
  }

  /**
   * 清空所有条目。
   *
   * @remarks
   * `disconnect()` 时调用（AC#28）。in-flight 记录**不清**：那些 Promise 已经有调用方在
   * 等，抹掉映射只会让紧随其后的同指纹请求再发一次，去重白做——它们会各自被
   * `disconnectSignal` 中止，那是 transport 的事。
   */
  clear(): void {
    this.#entries.clear();
  }

  /**
   * 同一指纹的并发调用合流到一个 Promise。
   *
   * @remarks
   * 堵的是 AC#28 点名的那个空洞：第二个请求若独立发出，会带着同一个 `If-None-Match`
   * 拿到 304，而此时第一个还没回填，缓存里没有 body——304 于是无处还原。
   *
   * 失败也合流，且 `finally` 里必须摘除映射：残留会让这个指纹永久返回那次失败。
   *
   * @param key - {@link requestFingerprint} 的产出
   * @param factory - 真正发请求的工厂，仅在没有 in-flight 时调用
   */
  async singleFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const pending = this.#inFlight.get(key);
    if (pending) {
      return (await pending) as T;
    }
    const started = factory().finally(() => this.#inFlight.delete(key));
    this.#inFlight.set(key, started);
    return started;
  }
}
