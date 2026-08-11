/**
 * 生成指定范围内的随机浮点数
 * 使用 Math.random() 生成 0 到 1 之间的随机数，然后映射到指定范围
 * @param min - 最小值（包含），默认为 Number.MIN_SAFE_INTEGER
 * @param max - 最大值（不包含），默认为 Number.MAX_SAFE_INTEGER
 * @returns 指定范围内的随机浮点数
 * @example
 * randomFloat(0, 10); // 返回 0 到 10 之间的随机浮点数，如 3.14159
 * @example
 * randomFloat(-5, 5); // 返回 -5 到 5 之间的随机浮点数
 * @example
 * randomFloat(); // 返回任意安全的浮点数
 * **注意：** 结果范围是 [min, max)，即包含最小值但不包含最大值
 * **注意：** 使用 Math.random()，分布是均匀的
 * **注意：** 如果 min >= max，返回结果可能不符合预期
 */
export const randomFloat = (min: number = Number.MIN_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER) =>
  Math.random() * (max - min) + min;
