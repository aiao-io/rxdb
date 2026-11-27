import type { I18n } from '@aiao/rxdb-i18n';

/** 带 nameKey 的应用显示名来源（清单最小形状）。 */
export interface NamedApp {
  readonly name: string;
  readonly nameKey?: string;
}

/**
 * 按清单 `nameKey` 取本地化应用显示名（ADESK-US-132 AC12：经 appId 传播到
 * 启动台/聚焦/Dock/菜单栏/窗口标题）；无 `nameKey` 的品牌名（不译）回退清单 `name`。
 * 调用方传组件内的响应式 `i18n` 绑定（`useI18n()` 的 I18nBinding，语言切换后界面跟随刷新）。
 */
export const appDisplayName = (i18n: Pick<I18n, 't'>, app: NamedApp): string =>
  app.nameKey ? i18n.t(app.nameKey) : app.name;
