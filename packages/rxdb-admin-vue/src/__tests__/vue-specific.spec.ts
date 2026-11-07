import { adminMessages, createMemoryStorage, Store, type MenuNode } from '@aiao/rxdb-admin';
import { createTestShell } from '@aiao/rxdb-admin/testing';
import { I18n } from '@aiao/rxdb-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, h, nextTick, shallowReactive, type Component } from 'vue';
import { useAdminStore } from '../context.js';
import AdminLayout from '../layout/admin-layout.vue';
import { interceptNavigation } from '../layout/intercept-navigation.js';
import { closeOnBackdrop } from '../use-dialog.js';
import { act, screen, within } from './queries.js';
import { cleanup, mount, renderWithShell } from './test-utils.js';

afterEach(cleanup);

/** React 版用属性传入的扩展点（`brandIcon` / `renderMenuExtra` / `headerStart` / `headerEnd`），Vue 版是插槽；React 的用例没有覆盖它们，这里补上。 */
describe('插槽', () => {
  const brandIcon = { 'brand-icon': () => h('u', { 'data-testid': 'brand-icon' }) };

  it('brand-icon：侧栏布局显示在侧栏品牌区，有 Logo 图片时让位给图片', async () => {
    const { shell } = mount({}, { slots: brandIcon });
    const sidebar = screen.getByTestId('admin-sidebar');
    expect(within(sidebar).getByTestId('brand-icon')).toBeTruthy();
    expect(within(screen.getByTestId('admin-header')).queryByTestId('brand-icon')).toBeNull();
    await act(() => shell.preferences.update({ logo: { source: '/logo.svg' } }));
    expect(screen.queryByTestId('brand-icon')).toBeNull();
  });

  it('brand-icon：顶栏品牌的布局里显示在顶栏', () => {
    mount({ defaults: { app: { layout: 'header-sidebar-nav' } } }, { slots: brandIcon });
    expect(within(screen.getByTestId('admin-header')).getByTestId('brand-icon')).toBeTruthy();
    expect(within(screen.getByTestId('admin-sidebar')).queryByTestId('brand-icon')).toBeNull();
  });

  it('header-start / header-end 分别在部件区之前与之后', () => {
    mount(
      {},
      {
        slots: {
          'header-start': () => h('em', { 'data-testid': 'slot-start' }, 'S'),
          'header-end': () => h('em', { 'data-testid': 'slot-end' }, 'E')
        }
      }
    );
    const [start, widgets, end] = ['slot-start', 'admin-widgets', 'slot-end'].map(id => screen.getByTestId(id));
    expect(start.compareDocumentPosition(widgets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(widgets.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('menu-extra：分组里的叶子与图标轨里都渲染，参数是菜单节点', () => {
    const slots = {
      'menu-extra': ({ node }: { node: { id: string } }) => h('b', { 'data-testid': `badge-${node.id}` })
    };
    mount({ defaults: { sidebar: { collapsed: true } } }, { slots });
    expect(screen.getByTestId('badge-asset')).toBeTruthy();
    expect(screen.getByTestId('badge-search')).toBeTruthy();
    expect(screen.queryByTestId('badge-entities')).toBeNull();
    cleanup();
    mount({}, { slots });
    expect(screen.getByTestId('badge-category')).toBeTruthy();
  });
});

describe('布局输入变化', () => {
  it('菜单更新后侧栏、面包屑与页签标题同步', async () => {
    const { shell, rerender } = mount();
    await rerender({ menu: [{ id: 'only', label: '唯一', route: '/entities/assets/Asset', testId: 'nav-only' }] });
    expect(screen.getByTestId('nav-only')).toBeTruthy();
    expect(screen.queryByTestId('nav-category')).toBeNull();
    expect(shell.tabs.value.tabs.map(tab => tab.title)).toEqual(['唯一']);
    expect(screen.getByTestId('admin-page-title').textContent).toBe('唯一');
  });

  it('菜单与地址同时变化时先同步菜单，不受属性书写顺序影响', async () => {
    const { shell } = createTestShell<Component>({ brand: { title: '工作台' } });
    const state = shallowReactive({
      menu: [{ id: 'a', label: 'A', route: '/a' }] as MenuNode<Component>[],
      url: '/a'
    });
    // url 写在 menu 前面：属性更新的触发顺序就是 url 先于 menu
    const layout: Component = { render: () => h(AdminLayout, { url: state.url, menu: state.menu }) };
    renderWithShell(shell, layout);
    state.url = '/b';
    state.menu = [{ id: 'b', label: 'B', route: '/b' }];
    await nextTick();
    expect(shell.tabs.value.tabs.map(tab => tab.title)).toEqual(['A', 'B']);
  });

  it('navigating 切回 false 后进度条消失', async () => {
    const { rerender } = mount({}, { navigating: true });
    expect(document.querySelector('.admin-progress')).toBeTruthy();
    await rerender({ navigating: false });
    expect(document.querySelector('.admin-progress')).toBeNull();
  });
});

describe('原生 dialog', () => {
  it('挂载时已处于锁定（刷新前就在锁屏）则锁屏对话框直接打开', async () => {
    const local = createMemoryStorage();
    local.setItem('aiao.admin.lock', '1');
    mount({ storage: { local } });
    await nextTick();
    expect((screen.getByTestId('admin-lock') as HTMLDialogElement).open).toBe(true);
    expect(screen.getByTestId('admin-lock-input')).toBeTruthy();
  });

  it('卸载后不再响应对话框事件', async () => {
    const { shell, wrapper } = mount();
    await act(() => shell.ui.setPreferencesOpen(true));
    const drawer = screen.getByTestId('admin-preferences') as HTMLDialogElement;
    wrapper.unmount();
    expect(() => drawer.dispatchEvent(new Event('cancel'))).not.toThrow();
    expect(shell.ui.value.preferencesOpen).toBe(true);
  });

  it('closeOnBackdrop：只有点在对话框自身上才关闭', () => {
    const close = vi.fn();
    const dialog = {};
    closeOnBackdrop({ target: {}, currentTarget: dialog }, close);
    expect(close).not.toHaveBeenCalled();
    closeOnBackdrop({ target: dialog, currentTarget: dialog }, close);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('组合式函数', () => {
  it('useAdminStore 跟随存储更新，作用域释放后退订', () => {
    const store = new Store(1);
    const scope = effectScope();
    const state = scope.run(() => useAdminStore(store));
    expect(state?.value).toBe(1);
    store.set(2);
    expect(state?.value).toBe(2);
    scope.stop();
    store.set(3);
    expect(state?.value).toBe(2);
  });

  it('外壳已在渲染前 attach 时 Provider 幂等：只绑定一次，卸载后解除', () => {
    const { shell, fakeWindow } = createTestShell<Component>();
    const detach = shell.attach();
    const view = renderWithShell(shell, { render: () => h('span') });
    expect(fakeWindow.listenerCount('keydown')).toBe(1);
    view.unmount();
    expect(fakeWindow.listenerCount('keydown')).toBe(0);
    expect(() => detach()).not.toThrow();
  });
});

describe('其他', () => {
  it('只有一种语言时不渲染语言下拉', () => {
    const i18n = new I18n({
      defaultLocale: 'zh-Hans',
      deviceLocale: 'zh-Hans',
      locale: 'zh-Hans',
      catalogs: adminMessages.filter(catalog => catalog.locale === 'zh-Hans')
    });
    mount({ i18n });
    expect(screen.queryByTestId('admin-widget-language')).toBeNull();
    expect(screen.getByTestId('admin-widget-timezone')).toBeTruthy();
  });

  it('interceptNavigation：已被 preventDefault 的点击不再接管', () => {
    const go = vi.fn();
    const event = new MouseEvent('click', { cancelable: true });
    event.preventDefault();
    interceptNavigation(event, go);
    expect(go).not.toHaveBeenCalled();
  });

  it('页签右键菜单打开期间目标页签被关闭则菜单不渲染内容', async () => {
    const { shell } = mount();
    await act(() => shell.syncRoute('/search'));
    const tab = screen.getAllByTestId('admin-tab')[1];
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await nextTick();
    expect(screen.getByTestId('admin-tab-menu')).toBeTruthy();
    await act(() => shell.tabs.close('/search'));
    expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
  });
});
