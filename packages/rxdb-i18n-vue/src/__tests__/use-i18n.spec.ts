import type { I18n } from '@aiao/rxdb-i18n';
import { mount } from '@vue/test-utils';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick } from 'vue';
import { provideI18n, useI18n, useI18nOptional, useI18nRuntime } from '../index';

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

describe('useI18n Vue', () => {
  it('缺少 provider 时严格读取报错，可选读取为空', () => {
    const consumer = defineComponent({
      setup() {
        expect(useI18nRuntime()).toBeUndefined();
        expect(useI18nOptional()).toBeUndefined();
        expect(() => useI18n()).toThrow('I18n provider');
        return () => h('span');
      }
    });
    mount(consumer).unmount();
  });

  it('provider 注入并跟随 locale、目录与消息更新', async () => {
    const fixture = createRuntime();
    const Consumer = defineComponent({
      setup() {
        const binding = useI18n();
        expect(binding.locale.value).toBe('zh-Hans');
        expect(binding.t('hello', { name: 'Ada' }, 'app')).toBe('你好');
        expect(fixture.runtime.t).toHaveBeenCalledWith('hello', { name: 'Ada' }, 'app');
        expect(binding.formatNumber(1)).toBe('number');
        expect(binding.formatDate(new Date())).toBe('date');
        expect(binding.formatRelativeTime(1, 'day')).toBe('relative');
        return () =>
          h('span', `${binding.locale.value}:${binding.t('hello')}:${binding.availableLocales.value.join(',')}`);
      }
    });
    const Provider = defineComponent({
      setup() {
        provideI18n(fixture.runtime);
        return () => h(Consumer);
      }
    });
    const component = mount(Provider);
    expect(component.text()).toBe('zh-Hans:你好:zh-Hans');
    await fixture.runtime.setLocale('en');
    fixture.availableLocales$.next(['zh-Hans', 'en']);
    fixture.setMessage('Hello');
    await nextTick();
    expect(component.text()).toBe('en:Hello:zh-Hans,en');
    component.unmount();
    expect(fixture.locale$.observed).toBe(false);
    expect(fixture.availableLocales$.observed).toBe(false);
    expect(fixture.changes$.observed).toBe(false);
    expect(fixture.changes$.closed).toBe(false);
  });

  it('显式运行时支持独立 effectScope 且停止后清理', () => {
    const fixture = createRuntime();
    const scope = effectScope();
    const binding = scope.run(() => useI18n(fixture.runtime));
    expect(binding?.t('hello')).toBe('你好');
    expect(fixture.locale$.observed).toBe(true);
    scope.stop();
    expect(fixture.locale$.observed).toBe(false);
  });
});
