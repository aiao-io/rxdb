type CloneableArrayBufferView = ArrayBufferView<ArrayBufferLike> &
  ArrayLike<number | bigint> & {
    constructor: {
      from(input: ArrayLike<number | bigint>): unknown;
    };
  };

/**
 * 装箱原语的 `Object.prototype.toString` 标签。
 *
 * 它们的值存放在内部槽（[[StringData]] 等）而非自有属性上，通用对象分支只会
 * 复制出一个没有内部槽的空壳（`valueOf()` 直接抛错），必须交给 `structuredClone`。
 */
const BOXED_PRIMITIVE_TAGS = new Set([
  '[object String]',
  '[object Number]',
  '[object Boolean]',
  '[object Symbol]',
  '[object BigInt]'
]);

/** 状态存放在内部槽、只能由结构化克隆算法复制的宿主对象。 */
const isStructuredCloneOnly = (value: object): boolean => {
  if (BOXED_PRIMITIVE_TAGS.has(Object.prototype.toString.call(value))) return true;
  // File 继承自 Blob，structuredClone 会保留具体类型。
  return typeof Blob !== 'undefined' && value instanceof Blob;
};

const cloneValue = <T>(value: T, seen: WeakMap<object, unknown>): T => {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }

  if (value instanceof DataView) {
    return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) as T;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as CloneableArrayBufferView;
    return view.constructor.from(view) as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(value, clonedMap);
    value.forEach((mapValue, key) => {
      clonedMap.set(cloneValue(key, seen), cloneValue(mapValue, seen));
    });
    return clonedMap as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(value, clonedSet);
    value.forEach(item => {
      clonedSet.add(cloneValue(item, seen));
    });
    return clonedSet as T;
  }

  if (Array.isArray(value)) {
    const clonedArray: unknown[] = [];
    seen.set(value, clonedArray);
    value.forEach(item => {
      clonedArray.push(cloneValue(item, seen));
    });
    return clonedArray as T;
  }

  // 按**类型**显式委托，而不是靠 try/catch 按异常分派：
  // 后者会让「同一个类多一个函数属性」在丢原型 / 保原型之间翻转（UTL-021）。
  if (isStructuredCloneOnly(value)) {
    const cloned = structuredClone(value);
    seen.set(value, cloned);
    return cloned;
  }

  const clonedObject = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>;
  seen.set(value, clonedObject);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      continue;
    }

    if ('value' in descriptor) {
      descriptor.value = cloneValue(descriptor.value, seen);
    }

    Object.defineProperty(clonedObject, key, descriptor);
  }

  return clonedObject as T;
};

/**
 * 深拷贝值。
 *
 * 只有**一套**对象模型：始终保留原型链与 property descriptor，因此 `instanceof`
 * 在拷贝前后恒等。历史实现是 `try structuredClone / catch 内部实现`，同一个类只要多
 * 一个函数属性就会在「丢原型」和「保原型」之间翻转（UTL-021），已移除。
 *
 * 分类处理：
 * - 原始值、函数：按引用原样返回（函数不被拷贝）。
 * - `Date` / `RegExp` / `ArrayBuffer` / `DataView` / TypedArray：重建同类型实例。
 *   `DataView` 会重建切片缓冲区，因此 `byteOffset` 归零、字节内容不变。
 * - `Map` / `Set` / `Array`：递归拷贝键、值与元素。
 * - 装箱原语（`new String` 等）与 `Blob` / `File`：状态在内部槽里，委托
 *   `structuredClone`。
 * - 其余对象：`Object.create(原型)` + 逐个 `Reflect.ownKeys` 复制 descriptor，
 *   symbol 键、getter/setter、不可枚举属性都保留；属性值中的函数按引用保留。
 *
 * 循环引用与共享引用通过 `WeakMap` 收敛，拷贝结果中的共享结构仍然共享。
 *
 * **已知边界**：`ImageData` / `ImageBitmap` / `MessagePort` 等其余宿主对象不在
 * 显式分类里，会走通用对象分支，只复制自有属性，语义不保证。
 *
 * @param value - 要拷贝的值
 * @returns 深拷贝后的值
 * @example
 * class A { x = 1; }
 * cloneDeep(new A()) instanceof A; // true
 */
export const cloneDeep = <T>(value: T): T => cloneValue(value, new WeakMap<object, unknown>());
