import { createTestShell } from '@aiao/rxdb-admin/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, type Component } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { act, fireEvent, screen, within } from './queries.js';
import { cleanup, mount, render, renderWithShell } from './test-utils.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('顶栏部件', () => {
  it('按偏好顺序渲染全部部件', () => {
    mount();
    const keys = [...screen.getByTestId('admin-widgets').querySelectorAll('[data-testid^="admin-widget-"]')].map(
      element => element.getAttribute('data-testid')?.replace('admin-widget-', '')
    );
    expect(keys).toEqual(['search', 'language', 'timezone', 'theme', 'fullscreen', 'refresh', 'lock', 'preferences']);
  });

  it('搜索按钮显示快捷键键帽并打开命令面板；快捷键被关闭后不显示键帽', async () => {
    const { shell } = mount();
    const button = screen.getByTestId('admin-widget-search');
    expect(within(button).getByText('Ctrl')).toBeTruthy();
    await fireEvent.click(button);
    expect(shell.palette.value.open).toBe(true);
    await act(() => shell.shortcuts.setEnabled('palette', false));
    expect(within(screen.getByTestId('admin-widget-search')).queryByText('Ctrl')).toBeNull();
  });

  it('搜索按钮的可访问名称来自可见文字；关闭快捷键后只剩标题', async () => {
    const { shell } = mount();
    const button = screen.getByTestId('admin-widget-search');
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: /搜索.*Ctrl.*K/ })).toBe(button);
    await act(() => shell.shortcuts.setEnabled('palette', false));
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('button', { name: '搜索' })).toBe(button);
  });

  it('主题按钮循环 system → 浅色 → 深色，标签带当前主题名', async () => {
    const { shell } = mount();
    const label = () => screen.getByTestId('admin-widget-theme').getAttribute('aria-label');
    expect(label()).toBe('切换主题：跟随系统');
    await fireEvent.click(screen.getByTestId('admin-widget-theme'));
    expect(shell.preferences.value.theme.name).toBe('light');
    expect(label()).toBe('切换主题：浅色');
    await fireEvent.click(screen.getByTestId('admin-widget-theme'));
    expect(label()).toBe('切换主题：深色');
  });

  it('自选主题时按明暗显示图标', async () => {
    const { shell } = mount({
      themes: [
        { name: 'light', dark: false },
        { name: 'night', dark: true }
      ]
    });
    await act(() => shell.theme.set('night'));
    expect(screen.getByTestId('admin-widget-theme').querySelector('svg')?.getAttribute('class')).toContain('moon');
  });

  it('全屏按钮切换 aria-pressed 与标签', async () => {
    const { fakeDocument } = mount();
    const doc = fakeDocument.document;
    const root = doc.documentElement as unknown as { requestFullscreen: () => Promise<void> };
    root.requestFullscreen = vi.fn(async () => undefined);
    const button = screen.getByTestId('admin-widget-fullscreen');
    expect(button.getAttribute('aria-label')).toBe('全屏');
    await fireEvent.click(button);
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
  });

  it('环境拒绝全屏后按钮禁用并提示不支持', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { shell, fakeDocument } = mount();
      const doc = fakeDocument.document as unknown as { documentElement: { requestFullscreen: () => Promise<void> } };
      doc.documentElement.requestFullscreen = vi.fn(async () => {
        throw new TypeError('Permissions check failed');
      });
      await act(() => shell.fullscreen.toggle());
      const button = screen.getByTestId('admin-widget-fullscreen');
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('aria-label')).toBe('当前环境不支持全屏');
    } finally {
      warn.mockRestore();
    }
  });

  it('刷新、锁屏、偏好按钮', async () => {
    const { shell } = mount();
    await fireEvent.click(screen.getByTestId('admin-widget-refresh'));
    expect(shell.ui.value.refreshKey).toBe(1);
    await fireEvent.click(screen.getByTestId('admin-widget-lock'));
    expect(shell.lock.locked.value).toBe(true);
    await act(() => shell.lock.unlock());
    await fireEvent.click(screen.getByTestId('admin-widget-preferences'));
    expect(shell.ui.value.preferencesOpen).toBe(true);
  });

  it('偏好按钮在有改动时带红点', async () => {
    const { shell } = mount();
    expect(document.querySelector('[data-testid="admin-widget-preferences"] .admin-reset-dot')).toBeNull();
    await act(() => shell.preferences.setPath('app.compact', true));
    expect(document.querySelector('[data-testid="admin-widget-preferences"] .admin-reset-dot')).toBeTruthy();
  });

  it('语言按钮：列出可用语言，选择后写入偏好并切换文案', async () => {
    const { shell } = mount();
    const menu = within(screen.getByTestId('admin-widget-language').parentElement as HTMLElement);
    const items = menu.getAllByRole('menuitemradio');
    expect(items.map(item => item.textContent)).toEqual(['English', '简体中文']);
    expect(items[1].getAttribute('aria-checked')).toBe('true');
    await act(() => fireEvent.click(items[0]));
    expect(shell.preferences.value.app.locale).toBe('en');
    await vi.waitFor(() =>
      expect(screen.getByTestId('admin-widget-theme').getAttribute('aria-label')).toContain('Switch theme')
    );
  });

  it('时区按钮：按钮显示偏移，列表分组，选择写入偏好，「跟随浏览器」清空', async () => {
    const { shell } = mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    const button = screen.getByTestId('admin-widget-timezone');
    expect(button.textContent).toBe('GMT+9');
    const menu = within(button.parentElement as HTMLElement);
    expect(menu.getByRole('group', { name: '亚洲' })).toBeTruthy();
    await fireEvent.click(menu.getByRole('menuitemradio', { name: /Shanghai/ }));
    expect(shell.preferences.value.app.timezone).toBe('Asia/Shanghai');
    await fireEvent.click(menu.getByRole('menuitemradio', { name: '跟随浏览器' }));
    expect(shell.preferences.value.app.timezone).toBe('');
  });

  it('时区按钮的可访问名称包含可见的偏移（label-in-name）', () => {
    mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    const button = screen.getByTestId('admin-widget-timezone');
    expect(button.getAttribute('aria-label')).toBe('时区：GMT+9');
    expect(button.getAttribute('aria-label')).toContain(button.textContent);
  });

  it('时区列表每 30 秒刷新各地时间', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    mount();
    const menu = within(screen.getByTestId('admin-widget-timezone').parentElement as HTMLElement);
    expect(menu.getByRole('menuitemradio', { name: /Tokyo/ }).textContent).toContain('09:00');
    await act(() => void vi.advanceTimersByTime(60_000));
    expect(menu.getByRole('menuitemradio', { name: /Tokyo/ }).textContent).toContain('09:01');
  });

  it('隐藏的部件不渲染', () => {
    mount({ defaults: { widget: { hidden: ['lock', 'refresh'] } } });
    expect(screen.queryByTestId('admin-widget-lock')).toBeNull();
    expect(screen.queryByTestId('admin-widget-refresh')).toBeNull();
  });
});

describe('AdminShellProvider / hooks', () => {
  it('缺少 Provider 时 useAdminShell 抛出明确错误', () => {
    const Probe: Component = {
      setup() {
        useAdminShell();
        return () => null;
      }
    };
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => render(Probe)).toThrow(/AdminShellProvider is missing/);
    spy.mockRestore();
  });

  it('挂载期间绑定浏览器，卸载后解除', () => {
    const { shell, fakeWindow, fakeDocument } = createTestShell<Component>();
    const view = renderWithShell(shell, { render: () => h('span') });
    expect(fakeWindow.listenerCount('keydown')).toBe(1);
    expect(fakeDocument.attributes.get('data-theme')).toBe('light');
    view.unmount();
    expect(fakeWindow.listenerCount('keydown')).toBe(0);
    expect(fakeDocument.attributes.size).toBe(0);
  });

  it('useAdminStore 在值变化时重新渲染；useAdminText 随语言更新', async () => {
    const { shell } = createTestShell<Component>();
    const Probe: Component = {
      setup() {
        const prefs = useAdminStore(shell.preferences);
        const t = useAdminText();
        return () => h('p', { 'data-testid': 'probe' }, `${String(prefs.value.app.compact)}|${t('prefs.title')}`);
      }
    };
    renderWithShell(shell, Probe);
    expect(screen.getByTestId('probe').textContent).toBe('false|偏好设置');
    await act(() => shell.preferences.setPath('app.compact', true));
    expect(screen.getByTestId('probe').textContent).toBe('true|偏好设置');
    await act(async () => shell.i18n.setLocale('en'));
    expect(screen.getByTestId('probe').textContent).toBe('true|Preferences');
  });
});
