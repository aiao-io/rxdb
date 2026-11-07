import { createTestShell } from '@aiao/rxdb-admin/testing';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminShellProvider } from '../context.js';
import { AdminLayout } from '../layout/admin-layout.js';
import { fakeHasher, menu, mount } from './test-utils.js';

afterEach(cleanup);

const slotOf = (): HTMLElement => screen.getByTestId('admin-sidebar').closest('.admin-sidebar-slot') as HTMLElement;
const widthVariable = (slot: HTMLElement): string => slot.style.getPropertyValue('--admin-sidebar-width');

describe('AdminLayout', () => {
  describe('侧栏导航（默认布局）', () => {
    it('渲染品牌、分组菜单与页面内容，当前页高亮', () => {
      mount();
      expect(screen.getByTestId('admin-sidebar')).toBeTruthy();
      expect(screen.getByText('工作台')).toBeTruthy();
      expect(screen.getByTestId('page').textContent).toBe('页面内容');
      const current = within(screen.getByTestId('admin-menu')).getByRole('link', { name: '资产' });
      expect(current.getAttribute('aria-current')).toBe('page');
      expect(
        within(screen.getByTestId('admin-menu')).getByRole('link', { name: '搜索' }).getAttribute('aria-current')
      ).toBeNull();
    });

    it('菜单项的 testId 与分组按菜单声明展开', () => {
      mount();
      expect(screen.getByTestId('nav-category')).toBeTruthy();
      expect(screen.getByTestId('nav-search')).toBeTruthy();
    });

    it('左键点击由外壳接管为 SPA 导航；带修饰键放行给浏览器', () => {
      const { navigated } = mount();
      const link = screen.getByTestId('nav-search');
      expect(fireEvent.click(link)).toBe(false);
      expect(navigated).toEqual(['/search']);
      expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
      expect(fireEvent.click(link, { metaKey: true })).toBe(true);
      expect(fireEvent.click(link, { button: 1 })).toBe(true);
      expect(navigated).toEqual(['/search']);
    });

    it('路由变化后面包屑、页签同步', () => {
      const { shell, rerender } = mount();
      expect(screen.getByTestId('admin-breadcrumb').textContent).toContain('实体');
      expect(screen.getByTestId('admin-breadcrumb').textContent).toContain('资产');
      rerender({ url: '/search' });
      expect(shell.tabs.value.tabs.map(tab => tab.title)).toEqual(['资产', '搜索']);
      expect(screen.getByTestId('admin-breadcrumb').textContent).toContain('搜索');
    });

    it('分组可折叠；手风琴模式下同级只展开一个', () => {
      const { shell } = mount();
      const menuRoot = within(screen.getByTestId('admin-menu'));
      const group = menuRoot.getByText('实体').closest('summary') as HTMLElement;
      fireEvent.click(group);
      expect((group.closest('details') as HTMLDetailsElement).open).toBe(false);
      fireEvent.click(group);
      expect((group.closest('details') as HTMLDetailsElement).open).toBe(true);
      act(() => shell.preferences.setPath('navigation.accordion', true));
      fireEvent.click(menuRoot.getByText('数据').closest('summary') as HTMLElement);
      expect((group.closest('details') as HTMLDetailsElement).open).toBe(false);
    });

    it('菜单更新后新出现的 expanded 分组自动展开；用户收起过的分组保持收起', () => {
      const { rerender } = mount();
      const menuRoot = within(screen.getByTestId('admin-menu'));
      const detailsOf = (label: string): HTMLDetailsElement =>
        menuRoot.getByText(label).closest('details') as HTMLDetailsElement;
      fireEvent.click(menuRoot.getByText('实体').closest('summary') as HTMLElement);
      expect(detailsOf('实体').open).toBe(false);

      rerender({
        menu: [
          ...menu,
          { id: 'late', label: '后到', expanded: true, children: [{ id: 'late-1', label: '后到子项', route: '/late' }] }
        ]
      });
      expect(detailsOf('后到').open).toBe(true);
      expect(detailsOf('实体').open).toBe(false);
    });

    it('折叠按钮切换侧栏图标轨；悬停临时展开', () => {
      const { shell } = mount();
      const sidebar = screen.getByTestId('admin-sidebar');
      expect(sidebar.getAttribute('data-collapsed')).toBe('false');
      fireEvent.click(screen.getByTestId('admin-sidebar-toggle'));
      expect(shell.preferences.value.sidebar.collapsed).toBe(true);
      expect(sidebar.getAttribute('data-collapsed')).toBe('true');
      expect(screen.getByTestId('admin-sidebar-toggle').getAttribute('aria-label')).toBe('展开导航');
      fireEvent.mouseEnter(sidebar);
      expect(sidebar.getAttribute('data-hover-expanded')).toBe('true');
      fireEvent.mouseLeave(sidebar);
      expect(sidebar.getAttribute('data-hover-expanded')).toBe('false');
    });

    it('关闭「折叠时悬停展开」后悬停无效；图标轨压平分组、保留标题属性', () => {
      const { shell } = mount({ defaults: { sidebar: { collapsed: true, expandOnHover: false } } });
      const sidebar = screen.getByTestId('admin-sidebar');
      fireEvent.mouseEnter(sidebar);
      expect(sidebar.getAttribute('data-hover-expanded')).toBe('false');
      expect(within(sidebar).queryByText('实体')).toBeNull();
      expect(screen.getByTestId('nav-asset').getAttribute('title')).toBe('资产');
      expect(shell.layout.value.sidebarWidth).toBe(48);
    });

    it('品牌链接有可访问名称（图标轨下文字被样式隐藏时仍可读）', () => {
      mount();
      const brand = within(screen.getByTestId('admin-sidebar')).getByRole('link', { name: '工作台' });
      expect(brand.getAttribute('aria-label')).toBe('工作台');
    });

    it('图标轨的分隔线是装饰：aria-hidden 的 li，不带 role=separator（ul 的直接子项只能是 li）', () => {
      mount({ defaults: { sidebar: { collapsed: true } } });
      const menu = screen.getByTestId('admin-menu');
      const separators = menu.querySelectorAll('.admin-menu-rail-separator');
      expect(separators.length).toBe(1);
      expect(separators[0].tagName).toBe('LI');
      expect(separators[0].getAttribute('aria-hidden')).toBe('true');
      expect(separators[0].hasAttribute('role')).toBe(false);
    });

    it('图标轨的菜单带 menu-md，展开后恢复（类名拼接回归）', () => {
      mount();
      const classes = (): string[] => [...screen.getByTestId('admin-menu').classList];
      expect(classes()).toEqual(['menu', 'admin-menu']);
      fireEvent.click(screen.getByTestId('admin-sidebar-toggle'));
      expect(classes()).toEqual(['menu', 'admin-menu', 'menu-md']);
      fireEvent.click(screen.getByTestId('admin-sidebar-toggle'));
      expect(classes()).toEqual(['menu', 'admin-menu']);
    });

    it('没有图标的菜单项，图标位是空元素（样式据此不占位）；有图标的则不是', () => {
      mount(
        {},
        {
          url: '/with',
          menu: [
            {
              id: 'group',
              label: '分组',
              expanded: true,
              children: [
                {
                  id: 'with',
                  label: '有图标',
                  route: '/with',
                  icon: <svg data-testid='menu-icon' />,
                  testId: 'nav-with'
                },
                { id: 'without', label: '无图标', route: '/without', testId: 'nav-without' }
              ]
            }
          ]
        }
      );
      const iconSlot = (element: Element | null): Element | null => element?.querySelector('.admin-menu-icon') ?? null;
      expect(iconSlot(screen.getByTestId('nav-without'))?.matches(':empty')).toBe(true);
      expect(iconSlot(screen.getByTestId('nav-with'))?.matches(':empty')).toBe(false);
      const groupTitle = within(screen.getByTestId('admin-menu')).getByText('分组');
      expect(iconSlot(groupTitle.closest('summary'))?.matches(':empty')).toBe(true);
    });

    it('拖拽只预览：占位元素的宽度变量与 aria-valuenow 跟手，偏好原地不动；松手一次性提交，宽度限制在 160–320', () => {
      const { shell } = mount();
      const committed: number[] = [];
      shell.preferences.subscribe(prefs => committed.push(prefs.sidebar.width));
      const slot = slotOf();
      const resizer = screen.getByTestId('admin-sidebar-resizer');
      fireEvent.pointerDown(resizer, { clientX: 240, pointerId: 1 });
      expect(resizer.getAttribute('data-dragging')).toBe('true');
      expect(slot.getAttribute('data-resizing')).toBe('true');
      fireEvent.pointerMove(resizer, { clientX: 300, pointerId: 1 });
      expect(widthVariable(slot)).toBe('300px');
      expect(resizer.getAttribute('aria-valuenow')).toBe('300');
      fireEvent.pointerMove(resizer, { clientX: 900, pointerId: 1 });
      expect(widthVariable(slot)).toBe('320px');
      expect(shell.preferences.value.sidebar.width).toBe(240);
      expect(committed).toEqual([]);

      fireEvent.pointerUp(resizer, { pointerId: 1 });
      expect(shell.preferences.value.sidebar.width).toBe(320);
      expect(committed).toEqual([320]);
      expect(widthVariable(slot)).toBe('');
      expect(slot.hasAttribute('data-resizing')).toBe(false);
      expect(resizer.getAttribute('data-dragging')).toBe('false');
      expect(resizer.getAttribute('aria-valuenow')).toBe('320');
      fireEvent.pointerMove(resizer, { clientX: 100, pointerId: 1 });
      expect(shell.preferences.value.sidebar.width).toBe(320);
      expect(widthVariable(slot)).toBe('');
    });

    it('指针被系统取消与松手一样结束拖动，保留最后一次预览的宽度', () => {
      const { shell } = mount();
      const slot = slotOf();
      const resizer = screen.getByTestId('admin-sidebar-resizer');
      fireEvent.pointerDown(resizer, { clientX: 240, pointerId: 1 });
      fireEvent.pointerMove(resizer, { clientX: 200, pointerId: 1 });
      fireEvent.pointerCancel(resizer, { pointerId: 1 });
      expect(shell.preferences.value.sidebar.width).toBe(200);
      expect(widthVariable(slot)).toBe('');
      expect(slot.hasAttribute('data-resizing')).toBe(false);
      expect(resizer.getAttribute('data-dragging')).toBe('false');
    });

    it('拖动中手柄被卸载（如关掉拖拽偏好）：撤掉预览，偏好保持拖动前的宽度', () => {
      const { shell } = mount();
      const slot = slotOf();
      const resizer = screen.getByTestId('admin-sidebar-resizer');
      fireEvent.pointerDown(resizer, { clientX: 240, pointerId: 1 });
      fireEvent.pointerMove(resizer, { clientX: 300, pointerId: 1 });
      expect(widthVariable(slot)).toBe('300px');
      act(() => shell.preferences.setPath('sidebar.draggable', false));
      expect(screen.queryByTestId('admin-sidebar-resizer')).toBeNull();
      expect(widthVariable(slot)).toBe('');
      expect(slot.hasAttribute('data-resizing')).toBe(false);
      expect(shell.preferences.value.sidebar.width).toBe(240);
    });

    it('键盘：左右方向键每次调整 16px 并立即提交，其他按键忽略', () => {
      const { shell } = mount();
      const resizer = screen.getByTestId('admin-sidebar-resizer');
      fireEvent.keyDown(resizer, { key: 'ArrowRight' });
      fireEvent.keyDown(resizer, { key: 'ArrowRight' });
      fireEvent.keyDown(resizer, { key: 'ArrowRight' });
      expect(shell.preferences.value.sidebar.width).toBe(288);
      fireEvent.keyDown(resizer, { key: 'ArrowLeft' });
      expect(shell.preferences.value.sidebar.width).toBe(272);
      fireEvent.keyDown(resizer, { key: 'Home' });
      expect(shell.preferences.value.sidebar.width).toBe(272);
      expect(resizer.getAttribute('aria-valuenow')).toBe('272');
    });

    it('draggable 关闭或折叠时没有拖拽手柄', () => {
      mount({ defaults: { sidebar: { draggable: false } } });
      expect(screen.queryByTestId('admin-sidebar-resizer')).toBeNull();
    });

    it('内容区有且只有一个视觉隐藏的一级标题：当前页的菜单标题，没有匹配时用品牌名', () => {
      const { rerender } = mount();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByTestId('admin-page-title').textContent).toBe('资产');
      rerender({ url: '/not-in-menu' });
      expect(screen.getByTestId('admin-page-title').textContent).toBe('工作台');
    });

    it('菜单项右侧可附加徽标', () => {
      mount({}, { renderMenuExtra: node => <b data-testid={`badge-${node.id}`}>3</b> });
      expect(screen.getByTestId('badge-asset').textContent).toBe('3');
    });
  });

  describe('其他布局模式', () => {
    it('顶栏只高亮最精确的路由，查询参数不影响匹配', async () => {
      const nodes = [
        { id: 'specific', label: '用户设置', route: '/users/settings', testId: 'nav-specific' },
        { id: 'general', label: '用户列表', route: '/users', testId: 'nav-general' }
      ];
      const { rerender } = mount(
        { defaults: { app: { layout: 'header-nav' } } },
        { menu: nodes, url: '/users/settings' }
      );
      expect(screen.getByTestId('nav-specific').getAttribute('aria-current')).toBe('page');
      expect(screen.getByTestId('nav-general').getAttribute('aria-current')).toBeNull();
      rerender({ url: '/users/settings/profile?tab=account#form' });
      expect(screen.getByTestId('nav-specific').getAttribute('aria-current')).toBe('page');
      expect(screen.getByTestId('nav-general').getAttribute('aria-current')).toBeNull();
    });

    it('切换到顶栏导航后仍能访问多层分组内的页面', async () => {
      const leaf = { id: 'leaf', label: '深层页面', route: '/deep', testId: 'nav-deep' };
      const nested = { id: 'nested', label: '孙分组', children: [leaf] };
      const group = { id: 'group', label: '子分组', children: [nested] };
      const nodes = [{ id: 'root', label: '根分组', children: [group] }];
      const { shell, navigated } = mount({}, { menu: nodes, url: '/deep' });
      expect(screen.getByTestId('nav-deep').getAttribute('href')).toBe('/deep');
      act(() => shell.preferences.setPath('app.layout', 'header-nav'));
      const nav = within(screen.getByTestId('admin-header-menu'));
      const link = nav.getByRole('link', { name: '深层页面' });
      expect(link.getAttribute('href')).toBe('/deep');
      expect(link.getAttribute('aria-current')).toBe('page');
      expect(nav.queryByRole('link', { name: '子分组' })).toBeNull();
      fireEvent.click(link);
      expect(navigated).toEqual(['/deep']);
    });

    it('header-nav：无侧栏，顶栏水平菜单（分组是下拉）', () => {
      mount({ defaults: { app: { layout: 'header-nav' } } });
      expect(screen.queryByTestId('admin-sidebar')).toBeNull();
      const nav = screen.getByTestId('admin-header-menu');
      expect(within(nav).getByRole('button', { name: /实体/ })).toBeTruthy();
      expect(screen.queryByTestId('admin-breadcrumb')).toBeNull();
      expect(screen.getByTestId('admin-header').textContent).toContain('工作台');
    });

    it('header-nav：点击水平菜单项导航，当前页高亮', () => {
      const { navigated } = mount({ defaults: { app: { layout: 'header-nav' } } });
      const link = screen.getByTestId('nav-asset');
      expect(link.getAttribute('aria-current')).toBe('page');
      fireEvent.click(screen.getByTestId('nav-search'));
      expect(navigated).toEqual(['/search']);
    });

    it('header-nav：当前页的水平菜单项带 btn-active，基础类不丢（类名拼接回归）', () => {
      mount({ defaults: { app: { layout: 'header-nav' } } });
      expect([...screen.getByTestId('nav-asset').classList]).toEqual(['btn', 'btn-ghost', 'btn-sm', 'btn-active']);
      expect([...screen.getByTestId('nav-search').classList]).toEqual(['btn', 'btn-ghost', 'btn-sm']);
    });

    it('header-sidebar-nav：Logo 与菜单开关在顶栏，开关折叠侧栏', () => {
      const { shell } = mount({ defaults: { app: { layout: 'header-sidebar-nav' } } });
      expect(screen.getByTestId('admin-header').textContent).toContain('工作台');
      expect(within(screen.getByTestId('admin-sidebar')).queryByText('工作台')).toBeNull();
      fireEvent.click(screen.getByTestId('admin-menu-toggle'));
      expect(shell.preferences.value.sidebar.collapsed).toBe(true);
    });

    it('full-content：没有侧栏与页脚，顶栏保留以便打开设置', () => {
      mount({ defaults: { app: { layout: 'full-content' }, footer: { enable: true } } });
      expect(screen.queryByTestId('admin-sidebar')).toBeNull();
      expect(screen.queryByTestId('admin-footer')).toBeNull();
      expect(screen.getByTestId('admin-widget-preferences')).toBeTruthy();
    });

    it('侧栏被关闭时导航回退到顶栏水平菜单', () => {
      mount({ defaults: { sidebar: { enable: false } } });
      expect(screen.queryByTestId('admin-sidebar')).toBeNull();
      expect(screen.getByTestId('admin-header-menu')).toBeTruthy();
    });

    it('没有 Logo 时品牌区不渲染；有图片时显示图片', () => {
      const { shell } = mount({ defaults: { logo: { enable: false } } });
      expect(screen.queryByText('工作台')).toBeNull();
      act(() => shell.preferences.update({ logo: { enable: true, source: '/logo.svg', showText: false } }));
      expect(document.querySelector('img.admin-brand-logo')?.getAttribute('src')).toBe('/logo.svg');
      expect(screen.queryByText('工作台')).toBeNull();
    });

    it('点击品牌回到首页', () => {
      const { navigated } = mount({ homeUrl: '/start' });
      fireEvent.click(screen.getByText('工作台'));
      expect(navigated).toEqual(['/start']);
    });
  });

  describe('移动端', () => {
    it('侧栏是抽屉：默认关闭，菜单开关打开，遮罩与路由变化关闭', () => {
      const { shell, rerender } = mount({}, {}, { mobile: true });
      const sidebar = screen.getByTestId('admin-sidebar');
      expect(screen.getByTestId('admin-shell').getAttribute('data-mobile')).toBe('true');
      expect(sidebar.getAttribute('data-open')).toBe('false');
      expect(screen.queryByTestId('admin-sidebar-toggle')).toBeNull();
      fireEvent.click(screen.getByTestId('admin-menu-toggle'));
      expect(sidebar.getAttribute('data-open')).toBe('true');
      expect(screen.getByTestId('admin-menu-toggle').getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(document.querySelector('.admin-backdrop') as HTMLElement);
      expect(sidebar.getAttribute('data-open')).toBe('false');
      act(() => shell.ui.setDrawer(true));
      rerender({ url: '/search' });
      expect(sidebar.getAttribute('data-open')).toBe('false');
    });

    it('视口变化时即时切换', () => {
      const { fakeWindow } = mount();
      expect(screen.getByTestId('admin-shell').getAttribute('data-mobile')).toBe('false');
      act(() => fakeWindow.setMobile(true));
      expect(screen.getByTestId('admin-shell').getAttribute('data-mobile')).toBe('true');
    });
  });

  describe('内容区', () => {
    it('刷新计数变化重建内容区子树', () => {
      const { shell } = mount();
      const before = screen.getByTestId('page');
      act(() => shell.ui.refresh());
      expect(screen.getByTestId('page')).not.toBe(before);
    });

    it('路径变化重播进入动画，查询串变化不重播，首次渲染不播放', () => {
      const { rerender } = mount();
      const page = screen.getByTestId('admin-page');
      expect(page.hasAttribute('data-entering')).toBe(false);
      rerender({ url: '/entities/assets/Asset?page=2' });
      expect(page.hasAttribute('data-entering')).toBe(false);
      rerender({ url: '/search' });
      expect(page.getAttribute('data-entering')).toBe('true');
    });

    it('新路径的内容在绘制前就进入动画起始状态', () => {
      const { shell } = createTestShell<ReactNode>({ brand: { title: '工作台' }, lockHasher: fakeHasher });
      const beforePaint: Array<string | null> = [];

      function PaintProbe({ url }: { url: string }) {
        useLayoutEffect(() => {
          beforePaint.push(screen.getByTestId('admin-page').getAttribute('data-entering'));
        }, [url]);

        return (
          <AdminShellProvider shell={shell}>
            <AdminLayout menu={menu} url={url}>
              <p>{url}</p>
            </AdminLayout>
          </AdminShellProvider>
        );
      }

      const view = render(<PaintProbe url='/entities/assets/Asset' />);
      view.rerender(<PaintProbe url='/search' />);
      expect(beforePaint).toEqual([null, 'true']);
    });

    it('导航中显示进度条；开启加载遮罩偏好时显示遮罩', () => {
      const { shell } = mount({}, { navigating: true });
      expect(document.querySelector('.admin-progress')).toBeTruthy();
      expect(screen.queryByTestId('admin-loading-mask')).toBeNull();
      act(() => shell.preferences.update({ transition: { loading: true } }));
      expect(screen.getByTestId('admin-loading-mask')).toBeTruthy();
      act(() => shell.preferences.update({ transition: { progress: false } }));
      expect(document.querySelector('.admin-progress')).toBeNull();
    });

    it('内容最大化隐藏顶栏与侧栏', () => {
      const { shell } = mount();
      act(() => shell.ui.toggleMaximize());
      expect(screen.queryByTestId('admin-header')).toBeNull();
      expect(screen.queryByTestId('admin-sidebar')).toBeNull();
      expect(screen.getByTestId('admin-shell').getAttribute('data-maximized')).toBe('true');
    });
  });

  describe('页脚与水印', () => {
    it('页脚显示版权，公司名缺省为应用名，备案号带链接', () => {
      const { shell } = mount({ defaults: { footer: { enable: true } } });
      expect(screen.getByTestId('admin-footer').textContent).toContain('© ');
      expect(screen.getByTestId('admin-footer').textContent).toContain('工作台');
      act(() =>
        shell.preferences.update({
          copyright: { companyName: '某某公司', companySiteLink: 'https://x.test', icp: '京ICP备1号' }
        })
      );
      const footer = screen.getByTestId('admin-footer');
      expect(footer.textContent).toContain('某某公司');
      expect(within(footer).getByRole('link', { name: '京ICP备1号' }).getAttribute('href')).toBe('https://x.test');
      act(() => shell.preferences.update({ copyright: { enable: false } }));
      expect(screen.getByTestId('admin-footer').textContent).toBe('');
    });

    it('水印随偏好显隐', () => {
      const { shell } = mount();
      expect(screen.queryByTestId('admin-watermark')).toBeNull();
      act(() => shell.preferences.update({ app: { watermark: true, watermarkContent: '机密' } }));
      expect(screen.getByTestId('admin-watermark')).toBeTruthy();
      expect(decodeURIComponent(shell.watermark.value)).toContain('机密');
    });
  });
});
