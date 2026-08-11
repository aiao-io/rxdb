import { isString } from './isString.js';

export const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
