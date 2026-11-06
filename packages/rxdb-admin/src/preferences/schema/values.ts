import type {
  BreadcrumbStyle,
  ContentCompact,
  LayoutMode,
  MenuAlign,
  NavigationStyle,
  Radius,
  TabbarPersist,
  TabbarStyle,
  TransitionName
} from '../types.js';

/** 布局模式取值。 */
export const LAYOUT_MODES = [
  'sidebar-nav',
  'header-sidebar-nav',
  'header-nav',
  'full-content'
] as const satisfies readonly LayoutMode[];

/** 圆角档位取值。 */
export const RADII = ['0', '0.25', '0.5', '0.75', '1'] as const satisfies readonly Radius[];

/** 导航菜单风格取值。 */
export const NAVIGATION_STYLES = ['rounded', 'plain'] as const satisfies readonly NavigationStyle[];

/** 面包屑风格取值。 */
export const BREADCRUMB_STYLES = ['normal', 'background'] as const satisfies readonly BreadcrumbStyle[];

/** 页签风格取值。 */
export const TABBAR_STYLES = ['chrome', 'plain', 'card', 'brisk'] as const satisfies readonly TabbarStyle[];

/** 页签持久化取值。 */
export const TABBAR_PERSISTS = ['off', 'session', 'local'] as const satisfies readonly TabbarPersist[];

/** 页面切换动画取值。 */
export const TRANSITIONS = ['fade', 'fade-slide', 'fade-up', 'fade-down'] as const satisfies readonly TransitionName[];

/** 内容区宽度约束取值。 */
export const CONTENT_COMPACTS = ['off', 'wide'] as const satisfies readonly ContentCompact[];

/** 顶部导航对齐取值。 */
export const MENU_ALIGNS = ['start', 'center'] as const satisfies readonly MenuAlign[];

/** 主色预设。 */
export const COLOR_PRESETS = [
  '#167bff',
  '#7c3aed',
  '#ec4899',
  '#f59e0b',
  '#14b8a6',
  '#10b981',
  '#f97316',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#64748b'
] as const;

/** 十六进制颜色（可为空）。 */
export const HEX_COLOR_PATTERN = /^(#[0-9a-fA-F]{6})?$/;

/** BCP 47 语言标签（可为空）的宽松匹配。 */
export const LOCALE_PATTERN = /^([A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*)?$/;

/** IANA 时区名（可为空）的宽松匹配。 */
export const TIMEZONE_PATTERN = /^([A-Za-z_]+(\/[A-Za-z0-9_+-]+)*)?$/;
