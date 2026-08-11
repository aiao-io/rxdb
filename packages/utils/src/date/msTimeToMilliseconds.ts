import ms from 'ms';
import { MS_TIME_PATTERN } from './ms-time-pattern.js';

/**
 * 毫秒
 */
export type Milliseconds = number;
export type MSTime = ms.StringValue;

/**
 * ms 时间转换为毫秒
 *
 * value   https://github.com/vercel/ms
 *
 * 入参同时接受 `MSTime` 字符串与已经是毫秒的 number ——
 * `ms(200)` 走的是**反向格式化**分支，返回字符串 `'200ms'`，
 * 而本函数声明的返回类型是 number（UTL-005）。数字因此原样返回，不再交给 `ms()`。
 *
 * 字符串先按 {@link MS_TIME_PATTERN}（与 `isMSTime` 同一份定义）校验：
 * `ms()` 对无法解析的字符串返回 `undefined`（同样与声明的 number 不符），
 * 对空串则抛自己的 `Error`。统一在入口拒绝，错误类型才是确定的。
 *
 * @param value - ms 时间字符串或毫秒数
 * @returns 毫秒
 * @throws {TypeError} 无法解析为有限毫秒数时
 *
 * @example '2 days', '1d', '10h', 200
 */
export const msTimeToMilliseconds = (value: MSTime | Milliseconds): Milliseconds => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`msTimeToMilliseconds: 无法解析为毫秒: ${JSON.stringify(value)}`);
    }
    return value;
  }

  if (!MS_TIME_PATTERN.test(value)) {
    throw new TypeError(`msTimeToMilliseconds: 无法解析为毫秒: ${JSON.stringify(value)}`);
  }

  const result = ms(value);
  if (!Number.isFinite(result)) {
    throw new TypeError(`msTimeToMilliseconds: 无法解析为毫秒: ${JSON.stringify(value)}`);
  }
  return result;
};
