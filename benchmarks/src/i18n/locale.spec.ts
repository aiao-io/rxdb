import { describe, expect, it } from 'vitest';
import { resolveInitialLocaleOptions } from './locale';
import { createBenchmarksI18n } from './runtime';

describe('resolveInitialLocaleOptions', () => {
  it('宿主语言只接受受支持集合，其余输入归一到 zh-Hans', () => {
    expect(resolveInitialLocaleOptions({ hostLocale: 'en' }).hostLocale).toBe('en');
    expect(resolveInitialLocaleOptions({ hostLocale: 'zh-Hans' }).hostLocale).toBe('zh-Hans');
    expect(resolveInitialLocaleOptions({ hostLocale: 'zh-CN' }).hostLocale).toBeUndefined();
    expect(resolveInitialLocaleOptions({ hostLocale: 42 }).hostLocale).toBeUndefined();
    expect(resolveInitialLocaleOptions({ hostLocale: '' }).hostLocale).toBeUndefined();
  });

  it('持久化偏好归一化到受支持集合，空值交给设备语言', () => {
    expect(resolveInitialLocaleOptions({ storedLocale: 'en-US' }).locale).toBe('en');
    expect(resolveInitialLocaleOptions({ storedLocale: 'zh-TW' }).locale).toBe('zh-Hans');
    expect(resolveInitialLocaleOptions({ storedLocale: null }).locale).toBeUndefined();
    expect(resolveInitialLocaleOptions({ storedLocale: '   ' }).locale).toBeUndefined();
  });

  it('设备语言归一化，缺省 zh-Hans', () => {
    expect(resolveInitialLocaleOptions({ deviceLocale: 'en-GB' }).deviceLocale).toBe('en');
    expect(resolveInitialLocaleOptions({ deviceLocale: 'zh-CN' }).deviceLocale).toBe('zh-Hans');
    expect(resolveInitialLocaleOptions({}).deviceLocale).toBe('zh-Hans');
  });
});

describe('启动语言优先级', () => {
  it('宿主语言优先于持久化偏好与设备语言', () => {
    expect(createBenchmarksI18n({ hostLocale: 'en', storedLocale: 'zh-Hans', deviceLocale: 'zh-Hans' }).locale).toBe(
      'en'
    );
    expect(createBenchmarksI18n({ hostLocale: 'zh-Hans', storedLocale: 'en', deviceLocale: 'en' }).locale).toBe(
      'zh-Hans'
    );
  });

  it('无宿主语言时用持久化偏好', () => {
    expect(createBenchmarksI18n({ storedLocale: 'en', deviceLocale: 'zh-Hans' }).locale).toBe('en');
    expect(createBenchmarksI18n({ storedLocale: 'zh-Hans', deviceLocale: 'en' }).locale).toBe('zh-Hans');
  });

  it('无宿主语言与持久化偏好时用设备语言', () => {
    expect(createBenchmarksI18n({ deviceLocale: 'en-US' }).locale).toBe('en');
    expect(createBenchmarksI18n({ deviceLocale: 'zh-CN' }).locale).toBe('zh-Hans');
  });

  it('全部缺失或非法时回退 zh-Hans', () => {
    expect(createBenchmarksI18n({}).locale).toBe('zh-Hans');
    expect(createBenchmarksI18n({ deviceLocale: 'fr-FR' }).locale).toBe('zh-Hans');
    expect(createBenchmarksI18n({ hostLocale: 42, storedLocale: '!!!', deviceLocale: 'fr' }).locale).toBe('zh-Hans');
  });

  it('宿主语言只覆盖启动值，用户显式切换后让位', async () => {
    const i18n = createBenchmarksI18n({ hostLocale: 'en', storedLocale: 'zh-Hans' });

    await i18n.setLocale('zh-Hans');

    expect(i18n.locale).toBe('zh-Hans');
  });
});
