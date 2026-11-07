import { adminMessages } from '@aiao/rxdb-admin';
import { I18n, type MessageCatalog } from '@aiao/rxdb-i18n';
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model';
import { appConfig, type AppConfig } from '../app-config';
import { domainEnMessages, domainModelEnMessages, domainModelZhMessages, domainZhMessages } from './domain-messages';
import { pageEnMessages, pageZhMessages } from './page-messages';

const applicationMessages = [
  {
    locale: 'zh-Hans',
    messages: {
      ...pageZhMessages,
      ...domainZhMessages,
      'app.loading': '加载中',
      'app.loadFailed': '加载失败',
      'app.searchLoadFailed': '搜索页初始化失败，请刷新重试'
    }
  },
  {
    locale: 'en',
    messages: {
      ...pageEnMessages,
      ...domainEnMessages,
      'app.loading': 'Loading',
      'app.loadFailed': 'Loading failed',
      'app.searchLoadFailed': 'Search could not be initialized. Please refresh and try again.'
    }
  }
];

const extensionMessages: MessageCatalog[] = [
  {
    locale: 'zh-Hans',
    namespace: 'rxdb-admin',
    messages: {
      'workbench.search.label': '全文搜索每页条数',
      'workbench.search.hint': '搜索页每次加载的结果数，修改后立即生效',
      'workbench.search.section': '全文搜索'
    }
  },
  {
    locale: 'en',
    namespace: 'rxdb-admin',
    messages: {
      'workbench.search.label': 'Results per page',
      'workbench.search.hint': 'Number of results loaded at a time. Changes apply immediately.',
      'workbench.search.section': 'Full-text search'
    }
  }
];

/** 创建共享的静态运行时；语言由外壳偏好持久化，保持业务库可在连接前恢复。 */
export function createWorkbenchI18n(config: AppConfig = appConfig): I18n {
  const catalogs: MessageCatalog[] = applicationMessages.map(({ locale, messages }) => {
    const identity = config.locales?.[locale] ?? config;
    return {
      locale,
      namespace: 'workbench',
      messages: {
        ...messages,
        'app.title': identity.title,
        'app.description': identity.description,
        'app.brandTitle': identity.brandTitle
      }
    };
  });
  return new I18n({
    namespace: 'workbench',
    defaultLocale: 'zh-Hans',
    deviceLocale: 'zh-Hans',
    locale: 'zh-Hans',
    catalogs: [
      ...adminMessages,
      ...extensionMessages,
      ...modelMessages,
      { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages },
      { locale: 'zh-Hans', namespace: 'rxdb-model', messages: domainModelZhMessages },
      { locale: 'en', namespace: 'rxdb-model', messages: domainModelEnMessages },
      ...catalogs
    ]
  });
}

/** 让 HTML 说明随共享运行时更新；标题和 lang 由外壳统一管理。 */
export function bindWorkbenchDescription(runtime: I18n, document: Document): () => void {
  const description = document.querySelector('meta[name="description"]');
  const originalContent = description?.getAttribute('content');
  const subscription = runtime.changes$.subscribe(() => {
    description?.setAttribute('content', runtime.t('app.description'));
  });
  return () => {
    subscription.unsubscribe();
    if (originalContent == null) description?.removeAttribute('content');
    else description?.setAttribute('content', originalContent);
  };
}
