import { describe, expect, it } from 'vitest';
import { createBootstrapScript } from '../bootstrap.js';
import { defaultPreferences } from '../preferences/defaults.js';
import { applyPatch } from '../preferences/merge.js';
import { PREFERENCES_VERSION } from '../preferences/types.js';
import { createFakeDocument } from '../testing.js';
import { computeRootAttributes, computeThemeStyle } from '../theme/style.js';
import { pickThemes, resolveThemeName } from '../theme/themes.js';

const KEY = 'my.app.preferences';

const run = (values: unknown, systemDark = false, raw?: string) => {
  const { document, attributes, styles } = createFakeDocument();
  const store = new Map<string, string>();
  if (raw !== undefined) store.set(KEY, raw);
  else if (values !== undefined) store.set(KEY, JSON.stringify({ version: PREFERENCES_VERSION, values }));
  const localStorage = { getItem: (key: string) => store.get(key) ?? null };
  const matchMedia = () => ({ matches: systemDark });
  new Function('document', 'localStorage', 'matchMedia', createBootstrapScript({ storageKey: KEY }))(
    document,
    localStorage,
    matchMedia
  );
  return { attributes, styles };
};

describe('createBootstrapScript', () => {
  it('没有保存的偏好时只写 data-theme（跟随系统）', () => {
    expect(run(undefined).attributes.get('data-theme')).toBe('light');
    expect(run(undefined, true).attributes.get('data-theme')).toBe('dark');
  });

  it('保存了具体主题则直接使用', () => {
    expect(run({ theme: { name: 'cupcake' } }).attributes.get('data-theme')).toBe('cupcake');
  });

  it('可自定义 system 对应的浅色 / 深色主题名', () => {
    const { document, attributes } = createFakeDocument();
    new Function(
      'document',
      'localStorage',
      'matchMedia',
      createBootstrapScript({ storageKey: KEY, darkTheme: 'night' })
    )(document, { getItem: () => null }, () => ({ matches: true }));
    expect(attributes.get('data-theme')).toBe('night');
  });

  it('损坏或版本不符的存储不抛错，按默认处理', () => {
    expect(run(undefined, false, '{oops').attributes.get('data-theme')).toBe('light');
    expect(
      run(undefined, false, JSON.stringify({ version: 99, values: { theme: { name: 'dark' } } })).attributes.get(
        'data-theme'
      )
    ).toBe('light');
  });

  it('localStorage 不可用时静默跳过', () => {
    const { document, attributes } = createFakeDocument();
    expect(() =>
      new Function('document', 'localStorage', 'matchMedia', createBootstrapScript({ storageKey: KEY }))(
        document,
        {
          getItem: () => {
            throw new Error('denied');
          }
        },
        () => ({ matches: false })
      )
    ).not.toThrow();
    expect(attributes.size).toBe(0);
  });

  describe('与外壳 attach() 写入的结果对拍', () => {
    const themes = pickThemes(['light', 'dark']);
    const cases: Array<{ name: string; patch: object; systemDark: boolean }> = [
      {
        name: '主色 + 圆角 + 字号',
        patch: { theme: { colorPrimary: '#167bff', radius: '0.5', fontSize: 18 } },
        systemDark: false
      },
      { name: '浅色背景主色取黑字', patch: { theme: { colorPrimary: '#f59e0b' } }, systemDark: false },
      { name: '深色系统 + 跟随系统', patch: {}, systemDark: true },
      { name: '灰色模式', patch: { app: { colorGrayMode: true } }, systemDark: false },
      { name: '色弱模式优先于灰色', patch: { app: { colorGrayMode: true, colorWeakMode: true } }, systemDark: false },
      { name: '圆角 0', patch: { theme: { radius: '0' } }, systemDark: false }
    ];

    it.each(cases)('$name', ({ patch, systemDark }) => {
      const prefs = applyPatch(defaultPreferences, patch);
      const diff = JSON.parse(JSON.stringify(patch)) as object;
      const { attributes, styles } = run(diff, systemDark);
      const expectedAttributes = computeRootAttributes(prefs, resolveThemeName(prefs.theme.name, systemDark, themes));
      const expectedStyle = computeThemeStyle(prefs);
      expect(attributes.get('data-theme')).toBe(expectedAttributes['data-theme']);
      expect(attributes.get('data-color-mode')).toBe(expectedAttributes['data-color-mode']);
      expect(Object.fromEntries(styles)).toEqual(expectedStyle);
    });
  });
});
