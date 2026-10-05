import ms from 'ms';
import { MS_TIME_PATTERN } from './ms-time-pattern.js';

/**
 * 毫秒
 */
export type Milliseconds = number;

/**
 * `ms`（ms@2.1.3）单位片段，大小写不敏感，与 {@link MS_TIME_PATTERN} 接受的单位同一张表。
 */
type MSUnit =
  | 'Years' | 'Year' | 'Yrs' | 'Yr' | 'Y'
  | 'Weeks' | 'Week' | 'W'
  | 'Days' | 'Day' | 'D'
  | 'Hours' | 'Hour' | 'Hrs' | 'Hr' | 'H'
  | 'Minutes' | 'Minute' | 'Mins' | 'Min' | 'M'
  | 'Seconds' | 'Second' | 'Secs' | 'Sec' | 's'
  | 'Milliseconds' | 'Millisecond' | 'Msecs' | 'Msec' | 'Ms';

type MSUnitAnyCase = MSUnit | Uppercase<MSUnit> | Lowercase<MSUnit>;

/**
 * `ms` 时间字符串。
 *
 * 结构上与 `ms@3` 回合的 `ms.StringValue` 等价，但不引用 `ms` 包的类型导出：
 * ms@2.1.3 不随包自带声明，utils 的 package.json 也没把 `@types/ms` 列为依赖，
 * 工作区里能编译只是因为根目录的同名 devDependency 全局兜底。一旦把 `ms.StringValue`
 * 原样写进公开类型，发布的 `.d.ts` 就会要求独立消费者自己装 `@types/ms`，
 * strict + skipLibCheck=false 时报 TS7016（RV-078）。这里自建同形状类型打断这条依赖，
 * 字面量集合覆盖的输入与原类型、与 `ms()` 实际能解析的字符串保持一致，
 * 对现有调用方是透明替换。
 */
export type MSTime = `${number}` | `${number}${MSUnitAnyCase}` | `${number} ${MSUnitAnyCase}`;

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
