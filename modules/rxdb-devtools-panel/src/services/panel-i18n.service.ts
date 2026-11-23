import { Injectable } from '@angular/core';
import { I18n, resolveUiLocale } from '@aiao/rxdb-i18n';
import { panelCatalogs, type PanelMessageKey } from '../i18n/messages';

/**
 * 面板自身的文案运行时。
 *
 * @remarks
 * 面板没有语言切换器，只随浏览器语言一次性解析（与 OPFS 日期格式化共用
 * `resolveUiLocale` 的归一口径）。复用 {@link I18n} 的静态模式拿到 ICU 插值、
 * 复数与回退链，不另起一套格式化实现。
 */
@Injectable({ providedIn: 'root' })
export class PanelI18nService {
  private readonly runtime = new I18n({
    defaultLocale: 'zh-Hans',
    deviceLocale: resolveUiLocale(globalThis.navigator?.language),
    namespace: 'panel',
    catalogs: panelCatalogs
  });

  /** 当前面板语言；随浏览器语言归一为 `en` 或 `zh-Hans`。 */
  readonly locale = this.runtime.locale;

  /** 按当前语言解析文案；ICU 插值通过 `params` 传入。 */
  readonly t = (key: PanelMessageKey, params?: Record<string, unknown>): string => this.runtime.t(key, params);
}
