import { describe, expect, it } from 'vitest';
import { dateStringWithTimezone } from '../../date/dateStringWithTimezone.js';

describe('dateStringWithTimezone', () => {
  it('1', () => {
    const date = dateStringWithTimezone('2018-12-04', '19:09:10', 480);
    expect(date).toEqual('2018-12-04T19:09:10+08:00');
  });
  it('2', () => {
    const date = dateStringWithTimezone('2018-12-04', '19:09:10', -480);
    expect(date).toEqual('2018-12-04T19:09:10-08:00');
  });
});

// UTL-028：`offset > 0 ? '+' : '-'` 把零偏移落到 '-' 分支，输出 `-00:00`。
// RFC 3339 里 `-00:00` 表示「偏移未知」，与「偏移为零(UTC)」语义不同。
describe('UTL-028 零偏移', () => {
  it('offset=0 必须输出 +00:00 而不是 -00:00', () => {
    expect(dateStringWithTimezone('2018-12-04', '19:09:10', 0)).toBe('2018-12-04T19:09:10+00:00');
  });

  it('正负偏移不受影响', () => {
    expect(dateStringWithTimezone('2018-12-04', '19:09:10', 480)).toBe('2018-12-04T19:09:10+08:00');
    expect(dateStringWithTimezone('2018-12-04', '19:09:10', -300)).toBe('2018-12-04T19:09:10-05:00');
  });
});
