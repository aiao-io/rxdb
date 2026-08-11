/**
 * 解析两个日期之间的时间差，返回分解后的时间单位
 */
export interface ParseTime {
  /** 年数 */
  year: number;
  /** 月数 */
  month: number;
  /** 天数 */
  day: number;
  /** 小时数 */
  hour: number;
  /** 分钟数 */
  minute: number;
  /** 秒数 */
  second: number;
}

/**
 * 计算两个日期之间的时间差，并分解为年、月、日、时、分、秒
 * @param startDate - 开始日期
 * @param endDate - 结束日期
 * @returns 包含时间差分解结果的对象
 * @example
 * const start = new Date('2023-01-01T00:00:00');
 * const end = new Date('2024-02-02T12:30:45');
 * const result = parseTime(start, end);
 * // 返回: { year: 1, month: 13, day: 397, hour: 12, minute: 30, second: 45 }
 * **注意：** 月份和年份的计算是近似值（30天=1月，12月=1年）
 * **注意：** 所有时间单位都是向下取整的整数
 * **注意：** 返回的月份和年份可能超过常规范围（如13个月表示1年1个月）
 */
export const parseTime = (startDate: Date, endDate: Date): ParseTime => {
  const ms = endDate.getTime() - startDate.getTime();
  // 反向区间（endDate 早于 startDate）在下面全部走 Math.floor，各字段变成负数或 0，
  // 上层 formatPassTime 的 `find(k => passTime[k] > 0)` 一个都命中不了、回退到 'second'，
  // 于是「未来时间」被伪装成「0 秒前」。这是调用方的参数顺序错误，必须暴露（UTL-030）
  if (ms < 0) {
    throw new RangeError(`parseTime: endDate 早于 startDate（相差 ${-ms}ms），请检查参数顺序`);
  }
  const day = Math.floor(ms / 86400000); // 天
  const month = Math.floor(day / 30); // 月
  const year = Math.floor(month / 12); // 年
  const hour = Math.floor(ms / 3600000) % 24; // 小时
  const minute = Math.floor(ms / 60000) % 60; // 分钟
  const second = Math.floor(ms / 1000) % 60; // 秒
  return { year, month, day, hour, minute, second };
};
