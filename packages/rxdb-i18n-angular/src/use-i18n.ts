import type { I18n } from '@aiao/rxdb-i18n';
import { inject, InjectionToken, type Provider, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

/** 当前注入器中的国际化运行时。 */
export const I18N = new InjectionToken<I18n>('I18n');

/** Angular 原生响应式国际化绑定。 */
export interface I18nBinding extends Pick<
  I18n,
  't' | 'setLocale' | 'formatNumber' | 'formatDate' | 'formatRelativeTime'
> {
  /** 当前生效语言。 */
  readonly locale: Signal<string>;
  /** 已注册目录的语言集合。 */
  readonly availableLocales: Signal<string[]>;
}

/**
 * 在当前注入器中提供运行时，销毁责任归调用方。
 * @param runtime - 已创建的运行时或同步构造工厂。
 * @returns Angular provider。
 */
export const provideI18n = (runtime: I18n | (() => I18n)): Provider =>
  typeof runtime === 'function' ? { provide: I18N, useFactory: runtime } : { provide: I18N, useValue: runtime };

/**
 * 可选读取当前 provider 的运行时。
 * @returns 运行时；缺少 provider 时为 `undefined`。
 */
export const useI18nRuntime = (): I18n | undefined => inject(I18N, { optional: true }) ?? undefined;

/**
 * 订阅当前国际化运行时，随组件销毁清理订阅。
 * @param runtime - 可选的显式运行时，优先于 provider。
 * @returns 语言 signal、翻译和格式化函数。
 * @throws 缺少 provider 且未传入运行时时抛错。
 */
export const useI18n = (runtime?: I18n): I18nBinding => {
  const instance = runtime ?? useI18nRuntime();
  if (!instance) throw new Error('I18n provider is missing. Call provideI18n() or pass an I18n runtime.');
  const locale = toSignal(instance.locale$, { requireSync: true });
  const availableLocales = toSignal(instance.availableLocales$, { requireSync: true });
  const revision = toSignal(instance.changes$, { requireSync: true });
  const track = (): void => {
    locale();
    revision();
  };
  return {
    locale,
    availableLocales,
    t: (...args) => {
      track();
      return instance.t(...args);
    },
    setLocale: instance.setLocale,
    formatNumber: (...args) => {
      track();
      return instance.formatNumber(...args);
    },
    formatDate: (...args) => {
      track();
      return instance.formatDate(...args);
    },
    formatRelativeTime: (...args) => {
      track();
      return instance.formatRelativeTime(...args);
    }
  };
};

/**
 * 订阅可选的 provider，缺少时不创建订阅。
 * @returns 国际化绑定；缺少 provider 时为 `undefined`。
 */
export const useI18nOptional = (): I18nBinding | undefined => {
  const runtime = useI18nRuntime();
  return runtime ? useI18n(runtime) : undefined;
};
