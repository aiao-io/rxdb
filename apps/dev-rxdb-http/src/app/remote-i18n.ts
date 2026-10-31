import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';

export const REMOTE_I18N_NAMESPACE = 'http-demo';
export const REMOTE_I18N_KEYS = ['greeting', 'status'] as const;
export const resolveI18nEnabled = (search: string): boolean => new URLSearchParams(search).get('i18n') === '1';

export const createHttpI18n = (rxdb: RxDB): I18n => {
  const i18n = new I18n({
    rxdb,
    locale: 'en',
    namespace: REMOTE_I18N_NAMESPACE,
    catalogs: [
      {
        locale: 'en',
        namespace: REMOTE_I18N_NAMESPACE,
        messages: { greeting: 'Bundle greeting', status: 'Bundle status' }
      }
    ]
  });
  void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
    getDevToolsConnector().init(rxdb, getEntityMetadata, { i18n, mutationPolicy: 'allow' });
  });
  return i18n;
};
