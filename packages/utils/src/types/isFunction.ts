import { AnyFunction } from './AnyFunction.js';

type CallablePart<T> = [Extract<T, AnyFunction>] extends [never] ? AnyFunction : Extract<T, AnyFunction>;

/** 检查值是否为可调用函数，并保留已有函数签名。 */
export const isFunction = <T>(value: T): value is T & CallablePart<T> => typeof value === 'function';
