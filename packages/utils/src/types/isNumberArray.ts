import { isArray } from './isArray.js';
import { isNumber } from './isNumber.js';

export function isNumberArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isNumber);
}
