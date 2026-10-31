import type { I18n } from '@aiao/rxdb-i18n';
import { Subscription } from 'rxjs';
import {
  computed,
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  type ComputedRef,
  type InjectionKey,
  type Ref
} from 'vue';

/** 当前组件树中的国际化运行时。 */
export const I18N: InjectionKey<I18n> = Symbol('I18n');

/** Vue 原生响应式国际化绑定。 */
export interface I18nBinding extends Pick<
  I18n,
  't' | 'setLocale' | 'formatNumber' | 'formatDate' | 'formatRelativeTime'
> {
  /** 当前生效语言。 */
  readonly locale: Readonly<Ref<string>>;
  /** 已注册目录的语言集合。 */
  readonly availableLocales: ComputedRef<string[]>;
}

/**
 * 为后代组件提供运行时，销毁责任归调用方。
 * @param runtime - 已创建的运行时。
 */
export const provideI18n = (runtime: I18n): void => provide(I18N, runtime);

/**
 * 可选读取当前 provider 的运行时。
 * @returns 运行时；缺少 provider 时为 `undefined`。
 */
export const useI18nRuntime = (): I18n | undefined => inject(I18N, undefined);

/**
 * 订阅当前国际化运行时，随 effect scope 销毁清理订阅。
 * @param runtime - 可选的显式运行时，优先于 provider。
 * @returns 语言 ref、翻译和格式化函数。
 * @throws 缺少 provider 且未传入运行时时抛错。
 */
export const useI18n = (runtime?: I18n): I18nBinding => {
  const instance = runtime ?? useI18nRuntime();
  if (!instance) throw new Error('I18n provider is missing. Call provideI18n() or pass an I18n runtime.');
  const locale = shallowRef(instance.locale$.value);
  const locales = shallowRef(instance.availableLocales$.value);
  const revision = shallowRef(instance.changes$.value);
  const subscription = new Subscription();
  subscription.add(
    instance.locale$.subscribe(value => {
      locale.value = value;
    })
  );
  subscription.add(
    instance.availableLocales$.subscribe(value => {
      locales.value = value;
    })
  );
  subscription.add(
    instance.changes$.subscribe(value => {
      revision.value = value;
    })
  );
  onScopeDispose(() => subscription.unsubscribe());
  const track = (): void => {
    void locale.value;
    void revision.value;
  };
  return {
    locale: computed(() => locale.value),
    availableLocales: computed(() => locales.value),
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
