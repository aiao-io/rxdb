import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from './queries.js';
import { cleanup, mount } from './test-utils.js';

afterEach(cleanup);

const openDrawer = async (shell: ReturnType<typeof mount>['shell']): Promise<HTMLElement> => {
  await act(() => shell.ui.setPreferencesOpen(true));
  return screen.getByTestId('admin-preferences');
};

describe('PreferencesDrawer', () => {
  it('打开时是原生模态 dialog，关闭按钮 / Esc 都能回写关闭状态', async () => {
    const { shell } = mount();
    const drawer = (await openDrawer(shell)) as HTMLDialogElement;
    expect(drawer.open).toBe(true);
    expect(within(drawer).getByRole('heading', { name: '偏好设置' })).toBeTruthy();
    await fireEvent.click(screen.getByTestId('pref-close'));
    expect(shell.ui.value.preferencesOpen).toBe(false);
    expect(drawer.open).toBe(false);
    await act(() => shell.ui.setPreferencesOpen(true));
    drawer.close();
    expect(shell.ui.value.preferencesOpen).toBe(false);
  });

  it('Esc：cancel 立即回写关闭；浏览器晚到的 close 事件不会覆盖随后再次打开的请求', async () => {
    const { shell } = mount();
    const drawer = (await openDrawer(shell)) as HTMLDialogElement;
    await fireEvent(drawer, new Event('cancel'));
    expect(shell.ui.value.preferencesOpen).toBe(false);
    await act(() => shell.ui.setPreferencesOpen(true));
    expect(drawer.open).toBe(true);
    // 原生 close 事件比 cancel 晚十几毫秒才到，此时对话框已被重新打开
    await fireEvent(drawer, new Event('close'));
    expect(shell.ui.value.preferencesOpen).toBe(true);
    expect(drawer.open).toBe(true);
  });

  it('点击对话框自身（背景）关闭，点击内容不关闭', async () => {
    const { shell } = mount();
    const drawer = await openDrawer(shell);
    await fireEvent.click(screen.getByTestId('pref-reset'));
    expect(shell.ui.value.preferencesOpen).toBe(true);
    await fireEvent.click(drawer);
    expect(shell.ui.value.preferencesOpen).toBe(false);
  });

  it('五个页签；切换页签显示对应分组', async () => {
    const { shell } = mount();
    const drawer = await openDrawer(shell);
    expect(
      within(drawer)
        .getAllByRole('tab')
        .map(tab => tab.textContent)
    ).toEqual(['外观', '布局', '快捷键', '通用', '拓展']);
    expect(within(drawer).getByRole('heading', { name: '主题' })).toBeTruthy();
    await fireEvent.click(screen.getByTestId('pref-tab-layout'));
    expect(within(drawer).getByRole('heading', { name: '布局模式' })).toBeTruthy();
    expect(screen.getByTestId('pref-tab-layout').getAttribute('aria-selected')).toBe('true');
    await fireEvent.click(screen.getByTestId('pref-tab-extension'));
    expect(within(drawer).getByText('没有可配置的扩展项')).toBeTruthy();
  });

  describe('控件写入偏好', () => {
    it('开关', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-app.compact'));
      expect(shell.preferences.value.app.compact).toBe(true);
      expect(document.documentElement.getAttribute('data-compact')).toBeNull();
    });

    it('主题网格：点击卡片切换主题', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      expect(screen.getByTestId('pref-theme-system').getAttribute('aria-pressed')).toBe('true');
      await fireEvent.click(screen.getByTestId('pref-theme-dark'));
      expect(shell.preferences.value.theme.name).toBe('dark');
      expect(screen.getByTestId('pref-theme-dark').getAttribute('data-theme')).toBe('dark');
      expect(screen.getByTestId('pref-theme-system').getAttribute('data-theme')).toBeNull();
    });

    it('主色：预设、取色器与清除', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getAllByTestId('pref-color-preset')[1]);
      expect(shell.preferences.value.theme.colorPrimary).toBe('#7c3aed');
      await fireEvent.change(screen.getByTestId('pref-color-input'), { target: { value: '#ff0000' } });
      expect(shell.preferences.value.theme.colorPrimary).toBe('#ff0000');
      await fireEvent.click(screen.getByTestId('pref-color-reset'));
      expect(shell.preferences.value.theme.colorPrimary).toBe('');
      expect(screen.queryByTestId('pref-color-reset')).toBeNull();
    });

    it('可空分段：选圆角，再选「默认」回到 null', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-theme.radius-0.5'));
      expect(shell.preferences.value.theme.radius).toBe('0.5');
      expect(screen.getByTestId('pref-theme.radius-0.5').getAttribute('aria-pressed')).toBe('true');
      await fireEvent.click(screen.getByTestId('pref-theme.radius-default'));
      expect(shell.preferences.value.theme.radius).toBeNull();
    });

    it('数字：失焦 / 回车提交并夹取；清空可空数字写 null；非法输入还原', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      const size = screen.getByTestId('pref-theme.fontSize') as HTMLInputElement;
      await fireEvent.change(size, { target: { value: '18' } });
      expect(shell.preferences.value.theme.fontSize).toBeNull();
      await fireEvent.blur(size);
      expect(shell.preferences.value.theme.fontSize).toBe(18);
      await fireEvent.change(size, { target: { value: '99' } });
      await fireEvent.keyDown(size, { key: 'Enter' });
      expect(shell.preferences.value.theme.fontSize).toBe(22);
      expect(size.value).toBe('22');
      await fireEvent.change(size, { target: { value: '' } });
      await fireEvent.blur(size);
      expect(shell.preferences.value.theme.fontSize).toBeNull();
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      const width = screen.getByTestId('pref-sidebar.width') as HTMLInputElement;
      await fireEvent.change(width, { target: { value: '' } });
      await fireEvent.blur(width);
      expect(width.value).toBe('240');
      await fireEvent.change(width, { target: { value: '-' } });
      await fireEvent.blur(width);
      expect(width.value).toBe('240');
    });

    it('分段按钮与页签的激活态类名完整（类名拼接回归）', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      expect([...screen.getByTestId('pref-tab-appearance').classList]).toEqual(['tab', 'tab-active']);
      expect([...screen.getByTestId('pref-tab-layout').classList]).toEqual(['tab']);
      expect([...screen.getByTestId('pref-theme.radius-default').classList]).toEqual([
        'btn',
        'btn-xs',
        'join-item',
        'btn-primary'
      ]);
      expect([...screen.getByTestId('pref-theme.radius-0.5').classList]).toEqual(['btn', 'btn-xs', 'join-item']);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      expect([...screen.getByTestId('pref-tab-layout').classList]).toEqual(['tab', 'tab-active']);
      expect([...screen.getByTestId('pref-tab-appearance').classList]).toEqual(['tab']);
    });

    it('数字：当前值已在上限时输入越界值，提交后输入框回到被约束的值', async () => {
      const { shell } = mount({ defaults: { theme: { fontSize: 22 } } });
      await openDrawer(shell);
      const size = screen.getByTestId('pref-theme.fontSize') as HTMLInputElement;
      expect(size.value).toBe('22');
      await fireEvent.change(size, { target: { value: '99' } });
      await fireEvent.keyDown(size, { key: 'Enter' });
      expect(shell.preferences.value.theme.fontSize).toBe(22);
      expect(size.value).toBe('22');
    });

    it('下拉与卡片', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      await fireEvent.click(screen.getByTestId('pref-app.layout-header-nav'));
      expect(shell.preferences.value.app.layout).toBe('header-nav');
      await fireEvent.change(screen.getByTestId('pref-tabbar.persist'), { target: { value: 'local' } });
      expect(shell.preferences.value.tabbar.persist).toBe('local');
      await fireEvent.click(screen.getByTestId('pref-tabbar.styleType-card'));
      expect(shell.preferences.value.tabbar.styleType).toBe('card');
    });

    it('文本：失焦提交，回车提交', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-general'));
      await fireEvent.click(screen.getByTestId('pref-app.watermark'));
      const input = screen.getByTestId('pref-app.watermarkContent') as HTMLInputElement;
      await fireEvent.change(input, { target: { value: '机密' } });
      await fireEvent.blur(input);
      expect(shell.preferences.value.app.watermarkContent).toBe('机密');
      await fireEvent.change(input, { target: { value: '内部' } });
      await fireEvent.keyDown(input, { key: 'Enter' });
      expect(shell.preferences.value.app.watermarkContent).toBe('内部');
    });

    it('依赖项在父开关关闭时禁用', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      expect((screen.getByTestId('pref-breadcrumb.hideOnlyOne') as HTMLInputElement).disabled).toBe(false);
      await fireEvent.click(screen.getByTestId('pref-breadcrumb.enable'));
      expect((screen.getByTestId('pref-breadcrumb.hideOnlyOne') as HTMLInputElement).disabled).toBe(true);
      expect(shell.preferences.value.breadcrumb.enable).toBe(false);
    });

    it('语言与时区下拉', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-general'));
      await fireEvent.change(screen.getByTestId('pref-app.timezone'), { target: { value: 'Asia/Tokyo' } });
      expect(shell.preferences.value.app.timezone).toBe('Asia/Tokyo');
      const locale = screen.getByTestId('pref-app.locale') as HTMLSelectElement;
      expect([...locale.options].map(option => option.value)).toEqual(['', 'en', 'zh-Hans']);
    });
  });

  describe('顶栏部件列表', () => {
    const widgetKeys = () =>
      within(screen.getByTestId('pref-widgets'))
        .getAllByTestId(/^pref-widget-(?!toggle)/)
        .map(row => row.getAttribute('data-testid')?.replace('pref-widget-', ''));

    it('方向键调整顺序', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      expect(widgetKeys()[0]).toBe('search');
      await fireEvent.keyDown(screen.getByTestId('pref-widget-search'), { key: 'ArrowDown' });
      expect(shell.preferences.value.widget.order.slice(0, 2)).toEqual(['language', 'search']);
      await fireEvent.keyDown(screen.getByTestId('pref-widget-search'), { key: 'ArrowUp' });
      expect(shell.preferences.value.widget.order[0]).toBe('search');
    });

    it('HTML5 拖放调整顺序', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      await fireEvent.dragStart(screen.getByTestId('pref-widget-lock'));
      await fireEvent.dragOver(screen.getByTestId('pref-widget-search'));
      expect(screen.getByTestId('pref-widget-search').getAttribute('data-drop-target')).toBe('true');
      await fireEvent.drop(screen.getByTestId('pref-widget-search'));
      expect(shell.preferences.value.widget.order[0]).toBe('lock');
      await fireEvent.dragStart(screen.getByTestId('pref-widget-lock'));
      await fireEvent.dragEnd(screen.getByTestId('pref-widget-lock'));
      await fireEvent.drop(screen.getByTestId('pref-widget-lock'));
      expect(shell.preferences.value.widget.order[0]).toBe('lock');
    });

    it('开始拖拽时写入拖拽数据（Firefox 没有数据就不会启动拖放）', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      const dataTransfer = { setData: vi.fn(), effectAllowed: 'none' };
      await fireEvent.dragStart(screen.getByTestId('pref-widget-lock'), { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'lock');
      expect(dataTransfer.effectAllowed).toBe('move');
    });

    it('隐藏与恢复部件；设置入口不可隐藏', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-layout'));
      expect((screen.getByTestId('pref-widget-toggle-preferences') as HTMLButtonElement).disabled).toBe(true);
      await fireEvent.click(screen.getByTestId('pref-widget-toggle-lock'));
      expect(shell.preferences.value.widget.hidden).toEqual(['lock']);
      expect(screen.queryByTestId('admin-widget-lock')).toBeNull();
      await fireEvent.click(screen.getByTestId('pref-widget-toggle-lock'));
      expect(shell.preferences.value.widget.hidden).toEqual([]);
      expect(screen.getByTestId('admin-widget-lock')).toBeTruthy();
    });
  });

  describe('快捷键列表', () => {
    it('列出内置快捷键与键帽，单独启停', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-shortcuts'));
      expect(screen.getByText('打开命令面板')).toBeTruthy();
      expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0);
      await fireEvent.click(screen.getByTestId('pref-shortcut-palette'));
      expect(shell.shortcuts.isEnabled('palette')).toBe(false);
      await fireEvent.click(screen.getByTestId('pref-shortcuts.enable'));
      expect((screen.getByTestId('pref-shortcut-lock') as HTMLInputElement).disabled).toBe(true);
    });

    it('应用追加的快捷键自动出现', async () => {
      const { shell } = mount();
      await act(
        () => void shell.shortcuts.register({ id: 'sync', combo: 'Alt+S', label: '立即同步', handler: vi.fn() })
      );
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-tab-shortcuts'));
      expect(screen.getByText('立即同步')).toBeTruthy();
    });
  });

  describe('页脚：重置 / 复制 / 导入', () => {
    it('有改动时重置按钮带红点，重置回到默认', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      expect(screen.queryByTestId('pref-reset-dot')).toBeNull();
      await fireEvent.click(screen.getByTestId('pref-app.compact'));
      expect(screen.getByTestId('pref-reset-dot')).toBeTruthy();
      await fireEvent.click(screen.getByTestId('pref-reset'));
      expect(shell.preferences.value.app.compact).toBe(false);
      expect(screen.queryByTestId('pref-reset-dot')).toBeNull();
    });

    it('复制配置：把差异 JSON 写入剪贴板并短暂提示', async () => {
      const writeText = vi.fn(async () => undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { shell } = mount();
      await openDrawer(shell);
      await act(() => shell.preferences.setPath('app.compact', true));
      await fireEvent.click(screen.getByTestId('pref-copy'));
      await waitFor(() => expect(screen.getByTestId('pref-copy').textContent).toBe('配置已复制'));
      expect(JSON.parse((writeText.mock.calls[0] as unknown as [string])[0])).toEqual({ app: { compact: true } });
    });

    it('复制配置：剪贴板被拒绝时按钮提示失败，不产生未处理的拒绝', async () => {
      const denied = vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError');
      });
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: denied }, configurable: true });
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-copy'));
      await waitFor(() => expect(screen.getByTestId('pref-copy').textContent).toBe('复制失败'));
      expect(denied).toHaveBeenCalledOnce();
    });

    it('复制配置：没有剪贴板接口（非安全上下文）时同样提示失败', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-copy'));
      await waitFor(() => expect(screen.getByTestId('pref-copy').textContent).toBe('复制失败'));
    });

    it('导入配置：合法 JSON 应用并收起面板，非法 JSON 提示且保持当前设置', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-import'));
      await fireEvent.change(screen.getByTestId('pref-import-text'), { target: { value: '{oops' } });
      await fireEvent.click(screen.getByTestId('pref-import-apply'));
      expect(screen.getByRole('alert').textContent).toContain('不是合法的 JSON 对象');
      await fireEvent.change(screen.getByTestId('pref-import-text'), { target: { value: '{"app":{"compact":true}}' } });
      expect(screen.queryByRole('alert')).toBeNull();
      await fireEvent.click(screen.getByTestId('pref-import-apply'));
      expect(shell.preferences.value.app.compact).toBe(true);
      expect(screen.queryByTestId('pref-import-panel')).toBeNull();
    });

    it('导入面板可取消', async () => {
      const { shell } = mount();
      await openDrawer(shell);
      await fireEvent.click(screen.getByTestId('pref-import'));
      await fireEvent.click(screen.getByRole('button', { name: '取消' }));
      expect(screen.queryByTestId('pref-import-panel')).toBeNull();
    });
  });

  it('扩展偏好出现在「拓展」页签并可写入', async () => {
    const { shell } = mount({
      extensions: [
        { key: 'tablePageSize', type: 'number', defaultValue: 20, min: 10, max: 100, step: 10, label: '每页行数' }
      ]
    });
    await openDrawer(shell);
    await fireEvent.click(screen.getByTestId('pref-tab-extension'));
    const input = screen.getByTestId('pref-extension.tablePageSize') as HTMLInputElement;
    expect(input.value).toBe('20');
    await fireEvent.change(input, { target: { value: '50' } });
    await fireEvent.blur(input);
    expect(shell.preferences.value.extension['tablePageSize']).toBe(50);
  });

  it('语言切换后抽屉文案立即更新', async () => {
    const { shell } = mount();
    await openDrawer(shell);
    await act(async () => shell.i18n.setLocale('en'));
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeTruthy();
    expect(screen.getByTestId('pref-tab-layout').textContent).toBe('Layout');
  });
});
