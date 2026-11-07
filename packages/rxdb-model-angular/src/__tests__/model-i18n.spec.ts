import { getEntityMetadata } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { provideI18n } from '@aiao/rxdb-i18n-angular';
import { buildPropertyColumn, defaultModelI18n, formatDateValue, localizeEntityMetadata } from '@aiao/rxdb-model';
import { Todo } from '@aiao/rxdb-test/entities';
import { computed } from '@angular/core';
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

describe('显示目录的 Angular 响应式绑定', () => {
  it('首次缺失目录后新增翻译和切语言都更新显示元数据', async () => {
    const metadata = getEntityMetadata(Todo);
    const key = `entity.${metadata.namespace}.${metadata.name}.displayName`;
    const runtime = new I18n({ locale: 'en' });
    TestBed.configureTestingModule({ providers: [provideI18n(runtime)] });
    const binding = TestBed.runInInjectionContext(useModelI18n);
    const label = computed(() => localizeEntityMetadata(metadata, binding.runtime).displayName);
    expect(label()).toBe(metadata.displayName);
    runtime.registerCatalog({ locale: 'en', namespace: 'rxdb-model', messages: { [key]: 'Tasks' } });
    runtime.registerCatalog({ locale: 'zh-Hans', namespace: 'rxdb-model', messages: { [key]: '任务' } });
    expect(label()).toBe('Tasks');
    await runtime.setLocale('zh-Hans');
    expect(label()).toBe('任务');
    expect(metadata.displayName).not.toBe('Tasks');
    runtime.destroy();
  });
});
