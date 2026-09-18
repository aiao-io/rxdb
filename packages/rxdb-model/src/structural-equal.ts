/**
 * 结构化深比较，替代 JSON.stringify 比较。
 * 递归比较对象和数组，不依赖 key 序列化顺序。
 * 支持循环引用检测，避免无限递归。
 * @param a - 参与比较的第一个值
 * @param b - 参与比较的第二个值
 * @param seen - 已访问的对象集合，用于循环引用检测
 * @returns 两者结构相等时返回 true
 */
export function structuralEqual(a: unknown, b: unknown, seen = new WeakSet<object>()): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;

  const typeA = typeof a;
  if (typeA !== typeof b) return false;
  // 非对象类型（primitives + function）走 Object.is 语义的快速路径
  if (typeA !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    if (seen.has(a)) return true;
    seen.add(a);
    for (let i = 0; i < a.length; i++) {
      if (!structuralEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  if (seen.has(a as object)) return true;
  seen.add(a as object);
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!structuralEqual(aObj[key], bObj[key], seen)) return false;
  }
  return true;
}
