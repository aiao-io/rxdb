import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { I18n, type MessageCatalog } from '@aiao/rxdb-i18n';
import { modelEnMessages, modelMessages } from '@aiao/rxdb-model';

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

export function createDemoI18n(rxdb: RxDB): I18n {
  const i18n = new I18n({
    rxdb,
    catalogs: [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }, ...demoMessages]
  });
  getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n, mutationPolicy: 'allow' });
  return i18n;
}
