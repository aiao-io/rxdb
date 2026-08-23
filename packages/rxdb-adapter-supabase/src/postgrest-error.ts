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

import { NetworkOfflineError } from '@aiao/rxdb';
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
 * 返回的错误**不得携带数字 `status`**：`isNetworkError` 的第 2 条判据是「带数字 `status`
 * ⇒ 不是网络错误」，把 `status: 0` 挂上去会把这次修复原地抵消。
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
