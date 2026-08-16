/**
 * @fileoverview transfer 限额的校验与三方协商。
 *
 * @remarks
 * panel、connector 与 provider 各自声明上限，实际生效值是三者的**最小值**。取最小而不是
 * 「以 provider 为准」，是因为链路上任何一段都可能是瓶颈：service worker 的消息大小、
 * renderer 的内存、原生侧的写入配额。让最严格的一方说了算，才不会出现「provider 说 1 GiB、
 * 中间某一段在 300 MiB 处静默断掉」这种只在大文件上复现的失败。
 *
 * @module @aiao/rxdb-devtools/provider/limits
 */

import { DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT } from '../v2/constants.js';
import { isSafeIntegerInRange } from '../v2/guards.js';

/**
 * 判断值是否为合法的 `maxTransferBytes`（0～1 GiB 的非负 safe integer）。
 *
 * @param value - 待检查值。
 * @returns 合规时为 `true`。
 */
export function isMaxTransferBytes(value: unknown): value is number {
  return isSafeIntegerInRange(value, 0, DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT);
}

/**
 * 协商出实际生效的 transfer 上限。
 *
 * @remarks
 * 任何一方的声明非法就整体返回 `undefined`，由调用方翻译成 `invalid_message`。
 * **不跳过非法项继续取最小值**——那会让一个写错的上限被静默忽略，
 * 而错误的一侧仍按自己的（可能更大的）值工作。
 *
 * @param limits - panel / connector / provider 各自声明的上限。
 * @returns 全部合法时为最小值；列表为空或含非法项时为 `undefined`。
 */
export function resolveNegotiatedTransferLimit(limits: unknown): number | undefined {
  if (!Array.isArray(limits) || limits.length === 0) return undefined;

  let negotiated: number = DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT;
  for (const limit of limits as readonly unknown[]) {
    if (!isMaxTransferBytes(limit)) return undefined;
    negotiated = Math.min(negotiated, limit);
  }
  return negotiated;
}

/**
 * 判断声明的总字节数是否在协商上限之内。
 *
 * @param totalBytes - `TRANSFER_START` 声明的 `totalBytes`。
 * @param negotiatedLimit - {@link resolveNegotiatedTransferLimit} 的结果。
 * @returns 在限额内时为 `true`；超出时调用方返回 `transfer_size_exceeded`。
 */
export function isWithinTransferLimit(totalBytes: unknown, negotiatedLimit: number): boolean {
  return isSafeIntegerInRange(totalBytes, 0, negotiatedLimit);
}
