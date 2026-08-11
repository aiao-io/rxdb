/**
 * `ms` 时间字符串的格式
 *
 * 由 {@link isMSTime} 与 {@link msTimeToMilliseconds} 共用：谓词的 true 集合
 * 与转换函数实际接受的输入必须是同一个定义，否则「通过了类型谓词」并不代表
 * 「转换函数能处理」（UTL-005）。
 *
 * https://github.com/vercel/ms
 */
export const MS_TIME_PATTERN =
  /^(?<value>-?(?:\d+)?\.?\d+) *(?<type>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;
