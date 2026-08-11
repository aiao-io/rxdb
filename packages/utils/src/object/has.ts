const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * 检查对象是否包含指定的嵌套自有属性。
 *
 * @param value - 要检查的值
 * @param path - 点号分隔路径
 * @returns 每一级都为自有属性时返回 true
 */
export const has = (value: unknown, path: string): boolean => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0 || segments.some(segment => UNSAFE_PATH_SEGMENTS.has(segment))) return false;

  let current: unknown = value;
  for (const segment of segments) {
    if ((typeof current !== 'object' && typeof current !== 'function') || current === null) return false;
    if (!Object.hasOwn(current, segment)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
};
