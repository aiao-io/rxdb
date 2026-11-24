import { I18n, type MessageCatalog, type UiLocale } from '@aiao/rxdb-i18n';
import { getOrbitHost } from '@modules/orbit';
import { BENCHMARKS_LOCALE_KEY, resolveInitialLocaleOptions, type InitialLocaleInput } from './locale';
import { benchmarksEnMessages, benchmarksZhMessages } from './messages';

/** 随包发布的 benchmarks 命名空间目录。 */
export const benchmarkCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'benchmarks', messages: benchmarksZhMessages },
  { locale: 'en', namespace: 'benchmarks', messages: benchmarksEnMessages }
];

/**
 * 创建 benchmarks 应用的静态 i18n 运行时。
 *
 * 基准应用没有常驻数据库，语言偏好落在 localStorage；启动语言按
 * 宿主语言 → 持久化偏好 → 设备语言解析，切换时由 {@link setBenchmarksLocale} 回写。
 */
export function createBenchmarksI18n(input: InitialLocaleInput = {}): I18n {
  return new I18n({
    ...resolveInitialLocaleOptions(input),
    catalogs: benchmarkCatalogs,
    namespace: 'benchmarks'
  });
}

/** 读取 localStorage 里的语言偏好；存储不可用时返回 null。 */
export function readStoredLocale(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(BENCHMARKS_LOCALE_KEY);
}

/**
 * 独立运行时把用户选择写回 localStorage；嵌入时由宿主语言决定初始值，不写本地偏好。
 */
export function persistLocale(locale: UiLocale): void {
  if (getOrbitHost()) return;
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BENCHMARKS_LOCALE_KEY, locale);
}

let runtime: I18n | undefined;

/**
 * 应用级 i18n 运行时单例；首次调用时用宿主语言、持久化偏好与设备语言解析启动语言。
 */
export function getBenchmarksI18n(): I18n {
  runtime ??= createBenchmarksI18n({
    hostLocale: getOrbitHost()?.props?.locale,
    storedLocale: readStoredLocale(),
    deviceLocale: globalThis.navigator?.language
  });
  return runtime;
}

/**
 * 切换语言并持久化；返回运行时刷新完成后的 Promise。
 */
export function setBenchmarksLocale(locale: UiLocale): Promise<void> {
  return getBenchmarksI18n()
    .setLocale(locale)
    .then(() => persistLocale(locale));
}
