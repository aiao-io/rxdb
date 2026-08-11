import { isFunction } from '../types/index.js';
import { parseTime, ParseTime } from './parseTime.js';
import { stringTime } from './stringTime.js';

export type ParseTimeConfig = { [K in keyof ParseTime]: string };
export type FormatPassFunction = (input: { key: keyof ParseTime; value: number }) => string;
export const dateKeys: (keyof ParseTime)[] = ['year', 'month', 'day', 'hour', 'minute', 'second'];

// 过去了多少时间
export const formatPassTime = (startDate: Date, endDate: Date, config?: ParseTimeConfig | FormatPassFunction) => {
  const passTime = parseTime(startDate, endDate);
  const key = dateKeys.find(k => passTime[k] > 0) || 'second';
  const value = passTime[key];
  return isFunction(config) ? config({ key, value }) : stringTime(key, value, config as ParseTimeConfig);
};
