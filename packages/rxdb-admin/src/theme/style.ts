import type { AdminPreferences } from '../preferences/types.js';

type Rgb = readonly [number, number, number];

const hexToRgb = (hex: string): Rgb | null => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const relativeLuminance = ([r, g, b]: Rgb): number => {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/**
 * 按 WCAG 相对亮度为背景色挑选对比度更高的前景色。
 * @param hex - `#rrggbb` 背景色。
 * @param fallback - 无法解析时的前景色。
 * @returns `#ffffff` 或 `#000000`。
 */
export function readableContentFor(hex: string, fallback: '#ffffff' | '#000000' = '#ffffff'): '#ffffff' | '#000000' {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  const luminance = relativeLuminance(rgb);
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

/**
 * 计算要写入根节点 `style` 的覆盖项（自定义属性或普通 CSS 属性名）。
 * @param prefs - 偏好。
 * @returns 属性名到值；偏好为「跟随主题」的项不出现。
 */
export function computeThemeStyle(prefs: AdminPreferences): Record<string, string> {
  const { colorPrimary, radius, fontSize } = prefs.theme;
  const style: Record<string, string> = {};
  if (colorPrimary) {
    style['--color-primary'] = colorPrimary;
    style['--color-primary-content'] = readableContentFor(colorPrimary);
  }
  if (radius !== null) {
    const value = `${radius}rem`;
    style['--radius-selector'] = value;
    style['--radius-field'] = value;
    style['--radius-box'] = value;
  }
  if (fontSize !== null) style['font-size'] = `${fontSize}px`;
  return style;
}

/**
 * 计算要写入根节点的属性：主题、灰/弱色模式、过渡名、紧凑密度。
 * @param prefs - 偏好。
 * @param resolvedTheme - 已解析的具体主题名。
 * @returns 属性名到值；不适用的属性不出现，应用方需移除。
 */
export function computeRootAttributes(prefs: AdminPreferences, resolvedTheme: string): Record<string, string> {
  const attributes: Record<string, string> = {
    'data-theme': resolvedTheme,
    'data-transition': prefs.transition.enable ? prefs.transition.name : 'none'
  };
  if (prefs.app.colorWeakMode) attributes['data-color-mode'] = 'weak';
  else if (prefs.app.colorGrayMode) attributes['data-color-mode'] = 'gray';
  if (prefs.app.compact) attributes['data-compact'] = 'true';
  return attributes;
}
