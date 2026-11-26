import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';

import { DESKTOP_CATALOGS, DESKTOP_DEFAULT_LOCALE, DESKTOP_I18N_NAMESPACE } from './desktop-i18n';
import { DESKTOP_MESSAGES_EN } from './messages-en';
import { DESKTOP_MESSAGES_ZH } from './messages-zh';

/** 静态模式：不接库，直接验证目录与回退链（ADESK-US-132 AC1）。 */
const staticI18n = (deviceLocale: string): I18n =>
  new I18n({
    defaultLocale: DESKTOP_DEFAULT_LOCALE,
    deviceLocale,
    namespace: DESKTOP_I18N_NAMESPACE,
    catalogs: DESKTOP_CATALOGS
  });

describe('desktop 目录回退链', () => {
  it.each(['zh-CN', 'zh-Hans', 'zh-TW', 'zh-HK'])('%s 设备命中中文目录', locale => {
    expect(staticI18n(locale).t('settings.section.general')).toBe('通用');
  });

  it('en-US 设备命中英文目录', () => {
    expect(staticI18n('en-US').t('settings.section.general')).toBe('General');
  });

  it('de-DE 设备回退英文基线', () => {
    expect(staticI18n('de-DE').t('settings.section.general')).toBe('General');
  });

  it('未登记 key 返回 key 本身，不抛错', () => {
    expect(staticI18n('en-US').t('settings.notRegistered')).toBe('settings.notRegistered');
  });

  it('英文目录与改动前硬编码文案逐字一致（含 U+2011 连字符）', () => {
    expect(staticI18n('en-US').t('settings.section.wifi')).toBe('Wi‑Fi');
    expect(staticI18n('en-US').t('settings.section.dock')).toBe('Desktop & Dock');
  });

  it('中文目录术语为 Apple 官方简体中文译名', () => {
    const zh = staticI18n('zh-CN');
    expect(zh.t('settings.section.general')).toBe('通用');
    expect(zh.t('settings.section.languageRegion')).toBe('语言与地区');
    expect(zh.t('settings.section.privacy')).toBe('隐私与安全性');
    expect(zh.t('general.about')).toBe('关于本机');
  });

  it('ICU 插值可用', () => {
    const runtime = new I18n({
      catalogs: [{ locale: 'en', namespace: 'app', messages: { hi: 'Hello {name}!' } }]
    });
    expect(runtime.t('hi', { name: 'Aiao' })).toBe('Hello Aiao!');
  });

  it('双注册后 availableLocales 含 zh / zh-Hans / en', () => {
    expect([...staticI18n('en-US').availableLocales].sort()).toEqual(['en', 'zh', 'zh-Hans']);
  });

  it('中英文目录的 key 集合完全一致（新增 key 必须成对）', () => {
    const en = Object.keys(DESKTOP_MESSAGES_EN).sort();
    const zh = Object.keys(DESKTOP_MESSAGES_ZH).sort();
    expect(zh).toEqual(en);
  });
});
