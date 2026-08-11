import { isDate } from './isDate.js';
import { isFunction } from './isFunction.js';
import { isNumber } from './isNumber.js';
import { isSymbol } from './isSymbol.js';

/**
 * 按工具库契约判断值是否为空
 *
 * @param value - 要检查的值
 * @returns 是否为空
 */
export const isEmpty = (value: unknown): boolean => {
  if (value === true || value === false || value === null || value === undefined) return true;
  if (isNumber(value)) return value === 0;
  if (isDate(value)) return Number.isNaN(value.getTime());
  if (isFunction(value) || isSymbol(value)) return false;

  const boxed = Object(value);
  const length = Reflect.get(boxed, 'length') as unknown;
  if (isNumber(length)) return length === 0;
  const size = Reflect.get(boxed, 'size') as unknown;
  if (isNumber(size)) return size === 0;
  return Object.keys(boxed).length === 0;
};
