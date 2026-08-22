/**
 * @packageDocumentation
 * 网络错误与业务错误的分类口径（US-020 D11）。
 *
 * @remarks
 * 单独成文件而不是写在 `catch` 里，是因为这条判断有两个使用方：
 * QueryCache 的 `offlineFallback`（US-020 AC#16）与后续的同步重试策略（US-212）。
 * 两处口径必须一致 —— 否则「什么算离线」会在两个地方各自漂移。
 */

import { NetworkOfflineError } from '../RxDBError.js';

/**
 * 判为网络故障的 Node errno。
 *
 * @remarks
 * 只收「连不上 / 连断了」这一类。像 `ENOENT`、`EACCES` 这种本地文件系统 errno 不在其中：
 * 它们是本地环境问题，拿陈旧缓存顶上去只会掩盖故障。
 */
const NETWORK_ERRNO = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT'
]);

/**
 * 判为网络故障的 `DOMException.name`。
 *
 * @remarks
 * 不含 `AbortError`：那是调用方主动 `abort()`，把它当离线会让「取消」静默变成「返回缓存」。
 */
const NETWORK_ERROR_NAMES = new Set(['NetworkError', 'TimeoutError']);

/**
 * `fetch()` 连接失败时各浏览器抛出的 `TypeError` 消息。
 *
 * @remarks
 * 规范只要求「reject with a TypeError」，消息文本由实现自定：
 * Chrome `Failed to fetch`、Firefox `NetworkError when attempting to fetch resource.`、
 * Safari `Load failed`。没有比匹配消息更可靠的手段 —— 所以这里限定到 `TypeError`
 * 且必须命中已知文本，认不出的 `TypeError`（例如读属性读到 undefined）照常上抛。
 */
const FETCH_FAILURE_MESSAGE = /failed to fetch|networkerror when attempting to fetch|load failed|network request failed/i;

/** 读一个可能不存在的属性，不引入 `any` */
const readProperty = (value: object, key: string): unknown => (value as Record<string, unknown>)[key];

/**
 * 判断一个错误是否为网络故障（连不上远端），而非远端给出的业务结果。
 *
 * @param error - 捕获到的任意值
 * @returns 仅在能明确识别为网络故障时为 `true`
 *
 * @remarks
 * **默认方向是「不是」**：认不出的错误一律返回 `false`，由调用方原样上抛。
 * 反过来会更危险 —— 401、唯一键冲突、字段校验失败被当成离线，调用方拿到的是陈旧缓存
 * 而不是失败原因，问题被推迟到不知道多久以后才暴露。
 *
 * 判据优先级：
 * 1. {@link NetworkOfflineError} —— 已经分类过了
 * 2. 带数字 `status` → **不是**网络错误。拿到了 HTTP 状态码就说明连接是通的，
 *    502 / 503 也是远端给的回答，不是网线断了
 * 3. Node errno（{@link NETWORK_ERRNO}）
 * 4. `DOMException.name`（{@link NETWORK_ERROR_NAMES}）
 * 5. `fetch()` 失败特有的 `TypeError` 消息
 *
 * @example
 * ```typescript
 * try {
 *   await remote.fetchMetadata('Todo', where);
 * } catch (error) {
 *   if (!isNetworkError(error)) throw error; // 业务错误原样上抛
 *   return readLocalCache();
 * }
 * ```
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkOfflineError) {
    return true;
  }
  if (error === null || typeof error !== 'object') {
    return false;
  }
  if (typeof readProperty(error, 'status') === 'number') {
    return false;
  }

  const code = readProperty(error, 'code');
  const name = readProperty(error, 'name');
  if (typeof code === 'string' && NETWORK_ERRNO.has(code)) {
    return true;
  }
  if (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) {
    return true;
  }
  return error instanceof TypeError && FETCH_FAILURE_MESSAGE.test(error.message);
}
