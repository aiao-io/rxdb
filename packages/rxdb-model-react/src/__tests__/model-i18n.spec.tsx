import { I18nProvider } from '@aiao/rxdb-i18n-react';
import { buildPropertyColumn, defaultModelI18n, formatDateValue } from '@aiao/rxdb-model';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useModelI18n } from '../i18n';

const date = new Date(2026, 9, 28, 13, 14, 15);
const numberValue = (runtime: ReturnType<typeof useModelI18n>['runtime']) => {
  const column = buildPropertyColumn({ field: 'amount', type: 'number', i18n: runtime });
  return (column.fieldFormat as (row: Record<string, unknown>) => string)({ amount: 1234567.89 });
};
afterEach(cleanup);

describe('模型 React 的默认格式兼容', () => {
  it('无provider时保留日期时间与未分组数字，重渲染保持适配对象稳定', () => {
    const hook = renderHook(useModelI18n);
    const runtime = hook.result.current.runtime;
    expect(formatDateValue(date, runtime)).toBe(date.toLocaleString());
    expect(numberValue(runtime)).toBe('1234567.89');
    hook.rerender();
    expect(hook.result.current.runtime).toBe(runtime);
  });

  it('有provider时显式启用locale formatter，并保持适配对象稳定', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider value={defaultModelI18n}>{children}</I18nProvider>
    );
    const hook = renderHook(useModelI18n, { wrapper });
    const runtime = hook.result.current.runtime;
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
    hook.rerender();
    expect(hook.result.current.runtime).toBe(runtime);
  });
});
