import * as VTable from '@visactor/vtable';
import type { SwitchStyle } from '@visactor/vtable/es/ts-types/column/style.js';

/** 系统字体栈 */
const SYSTEM_FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

/** daisyUI 主题 CSS 变量集合 */
export interface CSSVariables {
  /** 根背景色 */
  rootBg: string;
  /** base-100 面板背景色 */
  base100: string;
  /** base-200 次级背景色 */
  base200: string;
  /** base-300 边框/分隔线颜色 */
  base300: string;
  /** 基础内容文字色 */
  baseContent: string;
  /** 主色调 */
  primary: string;
  /** 主色调上的文字颜色 */
  primaryContent: string;
  /** 圆角尺寸 */
  radiusBox: string;
}

/**
 * 返回默认颜色集合
 *
 * @returns 内置默认主题色，作为无 CSS 变量环境下的兜底
 */
export function getDefaultColors(): CSSVariables {
  return {
    rootBg: '#fafbfc',
    base100: '#ffffff',
    base200: '#eef0f2',
    base300: '#dcdee0',
    baseContent: '#1e2328',
    primary: '#167bff',
    primaryContent: '#ffffff',
    radiusBox: '20px'
  };
}

/**
 * 获取文档根元素的计算样式
 *
 * @returns 文档根元素计算样式；非浏览器环境（无 document）时返回 undefined
 */
export function getDocumentRootStyle(): Pick<CSSStyleDeclaration, 'getPropertyValue'> | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  return getComputedStyle(document.documentElement);
}

/**
 * 读取单个 CSS 变量值，为空时回退到默认值
 *
 * @param name CSS 变量名
 * @param fallback 变量缺失或为空时的回退值
 * @param style 样式来源，默认取文档根元素计算样式
 * @returns 变量值（已去除首尾空白）；无效或为空时返回 fallback
 */
export function getCSSVariableValue(
  name: string,
  fallback: string,
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'> | undefined = getDocumentRootStyle()
): string {
  return style?.getPropertyValue(name).trim() || fallback;
}

/**
 * 判断当前文档是否处于暗色模式
 *
 * @returns data-theme=dark 或系统 prefers-color-scheme: dark 时为 true；非浏览器环境返回 false
 */
export function isDocumentDarkMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;

  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * 从 CSS 自定义属性读取 daisyUI 主题色
 *
 * @returns 主题色集合；无 document 时返回默认色
 */
export function getCSSVariables(): CSSVariables {
  const defaults = getDefaultColors();
  const style = getDocumentRootStyle();

  if (!style) {
    return defaults;
  }

  return {
    rootBg: getCSSVariableValue('--root-bg', defaults.rootBg, style),
    base100: getCSSVariableValue('--color-base-100', defaults.base100, style),
    base200: getCSSVariableValue('--color-base-200', defaults.base200, style),
    base300: getCSSVariableValue('--color-base-300', defaults.base300, style),
    baseContent: getCSSVariableValue('--color-base-content', defaults.baseContent, style),
    primary: getCSSVariableValue('--color-primary', defaults.primary, style),
    primaryContent: getCSSVariableValue('--color-primary-content', defaults.primaryContent, style),
    radiusBox: getCSSVariableValue('--radius-box', defaults.radiusBox, style)
  };
}

/**
 * 基于 daisyUI CSS 变量构建 VTable 主题
 *
 * @param isDark 是否暗色模式
 * @param cssVars 主题 CSS 变量集合
 * @returns VTable 主题对象
 */
export function createTheme(isDark: boolean, cssVars: CSSVariables): ReturnType<typeof VTable.themes.DEFAULT.extends> {
  const switchStyle: SwitchStyle = {
    checkedFill: cssVars.primary,
    uncheckedFill: isDark ? '#ffffff33' : '#00000033',
    circleFill: isDark ? '#ffffffDD' : '#ffffffEE',
    disableCheckedFill: isDark ? '#ffffff33' : '#00000033',
    disableUncheckedFill: isDark ? '#ffffff11' : '#00000011'
  };

  return VTable.themes.DEFAULT.extends({
    underlayBackgroundColor: cssVars.rootBg,
    defaultStyle: {
      borderColor: cssVars.base300,
      color: cssVars.baseContent,
      bgColor: cssVars.base100,
      fontSize: 13,
      fontFamily: SYSTEM_FONT
    },
    headerStyle: {
      borderColor: cssVars.base300,
      color: cssVars.baseContent,
      bgColor: cssVars.base200,
      fontSize: 13,
      fontWeight: 600,
      fontFamily: SYSTEM_FONT
    },
    bodyStyle: {
      borderColor: cssVars.base300,
      color: cssVars.baseContent,
      bgColor: cssVars.base100,
      hover: {
        cellBgColor: cssVars.base200
      }
    },
    frameStyle: {
      borderColor: cssVars.base300,
      borderLineWidth: 0.5
    },
    scrollStyle: {
      scrollSliderColor: cssVars.base300,
      scrollRailColor: cssVars.base200,
      width: 8,
      visible: 'scrolling',
      hoverOn: true
    },
    selectionStyle: {
      cellBorderColor: cssVars.primary,
      cellBorderLineWidth: 2,
      cellBgColor: `color-mix(in srgb, ${cssVars.primary} ${isDark ? '10' : '5'}%, transparent)`,
      inlineRowBgColor: `color-mix(in srgb, ${cssVars.primary} ${isDark ? '5' : '2'}%, transparent)`,
      inlineColumnBgColor: `color-mix(in srgb, ${cssVars.primary} ${isDark ? '5' : '2'}%, transparent)`
    },
    switchStyle
  });
}
