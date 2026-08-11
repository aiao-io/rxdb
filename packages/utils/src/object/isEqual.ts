import { isUint8Array } from '../types/index.js';
import { isEqualUint8Array } from './isEqualUint8Array.js';

/** 当前比较路径上「正在比较中」的对象对，用于循环引用检测。 */
type Seen = WeakMap<object, WeakSet<object>>;

/**
 * 装箱原语的 `Object.prototype.toString` 标签。
 *
 * 只有真正持有内部值槽（[[StringData]] 等）的对象才会返回这些标签，
 * `Object.create(String.prototype)` 之类的冒牌货返回 `[object Object]`。
 */
const BOXED_PRIMITIVE_TAGS = new Set([
  '[object String]',
  '[object Number]',
  '[object Boolean]',
  '[object Symbol]',
  '[object BigInt]'
]);

const hasSeenPair = (seen: Seen, a: object, b: object): boolean => {
  const set = seen.get(a);
  return set?.has(b) === true;
};

const markSeenPair = (seen: Seen, a: object, b: object): void => {
  let set = seen.get(a);
  if (!set) {
    set = new WeakSet<object>();
    seen.set(a, set);
  }
  set.add(b);
};

const unmarkSeenPair = (seen: Seen, a: object, b: object): void => {
  seen.get(a)?.delete(b);
};

/**
 * 自有**可枚举**键，字符串键与 symbol 键一并返回。
 *
 * 用 `Reflect.ownKeys` + descriptor 过滤而非 `Object.keys`：后者不含 symbol 键，
 * symbol 键指向的整棵子树会被静默跳过，只有 symbol 键不同的两个对象会判相等（UTL-022）。
 */
const ownEnumerableKeys = (target: object): PropertyKey[] =>
  Reflect.ownKeys(target).filter(key => Object.getOwnPropertyDescriptor(target, key)?.enumerable === true);

/** 按自有可枚举键逐个深比较。 */
const isEqualRecord = (a: object, b: object, seen: Seen): boolean => {
  const aRecord = a as Record<PropertyKey, unknown>;
  const bRecord = b as Record<PropertyKey, unknown>;
  const keys = ownEnumerableKeys(a);
  const bKeys = new Set<PropertyKey>(ownEnumerableKeys(b));
  if (keys.length !== bKeys.size) return false;
  if (keys.some(key => !bKeys.has(key))) return false;
  return keys.every(key => isEqualDeep(aRecord[key], bRecord[key], seen));
};

/**
 * 同构造函数对象的分类比较。
 *
 * 调用方已保证：两侧都是非 null 对象、构造函数相同、不构成循环。
 */
const isEqualObject = (a: object, b: object, seen: Seen): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => isEqualDeep(value, b[index], seen));
  }

  if (isUint8Array(a) && isUint8Array(b)) return isEqualUint8Array(a, b);

  // ArrayBuffer / DataView / 其他 TypedArray 都没有自有可枚举属性，落到下面的通用对象分支
  // 会因「两侧键集都是空」而被判**恒等** —— 内容完全不参与比较（UTL-025）
  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    return a.byteLength === b.byteLength && isEqualUint8Array(new Uint8Array(a), new Uint8Array(b));
  }
  if (a instanceof DataView && b instanceof DataView) {
    return (
      a.byteLength === b.byteLength &&
      isEqualUint8Array(
        new Uint8Array(a.buffer, a.byteOffset, a.byteLength),
        new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
      )
    );
  }
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    const viewA = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const viewB = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return a.byteLength === b.byteLength && isEqualUint8Array(viewA, viewB);
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // 注意：key 按引用比较（`b.has(key)`），value 才深比较。
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !isEqualDeep(value, b.get(key), seen)) return false;
    }
    return true;
  }

  // 无序比较：每个元素在对侧找一个未配对的等值项（O(n²)，仅适用于小集合）。
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    const remaining = [...b];
    for (const item of a) {
      const index = remaining.findIndex(candidate => isEqualDeep(item, candidate, seen));
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    return true;
  }

  // 装箱原始值（String / Number / Boolean / Symbol 对象）。
  // 按标签判定而非 `a.valueOf !== Object.prototype.valueOf`：null 原型对象的
  // `valueOf` 是 undefined，该比较为真却无法调用 → TypeError。
  if (BOXED_PRIMITIVE_TAGS.has(Object.prototype.toString.call(a))) {
    return a.valueOf() === b.valueOf();
  }

  // 只覆盖 toString 的内置对象（URL / Error / DOMException…）没有自有可枚举属性，
  // 直接走 isEqualRecord 会两边都是空键集 → 任意两个实例都判为相等。
  // 同样要先确认 toString 可调用，否则 null 原型对象会走进来并抛错。
  if (typeof a.toString === 'function' && a.toString !== Object.prototype.toString) {
    return a.toString() === b.toString();
  }

  return isEqualRecord(a, b, seen);
};

const isEqualDeep = (a: unknown, b: unknown, seen: Seen): boolean => {
  if (a === b || Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (a.constructor !== b.constructor) return false;

  // 循环检测按**当前路径**作用域，比较结束即撤销标记。
  // 不能退化成全局备忘录：Set 分支的 findIndex 是试探性比较，
  // 失败的 pair 若留在表里，后续同 pair 比较会被短路成 true（假阳性）。
  if (hasSeenPair(seen, a, b)) return true;
  markSeenPair(seen, a, b);
  try {
    return isEqualObject(a, b, seen);
  } finally {
    unmarkSeenPair(seen, a, b);
  }
};

/**
 * 深度比较两个值是否相等
 *
 * 支持数组 / Uint8Array / Date / RegExp / Map / Set / 包装类型 / 普通对象，
 * 并能安全处理循环引用。
 *
 * 通用对象按**自有可枚举**键比较，字符串键与 symbol 键同等对待。
 *
 * 已知边界：
 * - `Map` 的 key 按引用比较，只有 value 深比较（与 `Map#get` 的查找语义一致）。
 * - 仅覆盖 `toString` 的对象（如 `URL`、`Error`）按 `toString()` 结果比较。
 * - 不可枚举属性不参与比较（symbol 键与字符串键规则一致）。
 * - 取值会触发 getter；accessor 属性按其返回值比较。
 *
 * @param a - 第一个值
 * @param b - 第二个值
 * @returns 是否深度相等
 */
export const isEqual = (a: unknown, b: unknown): boolean => isEqualDeep(a, b, new WeakMap());
