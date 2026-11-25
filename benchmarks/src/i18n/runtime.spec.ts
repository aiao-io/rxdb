/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BENCHMARKS_LOCALE_KEY } from './locale';
import { createBenchmarksI18n, persistLocale, readStoredLocale } from './runtime';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe('benchmarks i18n runtime', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    delete window.$orbit;
    localStorage.clear();
  });

  it('宿主语言在整个会话内优先于持久化偏好（仅显式 setLocale 让位）', () => {
    window.$orbit = { props: { locale: 'en' } };
    localStorage.setItem(BENCHMARKS_LOCALE_KEY, 'zh-Hans');

    const i18n = createBenchmarksI18n({ hostLocale: window.$orbit.props?.locale, deviceLocale: 'zh-Hans' });

    expect(i18n.locale).toBe('en');
    expect(i18n.t('app.export')).toBe('Export');
  });

  it('独立运行时从持久化偏好解析初始语言', () => {
    localStorage.setItem(BENCHMARKS_LOCALE_KEY, 'en');

    const i18n = createBenchmarksI18n({ storedLocale: readStoredLocale(), deviceLocale: 'zh-Hans' });

    expect(i18n.locale).toBe('en');
  });

  it('切换语言更新运行时并重渲染翻译', async () => {
    const i18n = createBenchmarksI18n({ deviceLocale: 'zh-Hans' });

    await i18n.setLocale('en');

    expect(i18n.locale).toBe('en');
    expect(i18n.t('app.start')).toBe('Run benchmarks');
  });

  it('独立运行时切换语言写回 localStorage', async () => {
    const i18n = createBenchmarksI18n({ deviceLocale: 'zh-Hans' });

    await i18n.setLocale('en');
    persistLocale('en');

    expect(readStoredLocale()).toBe('en');
    expect(localStorage.getItem(BENCHMARKS_LOCALE_KEY)).toBe('en');
  });

  it('嵌入宿主时用户选择不写本地偏好，宿主语言保持主导', () => {
    window.$orbit = { props: { locale: 'en' } };

    persistLocale('en');

    expect(readStoredLocale()).toBeNull();
  });
});
