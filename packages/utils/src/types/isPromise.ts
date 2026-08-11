import { isFunction } from './isFunction.js';

/** 检查值是否包含可调用的 then 方法。 */
export const isPromise = <T = unknown>(value: unknown): value is Promise<T> => {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return isFunction(Reflect.get(value, 'then'));
};
