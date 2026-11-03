/**
 * 结构化深比较，替代 JSON.stringify 比较。
 * 递归比较对象和数组，不依赖 key 序列化顺序。
 * 支持循环引用检测，避免无限递归。
 * @param a - 参与比较的第一个值
 * @param b - 参与比较的第二个值
 * @param seen - 已访问的对象集合，用于循环引用检测
 * @returns 两者结构相等时返回 true
 */
export function structuralEqual(a: unknown, b: unknown): boolean {
  return structuralEqualInternal(a, b, new WeakMap<object, WeakSet<object>>());
}

/** 深复制模型状态中的结构化值，保留日期、字节序列和循环引用。 */
export function cloneStructured<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  const object = value as object;
  const previous = seen.get(object);
  if (previous !== undefined) return previous as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Uint8Array) return new Uint8Array(value) as T;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(object, copy);
    for (const item of value) copy.push(cloneStructured(item, seen));
    return copy as T;
  }
  const copy: Record<string, unknown> = {};
  seen.set(object, copy);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = cloneStructured(item, seen);
  }
  return copy as T;
}

function structuralEqualInternal(a: unknown, b: unknown, seen: WeakMap<object, WeakSet<object>>): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;

  const typeA = typeof a;
  if (typeA !== typeof b) return false;
  // 非对象类型（primitives + function）走 Object.is 语义的快速路径
  if (typeA !== 'object') return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    return (
      a instanceof Uint8Array &&
      b instanceof Uint8Array &&
      a.length === b.length &&
      a.every((value, index) => value === b[index])
    );
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    const seenRight = seen.get(a);
    if (seenRight?.has(b as object)) return true;
    if (seenRight) seenRight.add(b as object);
    else seen.set(a, new WeakSet([b as object]));
    for (let i = 0; i < a.length; i++) {
      if (!structuralEqualInternal(a[i], b[i], seen)) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  const seenRight = seen.get(a as object);
  if (seenRight?.has(b as object)) return true;
  if (seenRight) seenRight.add(b as object);
  else seen.set(a as object, new WeakSet([b as object]));
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!structuralEqualInternal(aObj[key], bObj[key], seen)) return false;
  }
  return true;
}
