import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { act, fireEvent, screen, within } from './queries.js';
import { cleanup, mount } from './test-utils.js';

afterEach(cleanup);

const open = async (shell: ReturnType<typeof mount>['shell'], ...urls: string[]): Promise<void> => {
  await act(() => {
    for (const url of urls) shell.syncRoute(url);
  });
};

const tabs = () => screen.getAllByTestId('admin-tab');
const titles = () => tabs().map(tab => tab.textContent);

describe('Tabbar', () => {
  it('进入页面即出现页签；当前页签 aria-current', () => {
    mount();
    expect(titles()).toEqual(['资产']);
    expect(within(tabs()[0]).getByRole('link', { name: '资产' }).getAttribute('aria-current')).toBe('page');
  });

  it('偏好关闭页签栏时不渲染', () => {
    mount({ defaults: { tabbar: { enable: false } } });
    expect(screen.queryByTestId('admin-tabbar')).toBeNull();
  });

  it('点击页签跳转；关闭按钮移除页签并跳到最近访问的页签', async () => {
    const { shell, navigated } = mount();
    await open(shell, '/search');
    expect(titles()).toEqual(['资产', '搜索']);
    await fireEvent.click(within(tabs()[0]).getByRole('link'));
    expect(navigated).toEqual(['/entities/assets/Asset']);
    await fireEvent.click(within(tabs()[1]).getByTestId('admin-tab-close'));
    expect(titles()).toEqual(['资产']);
  });

  it('关闭按钮的可访问名称带页签标题', () => {
    mount();
    expect(screen.getByTestId('admin-tab-close').getAttribute('aria-label')).toBe('移除页签：资产');
  });

  it('中键关闭（偏好开启时）；固定页签不可关闭', async () => {
    const { shell } = mount();
    await open(shell, '/search');
    await fireEvent.mouseDown(tabs()[1], { button: 1 });
    expect(await fireEvent(tabs()[1], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }))).toBe(
      false
    );
    expect(titles()).toEqual(['资产']);
    await act(() => shell.tabs.togglePin('/entities/assets/Asset'));
    await fireEvent(tabs()[0], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(titles()).toEqual(['资产']);
    expect(screen.queryByTestId('admin-tab-close')).toBeNull();
  });

  it('关闭中键关闭偏好后中键无效', async () => {
    const { shell } = mount({ defaults: { tabbar: { middleClickToClose: false } } });
    await open(shell, '/search');
    await fireEvent(tabs()[1], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(titles()).toEqual(['资产', '搜索']);
  });

  describe('右键菜单', () => {
    const openMenu = (index: number) => fireEvent.contextMenu(tabs()[index], { clientX: 40, clientY: 40 });

    it('展示 9 项，固定后「关闭」禁用', async () => {
      const { shell } = mount();
      await open(shell, '/search');
      await openMenu(1);
      const menu = screen.getByTestId('admin-tab-menu');
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(9);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-pin'));
      expect(shell.tabs.value.tabs[0].pinned).toBe(true);
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
      await openMenu(0);
      expect((screen.getByTestId('admin-tab-menu-close') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId('admin-tab-menu-pin').textContent).toBe('取消固定');
    });

    it('关闭其他 / 左侧 / 右侧 / 全部', async () => {
      const { shell } = mount();
      await open(shell, '/entities/assets/AssetCategory', '/search');
      await openMenu(1);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-closeLeft'));
      expect(titles()).toEqual(['资产分类', '搜索']);
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-closeRight'));
      expect(titles()).toEqual(['资产分类']);
      await open(shell, '/search');
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-closeOthers'));
      expect(titles()).toEqual(['资产分类']);
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-closeAll'));
      expect(screen.queryByTestId('admin-tabbar')).toBeNull();
    });

    it('没有可关闭的目标时对应项禁用', async () => {
      mount();
      await openMenu(0);
      for (const id of ['closeLeft', 'closeRight', 'closeOthers']) {
        expect((screen.getByTestId(`admin-tab-menu-${id}`) as HTMLButtonElement).disabled).toBe(true);
      }
    });

    it('新窗口打开、内容最大化与还原', async () => {
      const { shell, fakeWindow } = mount();
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-openNew'));
      expect(fakeWindow.opened).toEqual(['/entities/assets/Asset']);
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-maximize'));
      expect(shell.ui.value.maximized).toBe(true);
      expect(screen.getByTestId('admin-tabbar')).toBeTruthy();
      await openMenu(0);
      expect(screen.getByTestId('admin-tab-menu-maximize').textContent).toBe('还原');
    });

    it('偏好关闭最大化项后菜单只有 8 项', async () => {
      mount({ defaults: { tabbar: { showMaximize: false } } });
      await openMenu(0);
      expect(within(screen.getByTestId('admin-tab-menu')).getAllByRole('menuitem')).toHaveLength(8);
    });

    it('刷新此页递增刷新计数', async () => {
      const { shell } = mount();
      await openMenu(0);
      await fireEvent.click(screen.getByTestId('admin-tab-menu-reload'));
      expect(shell.ui.value.refreshKey).toBe(1);
    });

    it('Esc 关闭、点击菜单外关闭、方向键在菜单项间移动焦点', async () => {
      mount();
      await openMenu(0);
      const menu = screen.getByTestId('admin-tab-menu');
      const first = within(menu)
        .getAllByRole('menuitem')
        .find(item => !(item as HTMLButtonElement).disabled) as HTMLElement;
      expect(document.activeElement).toBe(first);
      await fireEvent.keyDown(menu, { key: 'ArrowDown' });
      expect(document.activeElement).not.toBe(first);
      await fireEvent.keyDown(menu, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(first);
      await fireEvent.keyDown(menu, { key: 'Escape' });
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
      await openMenu(0);
      await fireEvent.pointerDown(document.body);
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
    });

    it('键盘：ContextMenu 键与 Shift+F10 打开菜单', async () => {
      mount();
      await fireEvent.keyDown(within(tabs()[0]).getByRole('link'), { key: 'ContextMenu' });
      expect(screen.getByTestId('admin-tab-menu')).toBeTruthy();
      await fireEvent.keyDown(screen.getByTestId('admin-tab-menu'), { key: 'Escape' });
      await fireEvent.keyDown(within(tabs()[0]).getByRole('link'), { key: 'F10', shiftKey: true });
      expect(screen.getByTestId('admin-tab-menu')).toBeTruthy();
    });
  });

  describe('排序', () => {
    it('Shift+方向键移动页签；偏好关闭拖拽后无效', async () => {
      const { shell } = mount();
      await open(shell, '/search');
      await fireEvent.keyDown(within(tabs()[1]).getByRole('link'), { key: 'ArrowLeft', shiftKey: true });
      expect(titles()).toEqual(['搜索', '资产']);
      await fireEvent.keyDown(within(tabs()[0]).getByRole('link'), { key: 'ArrowRight', shiftKey: true });
      expect(titles()).toEqual(['资产', '搜索']);
      await act(() => shell.preferences.setPath('tabbar.draggable', false));
      await fireEvent.keyDown(within(tabs()[1]).getByRole('link'), { key: 'ArrowLeft', shiftKey: true });
      expect(titles()).toEqual(['资产', '搜索']);
    });

    it('HTML5 拖放重排，拖到自己或没有拖起时忽略', async () => {
      const { shell } = mount();
      await open(shell, '/search', '/entities/assets/AssetCategory');
      const dataTransfer = { setData: vi.fn() };
      await fireEvent.dragStart(tabs()[2], { dataTransfer });
      expect(tabs()[2].getAttribute('data-dragging')).toBe('true');
      await fireEvent.dragOver(tabs()[0]);
      expect(tabs()[0].getAttribute('data-drop-target')).toBe('true');
      await fireEvent.drop(tabs()[0]);
      expect(titles()).toEqual(['资产分类', '资产', '搜索']);
      await fireEvent.dragStart(tabs()[0], { dataTransfer });
      await fireEvent.drop(tabs()[0]);
      expect(titles()).toEqual(['资产分类', '资产', '搜索']);
      await fireEvent.dragOver(tabs()[1]);
      await fireEvent.dragEnd(tabs()[0]);
      expect(tabs()[0].getAttribute('data-dragging')).toBe('false');
      await fireEvent.dragOver(tabs()[1]);
      expect(tabs()[1].getAttribute('data-drop-target')).toBe('false');
    });
  });

  it('滚轮横向滚动页签（偏好开启时）', async () => {
    const scrollBy = vi.fn();
    const { shell } = mount();
    await open(shell, '/search');
    const scroller = screen.getByTestId('admin-tabbar').querySelector('.admin-tabbar-scroll') as HTMLUListElement;
    scroller.scrollBy = scrollBy;
    await fireEvent.wheel(scroller, { deltaY: 40 });
    expect(scrollBy).toHaveBeenCalledWith({ left: 40 });
    await act(() => shell.preferences.setPath('tabbar.wheelable', false));
    await fireEvent.wheel(scroller, { deltaY: 40 });
    expect(scrollBy).toHaveBeenCalledOnce();
  });

  it('访问历史菜单按最近访问排列，可跳转；关闭偏好后隐藏', async () => {
    const { shell, navigated } = mount();
    await open(shell, '/search', '/entities/assets/Asset');
    const history = screen.getByTestId('admin-tab-history').parentElement as HTMLElement;
    const items = within(history).getAllByRole('link');
    expect(items.map(item => item.textContent)).toEqual(['资产', '搜索']);
    await fireEvent.click(items[1]);
    expect(navigated.at(-1)).toBe('/search');
    await act(() => shell.preferences.setPath('tabbar.visitHistory', false));
    expect(screen.queryByTestId('admin-tab-history')).toBeNull();
  });

  it('页签图标取自菜单节点，可由偏好关闭', async () => {
    const icon = defineComponent({ render: () => h('i', { 'data-testid': 'menu-icon' }) });
    const { shell } = mount(
      {},
      {
        menu: [{ id: 'a', label: '资产', route: '/entities/assets/Asset', icon }]
      }
    );
    expect(within(screen.getByTestId('admin-tabbar')).getByTestId('menu-icon')).toBeTruthy();
    await act(() => shell.preferences.setPath('tabbar.showIcon', false));
    expect(within(screen.getByTestId('admin-tabbar')).queryByTestId('menu-icon')).toBeNull();
  });
});
