import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { buildPropertyColumn, formatDateValue } from '../entity-table/columns/column-utils.js';

const date = new Date(2026, 9, 28, 13, 14, 15);
const options: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric'
};

describe('模型列的本地化值', () => {
  it('旧日期与数字输出保持原值', () => {
    expect(formatDateValue(date)).toBe(date.toLocaleString());
    const column = buildPropertyColumn({ field: 'amount', type: 'number' });
    const format = column.fieldFormat as (row: Record<string, unknown>) => string;
    expect(format({ amount: 1234567.89 })).toBe('1234567.89');
  });

  it('显式运行时按语言格式化完整日期与时间，保留到秒', async () => {
    const runtime = new I18n({ locale: 'en-US' });
    try {
      const column = buildPropertyColumn({ field: 'timestamp', type: 'date', i18n: runtime });
      const format = column.fieldFormat as (row: Record<string, unknown>) => string;
      const english = new Intl.DateTimeFormat('en-US', options).format(date);
      expect(formatDateValue(date, runtime)).toBe(english);
      expect(format({ timestamp: date })).toBe(english);
      expect(english).not.toBe(new Intl.DateTimeFormat('en-US').format(date));
      await runtime.setLocale('zh-Hans');
      expect(formatDateValue(date, runtime)).toBe(new Intl.DateTimeFormat('zh-Hans', options).format(date));
    } finally {
      runtime.destroy();
    }
  });
});
