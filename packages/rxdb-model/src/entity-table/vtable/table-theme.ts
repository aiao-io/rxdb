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
 * @remarks
 * 优先读根节点计算样式的 `color-scheme`：daisyUI 的每个主题（dracula、night、business……）
 * 都会声明它，因此不局限于名为 `dark` 的主题。读不到（`normal` / `light dark` / 无样式引擎）
 * 时再看 `data-theme` 是否恰为 `dark` / `light`，最后跟随系统 `prefers-color-scheme`。
 *
 * @returns 暗色主题或系统暗色时为 true；非浏览器环境返回 false
 */
export function isDocumentDarkMode(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const scheme = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).colorScheme : '';
  if (scheme === 'dark' || scheme === 'only dark') return true;
  if (scheme === 'light' || scheme === 'only light') return false;

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
 * 观察文档主题变化：根节点的 `data-theme`、内联 `style`（运行时覆盖的主色 / 圆角写在这里），
 * 以及在没有显式 `data-theme` 时系统明暗的变化。
 *
 * @remarks
 * 三端表格都用它触发 VTable 主题重绘。只观察「是否暗色」这个布尔值不够：
 * 浅色 → cupcake、改主色这类变化不翻转布尔值，画布却需要按新的 CSS 变量重绘。
 *
 * @param onChange 主题可能已变化时调用
 * @returns 停止观察的函数；非浏览器环境返回空操作
 */
export function observeDocumentTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const root = document.documentElement;
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => onChange());
  observer?.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  const query =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ?
      window.matchMedia('(prefers-color-scheme: dark)')
    : undefined;
  const onSystemChange = (): void => {
    if (!root.hasAttribute('data-theme')) onChange();
  };
  query?.addEventListener('change', onSystemChange);

  return () => {
    observer?.disconnect();
    query?.removeEventListener('change', onSystemChange);
  };
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

  // VTable DEFAULT 主题的 hover 残留是固定浅色（#CCE0FF / #F3F8FF），
  // 暗色下与亮文字撞色、单行时画出与深色边框打架的浅色带——必须全部覆盖
  const headerHoverCell = `color-mix(in srgb, ${cssVars.baseContent} ${isDark ? '8' : '6'}%, ${cssVars.base200})`;
  const bodyHoverInline = `color-mix(in srgb, ${cssVars.baseContent} ${isDark ? '6' : '4'}%, ${cssVars.base100})`;

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
      fontFamily: SYSTEM_FONT,
      hover: {
        cellBgColor: headerHoverCell,
        inlineRowBgColor: headerHoverCell,
        inlineColumnBgColor: headerHoverCell
      }
    },
    bodyStyle: {
      borderColor: cssVars.base300,
      color: cssVars.baseContent,
      bgColor: cssVars.base100,
      hover: {
        cellBgColor: cssVars.base200,
        inlineRowBgColor: bodyHoverInline,
        inlineColumnBgColor: bodyHoverInline
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
