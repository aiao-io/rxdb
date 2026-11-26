import { describe, expect, it } from 'vitest';
import { formatDate } from './opfs-utils';

describe('OPFS date formatting', () => {
  it('formats dates with the requested UI locale', () => {
    const value = Date.parse('2024-01-02T03:04:00.000Z');
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };

    expect(formatDate(value, 'en-US')).toBe(new Intl.DateTimeFormat('en-US', options).format(value));
    expect(formatDate(value, 'zh-Hans')).toBe(new Intl.DateTimeFormat('zh-Hans', options).format(value));
  });
});
