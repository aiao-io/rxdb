import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { buildPropertyColumn, defaultModelI18n, formatDateValue } from '@aiao/rxdb-model';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { useModelI18n } from '../i18n';

const date = new Date(2026, 9, 28, 13, 14, 15);
const numberValue = (runtime: ReturnType<typeof useModelI18n>['runtime']) => {
  const column = buildPropertyColumn({ field: 'amount', type: 'number', i18n: runtime });
  return (column.fieldFormat as (row: Record<string, unknown>) => string)({ amount: 1234567.89 });
};
afterEach(() => TestBed.resetTestingModule());

describe('模型 Angular 的默认格式兼容', () => {
  it('无provider时保留日期时间与未分组数字', () => {
    const { runtime } = TestBed.runInInjectionContext(useModelI18n);
    expect(formatDateValue(date, runtime)).toBe(date.toLocaleString());
    expect(numberValue(runtime)).toBe('1234567.89');
  });

  it('有provider时显式启用完整日期时间与本地化数字', () => {
    TestBed.configureTestingModule({ providers: [provideI18n(defaultModelI18n)] });
    const { runtime } = TestBed.runInInjectionContext(useModelI18n);
    expect(runtime.formatDate).toBeTypeOf('function');
    expect(runtime.formatNumber).toBeTypeOf('function');
    expect(formatDateValue(date, runtime)).toBe(
      new Intl.DateTimeFormat(defaultModelI18n.locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      }).format(date)
    );
    expect(numberValue(runtime)).toBe(new Intl.NumberFormat(defaultModelI18n.locale).format(1234567.89));
  });
});
