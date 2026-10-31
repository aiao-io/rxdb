import { RxDB, SyncType, getEntityMetadata } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { filter, firstValueFrom, take } from 'rxjs';
import {
  I18n,
  I18nSettings,
  MessageEntry,
  buildLocaleChain,
  canonicalizeLocale,
  i18nEntities,
  messageId,
  resolveMessage,
  type MessageCatalog
} from './index.js';

const catalogs: MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: { hello: '你好 {name}', blank: '默认', fallback: '中文' } },
  {
    locale: 'en',
    namespace: 'app',
    messages: {
      hello: 'Hello {name}',
      count: '{count, plural, one {# item} other {# items}}',
      choice: '{role, select, admin {Admin} other {Guest}}'
    }
  },
  { locale: 'fr', namespace: 'app', messages: { hello: 'Bonjour {name}' } }
];

describe('locale and catalogs', () => {
  it('canonicalizes and expands every fallback node without duplicates', () => {
    expect(canonicalizeLocale('EN-us')).toBe('en-US');
    expect(() => canonicalizeLocale('not_a_locale')).toThrow();
    expect(() => canonicalizeLocale('')).toThrow();
    expect(
      buildLocaleChain({ locale: 'fr-CA', devicePreferredLocale: 'en-US', deviceLocale: 'fr', defaultLocale: 'en' })
    ).toEqual(['fr-CA', 'fr', 'en-US', 'en']);
  });

  it('keeps tuple identities unambiguous and missing values distinct from empty strings', () => {
    expect(messageId('en', 'a|b', 'c')).not.toBe(messageId('en', 'a', 'b|c'));
    expect(resolveMessage([], ['en'], 'app', 'missing').value).toBeUndefined();
    expect(
      resolveMessage([{ locale: 'en', namespace: 'app', key: 'blank', value: '' }], ['en'], 'app', 'blank').value
    ).toBe('');
  });

  it('formats ICU messages in static mode and falls back through parent languages', async () => {
    const i18n = new I18n({ catalogs, locale: 'fr-CA', defaultLocale: 'zh-Hans', deviceLocale: 'en-US' });
    expect(i18n.t('hello', { name: 'Ada' }, 'app')).toBe('Bonjour Ada');
    expect(i18n.t('fallback', {}, 'app')).toBe('中文');
    await i18n.setLocale('en');
    expect(i18n.t('count', { count: 2 }, 'app')).toBe('2 items');
    expect(i18n.t('count', { count: 1 }, 'app')).toBe('1 item');
    expect(i18n.t('choice', { role: 'admin' }, 'app')).toBe('Admin');
    expect(i18n.t('choice', { role: 'other' }, 'app')).toBe('Guest');
    expect(i18n.t('missing')).toBe('missing');
    expect(i18n.formatNumber(1234)).toBe(new Intl.NumberFormat('en').format(1234));
    const date = new Date('2026-01-02T00:00:00Z');
    expect(i18n.formatDate(date, { timeZone: 'UTC' })).toBe(
      new Intl.DateTimeFormat('en', { timeZone: 'UTC' }).format(date)
    );
    expect(i18n.formatRelativeTime(-1, 'day')).toBe(new Intl.RelativeTimeFormat('en').format(-1, 'day'));
    i18n.destroy();
  });

  it('rejects duplicate canonical tuples and invalid ICU atomically', () => {
    expect(
      () =>
        new I18n({
          catalogs: [
            { locale: 'en-us', namespace: 'app', messages: { a: 'A' } },
            { locale: 'en-US', namespace: 'app', messages: { a: 'B' } }
          ]
        })
    ).toThrow(/duplicate/i);
    expect(() => new I18n({ catalogs: [{ locale: 'en', namespace: 'app', messages: { a: '{broken' } }] })).toThrow();
    const i18n = new I18n();
    expect(() =>
      i18n.registerCatalog({ locale: 'en', namespace: 'app', messages: { valid: 'ok', invalid: '{bad' } })
    ).toThrow();
    expect(i18n.availableLocales).toEqual([]);
  });
});

describe('persisted locale', () => {
  let db: RxDB;
  const services: I18n[] = [];
  beforeEach(async () => {
    db = new RxDB({
      dbName: `i18n-${crypto.randomUUID()}`,
      entities: i18nEntities(),
      context: { userId: 'i18n' },
      sync: { type: SyncType.None, local: { adapter: 'pglite' } }
    });
    db.adapter('pglite', async rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    await db.connect('pglite');
  });
  afterEach(async () => {
    services.splice(0).forEach(i => i.destroy());
    await db.destroy();
  });
  const service = () => {
    const i = new I18n({ rxdb: db, catalogs, deviceLocale: 'zh-Hans' });
    services.push(i);
    return i;
  };

  it('creates one local-only settings row under concurrent initialization and observes writes', async () => {
    const a = service(),
      b = service();
    await Promise.all([a.init(), b.init()]);
    expect(getEntityMetadata(I18nSettings).sync?.type).toBe(SyncType.None);
    const repository = db.entityManager.getRepository(I18nSettings);
    expect(await firstValueFrom(repository.count({ where: { combinator: 'and', rules: [] } }))).toBe(1);
    const changed = firstValueFrom(
      b.locale$.pipe(
        filter(l => l === 'en'),
        take(1)
      )
    );
    await a.setLocale('en');
    await changed;
    expect(b.locale).toBe('en');
    const restarted = service();
    await restarted.init();
    expect(restarted.locale).toBe('en');
  });

  it('persists individual overrides, keeps empty values, and restores them on restart', async () => {
    const a = service();
    await a.init();
    await a.setMessages({ locale: 'en', namespace: 'app', messages: { hello: 'Welcome {name}', blank: '' } });
    await a.setLocale('en');
    expect(a.t('hello', { name: 'Ada' }, 'app')).toBe('Welcome Ada');
    expect(a.t('blank', {}, 'app')).toBe('');
    const b = service();
    await b.init();
    expect(b.t('hello', { name: 'Ada' }, 'app')).toBe('Welcome Ada');
    expect(
      (
        await firstValueFrom(
          db.entityManager
            .getRepository(MessageEntry)
            .findAll({ where: { combinator: 'and', rules: [] } })
            .pipe(
              filter(rows => rows.length === 2),
              take(1)
            )
        )
      ).length
    ).toBe(2);
    await a.removeMessages('en', 'app', ['hello']);
    expect(a.t('hello', { name: 'Ada' }, 'app')).toBe('Hello Ada');
    await expect(a.setMessages({ locale: 'en', namespace: 'app', messages: { bad: '{oops' } })).rejects.toThrow();
  });

  it('fails before queries when the required entities were not registered', async () => {
    const missing = new RxDB({ dbName: 'missing', entities: [], sync: { type: SyncType.None } });
    expect(() => new I18n({ rxdb: missing })).toThrow(/i18nEntities/);
    await missing.destroy();
  });
});
