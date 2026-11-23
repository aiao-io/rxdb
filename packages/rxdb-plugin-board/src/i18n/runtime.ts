import { I18n, resolveUiLocale } from '@aiao/rxdb-i18n';

import { boardCatalogs } from './messages.js';

/**
 * 创建只带看板目录的静态运行时，缺省跟随宿主语言；应用没有自己的 `I18n` 时使用。
 * @param deviceLocale - 宿主语言；省略时读取 `navigator.language`。
 * @returns 运行时。
 */
export function createBoardI18n(deviceLocale?: string): I18n {
  return new I18n({
    defaultLocale: 'zh-Hans',
    deviceLocale: resolveUiLocale(deviceLocale ?? globalThis.navigator?.language),
    catalogs: boardCatalogs
  });
}
