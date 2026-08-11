import { isNumber } from './isNumber.js';

/**
 * 判断是否为浮点数（有限且带小数部分）。
 *
 * @remarks
 * 必须带 `Number.isFinite`：`Infinity % 1` 求值为 `NaN`，`NaN !== 0` 为真，
 * 于是 `±Infinity` 会被判成浮点数（UTL-029）。
 */
export const isFloat = (value: unknown): value is number =>
  isNumber(value) && Number.isFinite(value) && value % 1 !== 0;
