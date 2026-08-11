const offsetFn = (offset: number) => {
  // `>= 0` 而非 `> 0`：零偏移（UTC）用 `>` 会落到 '-' 分支，输出 `-00:00`。
  // RFC 3339 里 `-00:00` 的语义是「偏移未知」，与「偏移为零」是两回事（UTL-028）
  const flag = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hour = `${Math.floor(absOffset / 60)}`.padStart(2, '0');
  const minute = `${absOffset % 60}`.padStart(2, '0');
  return {
    flag,
    absOffset,
    hour,
    minute
  };
};

/**
 * UTC 时间转换
 * @param date 2018-12-04
 * @param time  19:09:10
 * @param offset 本地时间 减去 格林威治标准时间 (GMT) 的分钟量 与 getTimezoneOffset 相反数
 * @returns
 *
 * @example
 *   dateStringWithTimezone('2018-12-04', '19:09:10', 480) => '2018-12-04T19:09:10+08:00'
 */
export const dateStringWithTimezone = (date: string, time: string, offset: number) => {
  const { flag, hour, minute } = offsetFn(offset);
  return `${date}T${time}${flag}${hour}:${minute}`;
};
