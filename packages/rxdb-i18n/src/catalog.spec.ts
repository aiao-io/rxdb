import { catalogMessages, messageId, resolveMessage } from './catalog.js';
import { I18n } from './i18n.js';
import { buildLocaleChain, canonicalizeLocale } from './locale.js';

describe('catalog validation and locale chains', () => {
  it('canonicalizes aliases and strips extensions before reducing parent locales', () => {
    expect(canonicalizeLocale('iw-IL')).toBe('he-IL');
    expect(
      buildLocaleChain({
        locale: 'zh-Hant-TW-u-nu-hanidec',
        devicePreferredLocale: null,
        deviceLocale: 'zh-Hant',
        defaultLocale: 'en-US'
      })
    ).toEqual(['zh-Hant-TW-u-nu-hanidec', 'zh-Hant-TW', 'zh-Hant', 'zh', 'en-US', 'en']);
    expect(() => canonicalizeLocale(' ')).toThrow(RangeError);
    expect(() => canonicalizeLocale('en_US')).toThrow(RangeError);
  });

  it('rejects empty namespaces, keys and non-string values', () => {
    expect(() => catalogMessages({ locale: 'en', namespace: '', messages: { key: 'value' } })).toThrow(TypeError);
    expect(() => catalogMessages({ locale: 'en', namespace: 'app', messages: { '': 'value' } })).toThrow(TypeError);
    const messages = JSON.parse('{"key":42}') as Record<string, string>;
    expect(() => catalogMessages({ locale: 'en', namespace: 'app', messages })).toThrow(TypeError);
  });

  it('isolates namespace identities and treats prototype-looking keys as ordinary data', () => {
    const messages = JSON.parse('{"__proto__":"safe","constructor":"valid"}') as Record<string, string>;
    const rows = catalogMessages({ locale: 'en-us', namespace: 'a', messages });
    expect(resolveMessage(rows, ['en-US'], 'a', '__proto__')).toEqual({ value: 'safe', locale: 'en-US' });
    expect(resolveMessage(rows, ['en-US'], 'b', '__proto__').value).toBeUndefined();
    expect(messageId('EN-us', 'a', 'key')).toBe(messageId('en-US', 'a', 'key'));
  });

  it('uses the selected namespace and keeps independently created runtimes isolated', async () => {
    const catalogs = [
      {
        locale: 'en',
        namespace: 'custom',
        messages: {
          text: 'Hello {name}',
          date: '{date, date, short}',
          bool: '{value}',
          html: '<strong>{name}</strong>'
        }
      }
    ];
    const a = new I18n({ locale: 'en', namespace: 'custom', catalogs });
    const b = new I18n({ deviceLocale: 'zh-Hans' });
    expect(a.t('text', { name: 'Ada' })).toBe('Hello Ada');
    expect(a.t('date', { date: new Date('2026-01-02T00:00:00Z') })).toContain('26');
    expect(a.t('bool', { value: true })).toBe('true');
    expect(a.t('bool', { value: null })).toBe('');
    expect(a.t('html', { name: 'Ada' })).toBe('<strong>Ada</strong>');
    expect(() => a.t('text', { name: { nested: 'value' } })).toThrow(TypeError);
    expect(() => a.t('text')).toThrow();
    expect(a.t('text', { name: 'Ada' }, 'missing')).toBe('text');
    expect(b.locale).toBe('zh-Hans');
    await Promise.all([a.init(), a.init()]);
    await a.setLocale('fr');
    expect(a.t('text', { name: 'Ada' })).toBe('Hello Ada');
    expect(b.locale).toBe('zh-Hans');
    a.destroy();
    b.destroy();
  });

  it('emits available languages for catalog registration and refuses mutations after destruction', async () => {
    const runtime = new I18n({ deviceLocale: 'en' });
    const locales: string[][] = [];
    const subscription = runtime.availableLocales$.subscribe(value => locales.push(value));
    runtime.registerCatalog({ locale: 'fr', namespace: 'app', messages: { hello: 'Bonjour' } });
    expect(locales).toEqual([[], ['fr']]);
    const snapshot = runtime.availableLocales;
    snapshot.push('de');
    expect(runtime.availableLocales).toEqual(['fr']);
    await expect(runtime.setLocale('invalid_locale')).rejects.toThrow();
    await expect(runtime.setMessages({ locale: 'en', namespace: 'app', messages: { text: 'value' } })).rejects.toThrow(
      /RxDB/
    );
    await expect(
      runtime.setRemoteMessages({ locale: 'en', namespace: 'app', messages: { text: 'value' } })
    ).rejects.toThrow(/RxDB/);
    await expect(runtime.removeMessages('en', 'app', ['hello'])).rejects.toThrow(/RxDB/);
    await expect(runtime.removeRemoteMessages('en', 'app', ['hello'])).rejects.toThrow(/RxDB/);
    await expect(runtime.clearMissingMessages()).rejects.toThrow(/RxDB/);
    await runtime.flushDiagnostics();
    runtime.destroy();
    runtime.destroy();
    expect(() => runtime.init()).toThrow(/destroyed/);
    expect(() => runtime.registerCatalog({ locale: 'en', namespace: 'app', messages: {} })).toThrow(/destroyed/);
    await expect(runtime.setLocale('en')).rejects.toThrow(/destroyed/);
    expect(subscription.closed).toBe(true);
  });
});
