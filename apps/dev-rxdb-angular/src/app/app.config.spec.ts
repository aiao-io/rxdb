import { LOCALE_ID } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { appConfig, resolveLocale } from './app.config';

describe('appConfig LOCALE_ID resolution', () => {
  const originalOrbit = window.$orbit;

  afterEach(() => {
    if (originalOrbit) window.$orbit = originalOrbit;
    else delete window.$orbit;
  });

  it('LOCALE_ID 提供商使用宿主优先的解析函数', () => {
    const provider = appConfig.providers.find(p => 'provide' in p && p.provide === LOCALE_ID) as
      { useFactory?: unknown } | undefined;
    expect(provider?.useFactory).toBe(resolveLocale);
  });

  it('嵌入文档站时跟随宿主语言', () => {
    window.$orbit = { props: { locale: 'en' } };
    expect(resolveLocale()).toBe('en');

    window.$orbit = { props: { locale: 'zh-Hans' } };
    expect(resolveLocale()).toBe('zh-Hans');
  });

  it('独立运行时保持原有设备解析：含 zh 的语言用 zh，其余回退 en-US', () => {
    delete window.$orbit;
    const device = Intl.DateTimeFormat().resolvedOptions().locale;
    expect(resolveLocale()).toBe(device.includes('zh') ? 'zh' : 'en-US');
  });
});
