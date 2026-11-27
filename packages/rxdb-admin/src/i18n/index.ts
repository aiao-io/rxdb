import { I18n, resolveUiLocale, type MessageCatalog } from '@aiao/rxdb-i18n';
import { adminEnMessages } from './en.js';
import { adminZhHansMessages, type AdminMessageKey } from './zh-hans.js';

export { adminEnMessages, adminZhHansMessages, type AdminMessageKey };

/** 外壳文案目录的命名空间。 */
export const ADMIN_I18N_NAMESPACE = 'rxdb-admin';

/** 外壳随包发布的文案目录（中文、英文）。应用自带 `I18n` 运行时时需把它加入 `catalogs`。 */
export const adminMessages: MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: ADMIN_I18N_NAMESPACE, messages: adminZhHansMessages },
  { locale: 'en', namespace: ADMIN_I18N_NAMESPACE, messages: adminEnMessages }
];

/**
 * 创建只带外壳目录的静态运行时，缺省跟随宿主语言；应用没有自己的 `I18n` 时使用。
 * @param locale - 初始语言，缺省跟随宿主语言。
 * @param deviceLocale - 宿主语言；省略时读取 `navigator.language`。
 * @returns 运行时。
 */
export function createAdminI18n(locale?: string, deviceLocale?: string): I18n {
  return new I18n({
    defaultLocale: 'zh-Hans',
    deviceLocale: resolveUiLocale(deviceLocale ?? globalThis.navigator?.language),
    ...(locale ? { locale: resolveUiLocale(locale) } : {}),
    catalogs: adminMessages
  });
}

/**
 * 翻译外壳文案。
 * @param i18n - 运行时。
 * @param key - 文案键。
 * @param params - ICU 参数。
 * @returns 译文；键缺失时返回键本身。
 */
export function translateAdmin(i18n: I18n, key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params, ADMIN_I18N_NAMESPACE);
}
