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

const flattenValue = (value: unknown, prefix: string, result: Record<string, unknown>): Record<string, unknown> => {
  if (isArray(value)) {
    if (value.length === 0) {
      return flattenEmptyContainer([], prefix, result);
    }
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
 * 输出可由 {@link flattenPathObjectToPlainObject} 原样还原。
 *
 * @param object - 待扁平化对象
 * @returns 路径键值对象
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
