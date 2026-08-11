import type { Milliseconds } from './msTimeToMilliseconds.js';

/**
 * 判断是否是毫秒数
 *
 * 与 {@link isMSTime} 互补：后者只收窄 `ms` 的**字符串**写法（`'1d'`、`'2 days'`），
 * 数字走这里。两者的 true 集合不重叠（UTL-005）。
 *
 * @param value - 待判断的值
 * @returns 是有限数时为 true（`NaN` / `Infinity` 没有时长语义）
 *
 * @example
 * ```ts
 * isMilliseconds(200); // true
 * isMilliseconds('200'); // false —— 那是 MSTime
 * ```
 */
export function isMilliseconds(value: unknown): value is Milliseconds {
  return typeof value === 'number' && Number.isFinite(value);
}
