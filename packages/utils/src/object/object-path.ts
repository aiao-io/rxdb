/**
 * 对象路径的公共规则
 *
 * 由 {@link setBase} 与 {@link flattenPathObjectToPlainObject} 共用：两者对「哪些段危险」
 * 「哪些段是数组下标」必须是同一个定义，否则同一条路径在两边建出不同形状的容器。
 */

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * 拒绝会改写原型链的路径段
 *
 * @throws {TypeError} 含 `__proto__` / `prototype` / `constructor` 段
 */
export const assertSafePath = (segments: readonly string[]): void => {
  const unsafeSegment = segments.find(segment => UNSAFE_PATH_SEGMENTS.has(segment));
  if (unsafeSegment) {
    throw new TypeError(`Unsafe object path segment: ${unsafeSegment}`);
  }
};

/**
 * 是否是规范数组下标：无前导零，且不超过数组下标上限 2^32 - 2
 *
 * `/^\d+$/` 会把 `01`、`4294967295` 也当下标建数组，写入时它们却只是普通属性——
 * 数组长度不变、JSON 看不见，值被静默藏起来。
 */
export const isArrayIndex = (segment: string): boolean =>
  /^(?:0|[1-9]\d*)$/.test(segment) && Number(segment) <= 2 ** 32 - 2;
