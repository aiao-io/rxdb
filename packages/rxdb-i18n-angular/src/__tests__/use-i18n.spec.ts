import type { I18n } from '@aiao/rxdb-i18n';
import { Component, createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { I18N, provideI18n, useI18n, useI18nOptional, useI18nRuntime } from '../index';

const createRuntime = () => {
  const locale$ = new BehaviorSubject('zh-Hans');
  const availableLocales$ = new BehaviorSubject(['zh-Hans']);
  const changes$ = new BehaviorSubject(0);
  let message = '你好';
  const runtime = {
    locale$,
    availableLocales$,
    changes$,
    t: vi.fn(() => message),
    setLocale: vi.fn(async (locale: string) => {
      locale$.next(locale);
      changes$.next(changes$.value + 1);
    }),
    formatNumber: vi.fn(() => 'number'),
    formatDate: vi.fn(() => 'date'),
    formatRelativeTime: vi.fn(() => 'relative')
  } as unknown as I18n;
  return {
    runtime,
    locale$,
    availableLocales$,
    changes$,
    setMessage: (value: string) => {
      message = value;
      changes$.next(changes$.value + 1);
    }
  };
};

describe('useI18n Angular', () => {
  it('缺少 provider 时严格读取报错，可选读取为空', () => {
    TestBed.runInInjectionContext(() => {
      expect(useI18nRuntime()).toBeUndefined();
      expect(useI18nOptional()).toBeUndefined();
      expect(() => useI18n()).toThrow('I18n provider');
    });
  });

  it('注入工厂仅构造一次，并以 signal 跟随 locale 与目录', async () => {
    const fixture = createRuntime();
    const factory = vi.fn(() => fixture.runtime);
    TestBed.configureTestingModule({ providers: [provideI18n(factory)] });
    const binding = TestBed.runInInjectionContext(() => useI18n());
    expect(TestBed.inject(I18N)).toBe(fixture.runtime);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(binding.locale()).toBe('zh-Hans');
    expect(binding.availableLocales()).toEqual(['zh-Hans']);
    await binding.setLocale('en');
    fixture.availableLocales$.next(['zh-Hans', 'en']);
    expect(binding.locale()).toBe('en');
    expect(binding.availableLocales()).toEqual(['zh-Hans', 'en']);
    expect(binding.formatNumber(1)).toBe('number');
    expect(binding.formatDate(new Date())).toBe('date');
    expect(binding.formatRelativeTime(1, 'day')).toBe('relative');
    expect(binding.t('hello', { name: 'Ada' }, 'app')).toBe('你好');
    expect(fixture.runtime.t).toHaveBeenCalledWith('hello', { name: 'Ada' }, 'app');
  });

  it('目录修改重新渲染，组件销毁清理全部订阅且不销毁运行时', async () => {
    const fixture = createRuntime();
    @Component({ template: '{{ i18n.t("hello") }}' })
    class Consumer {
      readonly i18n = useI18n();
    }
    TestBed.configureTestingModule({ providers: [provideI18n(fixture.runtime)] });
    const component = TestBed.createComponent(Consumer);
    component.detectChanges();
    expect(component.nativeElement.textContent).toBe('你好');
    fixture.setMessage('Hello');
    await component.whenStable();
    expect(component.nativeElement.textContent).toBe('Hello');
    expect(fixture.locale$.observed).toBe(true);
    component.destroy();
    expect(fixture.locale$.observed).toBe(false);
    expect(fixture.availableLocales$.observed).toBe(false);
    expect(fixture.changes$.observed).toBe(false);
    expect(fixture.changes$.closed).toBe(false);
  });

  it('显式运行时优先，并随注入器销毁清理', () => {
    const provided = createRuntime();
    const explicit = createRuntime();
    const injector = createEnvironmentInjector([provideI18n(provided.runtime)], TestBed.inject(EnvironmentInjector));
    const binding = runInInjectionContext(injector, () => useI18n(explicit.runtime));
    expect(binding.t('hello')).toBe('你好');
    expect(provided.locale$.observed).toBe(false);
    expect(explicit.locale$.observed).toBe(true);
    injector.destroy();
    expect(explicit.locale$.observed).toBe(false);
  });
});
