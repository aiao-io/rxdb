import { isNil } from '../types/index.js';

type ArrayType<T = unknown> = T extends Array<infer R> ? R : T;

/**
 * 将任意值标准化为数组格式
 *
 * @template T - 输入值类型
 * @param value - 需要标准化为数组的值
 * @returns 数组原值、空数组或包含输入值的单元素数组
 */
export const needArray = <T = unknown>(value: T): ArrayType<T>[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (isNil(value)) {
    return [];
  }

  return [value] as ArrayType<T>[];
};
