import { describe, expect, it, vi } from 'vitest';
import { deriveLayout, type LayoutInput } from '../../layout/layout-state.js';
import { ShellUi } from '../../layout/ui-state.js';
import { createMediaQueryStore } from '../../media.js';
import { defaultPreferences } from '../../preferences/defaults.js';
import { applyPatch } from '../../preferences/merge.js';

const input = (patch: object = {}, rest: Partial<Omit<LayoutInput, 'prefs'>> = {}): LayoutInput => ({
  prefs: applyPatch(defaultPreferences, patch),
  isMobile: false,
  maximized: false,
  hasMenu: true,
  ...rest
});

describe('deriveLayout', () => {
  it('默认（sidebar-nav）：侧栏 + 顶栏，Logo 在侧栏，面包屑与页签显示', () => {
    expect(deriveLayout(input())).toMatchObject({
      mode: 'sidebar-nav',
      showSidebar: true,
      sidebarDrawer: false,
      sidebarCollapsed: false,
      sidebarWidth: 240,
      sidebarExpandedWidth: 240,
      showHeader: true,
      headerHeight: 56,
      headerMenu: false,
      brandInHeader: false,
      showMenuToggle: false,
      showBreadcrumb: true,
      showTabbar: true,
      showFooter: false
    });
  });

  it('header-sidebar-nav：Logo 与菜单开关在顶栏', () => {
    expect(deriveLayout(input({ app: { layout: 'header-sidebar-nav' } }))).toMatchObject({
      mode: 'header-sidebar-nav',
      showSidebar: true,
      brandInHeader: true,
      showMenuToggle: true,
      headerMenu: false
    });
  });

  it('header-nav：无侧栏，顶栏渲染水平菜单且不显示面包屑', () => {
    expect(deriveLayout(input({ app: { layout: 'header-nav' } }))).toMatchObject({
      showSidebar: false,
      sidebarWidth: 0,
      headerMenu: true,
      brandInHeader: true,
      showBreadcrumb: false,
      showMenuToggle: false
    });
  });

  it('full-content：无侧栏、无页脚，保留顶栏以便打开设置', () => {
    expect(deriveLayout(input({ app: { layout: 'full-content' }, footer: { enable: true } }))).toMatchObject({
      mode: 'full-content',
      showSidebar: false,
      showFooter: false,
      showHeader: true,
      headerMenu: false
    });
  });

  it('侧栏折叠：占位宽度取折叠宽度，展开宽度保持', () => {
    expect(deriveLayout(input({ sidebar: { collapsed: true } }))).toMatchObject({
      sidebarCollapsed: true,
      sidebarWidth: 48,
      sidebarExpandedWidth: 240
    });
  });

  it('关闭侧栏时导航回退到顶栏水平菜单', () => {
    expect(deriveLayout(input({ sidebar: { enable: false } }))).toMatchObject({
      showSidebar: false,
      headerMenu: true,
      brandInHeader: true,
      showBreadcrumb: false
    });
  });

  it('没有菜单时不渲染侧栏也不渲染水平菜单', () => {
    expect(deriveLayout(input({}, { hasMenu: false }))).toMatchObject({ showSidebar: false, headerMenu: false });
    expect(deriveLayout(input({ app: { layout: 'header-nav' } }, { hasMenu: false })).headerMenu).toBe(false);
  });

  describe('移动端', () => {
    it('任何布局都按侧栏导航，侧栏是抽屉，不占位、不折叠，顶栏有菜单开关', () => {
      const layout = deriveLayout(
        input({ app: { layout: 'header-nav' }, sidebar: { collapsed: true } }, { isMobile: true })
      );
      expect(layout).toMatchObject({
        mode: 'sidebar-nav',
        showSidebar: true,
        sidebarDrawer: true,
        sidebarCollapsed: false,
        sidebarWidth: 0,
        showMenuToggle: true,
        headerMenu: false
      });
    });

    it('full-content 在移动端依然是全屏内容', () => {
      expect(deriveLayout(input({ app: { layout: 'full-content' } }, { isMobile: true })).showSidebar).toBe(false);
    });

    it('关闭侧栏的移动端没有水平菜单可回退，也没有菜单开关', () => {
      expect(deriveLayout(input({ sidebar: { enable: false } }, { isMobile: true }))).toMatchObject({
        showSidebar: false,
        headerMenu: false,
        showMenuToggle: false
      });
    });
  });

  it('内容最大化：隐藏顶栏、侧栏与页脚，页签栏保留', () => {
    expect(deriveLayout(input({ footer: { enable: true } }, { maximized: true }))).toMatchObject({
      showHeader: false,
      showSidebar: false,
      showFooter: false,
      showTabbar: true
    });
  });

  it('页脚、页签、面包屑开关', () => {
    expect(deriveLayout(input({ footer: { enable: true, fixed: true, height: 60 } }))).toMatchObject({
      showFooter: true,
      footerFixed: true,
      footerHeight: 60
    });
    expect(deriveLayout(input({ tabbar: { enable: false } })).showTabbar).toBe(false);
    expect(deriveLayout(input({ breadcrumb: { enable: false } })).showBreadcrumb).toBe(false);
  });

  it('紧凑密度收紧顶栏高度；本来更矮则不变', () => {
    expect(deriveLayout(input({ app: { compact: true } })).headerHeight).toBe(44);
    expect(deriveLayout(input({ app: { compact: true }, header: { height: 40 } })).headerHeight).toBe(40);
  });

  it('内容区宽度约束与内边距', () => {
    expect(deriveLayout(input()).contentMaxWidth).toBeNull();
    const wide = deriveLayout(input({ content: { compact: 'wide', compactWidth: 1000, padding: { top: 8 } } }));
    expect(wide.contentMaxWidth).toBe(1000);
    expect(wide.contentPadding).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
  });

  it('半深色标记透传', () => {
    expect(deriveLayout(input({ theme: { semiDarkSidebar: true, semiDarkHeader: true } }))).toMatchObject({
      semiDarkSidebar: true,
      semiDarkHeader: true
    });
  });
});

describe('ShellUi', () => {
  it('抽屉、悬停、最大化、偏好抽屉、刷新与导航状态', () => {
    const ui = new ShellUi();
    ui.toggleDrawer();
    expect(ui.value.drawerOpen).toBe(true);
    ui.setDrawer(false);
    ui.setHoverExpanded(true);
    ui.toggleMaximize();
    ui.setPreferencesOpen(true);
    ui.refresh();
    ui.refresh();
    ui.setNavigating(true);
    expect(ui.value).toEqual({
      drawerOpen: false,
      hoverExpanded: true,
      maximized: true,
      preferencesOpen: true,
      refreshKey: 2,
      navigating: true
    });
    ui.setMaximized(false);
    expect(ui.value.maximized).toBe(false);
  });

  it('没有实际变化的设置不通知', () => {
    const ui = new ShellUi();
    const listener = vi.fn();
    ui.subscribe(listener);
    ui.setDrawer(false);
    ui.setNavigating(false);
    expect(listener).not.toHaveBeenCalled();
    ui.setDrawer(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('changes$ 回放当前状态', () => {
    const ui = new ShellUi();
    const seen: boolean[] = [];
    const subscription = ui.changes$.subscribe(state => seen.push(state.maximized));
    ui.toggleMaximize();
    subscription.unsubscribe();
    expect(seen).toEqual([false, true]);
  });
});

describe('createMediaQueryStore', () => {
  it('跟随查询变化并可停止', () => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const mql = {
      matches: false,
      addEventListener: (_: 'change', listener: (event: { matches: boolean }) => void) => void listeners.add(listener),
      removeEventListener: (_: 'change', listener: (event: { matches: boolean }) => void) =>
        void listeners.delete(listener)
    };
    const matchMedia = vi.fn(() => mql);
    const { store, stop } = createMediaQueryStore(matchMedia, '(max-width: 768px)');
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 768px)');
    expect(store.value).toBe(false);
    for (const listener of listeners) listener({ matches: true });
    expect(store.value).toBe(true);
    stop();
    expect(listeners.size).toBe(0);
  });

  it('没有 matchMedia 时恒为 false', () => {
    const { store, stop } = createMediaQueryStore(undefined, '(max-width: 768px)');
    expect(store.value).toBe(false);
    expect(() => stop()).not.toThrow();
  });
});
