/** 检查值是否为非 NaN 的 number 原始值。 */
export const isNumber = (value: unknown): value is number => typeof value === 'number' && !Number.isNaN(value);
