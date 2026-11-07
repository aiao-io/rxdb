import type { AdminPreferences, LayoutMode } from '../preferences/types.js';

/** 推导布局所需的输入。 */
export interface LayoutInput {
  /** 偏好。 */
  readonly prefs: AdminPreferences;
  /** 视口是否处于移动端宽度。 */
  readonly isMobile: boolean;
  /** 内容最大化：临时隐藏顶栏、侧栏与页脚。 */
  readonly maximized: boolean;
  /** 是否有导航菜单。 */
  readonly hasMenu: boolean;
}

/** 推导出的布局，三端壳按它渲染，不再各自判断。 */
export interface LayoutState {
  /** 生效的布局模式（移动端一律按侧栏导航，侧栏以抽屉呈现）。 */
  readonly mode: LayoutMode;
  /** 是否渲染侧栏。 */
  readonly showSidebar: boolean;
  /** 侧栏以抽屉（覆盖层）呈现。 */
  readonly sidebarDrawer: boolean;
  /** 侧栏折叠为图标轨（仅桌面）。 */
  readonly sidebarCollapsed: boolean;
  /** 侧栏占位宽度（px）：折叠取折叠宽度，抽屉不占位。 */
  readonly sidebarWidth: number;
  /** 侧栏展开宽度（px），悬停展开与抽屉使用。 */
  readonly sidebarExpandedWidth: number;
  /** 是否渲染顶栏。 */
  readonly showHeader: boolean;
  /** 顶栏高度（px）。 */
  readonly headerHeight: number;
  /** 顶栏渲染水平菜单。 */
  readonly headerMenu: boolean;
  /** Logo 放在顶栏（顶部导航与顶栏+侧栏）而不是侧栏头部。 */
  readonly brandInHeader: boolean;
  /** 顶栏显示菜单开关按钮。 */
  readonly showMenuToggle: boolean;
  /** 是否显示面包屑。 */
  readonly showBreadcrumb: boolean;
  /** 是否显示页签栏。 */
  readonly showTabbar: boolean;
  /** 是否显示页脚。 */
  readonly showFooter: boolean;
  /** 页脚固定在视口底部。 */
  readonly footerFixed: boolean;
  /** 页脚高度（px）。 */
  readonly footerHeight: number;
  /** 内容区最大宽度（px），`null` 不限。 */
  readonly contentMaxWidth: number | null;
  /** 内容区四向内边距（px）。 */
  readonly contentPadding: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  /** 侧栏使用半深色。 */
  readonly semiDarkSidebar: boolean;
  /** 顶栏使用半深色。 */
  readonly semiDarkHeader: boolean;
}

/** 紧凑密度下顶栏高度的上限（px）。 */
const COMPACT_HEADER_HEIGHT = 44;

const SIDEBAR_MODES: ReadonlySet<LayoutMode> = new Set(['sidebar-nav', 'header-sidebar-nav']);

/**
 * 由偏好、视口与菜单推导布局。
 *
 * @remarks
 * 侧栏被关闭（`sidebar.enable = false`）时，导航自动回退到顶栏水平菜单，不会让用户失去导航入口。
 * @param input - 偏好、视口、最大化与菜单状态。
 * @returns 布局。
 */
export function deriveLayout(input: LayoutInput): LayoutState {
  const { prefs, isMobile, maximized, hasMenu } = input;
  const mode: LayoutMode = isMobile && prefs.app.layout !== 'full-content' ? 'sidebar-nav' : prefs.app.layout;
  const sidebarMode = SIDEBAR_MODES.has(mode);
  const showSidebar = sidebarMode && prefs.sidebar.enable && hasMenu && !maximized;
  const headerMenu = hasMenu && !isMobile && (mode === 'header-nav' || (sidebarMode && !prefs.sidebar.enable));
  const collapsed = prefs.sidebar.collapsed && !isMobile;
  const { sidebar, content, header } = prefs;
  return {
    mode,
    showSidebar,
    sidebarDrawer: showSidebar && isMobile,
    sidebarCollapsed: showSidebar && collapsed,
    sidebarWidth:
      !showSidebar || isMobile ? 0
      : collapsed ? sidebar.collapseWidth
      : sidebar.width,
    sidebarExpandedWidth: sidebar.width,
    showHeader: !maximized,
    headerHeight: prefs.app.compact ? Math.min(header.height, COMPACT_HEADER_HEIGHT) : header.height,
    headerMenu,
    brandInHeader: mode === 'header-nav' || mode === 'header-sidebar-nav' || headerMenu,
    showMenuToggle: showSidebar && (isMobile || mode === 'header-sidebar-nav'),
    showBreadcrumb: prefs.breadcrumb.enable && !headerMenu,
    showTabbar: prefs.tabbar.enable,
    showFooter: prefs.footer.enable && !maximized && mode !== 'full-content',
    footerFixed: prefs.footer.fixed,
    footerHeight: prefs.footer.height,
    contentMaxWidth: content.compact === 'wide' ? content.compactWidth : null,
    contentPadding: content.padding,
    semiDarkSidebar: prefs.theme.semiDarkSidebar,
    semiDarkHeader: prefs.theme.semiDarkHeader
  };
}
