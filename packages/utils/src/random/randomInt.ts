/**
 * 生成指定范围内的随机整数
 * 使用 Math.random() 生成随机数，然后使用 Math.floor() 向下取整
 * @param min - 最小值（包含），默认为 Number.MIN_SAFE_INTEGER
 * @param max - 最大值（包含），默认为 Number.MAX_SAFE_INTEGER
 * @returns 指定范围内的随机整数
 * @example
 * randomInt(1, 10); // 返回 1 到 10 之间的随机整数，如 5
 * @example
 * randomInt(0, 1); // 返回 0 或 1
 * @example
 * randomInt(-5, 5); // 返回 -5 到 5 之间的随机整数
 * **注意：** 结果范围是 [min, max]，即包含最小值和最大值
 * **注意：** 使用 Math.floor() 确保返回整数
 * **注意：** 如果 min > max，返回结果可能不符合预期
 */
export function randomInt(min: number = Number.MIN_SAFE_INTEGER, max: number = Number.MAX_SAFE_INTEGER) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
