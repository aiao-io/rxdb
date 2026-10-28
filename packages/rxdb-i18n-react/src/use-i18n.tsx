import type { I18n } from '@aiao/rxdb-i18n';
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import type { BehaviorSubject } from 'rxjs';

const I18nContext = createContext<I18n | undefined>(undefined);

/** React 状态驱动的国际化绑定。 */
export interface I18nBinding extends Pick<
  I18n,
  't' | 'setLocale' | 'formatNumber' | 'formatDate' | 'formatRelativeTime'
> {
  /** 当前生效语言。 */
  readonly locale: string;
  /** 已注册目录的语言集合。 */
  readonly availableLocales: string[];
}

/** 国际化 provider 的输入。 */
export interface I18nProviderProps {
  /** 由调用方持有和销毁的运行时。 */
  readonly value: I18n;
  /** 共享此运行时的组件。 */
  readonly children?: ReactNode;
}

/**
 * 为子组件提供运行时，销毁责任归调用方。
 * @param props - 运行时与子组件。
 * @returns provider 元素。
 */
export const I18nProvider = ({ value, children }: I18nProviderProps): ReactElement => (
  <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
);

/**
 * 可选读取当前 provider 的运行时。
 * @returns 运行时；缺少 provider 时为 `undefined`。
 */
export const useI18nRuntime = (): I18n | undefined => useContext(I18nContext);

const useSubject = <T,>(subject: BehaviorSubject<T> | undefined): T | undefined => {
  const subscribe = useCallback(
    (notify: () => void) => {
      const subscription = subject?.subscribe(notify);
      return () => subscription?.unsubscribe();
    },
    [subject]
  );
  const snapshot = useCallback(() => subject?.value, [subject]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
};

const useBinding = (runtime: I18n | undefined): I18nBinding | undefined => {
  const locale = useSubject(runtime?.locale$);
  const availableLocales = useSubject(runtime?.availableLocales$);
  useSubject(runtime?.changes$);
  if (!runtime) return undefined;
  return {
    locale: locale as string,
    availableLocales: availableLocales as string[],
    t: runtime.t,
    setLocale: runtime.setLocale,
    formatNumber: runtime.formatNumber,
    formatDate: runtime.formatDate,
    formatRelativeTime: runtime.formatRelativeTime
  };
};

/**
 * 订阅当前国际化运行时，卸载时清理订阅。
 * @param runtime - 可选的显式运行时，优先于 provider。
 * @returns 当前语言、翻译和格式化函数。
 * @throws 缺少 provider 且未传入运行时时抛错。
 */
export const useI18n = (runtime?: I18n): I18nBinding => {
  const provided = useI18nRuntime();
  const binding = useBinding(runtime ?? provided);
  if (!binding) throw new Error('I18n provider is missing. Render I18nProvider or pass an I18n runtime.');
  return binding;
};

/**
 * 订阅可选的 provider，缺少时不创建订阅。
 * @returns 国际化绑定；缺少 provider 时为 `undefined`。
 */
export const useI18nOptional = (): I18nBinding | undefined => useBinding(useI18nRuntime());
