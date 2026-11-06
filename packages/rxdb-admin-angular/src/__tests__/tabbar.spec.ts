import { LucideHouse } from '@lucide/angular';
import { describe, expect, it, vi } from 'vitest';
import { act, fire, mount, screen, within, type Mounted } from './test-utils';

const open = async (shell: Mounted['shell'], ...urls: string[]): Promise<void> => {
  await act(() => {
    for (const url of urls) shell.syncRoute(url);
  });
};

const tabs = () => screen.getAllByTestId('admin-tab');
const titles = () => tabs().map(tab => tab.textContent);

describe('Tabbar', () => {
  it('进入页面即出现页签；当前页签 aria-current', async () => {
    await mount();
    expect(titles()).toEqual(['资产']);
    expect(within(tabs()[0]).getByRole('link', { name: '资产' }).getAttribute('aria-current')).toBe('page');
  });

  it('偏好关闭页签栏时不渲染', async () => {
    await mount({ defaults: { tabbar: { enable: false } } });
    expect(screen.queryByTestId('admin-tabbar')).toBeNull();
  });

  it('点击页签跳转；关闭按钮移除页签并跳到最近访问的页签', async () => {
    const { shell, navigated } = await mount();
    await open(shell, '/search');
    expect(titles()).toEqual(['资产', '搜索']);
    await fire.click(within(tabs()[0]).getByRole('link'));
    expect(navigated).toEqual(['/entities/assets/Asset']);
    await fire.click(within(tabs()[1]).getByTestId('admin-tab-close'));
    expect(titles()).toEqual(['资产']);
  });

  it('关闭按钮的可访问名称带页签标题', async () => {
    await mount();
    expect(screen.getByTestId('admin-tab-close').getAttribute('aria-label')).toBe('移除页签：资产');
  });

  it('中键关闭（偏好开启时）；固定页签不可关闭', async () => {
    const { shell } = await mount();
    await open(shell, '/search');
    await fire.mouseDown(tabs()[1], { button: 1 });
    expect(
      await fire.event(tabs()[1], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }))
    ).toBe(false);
    expect(titles()).toEqual(['资产']);
    await act(() => shell.tabs.togglePin('/entities/assets/Asset'));
    await fire.event(tabs()[0], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(titles()).toEqual(['资产']);
    expect(screen.queryByTestId('admin-tab-close')).toBeNull();
  });

  it('关闭中键关闭偏好后中键无效', async () => {
    const { shell } = await mount({ defaults: { tabbar: { middleClickToClose: false } } });
    await open(shell, '/search');
    await fire.event(tabs()[1], new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(titles()).toEqual(['资产', '搜索']);
  });

  describe('右键菜单', () => {
    const openMenu = (index: number) => fire.contextMenu(tabs()[index], { clientX: 40, clientY: 40 });

    it('展示 9 项，固定后「关闭」禁用', async () => {
      const { shell } = await mount();
      await open(shell, '/search');
      await openMenu(1);
      const menu = screen.getByTestId('admin-tab-menu');
      expect(within(menu).getAllByRole('menuitem')).toHaveLength(9);
      await fire.click(screen.getByTestId('admin-tab-menu-pin'));
      expect(shell.tabs.value.tabs[0].pinned).toBe(true);
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
      await openMenu(0);
      expect((screen.getByTestId('admin-tab-menu-close') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId('admin-tab-menu-pin').textContent).toBe('取消固定');
    });

    it('关闭其他 / 左侧 / 右侧 / 全部', async () => {
      const { shell } = await mount();
      await open(shell, '/entities/assets/AssetCategory', '/search');
      await openMenu(1);
      await fire.click(screen.getByTestId('admin-tab-menu-closeLeft'));
      expect(titles()).toEqual(['资产分类', '搜索']);
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-closeRight'));
      expect(titles()).toEqual(['资产分类']);
      await open(shell, '/search');
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-closeOthers'));
      expect(titles()).toEqual(['资产分类']);
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-closeAll'));
      expect(screen.queryByTestId('admin-tabbar')).toBeNull();
    });

    it('没有可关闭的目标时对应项禁用', async () => {
      await mount();
      await openMenu(0);
      for (const id of ['closeLeft', 'closeRight', 'closeOthers']) {
        expect((screen.getByTestId(`admin-tab-menu-${id}`) as HTMLButtonElement).disabled).toBe(true);
      }
    });

    it('新窗口打开、内容最大化与还原', async () => {
      const { shell, fakeWindow } = await mount();
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-openNew'));
      expect(fakeWindow.opened).toEqual(['/entities/assets/Asset']);
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-maximize'));
      expect(shell.ui.value.maximized).toBe(true);
      expect(screen.getByTestId('admin-tabbar')).toBeTruthy();
      await openMenu(0);
      expect(screen.getByTestId('admin-tab-menu-maximize').textContent).toBe('还原');
    });

    it('偏好关闭最大化项后菜单只有 8 项', async () => {
      await mount({ defaults: { tabbar: { showMaximize: false } } });
      await openMenu(0);
      expect(within(screen.getByTestId('admin-tab-menu')).getAllByRole('menuitem')).toHaveLength(8);
    });

    it('刷新此页递增刷新计数', async () => {
      const { shell } = await mount();
      await openMenu(0);
      await fire.click(screen.getByTestId('admin-tab-menu-reload'));
      expect(shell.ui.value.refreshKey).toBe(1);
    });

    it('Esc 关闭、点击菜单外关闭、方向键在菜单项间移动焦点', async () => {
      await mount();
      await openMenu(0);
      const menu = screen.getByTestId('admin-tab-menu');
      const first = within(menu)
        .getAllByRole('menuitem')
        .find(item => !(item as HTMLButtonElement).disabled) as HTMLElement;
      expect(document.activeElement).toBe(first);
      await fire.keyDown(menu, { key: 'ArrowDown' });
      expect(document.activeElement).not.toBe(first);
      await fire.keyDown(menu, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(first);
      await fire.keyDown(menu, { key: 'Escape' });
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
      await openMenu(0);
      await fire.pointerDown(document.body);
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
    });

    it('滚动与窗口失焦也会关闭菜单', async () => {
      await mount();
      await openMenu(0);
      await fire.event(window, new Event('scroll'));
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
      await openMenu(0);
      await fire.event(window, new Event('blur'));
      expect(screen.queryByTestId('admin-tab-menu')).toBeNull();
    });

    it('键盘：ContextMenu 键与 Shift+F10 打开菜单', async () => {
      await mount();
      await fire.keyDown(within(tabs()[0]).getByRole('link'), { key: 'ContextMenu' });
      expect(screen.getByTestId('admin-tab-menu')).toBeTruthy();
      await fire.keyDown(screen.getByTestId('admin-tab-menu'), { key: 'Escape' });
      await fire.keyDown(within(tabs()[0]).getByRole('link'), { key: 'F10', shiftKey: true });
      expect(screen.getByTestId('admin-tab-menu')).toBeTruthy();
    });
  });

  describe('排序', () => {
    it('Shift+方向键移动页签；偏好关闭拖拽后无效', async () => {
      const { shell } = await mount();
      await open(shell, '/search');
      await fire.keyDown(within(tabs()[1]).getByRole('link'), { key: 'ArrowLeft', shiftKey: true });
      expect(titles()).toEqual(['搜索', '资产']);
      await fire.keyDown(within(tabs()[0]).getByRole('link'), { key: 'ArrowRight', shiftKey: true });
      expect(titles()).toEqual(['资产', '搜索']);
      await act(() => shell.preferences.setPath('tabbar.draggable', false));
      await fire.keyDown(within(tabs()[1]).getByRole('link'), { key: 'ArrowLeft', shiftKey: true });
      expect(titles()).toEqual(['资产', '搜索']);
    });

    // 真实浏览器里实测：@for 的 keyed 重排把被聚焦页签的 DOM 节点移走（摘下再插入），焦点掉回 body，连按 Shift+方向键就断了
    it('Shift+方向键重排后焦点仍在被移动的页签上，可以连续按', async () => {
      const { shell } = await mount();
      await open(shell, '/search', '/entities/assets/AssetCategory');
      // 浏览器里节点被摘下再插回就会失焦，happy-dom 不模拟这一点：补一个同样语义的 shim
      const blurWhenDetached = (node: Node): void => {
        if (node.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      };
      const originalInsertBefore = Node.prototype.insertBefore;
      const insertBefore = vi.spyOn(Node.prototype, 'insertBefore').mockImplementation(function <T extends Node>(
        this: Node,
        node: T,
        child: Node | null
      ): T {
        blurWhenDetached(node);
        return originalInsertBefore.call(this, node, child) as T;
      });
      const link = (title: string): HTMLElement =>
        within(tabs().find(tab => tab.textContent === title) as HTMLElement).getByRole('link');
      try {
        link('搜索').focus();
        await fire.keyDown(link('搜索'), { key: 'ArrowRight', shiftKey: true });
        expect(titles()).toEqual(['资产', '资产分类', '搜索']);
        expect(document.activeElement).toBe(link('搜索'));
        await fire.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft', shiftKey: true });
        await fire.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft', shiftKey: true });
        expect(titles()).toEqual(['搜索', '资产', '资产分类']);
        expect(document.activeElement).toBe(link('搜索'));
      } finally {
        insertBefore.mockRestore();
      }
    });

    it('HTML5 拖放重排，拖到自己或没有拖起时忽略', async () => {
      const { shell } = await mount();
      await open(shell, '/search', '/entities/assets/AssetCategory');
      const dataTransfer = { setData: vi.fn() };
      await fire.dragStart(tabs()[2], { dataTransfer });
      expect(tabs()[2].getAttribute('data-dragging')).toBe('true');
      await fire.dragOver(tabs()[0]);
      expect(tabs()[0].getAttribute('data-drop-target')).toBe('true');
      await fire.drop(tabs()[0]);
      expect(titles()).toEqual(['资产分类', '资产', '搜索']);
      await fire.dragStart(tabs()[0], { dataTransfer });
      await fire.drop(tabs()[0]);
      expect(titles()).toEqual(['资产分类', '资产', '搜索']);
      await fire.dragOver(tabs()[1]);
      await fire.dragEnd(tabs()[0]);
      expect(tabs()[0].getAttribute('data-dragging')).toBe('false');
      await fire.dragOver(tabs()[1]);
      expect(tabs()[1].getAttribute('data-drop-target')).toBe('false');
    });
  });

  it('滚轮横向滚动页签（偏好开启时）', async () => {
    const scrollBy = vi.fn();
    const { shell } = await mount();
    await open(shell, '/search');
    const scroller = screen.getByTestId('admin-tabbar').querySelector('.admin-tabbar-scroll') as HTMLUListElement;
    scroller.scrollBy = scrollBy;
    await fire.wheel(scroller, { deltaY: 40 });
    expect(scrollBy).toHaveBeenCalledWith({ left: 40 });
    await act(() => shell.preferences.setPath('tabbar.wheelable', false));
    await fire.wheel(scroller, { deltaY: 40 });
    expect(scrollBy).toHaveBeenCalledOnce();
  });

  it('访问历史菜单按最近访问排列，可跳转；关闭偏好后隐藏', async () => {
    const { shell, navigated } = await mount();
    await open(shell, '/search', '/entities/assets/Asset');
    const history = screen.getByTestId('admin-tab-history').parentElement as HTMLElement;
    const items = within(history).getAllByRole('link');
    expect(items.map(item => item.textContent)).toEqual(['资产', '搜索']);
    await fire.click(items[1]);
    expect(navigated.at(-1)).toBe('/search');
    await act(() => shell.preferences.setPath('tabbar.visitHistory', false));
    expect(screen.queryByTestId('admin-tab-history')).toBeNull();
  });

  it('页签图标取自菜单节点，可由偏好关闭', async () => {
    // Angular 的图标是 @lucide/angular 的图标数据，没有 data-testid 可挂；以图标的 lucide-house 类名定位
    const { shell } = await mount(
      {},
      { menu: [{ id: 'a', label: '资产', route: '/entities/assets/Asset', icon: LucideHouse }] }
    );
    const tabIcon = () => screen.getByTestId('admin-tabbar').querySelector('svg.lucide-house');
    expect(tabIcon()).toBeTruthy();
    await act(() => shell.preferences.setPath('tabbar.showIcon', false));
    expect(tabIcon()).toBeNull();
  });
});
