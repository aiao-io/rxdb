import { serialize } from '@ungap/structured-clone';

/**
 * @fileoverview 小程序缺原生 `structuredClone` 时装上的实现。
 *
 * 序列化沿用 `@ungap/structured-clone`，反序列化自己做：ungap 的 `deserialize` 在模块求值时取
 * `self ?? globalThis` 作构造函数表，抖音页面模块两者都是 `undefined`，一克隆类型化数组、
 * 包装对象或 Error 就 TypeError。这里只经自由变量引用内置构造函数，不读任何全局对象。
 *
 * 记录格式取自 ungap 1.4.0（`package.json` 精确锁版本），升级时要对照 `esm/types.js` 与
 * `esm/deserialize.js` 复核。
 */

/** ungap 的记录：`[类型, 值]`，类型是 `esm/types.js` 的数字或构造函数名。 */
type SerializedRecord = readonly [type: number | string, value?: unknown];

const VOID = -1;
const PRIMITIVE = 0;
const ARRAY = 1;
const OBJECT = 2;
const DATE = 3;
const REGEXP = 4;
const MAP = 5;
const SET = 6;
const ERROR = 7;
const BIGINT = 8;

type TypedArrayConstructor = new (values: ArrayLike<number> & ArrayLike<bigint>) => ArrayBufferView;

/** 按名字取类型化数组构造函数；只在遇到该类型时才引用，缺 `BigInt64Array` 的引擎照样能加载本模块。 */
function typedArrayConstructor(type: string): TypedArrayConstructor | undefined {
  switch (type) {
    case 'Int8Array':
      return Int8Array as unknown as TypedArrayConstructor;
    case 'Uint8Array':
      return Uint8Array as unknown as TypedArrayConstructor;
    case 'Uint8ClampedArray':
      return Uint8ClampedArray as unknown as TypedArrayConstructor;
    case 'Int16Array':
      return Int16Array as unknown as TypedArrayConstructor;
    case 'Uint16Array':
      return Uint16Array as unknown as TypedArrayConstructor;
    case 'Int32Array':
      return Int32Array as unknown as TypedArrayConstructor;
    case 'Uint32Array':
      return Uint32Array as unknown as TypedArrayConstructor;
    case 'Float32Array':
      return Float32Array as unknown as TypedArrayConstructor;
    case 'Float64Array':
      return Float64Array as unknown as TypedArrayConstructor;
    case 'BigInt64Array':
      return BigInt64Array as unknown as TypedArrayConstructor;
    case 'BigUint64Array':
      return BigUint64Array as unknown as TypedArrayConstructor;
  }
  return undefined;
}

/** HTML 规范可序列化的错误类型；其余名字落成普通 `Error`。 */
const ERRORS: Readonly<Record<string, ErrorConstructor>> = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError
};

function bytesOf(value: unknown): ArrayBuffer {
  return Uint8Array.from(value as number[]).buffer;
}

/** 由名字记录（类型化数组、`ArrayBuffer`、`DataView`、包装对象）重建值；未知名字直接拒绝。 */
function reviveNamed(type: string, value: unknown): object {
  switch (type) {
    case 'ArrayBuffer':
      return bytesOf(value);
    case 'DataView':
      return new DataView(bytesOf(value));
    case 'Boolean':
    case 'Number':
    case 'String':
      return Object(value) as object;
    case 'BigInt':
      return Object(BigInt(value as string)) as object;
  }
  const TypedArray = typedArrayConstructor(type);
  if (!TypedArray) throw new TypeError(`unable to deserialize ${type}`);
  return new TypedArray(value as ArrayLike<number> & ArrayLike<bigint>);
}

function reviveError(value: unknown): Error {
  const { name, message } = value as { readonly name: string; readonly message: string };
  const ErrorType = Object.prototype.hasOwnProperty.call(ERRORS, name) ? ERRORS[name] : Error;
  return new ErrorType(message);
}

function deserialize(records: readonly SerializedRecord[]): unknown {
  const revived = new Map<number, unknown>();
  const keep = <T>(index: number, value: T): T => {
    revived.set(index, value);
    return value;
  };

  const unpair = (index: number): unknown => {
    if (revived.has(index)) return revived.get(index);
    const [type, value] = records[index];
    switch (type) {
      case VOID:
      case PRIMITIVE:
        return keep(index, value);
      case ARRAY: {
        const array = keep(index, [] as unknown[]);
        for (const item of value as number[]) array.push(unpair(item));
        return array;
      }
      case OBJECT: {
        const object = keep(index, {} as Record<string, unknown>);
        // defineProperty 让 `__proto__` 成为自有属性，不改原型
        for (const [key, item] of value as [number, number][]) {
          Object.defineProperty(object, unpair(key) as string, {
            value: unpair(item),
            configurable: true,
            enumerable: true,
            writable: true
          });
        }
        return object;
      }
      case DATE:
        return keep(index, new Date(value as string));
      case REGEXP: {
        const { source, flags } = value as { readonly source: string; readonly flags: string };
        return keep(index, new RegExp(source, flags));
      }
      case MAP: {
        const map = keep(index, new Map<unknown, unknown>());
        for (const [key, item] of value as [number, number][]) map.set(unpair(key), unpair(item));
        return map;
      }
      case SET: {
        const set = keep(index, new Set<unknown>());
        for (const item of value as number[]) set.add(unpair(item));
        return set;
      }
      case ERROR:
        return keep(index, reviveError(value));
      case BIGINT:
        return keep(index, BigInt(value as string));
      case '-0':
        return -0;
    }
    return keep(index, reviveNamed(type as string, value));
  };

  return unpair(0);
}

/** @internal 小程序缺原生 `structuredClone` 时装上的实现；函数与 symbol 抛 `TypeError`。 */
export const structuredClonePolyfill = <T>(value: T): T => deserialize(serialize(value) as SerializedRecord[]) as T;
