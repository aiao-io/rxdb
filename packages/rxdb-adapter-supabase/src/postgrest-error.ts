/**
 * @packageDocumentation
 * PostgREST 失败响应的分类口径（RV-001）。
 *
 * @remarks
 * core 的 `isNetworkError` 是「什么算离线」的唯一权威，而它的**默认方向是「不是」**：
 * 认不出的错误一律判 `false`。适配器把传输失败包成自定义 Error 类而不带任何判别位，
 * 等于让 `QueryCacheRepository` 的 `offlineFallback` 在这个适配器上恒不生效 ——
 * 断网时拿到的不是缓存，是异常。
 *
 * 之所以能靠 `status` 而不是嗅探 message：postgrest-js 在 fetch 失败时**不 reject**，
 * 它 catch 掉 `TypeError` 后返回 `{ error, data: null, status: 0, statusText: '' }`
 * （见 `PostgrestBuilder` 里 `res.catch(fetchError => …)` 一段）。于是：
 *
 * - `status === 0` ⇒ 连接就没建起来，是传输失败
 * - 任何非 0 的数字 ⇒ 拿到了 HTTP 状态码，说明连接是通的，401 / 403 / 502 都是远端给的**回答**
 *
 * 反过来放宽 core 那条 `FETCH_FAILURE_MESSAGE` 正则（去掉 `instanceof TypeError` 限制）
 * 是不能走的捷径：RLS 或约束错误的 message 里出现 `load failed` 就会被误判成离线，
 * 调用方拿到陈旧缓存而不是失败原因。
 */

import { NetworkOfflineError, type ReachabilityMonitor } from '@aiao/rxdb';
import { SupabaseDataError } from './errors.js';

/**
 * PostgREST 响应中与错误分类相关的部分。
 *
 * @remarks
 * `status` 声明成可选，是为了兼容那些只解构 `{ data, error }` 的既有调用点：
 * 缺失时按「不是传输失败」处理，与改动前的行为完全一致。
 */
export interface PostgrestFailure {
  /** PostgREST 返回的错误体；`null` 表示成功 */
  error: { message?: string | null } | null;
  /** HTTP 状态码；postgrest-js 用 `0` 表示请求根本没发出去 */
  status?: number;
}

/** postgrest-js 用来表示「连接没建起来」的哨兵状态码 */
const TRANSPORT_FAILURE_STATUS = 0;

/**
 * 判断一个 PostgREST 失败响应是否为传输失败（连不上远端），而非远端给出的业务结果。
 *
 * @param response - PostgREST 响应中的 `error` 与 `status`
 * @returns 仅在能明确识别为传输失败时为 `true`
 */
export function is_transport_failure(response: PostgrestFailure): boolean {
  return response.status === TRANSPORT_FAILURE_STATUS;
}

/**
 * 把 PostgREST 的失败响应转成该抛的错误对象。
 *
 * @param response - PostgREST 响应中的 `error` 与 `status`
 * @param errorMessage - 消息前缀，例如 `'Failed to fetch metadata'`
 * @returns 传输失败 → {@link NetworkOfflineError}；其余 → {@link SupabaseDataError}
 *
 * @remarks
 * 传输失败返回 core 的 {@link NetworkOfflineError} 而不是本包自定义的类，是因为它是
 * `isNetworkError` 的**第 1 条判据**（`instanceof`），也是唯一不依赖字符串约定的那条 ——
 * 适配器已经分类过了，core 直接采信。
 *
 * 返回的错误**不挂数字 `status`**。注意这不是 `NetworkOfflineError` 能否被识别的前提 ——
 * 第 1 条判据是 `instanceof`，命中即 `return true`，第 2 条那句「带数字 `status` ⇒ 不是网络
 * 错误」对它根本走不到。这里不挂只是为了让判据顺序不成为承重结构：一旦哪天改成抛别的错误
 * 类型（或 core 调整判据顺序），挂着的 `status: 0` 会立刻把这次修复原地抵消，而症状是
 * 断网被当成业务失败——与修复前一模一样，无从区分是没修还是修坏了。
 *
 * @example
 * ```typescript
 * const { data, error, status } = await query;
 * if (error) throw classify_postgrest_error({ error, status }, 'Failed to fetch metadata');
 * ```
 */
export function classify_postgrest_error(response: PostgrestFailure, errorMessage: string): Error {
  const detail = response.error?.message || 'unknown error';
  const message = `${errorMessage}: ${detail}`;

  return is_transport_failure(response) ? new NetworkOfflineError(new Error(message)) : new SupabaseDataError(message);
}

/**
 * 把一次失败的 PostgREST 往返上报给可达性判定，并返回该抛的错误。
 *
 * @param reachability - 可达性监视器，通常是 `rxdb.reachability`
 * @param response - PostgREST 响应中的 `error` 与 `status`
 * @param errorMessage - 消息前缀，例如 `'Failed to check table existence'`
 * @returns 该抛的错误；调用点写成 `throw settle_postgrest_failure(...)`
 *
 * @remarks
 * **返回而不是抛**，是为了让 `throw` 留在调用点上：TypeScript 的控制流分析认 `throw`
 * 语句、不认「这个函数一定会抛」，写成抛的话每个调用点后面都得再补一句永远到不了的
 * `return`，把不可达代码当成类型系统的贡品。
 *
 * 报的是**已分类**的错误而不是原始响应：`isNetworkError` 的第 1 条判据是
 * `instanceof NetworkOfflineError`，分类正是产出那个实例的地方。
 *
 * 带状态码的失败（401 / 403 / 500）**照报不误**。翻不翻由
 * {@link ReachabilityMonitor.report} 一处定夺 —— 在适配器里先筛一遍，等于让
 * 「什么算离线」在仓库里长出第二份定义，两份迟早会不一致。
 */
export function settle_postgrest_failure(
  reachability: ReachabilityMonitor,
  response: PostgrestFailure,
  errorMessage: string
): Error {
  const failure = classify_postgrest_error(response, errorMessage);
  reachability.report(failure);
  return failure;
}

/**
 * 结算一次 PostgREST 往返：上报结局，成功放行，失败抛出。
 *
 * @param reachability - 可达性监视器，通常是 `rxdb.reachability`
 * @param response - PostgREST 响应中的 `error` 与 `status`
 * @param errorMessage - 失败时的消息前缀，例如 `'Failed to find entities'`
 * @throws `NetworkOfflineError` 连不上远端（分类见 {@link classify_postgrest_error}）
 * @throws {SupabaseDataError} 远端拒绝（RLS / 约束 / 语法等）
 *
 * @remarks
 * **成功也要报**，而且这半边才是能不能恢复的关键：只报失败的话，一次断网之后
 * 没有任何东西会把状态翻回在线 —— 面板会一直显示离线，直到用户刷新页面。
 *
 * @example
 * ```typescript
 * const { data, error, status } = await query;
 * assert_postgrest_ok(this.rxdb.reachability, { error, status }, 'Failed to find entities');
 * // 走到这里就是成功，data 可用
 * ```
 */
export function assert_postgrest_ok(
  reachability: ReachabilityMonitor,
  response: PostgrestFailure,
  errorMessage: string
): void {
  if (!response.error) {
    reachability.report(null);
    return;
  }
  throw settle_postgrest_failure(reachability, response, errorMessage);
}
