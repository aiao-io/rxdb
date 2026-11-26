import { afterEach, describe, expect, it } from 'vitest';
import { resolveDemoInitialLocale } from './i18n';

describe('resolveDemoInitialLocale', () => {
  const originalOrbit = window.$orbit;

  afterEach(() => {
    if (originalOrbit) window.$orbit = originalOrbit;
    else delete window.$orbit;
  });

  it('嵌入文档站时宿主语言优先', () => {
    window.$orbit = { props: { locale: 'en' } };

    expect(resolveDemoInitialLocale().hostLocale).toBe('en');
  });

  it('宿主语言不可识别时不强行采用', () => {
    window.$orbit = { props: { locale: 'fr-FR' } };

    expect(resolveDemoInitialLocale().hostLocale).toBeUndefined();
  });

  it('独立运行时不读宿主，保持设备语言兜底', () => {
    delete window.$orbit;

    const resolved = resolveDemoInitialLocale();

    expect(resolved.hostLocale).toBeUndefined();
    expect(['en', 'zh-Hans']).toContain(resolved.deviceLocale);
  });
});
