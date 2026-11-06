import { describe, expect, it, vi } from 'vitest';
import { defaultPreferences } from '../../preferences/defaults.js';
import { applyPatch } from '../../preferences/merge.js';
import type { AdminPreferences } from '../../preferences/types.js';
import { computeRootAttributes, computeThemeStyle, readableContentFor } from '../../theme/style.js';
import { createSystemDarkStore, type MediaQueryLike } from '../../theme/system-theme.js';
import { DAISYUI_THEMES, nextThemeName, pickThemes, resolveThemeName } from '../../theme/themes.js';

const prefs = (patch: object): AdminPreferences => applyPatch(defaultPreferences, patch);

describe('主题目录', () => {
  it('pickThemes 按给定顺序挑选，并带明暗标记', () => {
    expect(pickThemes(['dark', 'light', 'dracula'])).toEqual([
      { name: 'dark', dark: true },
      { name: 'light', dark: false },
      { name: 'dracula', dark: true }
    ]);
  });

  it('pickThemes 遇到目录之外的主题立即报错', () => {
    expect(() => pickThemes(['light', 'nope'])).toThrow(/Unknown theme "nope"/);
  });

  it('目录里的主题名唯一', () => {
    const names = DAISYUI_THEMES.map(theme => theme.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolveThemeName：system 跟随系统明暗，其余原样', () => {
    const themes = pickThemes(['light', 'dark', 'cupcake']);
    expect(resolveThemeName('system', true, themes)).toBe('dark');
    expect(resolveThemeName('system', false, themes)).toBe('light');
    expect(resolveThemeName('cupcake', true, themes)).toBe('cupcake');
  });

  it('resolveThemeName：目录里没有 light / dark 时取同明暗的第一个', () => {
    const themes = pickThemes(['corporate', 'night']);
    expect(resolveThemeName('system', false, themes)).toBe('corporate');
    expect(resolveThemeName('system', true, themes)).toBe('night');
  });

  it('nextThemeName：system → 浅色 → 深色 → system，其他主题回到浅色', () => {
    const themes = pickThemes(['light', 'dark', 'cupcake']);
    expect(nextThemeName('system', themes)).toBe('light');
    expect(nextThemeName('light', themes)).toBe('dark');
    expect(nextThemeName('dark', themes)).toBe('system');
    expect(nextThemeName('cupcake', themes)).toBe('light');
  });

  it('nextThemeName：只有一种明暗时在该主题与 system 间切换', () => {
    const themes = pickThemes(['light', 'cupcake']);
    expect(nextThemeName('system', themes)).toBe('light');
    expect(nextThemeName('light', themes)).toBe('system');
  });
});

describe('readableContentFor', () => {
  it('取与背景对比度更高的前景色（#167bff 上黑字 5.3:1 高于白字 3.96:1）', () => {
    expect(readableContentFor('#167bff')).toBe('#000000');
    expect(readableContentFor('#000000')).toBe('#ffffff');
    expect(readableContentFor('#ffffff')).toBe('#000000');
    expect(readableContentFor('#f59e0b')).toBe('#000000');
    expect(readableContentFor('#7c3aed')).toBe('#ffffff');
  });

  it('不接受简写与非法输入时返回给定回退色', () => {
    expect(readableContentFor('red')).toBe('#ffffff');
    expect(readableContentFor('red', '#000000')).toBe('#000000');
    expect(readableContentFor('#12')).toBe('#ffffff');
  });

  it('带或不带 # 前缀都能解析', () => {
    expect(readableContentFor('ffffff')).toBe('#000000');
  });
});

describe('computeThemeStyle', () => {
  it('默认偏好不覆盖任何样式', () => {
    expect(computeThemeStyle(defaultPreferences)).toEqual({});
  });

  it('主色同时写入对比色', () => {
    expect(computeThemeStyle(prefs({ theme: { colorPrimary: '#167bff' } }))).toEqual({
      '--color-primary': '#167bff',
      '--color-primary-content': '#000000'
    });
  });

  it('圆角写入 daisyUI 的三个圆角变量', () => {
    expect(computeThemeStyle(prefs({ theme: { radius: '0.5' } }))).toEqual({
      '--radius-selector': '0.5rem',
      '--radius-field': '0.5rem',
      '--radius-box': '0.5rem'
    });
  });

  it('字号写在根节点 font-size 上，整套 rem 单位随之缩放', () => {
    expect(computeThemeStyle(prefs({ theme: { fontSize: 18 } }))).toEqual({ 'font-size': '18px' });
  });
});

describe('computeRootAttributes', () => {
  it('默认：只有 data-theme 与过渡名', () => {
    expect(computeRootAttributes(defaultPreferences, 'light')).toEqual({
      'data-theme': 'light',
      'data-transition': 'fade-slide'
    });
  });

  it('灰色模式与色弱模式互斥，色弱优先', () => {
    expect(computeRootAttributes(prefs({ app: { colorGrayMode: true } }), 'light')['data-color-mode']).toBe('gray');
    expect(
      computeRootAttributes(prefs({ app: { colorGrayMode: true, colorWeakMode: true } }), 'light')['data-color-mode']
    ).toBe('weak');
  });

  it('紧凑密度写 data-compact；关闭过渡写 none', () => {
    const attrs = computeRootAttributes(prefs({ app: { compact: true }, transition: { enable: false } }), 'dark');
    expect(attrs).toEqual({ 'data-theme': 'dark', 'data-transition': 'none', 'data-compact': 'true' });
  });
});

class FakeMediaQuery implements MediaQueryLike {
  matches: boolean;
  readonly listeners = new Set<(event: { matches: boolean }) => void>();
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener);
  }
  emit(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

describe('createSystemDarkStore', () => {
  it('读取初始值并跟随系统变化', () => {
    const mql = new FakeMediaQuery(false);
    const { store, stop } = createSystemDarkStore(() => mql);
    expect(store.value).toBe(false);
    const listener = vi.fn();
    store.subscribe(listener);
    mql.emit(true);
    expect(store.value).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);
    stop();
    expect(mql.listeners.size).toBe(0);
  });

  it('没有 matchMedia（SSR / 测试）时恒为浅色', () => {
    const { store, stop } = createSystemDarkStore(undefined);
    expect(store.value).toBe(false);
    expect(() => stop()).not.toThrow();
  });
});
