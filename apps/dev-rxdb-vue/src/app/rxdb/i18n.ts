import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { I18n, resolveUiLocale, type MessageCatalog, type UiLocale } from '@aiao/rxdb-i18n';
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model';
import { commonCatalogs } from '@modules/demo-i18n/common';
import { encryptedCatalogs } from '@modules/demo-i18n/encrypted';
import { entitiesCatalogs } from '@modules/demo-i18n/entities';
import { fileManagerCatalogs } from '@modules/demo-i18n/file-manager';
import { fileCatalogs } from '@modules/demo-i18n/files';
import { generatorCatalogs } from '@modules/demo-i18n/generator';
import { headlessCatalogs } from '@modules/demo-i18n/headless';
import { historyCatalogs } from '@modules/demo-i18n/history';
import { remoteCacheCatalogs } from '@modules/demo-i18n/remote-cache';
import { searchCatalogs } from '@modules/demo-i18n/search';
import { todoCatalogs } from '@modules/demo-i18n/todo';
import { treeMenuCatalogs } from '@modules/demo-i18n/tree-menu';
import { workingTreeCatalogs } from '@modules/demo-i18n/working-tree';
import { workspaceEnMessages, workspaceZhMessages } from '@modules/demo-i18n/workspace';
import { getOrbitHost, parseHostLocale, type HostLocale } from '@modules/orbit';

export const demoMessages: readonly MessageCatalog[] = [
  {
    locale: 'zh-Hans',
    namespace: 'demo',
    messages: { language: '语言', preview: '本地化预览', date: '日期', number: '数字' }
  },
  {
    locale: 'en',
    namespace: 'demo',
    messages: { language: 'Language', preview: 'Locale preview', date: 'Date', number: 'Number' }
  }
];

export const DEMO_FORMAT_DATE = new Date('2026-10-28T12:00:00.000Z');
export const DEMO_FORMAT_NUMBER = 12345.67;
export const DEMO_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC'
};

/**
 * 解析演示应用的启动语言：嵌入文档站时宿主（网站）语言优先，独立运行回退设备语言；
 * 已持久化的用户偏好由 I18n 在首个设置快照就绪后接管。
 */
export function resolveDemoInitialLocale(): {
  readonly deviceLocale: UiLocale;
  readonly hostLocale: HostLocale | undefined;
} {
  return {
    hostLocale: parseHostLocale(getOrbitHost()?.props?.locale),
    deviceLocale: resolveUiLocale(globalThis.navigator?.language)
  };
}

export function createDemoI18n(rxdb: RxDB): I18n {
  const { deviceLocale, hostLocale } = resolveDemoInitialLocale();
  const i18n = new I18n({
    rxdb,
    deviceLocale,
    hostLocale,
    catalogs: [
      ...modelMessages,
      { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages },
      { locale: 'zh-Hans', namespace: 'app', messages: workspaceZhMessages },
      { locale: 'en', namespace: 'app', messages: workspaceEnMessages },
      ...commonCatalogs,
      ...encryptedCatalogs,
      ...entitiesCatalogs,
      ...fileCatalogs,
      ...fileManagerCatalogs,
      ...generatorCatalogs,
      ...headlessCatalogs,
      ...historyCatalogs,
      ...remoteCacheCatalogs,
      ...searchCatalogs,
      ...todoCatalogs,
      ...treeMenuCatalogs,
      ...workingTreeCatalogs,
      ...demoMessages
    ]
  });
  getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n, mutationPolicy: 'allow' });
  return i18n;
}
