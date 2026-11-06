import type { ReadableStore } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SHELL, injectAdminShell, injectAdminStore, injectAdminText, provideAdminShell } from '../context';
import { act, fire, mount, mountComponent, screen, waitFor, within } from './test-utils';

afterEach(() => {
  vi.useRealTimers();
});

@Component({ selector: 'rxdb-admin-empty', changeDetection: ChangeDetectionStrategy.OnPush, template: '<span></span>' })
class EmptyComponent {}

/** 同时读取一个 signal 化的存储和翻译函数，用来证明 OnPush + zoneless 下模板会随之重渲染。 */
@Component({
  selector: 'rxdb-admin-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p data-testid="probe">{{ prefs().app.compact }}|{{ t("prefs.title") }}</p>'
})
class ProbeComponent {
  readonly prefs = injectAdminStore(injectAdminShell().preferences);
  readonly t = injectAdminText();
}

/** 带参数的翻译：参数必须原样交给外壳。 */
@Component({
  selector: 'rxdb-admin-params-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p data-testid="params">{{ t("layout.copyright", { year: 2026, company: "某某公司" }) }}</p>'
})
class ParamsProbeComponent {
  readonly t = injectAdminText();
}

/** 读取一个应用自己追加的文案键：目录登记后模板必须随之更新。 */
@Component({
  selector: 'rxdb-admin-catalog-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<p data-testid="catalog">{{ t("custom.greeting") }}</p>'
})
class CatalogProbeComponent {
  readonly t = injectAdminText();
}

describe('顶栏部件', () => {
  it('按偏好顺序渲染全部部件', async () => {
    await mount();
    const keys = [...screen.getByTestId('admin-widgets').querySelectorAll('[data-testid^="admin-widget-"]')].map(
      element => element.getAttribute('data-testid')?.replace('admin-widget-', '')
    );
    expect(keys).toEqual(['search', 'language', 'timezone', 'theme', 'fullscreen', 'refresh', 'lock', 'preferences']);
  });

  it('搜索按钮显示快捷键键帽并打开命令面板；快捷键被关闭后不显示键帽', async () => {
    const { shell } = await mount();
    const button = screen.getByTestId('admin-widget-search');
    expect(within(button).getByText('Ctrl')).toBeTruthy();
    await fire.click(button);
    expect(shell.palette.value.open).toBe(true);
    await act(() => shell.shortcuts.setEnabled('palette', false));
    expect(within(screen.getByTestId('admin-widget-search')).queryByText('Ctrl')).toBeNull();
  });

  it('搜索按钮的可访问名称包含可见的全部文字（含键帽，label-in-name）；关闭快捷键后只剩标题', async () => {
    const { shell } = await mount();
    expect(screen.getByTestId('admin-widget-search').getAttribute('aria-label')).toBe('搜索 Ctrl K');
    await act(() => shell.shortcuts.setEnabled('palette', false));
    expect(screen.getByTestId('admin-widget-search').getAttribute('aria-label')).toBe('搜索');
  });

  it('主题按钮循环 system → 浅色 → 深色，标签带当前主题名', async () => {
    const { shell } = await mount();
    const label = () => screen.getByTestId('admin-widget-theme').getAttribute('aria-label');
    expect(label()).toBe('切换主题：跟随系统');
    await fire.click(screen.getByTestId('admin-widget-theme'));
    expect(shell.preferences.value.theme.name).toBe('light');
    expect(label()).toBe('切换主题：浅色');
    await fire.click(screen.getByTestId('admin-widget-theme'));
    expect(label()).toBe('切换主题：深色');
  });

  it('自选主题时按明暗显示图标', async () => {
    const { shell } = await mount({
      themes: [
        { name: 'light', dark: false },
        { name: 'night', dark: true }
      ]
    });
    await act(() => shell.theme.set('night'));
    expect(screen.getByTestId('admin-widget-theme').querySelector('svg')?.getAttribute('class')).toContain('moon');
  });

  it('全屏按钮切换 aria-pressed 与标签', async () => {
    const { fakeDocument } = await mount();
    const doc = fakeDocument.document;
    const root = doc.documentElement as unknown as { requestFullscreen: () => Promise<void> };
    root.requestFullscreen = vi.fn(async () => undefined);
    const button = screen.getByTestId('admin-widget-fullscreen');
    expect(button.getAttribute('aria-label')).toBe('全屏');
    await fire.click(button);
    expect(root.requestFullscreen).toHaveBeenCalledOnce();
  });

  it('环境拒绝全屏后按钮禁用并提示不支持', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { shell, fakeDocument } = await mount();
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
    const { shell } = await mount();
    await fire.click(screen.getByTestId('admin-widget-refresh'));
    expect(shell.ui.value.refreshKey).toBe(1);
    await fire.click(screen.getByTestId('admin-widget-lock'));
    expect(shell.lock.locked.value).toBe(true);
    await act(() => shell.lock.unlock());
    await fire.click(screen.getByTestId('admin-widget-preferences'));
    expect(shell.ui.value.preferencesOpen).toBe(true);
  });

  it('偏好按钮在有改动时带红点', async () => {
    const { shell } = await mount();
    expect(document.querySelector('[data-testid="admin-widget-preferences"] .admin-reset-dot')).toBeNull();
    await act(() => shell.preferences.setPath('app.compact', true));
    expect(document.querySelector('[data-testid="admin-widget-preferences"] .admin-reset-dot')).toBeTruthy();
  });

  it('语言按钮：列出可用语言，选择后写入偏好并切换文案', async () => {
    const { shell } = await mount();
    const menu = within(screen.getByTestId('admin-widget-language').parentElement as HTMLElement);
    const items = menu.getAllByRole('menuitemradio');
    expect(items.map(item => item.textContent)).toEqual(['English', '简体中文']);
    expect(items[1].getAttribute('aria-checked')).toBe('true');
    await act(async () => fire.click(items[0]));
    expect(shell.preferences.value.app.locale).toBe('en');
    await waitFor(() =>
      expect(screen.getByTestId('admin-widget-theme').getAttribute('aria-label')).toContain('Switch theme')
    );
  });

  it('时区按钮：按钮显示偏移，列表分组，选择写入偏好，「跟随浏览器」清空', async () => {
    const { shell } = await mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    const button = screen.getByTestId('admin-widget-timezone');
    expect(button.textContent).toBe('GMT+9');
    const menu = within(button.parentElement as HTMLElement);
    expect(menu.getByRole('group', { name: '亚洲' })).toBeTruthy();
    await fire.click(menu.getByRole('menuitemradio', { name: /Shanghai/ }));
    expect(shell.preferences.value.app.timezone).toBe('Asia/Shanghai');
    await fire.click(menu.getByRole('menuitemradio', { name: '跟随浏览器' }));
    expect(shell.preferences.value.app.timezone).toBe('');
  });

  it('时区按钮的可访问名称包含可见的偏移（label-in-name）', async () => {
    await mount({ defaults: { app: { timezone: 'Asia/Tokyo' } } });
    const button = screen.getByTestId('admin-widget-timezone');
    expect(button.getAttribute('aria-label')).toBe('时区：GMT+9');
    expect(button.getAttribute('aria-label')).toContain(button.textContent);
  });

  it('时区列表每 30 秒刷新各地时间', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
    await mount();
    const menu = within(screen.getByTestId('admin-widget-timezone').parentElement as HTMLElement);
    expect(menu.getByRole('menuitemradio', { name: /Tokyo/ }).textContent).toContain('09:00');
    await act(() => void vi.advanceTimersByTime(60_000));
    expect(menu.getByRole('menuitemradio', { name: /Tokyo/ }).textContent).toContain('09:01');
  });

  it('隐藏的部件不渲染', async () => {
    await mount({ defaults: { widget: { hidden: ['lock', 'refresh'] } } });
    expect(screen.queryByTestId('admin-widget-lock')).toBeNull();
    expect(screen.queryByTestId('admin-widget-refresh')).toBeNull();
  });
});

// Angular 对应：AdminShellProvider → provideAdminShell，useAdminShell → injectAdminShell，
// useAdminStore → injectAdminStore，useAdminText → injectAdminText（用例标题与 React 版保持一致）。
describe('AdminShellProvider / hooks', () => {
  it('缺少 Provider 时 useAdminShell 抛出明确错误', () => {
    TestBed.configureTestingModule({});
    expect(() => TestBed.runInInjectionContext(() => injectAdminShell())).toThrow(/provideAdminShell\(\) is missing/);
  });

  it('挂载期间绑定浏览器，卸载后解除', async () => {
    const { fakeWindow, fakeDocument } = await mountComponent(EmptyComponent);
    expect(fakeWindow.listenerCount('keydown')).toBe(1);
    expect(fakeDocument.attributes.get('data-theme')).toBe('light');
    TestBed.resetTestingModule();
    expect(fakeWindow.listenerCount('keydown')).toBe(0);
    expect(fakeDocument.attributes.size).toBe(0);
  });

  it('useAdminStore 在值变化时重新渲染；useAdminText 随语言更新', async () => {
    const { shell } = await mountComponent(ProbeComponent);
    expect(screen.getByTestId('probe').textContent).toBe('false|偏好设置');
    await act(() => shell.preferences.setPath('app.compact', true));
    expect(screen.getByTestId('probe').textContent).toBe('true|偏好设置');
    await act(async () => shell.i18n.setLocale('en'));
    expect(screen.getByTestId('probe').textContent).toBe('true|Preferences');
  });
});

describe('provideAdminShell / injectAdmin* 的 Angular 行为', () => {
  it('提供器暴露同一个外壳，环境初始化时 attach，销毁环境注入器时解除', async () => {
    const { shell, fakeWindow } = await mountComponent(EmptyComponent);
    expect(TestBed.inject(ADMIN_SHELL)).toBe(shell);
    const before = fakeWindow.listenerCount('keydown');
    const child = createEnvironmentInjector([provideAdminShell(shell)], TestBed.inject(EnvironmentInjector));
    expect(fakeWindow.listenerCount('keydown')).toBe(before);
    child.destroy();
    expect(fakeWindow.listenerCount('keydown')).toBe(0);
  });

  it('injectAdminStore 的初值是存储快照，组件销毁时退订', async () => {
    const unsubscribe = vi.fn();
    const store: ReadableStore<number> = {
      value: 7,
      changes$: of(7),
      subscribe: () => unsubscribe
    };
    @Component({ selector: 'rxdb-admin-store-probe', template: '{{ count() }}' })
    class StoreProbe {
      readonly count = injectAdminStore(store);
    }
    const { fixture } = await mountComponent(StoreProbe);
    expect(fixture.nativeElement.textContent).toBe('7');
    expect(unsubscribe).not.toHaveBeenCalled();
    fixture.destroy();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('injectAdminText 在目录（而不只是语言）变化后也会让 OnPush 模板重渲染', async () => {
    const { shell } = await mountComponent(CatalogProbeComponent);
    expect(screen.getByTestId('catalog').textContent).toBe('custom.greeting');
    await act(() =>
      shell.i18n.registerCatalog({
        locale: 'zh-Hans',
        namespace: 'rxdb-admin',
        messages: { 'custom.greeting': '你好' }
      })
    );
    expect(screen.getByTestId('catalog').textContent).toBe('你好');
  });

  it('injectAdminText 把参数交给外壳翻译', async () => {
    const { shell } = await mountComponent(ParamsProbeComponent);
    expect(screen.getByTestId('params').textContent).toBe(
      shell.t('layout.copyright', { year: 2026, company: '某某公司' })
    );
    expect(screen.getByTestId('params').textContent).toContain('某某公司');
  });
});
