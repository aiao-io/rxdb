import { describe, expect, it } from 'vitest';

import {
  DATE_FORMATS, DEFAULT_APPEARANCE, TIME_FORMATS,
  formatGithubDate, formatGithubNumber, formatGithubTime, isGithubAppearance
} from './github-appearance';

describe('GitHub Appearance', () => {
  const date = new Date(2017, 9, 19, 14, 30, 45);

  it('formats date and time with the selected tokens', () => {
    expect(formatGithubDate(date, 'yyyy-MM-dd')).toBe('2017-10-19');
    expect(formatGithubDate(date, 'MMMM do, yyyy')).toBe('October 19th, 2017');
    expect(formatGithubDate(new Date(2026, 0, 1), 'MMMM do, yyyy')).toBe('January 1st, 2026');
    expect(formatGithubTime(date, 'h.mm.ss aaa')).toBe('2.30.45 pm');
    expect(formatGithubTime(new Date(2026, 0, 1), 'h:mm aaa')).toBe('12:00 am');
    expect(new Set(DATE_FORMATS.map(pattern => formatGithubDate(date, pattern))).size).toBe(DATE_FORMATS.length);
    expect(new Set(TIME_FORMATS.map(pattern => formatGithubTime(date, pattern))).size).toBe(TIME_FORMATS.length);
  });

  it('formats number groups and decimals independently', () => {
    expect(formatGithubNumber(-1234567.89, '.|,')).toBe('-1.234.567,89');
    expect(formatGithubNumber(1234567.89, ' |.')).toBe('1 234 567.89');
    expect(formatGithubNumber(1234567, '|.')).toBe('1234567');
  });

  it('only accepts supported stored choices', () => {
    expect(isGithubAppearance(DEFAULT_APPEARANCE)).toBe(true);
    expect(isGithubAppearance({ ...DEFAULT_APPEARANCE, theme: 'other' })).toBe(false);
    expect(isGithubAppearance({ ...DEFAULT_APPEARANCE, tabSize: 7 })).toBe(false);
    expect(isGithubAppearance({ ...DEFAULT_APPEARANCE, numberFormat: 'wrong' })).toBe(false);
    expect(isGithubAppearance(null)).toBe(false);
  });
});
