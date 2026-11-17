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

  it('只带取值边界的数字 format 不改变显示：仍按语言格式化', () => {
    const runtime = new I18n({ locale: 'en-US' });
    try {
      const english = new Intl.NumberFormat('en-US').format(1234567.89);
      for (const type of ['number', 'integer'] as const) {
        const column = buildPropertyColumn({
          field: 'amount',
          type,
          i18n: runtime,
          format: { kind: 'number', min: 0 }
        });
        const format = column.fieldFormat as (row: Record<string, unknown>) => string;
        expect(format({ amount: 1234567.89 })).toBe(english);
      }
      // 带显示语义的 format 仍走自己的渲染，不被本地化覆盖。
      const currency = buildPropertyColumn({
        field: 'amount',
        type: 'number',
        i18n: runtime,
        format: { kind: 'currency', currency: 'CNY' }
      });
      expect((currency.fieldFormat as (row: Record<string, unknown>) => string)({ amount: 12 })).toBe('12 CNY');
    } finally {
      runtime.destroy();
    }
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
