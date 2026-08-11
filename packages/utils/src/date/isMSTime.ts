import { isString } from '../types/index.js';
import { MS_TIME_PATTERN } from './ms-time-pattern.js';
import type { MSTime } from './msTimeToMilliseconds.js';

/**
 * 判断是否是 ms 时间字符串
 *
 * https://github.com/vercel/ms
 *
 * `MSTime` 就是 `ms.StringValue`，**只含字符串**。原实现对 number 直接 `return true`，
 * 收窄集合与声明的类型不一致：通过该谓词后把 number 交给 `msTimeToMilliseconds()`，
 * 运行时会拿到字符串 `'200ms'`（UTL-005）。数字请用 {@link isMilliseconds}。
 *
 * @param value - 待判断的值
 * @returns 是合法 ms 时间字符串时为 true
 *
 * @example
 * ```ts
 * isMSTime('2 days'); // true
 * isMSTime('100'); // true
 * isMSTime(200); // false —— 那是 Milliseconds
 * ```
 */
export function isMSTime(value: unknown): value is MSTime {
  return isString(value) && MS_TIME_PATTERN.test(value);
}
