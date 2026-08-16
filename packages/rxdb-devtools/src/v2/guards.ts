/**
 * @fileoverview v2 协议的数值与范围守卫。
 *
 * @remarks
 * 故事要求「所有协议数值必须通过统一 guard」。集中在一处的意义不只是去重：
 * NaN / Infinity / 小数 / 数字字符串 / 超过 `MAX_SAFE_INTEGER` 这五类输入里，
 * 任何一个字段漏掉一类，那个字段就成了绕过上限的入口。
 *
 * @module @aiao/rxdb-devtools/v2/guards
 */

import {
  DEVTOOLS_MAX_PAGE_SIZE,
  DEVTOOLS_MAX_PROTOCOL_VERSION,
  DEVTOOLS_MAX_SUPPORTED_VERSIONS,
  DEVTOOLS_MIN_PROTOCOL_VERSION
} from './constants.js';

export {
  hasExactKeys,
  isNonEmptyString,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  isRecord
} from '../internal/guards.js';

/**
 * 判断值是否为落在 `[min, max]` 闭区间内的 safe integer。
 *
 * @remarks
 * `Number.isSafeInteger` 一次挡掉 NaN、±Infinity、小数与非 number 类型；
 * 单纯比较大小（`value >= min && value <= max`）会让数字字符串通过 —— JS 的
 * 关系运算符会把 `'5'` 隐式转成 `5`。
 *
 * @param value - 待检查值。
 * @param min - 闭区间下界。
 * @param max - 闭区间上界。
 * @returns 合规时为 `true`。
 */
export function isSafeIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * 判断值是否为合法的 `pageSize`（1～500）。
 *
 * @param value - 待检查值。
 * @returns 合规时为 `true`。
 */
export function isPageSize(value: unknown): value is number {
  return isSafeIntegerInRange(value, 1, DEVTOOLS_MAX_PAGE_SIZE);
}

/**
 * 判断值是否为合法的 `PROTOCOL_HELLO.supportedVersions`。
 *
 * @remarks
 * 要求**严格降序**而不是「降序 + 另做去重」：严格降序一步同时保证了有序与无重复，
 * 少一个可能与排序检查结果不一致的独立去重实现。降序本身是协议的一部分——
 * 版本选择直接取首个共同支持项，乱序会让选择结果依赖对端的书写顺序。
 *
 * @param value - 待检查值。
 * @returns 非空、严格降序、长度 ≤ 8 且每项都在 1～255 内时为 `true`。
 */
export function isSupportedVersionList(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  const versions: readonly unknown[] = value;
  if (versions.length === 0 || versions.length > DEVTOOLS_MAX_SUPPORTED_VERSIONS) return false;

  let previous = Number.POSITIVE_INFINITY;
  for (const version of versions) {
    if (!isSafeIntegerInRange(version, DEVTOOLS_MIN_PROTOCOL_VERSION, DEVTOOLS_MAX_PROTOCOL_VERSION)) return false;
    if (version >= previous) return false;
    previous = version;
  }
  return true;
}
