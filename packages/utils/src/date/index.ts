/**
 * @fileoverview 日期时间工具模块
 *
 * @module date
 */

/**
 * 检查值是否可以转换为日期
 */
export { canBeDate } from './canBeDate.js';

/**
 * 将日期字符串转换为 Date 对象
 */
export { dateStringToDate } from './dateStringToDate.js';

/**
 * 处理带时区的日期字符串
 */
export { dateStringWithTimezone } from './dateStringWithTimezone.js';

/**
 * 格式化倒计时
 */
export { formatCountdown } from './formatCountdown.js';

/**
 * 格式化流逝时间（如"3小时前"）
 */
export { formatPassTime } from './formatPassTime.js';

/**
 * 检查是否是 ISO 日期字符串
 */
export { isISODateString } from './isISODateString.js';

/**
 * 检查是否是 ms 时间字符串
 */
export { isMSTime } from './isMSTime.js';

/**
 * 检查是否是毫秒数
 */
export { isMilliseconds } from './isMilliseconds.js';

/**
 * 毫秒时间转换
 */
export { msTimeToMilliseconds } from './msTimeToMilliseconds.js';
export type { MSTime } from './msTimeToMilliseconds.js';

/**
 * 解析时间字符串
 */
export { parseTime } from './parseTime.js';

/**
 * 字符串时间
 */
export { stringTime } from './stringTime.js';

/**
 * 获取 Unix 时间戳
 */
export { unixTimestamp } from './unixTimestamp.js';
