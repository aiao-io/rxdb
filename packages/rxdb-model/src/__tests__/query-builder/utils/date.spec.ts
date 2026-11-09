import { formatDateToYmd, parseYmdToLocalDate } from '../../../query-builder/utils/date.js';

describe('formatDateToYmd', () => {
  it('formats a Date object to yyyy-MM-dd', () => {
    const date = new Date(2026, 2, 17); // March 17, 2026
    expect(formatDateToYmd(date)).toBe('2026-03-17');
  });

  it('formats a date string', () => {
    expect(formatDateToYmd('2024-01-05T10:00:00Z')).toMatch(/^2024-01-05$/);
  });

  it('returns empty string for null', () => {
    expect(formatDateToYmd(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateToYmd(undefined)).toBe('');
  });

  it('returns empty string for invalid date string', () => {
    expect(formatDateToYmd('not-a-date')).toBe('');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2024, 0, 3); // Jan 3, 2024
    expect(formatDateToYmd(date)).toBe('2024-01-03');
  });
});

describe('parseYmdToLocalDate', () => {
  it('parses yyyy-MM-dd to local Date', () => {
    const date = parseYmdToLocalDate('2026-03-17');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(2); // March = 2
    expect(date!.getDate()).toBe(17);
    expect(date!.getHours()).toBe(0);
    expect(date!.getMinutes()).toBe(0);
  });

  it('returns null for null', () => {
    expect(parseYmdToLocalDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseYmdToLocalDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseYmdToLocalDate('')).toBeNull();
  });

  it('returns null for invalid format (no dashes)', () => {
    expect(parseYmdToLocalDate('20260317')).toBeNull();
  });

  it('returns null for non-numeric parts', () => {
    expect(parseYmdToLocalDate('abc-de-fg')).toBeNull();
  });

  it('returns null for incomplete date', () => {
    expect(parseYmdToLocalDate('2026-03')).toBeNull();
  });

  // setFullYear 会把不存在的日期归一到别的日子（2024-02-31 → 2024-03-02），筛选条件与用户输入不一致（RV-01a1bbd9c4427852b47d62c41a76fa0e）
  it.each([
    '2023-02-29',
    '2024-02-30',
    '2024-02-31',
    '2024-04-31',
    '2024-13-01',
    '2024-00-10',
    '2024-01-00',
    '2024-01-32'
  ])('returns null for calendar date that does not exist: %s', ymd => {
    expect(parseYmdToLocalDate(ymd)).toBeNull();
  });

  it.each([
    ['2024-02-29', 2024, 1, 29],
    ['2000-02-29', 2000, 1, 29],
    ['2023-02-28', 2023, 1, 28],
    ['2024-04-30', 2024, 3, 30],
    ['2024-12-31', 2024, 11, 31],
    ['0099-01-01', 99, 0, 1]
  ])('keeps the exact local calendar day for %s', (ymd, year, monthIndex, day) => {
    const date = parseYmdToLocalDate(ymd);
    expect(date).not.toBeNull();
    expect([date!.getFullYear(), date!.getMonth(), date!.getDate(), date!.getHours()]).toEqual([
      year,
      monthIndex,
      day,
      0
    ]);
  });
});
