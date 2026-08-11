import type { GraphQueryResult } from './graph-repository.interface.js';

/** 给数组附加不可枚举的截断状态，保持既有数组比较与序列化行为。 */
export const createGraphQueryResult = <T>(items: T[], truncated: boolean): GraphQueryResult<T> => {
  Object.defineProperty(items, 'truncated', {
    configurable: false,
    enumerable: false,
    value: truncated,
    writable: false
  });
  return items;
};
