import { isArray } from './isArray.js';
import { isInt } from './isInt.js';

export function isIntArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isInt);
}
