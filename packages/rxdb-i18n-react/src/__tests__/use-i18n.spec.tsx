import type { I18n } from '@aiao/rxdb-i18n';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useI18n, useI18nOptional, useI18nRuntime } from '../index';

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

afterEach(cleanup);

describe('useI18n React', () => {
  it('缺少 provider 时严格读取报错，可选读取为空', () => {
    expect(renderHook(useI18nRuntime).result.current).toBeUndefined();
    expect(renderHook(useI18nOptional).result.current).toBeUndefined();
    expect(() => renderHook(() => useI18n())).toThrow('I18n provider');
  });

  it('provider 注入并跟随 locale、目录与消息更新', async () => {
    const fixture = createRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider value={fixture.runtime}>{children}</I18nProvider>
    );
    const hook = renderHook(() => useI18n(), { wrapper });
    expect(hook.result.current.locale).toBe('zh-Hans');
    await act(() => hook.result.current.setLocale('en'));
    act(() => fixture.availableLocales$.next(['zh-Hans', 'en']));
    expect(hook.result.current.locale).toBe('en');
    expect(hook.result.current.availableLocales).toEqual(['zh-Hans', 'en']);
    expect(hook.result.current.t('hello', { name: 'Ada' }, 'app')).toBe('你好');
    expect(fixture.runtime.t).toHaveBeenCalledWith('hello', { name: 'Ada' }, 'app');
    expect(hook.result.current.formatNumber(1)).toBe('number');
    expect(hook.result.current.formatDate(new Date())).toBe('date');
    expect(hook.result.current.formatRelativeTime(1, 'day')).toBe('relative');
    const Consumer = () => <span>{useI18n().t('hello')}</span>;
    const component = render(<Consumer />, { wrapper });
    act(() => fixture.setMessage('Hello'));
    expect(component.container.textContent).toBe('Hello');
  });

  it('切换显式运行时和卸载会清理旧订阅', async () => {
    const first = createRuntime();
    const second = createRuntime();
    await second.runtime.setLocale('en');
    const hook = renderHook(({ runtime }) => useI18n(runtime), { initialProps: { runtime: first.runtime } });
    expect(first.locale$.observed).toBe(true);
    hook.rerender({ runtime: second.runtime });
    expect(hook.result.current.locale).toBe('en');
    expect(first.locale$.observed).toBe(false);
    expect(first.availableLocales$.observed).toBe(false);
    expect(first.changes$.observed).toBe(false);
    hook.unmount();
    expect(second.locale$.observed).toBe(false);
    expect(second.availableLocales$.observed).toBe(false);
    expect(second.changes$.observed).toBe(false);
    expect(second.changes$.closed).toBe(false);
  });

  it('可选 hook 在 provider 中返回响应式绑定', () => {
    const fixture = createRuntime();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider value={fixture.runtime}>{children}</I18nProvider>
    );
    const { result } = renderHook(useI18nOptional, { wrapper });
    expect(result.current?.locale).toBe('zh-Hans');
  });
});
