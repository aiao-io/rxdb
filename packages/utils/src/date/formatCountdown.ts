import { isFunction } from '../types/index.js';
import { dateKeys, ParseTimeConfig } from './formatPassTime.js';
import { parseTime, ParseTime } from './parseTime.js';
import { stringTime } from './stringTime.js';

type FormatCountdownFunction = (input: ParseTime) => string;

/**
 * 倒计时
 * @param startDate 开始时间
 * @param endDate 结束时间
 * @param config 配置
 * @returns
 */
export const formatCountdown = (startDate: Date, endDate: Date, config?: ParseTimeConfig | FormatCountdownFunction) => {
  const passTime = parseTime(startDate, endDate);
  return isFunction(config) ?
      config(passTime)
    : dateKeys
        .filter(d => d)
        .map(key => stringTime(key, passTime[key], config as ParseTimeConfig))
        .join(' ');
};
