import { isArray, isPlainObject } from '../types/index.js';

/**
 * 空容器自己就是叶子
 *
 * 容器分支靠「遍历子项」写入结果，子项数为 0 时一条都不写，
 * 空数组 / 空对象在扁平化后彻底消失，反扁平化无从恢复（UTL-012）。
 * 根级（prefix 为空）例外：根是容器本身，写入会得到一个空字符串键。
 */
const flattenEmptyContainer = (
  empty: unknown[] | Record<string, unknown>,
  prefix: string,
  result: Record<string, unknown>
): Record<string, unknown> => {
  if (prefix !== '') {
    result[prefix] = empty;
  }
  return result;
};

/**
 * 数组末位不能是空洞
 *
 * 扁平结果里数组长度只能由写出的最大下标推出（还原时按下标写回，长度 = 最大下标 + 1）。
 * 中间空洞靠「该下标缺席」就能原样还原；末位空洞却没有任何键能承载长度——
 * `forEach` 跳过空洞后，`new Array(2)` 整个消失、`[1, ,]` 缩成 `[1]`。
 * 拒绝而不是把空洞补成 `undefined`：同包 isEqual / cloneDeep / createStableKey
 * 都把空洞与 `undefined` 当作不同的数据，补齐等于换了一份数据交回去。
 */
const assertTrailingSlotFilled = (array: readonly unknown[], prefix: string): void => {
  const lastIndex = array.length - 1;
  if (lastIndex in array) return;
  throw new TypeError(
    `plainObjectToFlattenPathObject: 路径 "${prefix}" 处的数组末位是空洞（length ${array.length}），` +
      '扁平路径只能由最大下标推出数组长度，无法表示末尾空洞'
  );
};

const flattenValue = (value: unknown, prefix: string, result: Record<string, unknown>): Record<string, unknown> => {
  if (isArray(value)) {
    if (value.length === 0) {
      return flattenEmptyContainer([], prefix, result);
    }
    assertTrailingSlotFilled(value, prefix);
    value.forEach((item, index) => flattenValue(item, `${prefix}[${index}]`, result));
    return result;
  }

  if (isPlainObject(value)) {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object);
    if (keys.length === 0) {
      return flattenEmptyContainer({}, prefix, result);
    }
    keys.forEach(key => flattenValue(object[key], `${prefix ? `${prefix}.` : ''}${key}`, result));
    return result;
  }

  result[prefix] = value;
  return result;
};

/**
 * 将普通对象扁平化为路径键值对象
 *
 * 空数组与空对象作为**叶子**写入（值就是 `[]` / `{}`），否则它们会在扁平化中消失，
 * 无法与「该字段不存在」区分（UTL-012）。根级空容器不写入，避免产生空字符串键。
 *
 * 根为普通对象、且键名不含 `.` / `[` / `]` 时，输出可由 {@link flattenPathObjectToPlainObject} 原样还原。
 * 根为数组时扁平键以 `[i]` 开头，而还原结果的根恒为普通对象，还原会抛 TypeError。
 *
 * 稀疏数组：中间空洞不产生键（还原后仍是空洞）；末位是空洞的数组（含 `new Array(n)`）
 * 无法表示长度，直接抛错，不静默缩短或丢弃。显式 `undefined` 是有值的位，照常写成叶子。
 *
 * @param object - 待扁平化对象
 * @returns 路径键值对象
 * @throws {TypeError} 任一层非空数组的末位是空洞
 *
 * @example
 * ```ts
 * plainObjectToFlattenPathObject({ a: { b: [0, 1] }, c: [], d: {} });
 * // { 'a.b[0]': 0, 'a.b[1]': 1, c: [], d: {} }
 * ```
 */
export function plainObjectToFlattenPathObject(object: object): Record<string, unknown> {
  return flattenValue(object, '', {});
}
