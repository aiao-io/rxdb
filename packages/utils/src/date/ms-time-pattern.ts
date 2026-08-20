/**
 * `ms` 时间字符串的格式
 *
 * 由 {@link isMSTime} 与 {@link msTimeToMilliseconds} 共用：谓词的 true 集合
 * 与转换函数实际接受的输入必须是同一个定义，否则「通过了类型谓词」并不代表
 * 「转换函数能处理」（UTL-005）。
 *
 * 数值部分写成 `\d+(?:\.\d+)?|\.\d+` 而不是上游的 `(?:\d+)?\.?\d+`：后者让两个 `\d+`
 * 对同一串数字有 O(n) 种切分，末尾跟一个不匹配的字符就逼引擎把所有切分走一遍，
 * `'0'.repeat(50000) + 'x'` 上退化成 O(n²)（CS-006 / CS-007）。两者接受的字符串集合相同 ——
 * `'1.'` 两边都拒（小数点后必须有数字），`'.5'` 两边都收。
 *
 * https://github.com/vercel/ms
 */
export const MS_TIME_PATTERN =
  /^(?<value>-?(?:\d+(?:\.\d+)?|\.\d+)) *(?<type>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;
