import type { RxDB } from '@aiao/rxdb';
import { I18n, type MessageCatalog } from '@aiao/rxdb-i18n';

import { DESKTOP_MESSAGES_EN } from './messages-en';

/** 桌面目录的命名空间。 */
export const DESKTOP_I18N_NAMESPACE = 'desktop';
/** 回退基线语言：中文系统自动中文，其余语言系统回退英文（macOS「开发语言」语义）。 */
export const DESKTOP_DEFAULT_LOCALE = 'en';

/**
 * 随应用发布的英文目录（静态入包：回退基线任何设备首屏都需要）。
 * zh 目录为懒加载的独立 chunk（`warmDesktopZhCatalog`），不占 initial 预算。
 */
export const DESKTOP_CATALOGS_EN: readonly MessageCatalog[] = [
  { locale: 'en', namespace: DESKTOP_I18N_NAMESPACE, messages: DESKTOP_MESSAGES_EN }
];

/**
 * zh 目录 chunk 的取回 promise：中文消息双注册为 zh 与 zh-Hans（同一份 messages 对象）——
 * BCP 47 父链 zh-CN→zh 推不出 zh-Hans，只注册 zh-Hans 会让中文系统首启显示英文（zh-CN/zh-TW/zh-HK
 * 经父链命中 zh）；直接上报 zh-Hans 的设备命中第二份。Language & Region 面板把两者归并展示。
 */
const zhCatalogs: Promise<readonly MessageCatalog[]> = import('./messages-zh').then(({ DESKTOP_MESSAGES_ZH }) => [
  { locale: 'zh', namespace: DESKTOP_I18N_NAMESPACE, messages: DESKTOP_MESSAGES_ZH },
  { locale: 'zh-Hans', namespace: DESKTOP_I18N_NAMESPACE, messages: DESKTOP_MESSAGES_ZH }
]);

/** 预热 zh 目录 chunk：`main.ts` 在 bootstrap 前 await，运行时创建时注册即刻生效（zh 设备首屏中文）。 */
export const warmDesktopZhCatalog = (): Promise<void> => zhCatalogs.then(() => undefined);

/**
 * 桌面的 i18n 运行时：持久模式，语言偏好存库内 I18nSettings 实体（SyncType.None，不进撤销/分支历史）。
 * 英文目录随包静态注册；zh 目录 chunk 就绪后异步注册（`changes$` 触发响应式绑定重算，界面跟随刷新）。
 * 首屏渲染前必须 await init()；init 由桌面页排在 DesktopData.ready 之后执行（见 desktop-page.ts）。
 */
export function createDesktopI18n(rxdb: RxDB): I18n {
  const i18n = new I18n({
    rxdb,
    defaultLocale: DESKTOP_DEFAULT_LOCALE,
    namespace: DESKTOP_I18N_NAMESPACE,
    catalogs: DESKTOP_CATALOGS_EN
  });
  void zhCatalogs.then(catalogs => {
    for (const catalog of catalogs) i18n.registerCatalog(catalog);
  });
  return i18n;
}

let desktopI18n: I18n | undefined;

/** 页面级单例：provideI18n 的工厂与退出清理共用同一个运行时。 */
export function getDesktopI18n(rxdb: RxDB): I18n {
  desktopI18n ??= createDesktopI18n(rxdb);
  return desktopI18n;
}

/** 应用退出时销毁运行时；不销毁宿主数据库。 */
export function destroyDesktopI18n(): void {
  desktopI18n?.destroy();
  desktopI18n = undefined;
}
