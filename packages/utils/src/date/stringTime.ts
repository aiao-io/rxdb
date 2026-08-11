import { ParseTimeConfig } from './formatPassTime.js';
import { ParseTime } from './parseTime.js';

/**
 * 将时间数值格式化为带单位的字符串
 * @param key - 时间单位键名，对应 ParseTime 接口的属性
 * @param value - 时间数值
 * @param config - 可选的配置对象，用于自定义单位名称
 * @returns 格式化后的时间字符串，如 "5 天" 或 "3 hours"
 * @example
 * stringTime('day', 5); // 返回 "5 day"
 * stringTime('hour', 3, { hour: '小时' }); // 返回 "3 小时"
 * **注意：** 如果提供 config，会使用配置中的单位名称，否则使用英文键名
 * **注意：** 此函数主要用于 formatPassTime 等函数的内部实现
 */
export const stringTime = (key: keyof ParseTime, value: number, config?: ParseTimeConfig) =>
  config ? `${value} ${(config as ParseTimeConfig)[key] || key}` : `${value} ${key}`;
