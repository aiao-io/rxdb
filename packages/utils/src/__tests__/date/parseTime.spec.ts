import { describe, expect, it } from 'vitest';
import { parseTime } from '../../date/parseTime.js';

describe('parseTime', () => {
  it('按天/时/分/秒拆分正向区间', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-02T12:30:45.000Z');
    expect(parseTime(start, end)).toMatchObject({ day: 1, hour: 12, minute: 30, second: 45 });
  });

  // UTL-030：endDate 早于 startDate 时 ms 为负，各字段经 Math.floor 变成负数或 0，
  // formatPassTime 的 `find(k => passTime[k] > 0)` 一个都命中不了、回退到 'second'，
  // 于是「未来时间」被伪装成「0 秒前」。这是调用方的参数顺序错误，必须暴露。
  describe('UTL-030 反向区间', () => {
    it('endDate 早于 startDate 必须抛 RangeError', () => {
      const later = new Date('2026-01-02T00:00:00.000Z');
      const earlier = new Date('2026-01-01T00:00:00.000Z');
      expect(() => parseTime(later, earlier)).toThrow(RangeError);
    });

    it('相等时间戳仍然合法（差值为 0）', () => {
      const t = new Date('2026-01-01T00:00:00.000Z');
      expect(() => parseTime(t, t)).not.toThrow();
      expect(parseTime(t, t)).toMatchObject({ day: 0, second: 0 });
    });
  });
});
