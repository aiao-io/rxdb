import { dateStringWithTimezone } from './dateStringWithTimezone.js';

/**
 * UTC 时间转换
 * @param date - 日期字符串，格式如 '2018-12-04'
 * @param time - 时间字符串，格式如 '19:09:10'
 * @param offset - 时区偏移量（分钟）
 */
export const dateStringToDate = (date: string, time: string, offset: number) =>
  new Date(dateStringWithTimezone(date, time, offset));
