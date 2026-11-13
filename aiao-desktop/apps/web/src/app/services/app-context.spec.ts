import type {
  DesktopAccent,
  DesktopCapability,
  DesktopMenu,
  DesktopMethod,
  DesktopWindowState
} from '@aiao/orbit/desktop';
import { DESKTOP_CAPABILITIES, DESKTOP_LIMITS, DESKTOP_METHOD_CAPABILITIES, DesktopError } from '@aiao/orbit/desktop';
import { EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { SNAPSHOT, fakeHostServices, recordingInteraction } from '../testing/fake-host-services';
import { fakeWindows } from '../testing/fake-windows';
import { AppContextChrome, DesktopAppContext, DesktopAppContexts, DesktopNotice } from './app-context';
import { AppNotifications } from './app-notifications';
import { DESKTOP_APPS, DesktopAppRegistry } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { FilePanels } from './file-panels';
import { FileSystem } from './file-system';
import { MenuCommand, isMenuCommand } from './menu';
import { SystemState } from './system-state';
import { ThemeService } from './theme';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

/** 第一批能力：窗口、菜单、应用、外观。 */
const ALL: readonly DesktopCapability[] = ['window', 'menu', 'app', 'appearance', 'appearance:write'];

/** 把 notes 登记成透明窗口的集成应用，与 Aiao Code 的登记形态一致。 */
const apps = (frame: 'standard' | 'transparent' = 'transparent'): DesktopAppRegistry =>
  testApps({
    notes: {
      kind: 'web',
      web: { url: 'https://code.example/', version: 'online', allow: [], readyTimeout: 1000, frame }
    } as never
  });

function fakeChrome() {
  const decorations = signal(true);
  const chrome = {
    decorations: () => decorations(),
    setDecorations: vi.fn((value: boolean) => decorations.set(value)),
    setDragRegions: vi.fn()
  } satisfies AppContextChrome;
  return { chrome, decorations };
}

interface Setup {
  readonly capabilities?: readonly DesktopCapability[];
  readonly frame?: 'standard' | 'transparent';
  readonly withChrome?: boolean;
}

function setup({ capabilities = ALL, frame = 'transparent', withChrome = true }: Setup = {}) {
  const registry = apps(frame);
  const win = new DesktopWindow('w1', registry.notes, {}, { left: 0, top: 0, width: 600, height: 400 });
  win.attempt = 1;
  win.state.set('ready');
  const { windows, focused } = fakeWindows();
  const { chrome, decorations } = fakeChrome();
  const system = new SystemState();
  const theme = {
    setAppearance: vi.fn((mode: 'light' | 'dark' | 'auto') => {
      system.appearance.set(mode);
      system.theme.set(mode === 'auto' ? 'light' : mode);
    }),
    setAccent: vi.fn((accent: DesktopAccent) => system.accent.set(accent))
  };
  const notices: DesktopNotice[] = [];
  const services = fakeHostServices();
  const context = new DesktopAppContext({
    win,
    capabilities,
    apps: registry,
    windows,
    system,
    theme,
    chrome: withChrome ? chrome : undefined,
    notify: notice => notices.push(notice),
    notifications: services.notifications,
    clipboard: services.clipboard,
    panels: services.panels,
    files: services.files,
    refocus: services.refocus,
    newHandle: services.newHandle
  });
  return { context, win, windows, focused, chrome, decorations, system, theme, notices, registry, services };
}

const rejection = async (promise: unknown) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
};

/** 同步调用或异步结果，统一当作 Promise 看错误码。 */
const codeOf = async (call: () => unknown) =>
  ((await rejection(Promise.resolve().then(call))) as DesktopError | undefined)?.code;

const sections: readonly DesktopMenu[] = [
  {
    label: 'File',
    items: [
      { id: 'open', label: 'Open…', key: '⌘O' },
      { type: 'separator' },
      { id: 'save', label: 'Save', disabled: true }
    ]
  },
  { label: 'View', items: [{ id: 'zoom', label: 'Zoom', checked: true }] }
];

describe('DesktopAppContext：默认拒绝', () => {
  it('什么都没声明：每个方法都是 CAPABILITY_DENIED，没有任何副作用，每次拒绝窗口里都有可见原因', async () => {
    const { context, win, windows, theme, chrome, notices, services } = setup({ capabilities: [] });
    const calls: [DesktopMethod, () => unknown][] = [
      ['window.getState', () => context.window.getState()],
      ['window.setTitle', () => context.window.setTitle('x')],
      ['window.minimize', () => context.window.minimize()],
      ['window.restore', () => context.window.restore()],
      ['window.toggleMaximize', () => context.window.toggleMaximize()],
      ['window.close', () => context.window.close()],
      ['window.setDecorations', () => context.window.setDecorations(true)],
      ['window.setDragRegions', () => context.window.setDragRegions([])],
      ['menu.set', () => context.menu.set(sections)],
      ['app.open', () => context.app.open('calculator')],
      ['app.focus', () => context.app.focus()],
      ['app.quit', () => context.app.quit()],
      ['appearance.get', () => context.appearance.get()],
      ['appearance.set', () => context.appearance.set({ appearance: 'dark' })],
      ['notification.post', () => context.notification.post({ title: 'T', body: 'B' })],
      ['clipboard.readText', () => context.clipboard.readText()],
      ['clipboard.writeText', () => context.clipboard.writeText('x')],
      ['filesystem.open', () => context.filesystem.open({})],
      ['filesystem.save', () => context.filesystem.save({ suggestedName: 'a.txt', bytes: new Uint8Array(1) })],
      ['filesystem.save', () => context.filesystem.save({ handle: 'h1', suggestedName: 'a', bytes: new Uint8Array(1) })]
    ];
    for (const [, call] of calls) expect(await codeOf(call)).toBe('CAPABILITY_DENIED');
    expect(notices.map(notice => notice.method)).toEqual(calls.map(([method]) => method));
    expect(notices.every(notice => notice.code === 'CAPABILITY_DENIED')).toBe(true);
    expect(notices[8]?.text).toBe('“Notes” isn’t allowed to use menu (menu.set).');
    expect(win.title()).toBe('Notes');
    expect(win.menus()).toBeNull();
    expect(
      Object.values(windows)
        .filter(vi.isMockFunction)
        .every(spy => spy.mock.calls.length === 0)
    ).toBe(true);
    expect(theme.setAppearance).not.toHaveBeenCalled();
    expect(chrome.setDecorations).not.toHaveBeenCalled();
    /* 通知中心、剪贴板、面板与磁盘一个也没被碰。 */
    expect(services.notifications.post).not.toHaveBeenCalled();
    expect(services.clipboard.readText).not.toHaveBeenCalled();
    expect(services.clipboard.writeText).not.toHaveBeenCalled();
    expect(services.panels.show).not.toHaveBeenCalled();
    expect(services.files.snapshot).not.toHaveBeenCalled();
    expect(services.files.replace).not.toHaveBeenCalled();
    expect(services.files.create).not.toHaveBeenCalled();
  });

  it('每个方法需要的能力来自 Orbit 的能力注册表：拿到了方法对应的能力就放行，别的能力不能代替', async () => {
    for (const capability of DESKTOP_CAPABILITIES) {
      const { context, services } = setup({ capabilities: [capability] });
      /* 放行的打开请求会弹出面板等用户：探测的是授权，所以弹出来就取消它。 */
      const cancelPanel = async (): Promise<void> => {
        for (let turn = 0; turn < 20 && !services.panels.top; turn++) await Promise.resolve();
        services.panels.top?.cancel();
      };
      const probes: Record<DesktopMethod, () => unknown> = {
        'window.getState': () => context.window.getState(),
        'window.setTitle': () => context.window.setTitle('x'),
        'window.minimize': () => context.window.minimize(),
        'window.restore': () => context.window.restore(),
        'window.toggleMaximize': () => context.window.toggleMaximize(),
        'window.close': () => context.window.close(),
        'window.setDecorations': () => context.window.setDecorations(true),
        'window.setDragRegions': () => context.window.setDragRegions([]),
        'menu.set': () => context.menu.set([]),
        'app.open': () => context.app.open('calculator'),
        'app.focus': () => context.app.focus(),
        'app.quit': () => context.app.quit(),
        'appearance.get': () => context.appearance.get(),
        'appearance.set': () => context.appearance.set({ accent: 'blue' }),
        'notification.post': () => context.notification.post({ title: 'T', body: 'B' }),
        'clipboard.readText': () => context.clipboard.readText(),
        'clipboard.writeText': () => context.clipboard.writeText('x'),
        'filesystem.open': () => {
          const opening = context.filesystem.open({});
          void cancelPanel();
          return opening;
        },
        'filesystem.save': () =>
          context.filesystem.save({ handle: 'nope', suggestedName: 'a', bytes: new Uint8Array(1) })
      };
      for (const [method, probe] of Object.entries(probes) as [DesktopMethod, () => unknown][]) {
        const allowed = DESKTOP_METHOD_CAPABILITIES[method] === capability;
        expect((await codeOf(probe)) === 'CAPABILITY_DENIED', `${capability} → ${method}`).toBe(!allowed);
      }
    }
  });

  it('订阅推送同样受清单约束：用对应读取方法的能力检查，拒绝时窗口里也有可见原因', () => {
    const { context, notices } = setup({ capabilities: [] });
    const throwsDenied = (subscribe: () => unknown) =>
      expect(subscribe).toThrow(expect.objectContaining({ name: 'DesktopError', code: 'CAPABILITY_DENIED' }));
    throwsDenied(() => context.window.onStateChange(() => undefined));
    throwsDenied(() => context.menu.onCommand(() => undefined));
    throwsDenied(() => context.appearance.onChange(() => undefined));
    expect(notices.map(notice => notice.method)).toEqual(['window.getState', 'menu.set', 'appearance.get']);
    const granted = setup({ capabilities: ['window', 'menu', 'appearance'] });
    expect(() => granted.context.window.onStateChange(() => undefined)).not.toThrow();
    expect(() => granted.context.menu.onCommand(() => undefined)).not.toThrow();
    expect(() => granted.context.appearance.onChange(() => undefined)).not.toThrow();
  });
});

describe('DesktopAppContext：window', () => {
  it('状态来自窗口自己：缩放、最小化、前台、标题栏显示，平台与外观取自清单', () => {
    const { context, win, focused, decorations } = setup();
    const read = () => context.windowState();
    expect(read()).toEqual({
      platform: 'macos',
      frame: 'transparent',
      decorations: true,
      focused: false,
      maximized: false,
      minimized: false
    });
    focused.set(win);
    win.zoomed.set(true);
    win.minimized.set(true);
    decorations.set(false);
    expect(read()).toEqual({
      platform: 'macos',
      frame: 'transparent',
      decorations: false,
      focused: true,
      maximized: true,
      minimized: true
    });
  });

  it('内置应用没有应用自绘的标题栏：状态里 decorations 恒为 true，frame 是 standard', () => {
    const registry = testApps();
    const win = new DesktopWindow('w2', registry.calculator, {}, { left: 0, top: 0, width: 1, height: 1 });
    const { windows } = fakeWindows();
    const system = new SystemState();
    const services = fakeHostServices();
    const context = new DesktopAppContext({
      win,
      capabilities: ALL,
      apps: registry,
      windows,
      system,
      theme: { setAppearance: vi.fn(), setAccent: vi.fn() },
      notify: vi.fn(),
      ...services
    });
    expect(context.windowState()).toMatchObject({ frame: 'standard', decorations: true });
  });

  it('getState 读到的就是当前状态；改标题只改自己的窗口；最小化、还原、缩放、关闭只作用于自己的窗口', async () => {
    const { context, win, windows } = setup();
    expect(await context.window.getState()).toEqual(context.windowState());
    await context.window.setTitle('Report.md — Aiao Code');
    expect(win.title()).toBe('Report.md — Aiao Code');
    await context.window.minimize();
    await context.window.restore();
    await context.window.toggleMaximize();
    await context.window.close();
    expect(windows.minimize).toHaveBeenCalledExactlyOnceWith('w1');
    expect(windows.unminimize).toHaveBeenCalledExactlyOnceWith('w1');
    expect(windows.zoom).toHaveBeenCalledExactlyOnceWith('w1');
    expect(windows.close).toHaveBeenCalledExactlyOnceWith('w1');
  });

  it('透明窗口的应用可以隐藏桌面标题栏并上报拖动区；标准窗口隐藏标题栏被拒绝', async () => {
    const transparent = setup();
    await transparent.context.window.setDecorations(false);
    expect(transparent.chrome.setDecorations).toHaveBeenCalledWith(false);
    const regions = [{ x: 0, y: 0, width: 800, height: 36, holes: [] }];
    await transparent.context.window.setDragRegions(regions);
    expect(transparent.chrome.setDragRegions).toHaveBeenCalledWith(regions);
    const standard = setup({ frame: 'standard' });
    expect(await codeOf(() => standard.context.window.setDecorations(false))).toBe('CAPABILITY_DENIED');
    await standard.context.window.setDecorations(true);
    expect(standard.chrome.setDecorations).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('没有窗口外观的窗口（内置应用）不能隐藏标题栏，也不接受拖动区；显式要求显示标题栏是空操作', async () => {
    const { context } = setup({ withChrome: false });
    expect(await codeOf(() => context.window.setDecorations(false))).toBe('CAPABILITY_DENIED');
    expect(await codeOf(() => context.window.setDragRegions([]))).toBe('CAPABILITY_DENIED');
  });

  it('参数在上下文里照样校验（内置应用直接调用也一样）：标题太长、拖动区非法都是 INVALID_ARGUMENT，窗口不变', async () => {
    const { context, win, notices } = setup();
    expect(await codeOf(() => context.window.setTitle('x'.repeat(257)))).toBe('INVALID_ARGUMENT');
    expect(await codeOf(() => context.window.setTitle(42 as never))).toBe('INVALID_ARGUMENT');
    expect(await codeOf(() => context.window.setDragRegions([{ x: 0, y: 0, width: -1, height: 1, holes: [] }]))).toBe(
      'INVALID_ARGUMENT'
    );
    expect(win.title()).toBe('Notes');
    expect(notices.map(notice => notice.code)).toEqual(['INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'INVALID_ARGUMENT']);
    expect(notices[0]?.text).toBe('“Notes” sent a request the desktop couldn’t accept (window.setTitle).');
  });

  it('窗口状态变化推给订阅者：推的是变化不是初始值，没变不重复推，退订后不再推', () => {
    const { context, win, focused } = setup();
    const seen: DesktopWindowState[] = [];
    const off = context.window.onStateChange(state => seen.push(state));
    context.publishWindow();
    expect(seen).toEqual([]);
    focused.set(win);
    context.publishWindow();
    context.publishWindow();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ focused: true });
    off();
    win.zoomed.set(true);
    context.publishWindow();
    expect(seen).toHaveLength(1);
  });
});

describe('DesktopAppContext：menu', () => {
  const entries = (_context: DesktopAppContext, win: DesktopWindow) => win.menus()?.() ?? [];

  it('登记的菜单落在这个窗口上，命令 ID 带 <appId>:<commandId> 命名空间，分隔线、禁用与勾选照搬', async () => {
    const { context, win } = setup();
    await context.menu.set(sections);
    const menus = entries(context, win);
    expect(menus.map(menu => menu.label)).toEqual(['File', 'View']);
    const file = menus[0]!.items;
    expect(file.map(item => (isMenuCommand(item) ? item.id : item))).toEqual(['notes:open', '-', 'notes:save']);
    expect(file[0]).toMatchObject({ id: 'notes:open', label: 'Open…', key: '⌘O' });
    expect(file[2]).toMatchObject({ disabled: true });
    expect(menus[1]!.items[0]).toMatchObject({ id: 'notes:zoom', checked: true });
  });

  it('点选菜单命令：应用收到自己登记的命令 ID（不带命名空间）；订阅可退订', async () => {
    const { context, win } = setup();
    const received: string[] = [];
    const off = context.menu.onCommand(commandId => received.push(commandId));
    await context.menu.set(sections);
    const open = entries(context, win)[0]!.items[0] as MenuCommand;
    open.run?.();
    expect(received).toEqual(['open']);
    off();
    open.run?.();
    expect(received).toEqual(['open']);
  });

  it('同一次登记里命令 ID 重复 → INVALID_ARGUMENT，已有的登记保持不变', async () => {
    const { context, win } = setup();
    await context.menu.set(sections);
    const duplicate: DesktopMenu[] = [
      {
        label: 'A',
        items: [
          { id: 'x', label: 'X' },
          { id: 'x', label: 'Again' }
        ]
      }
    ];
    expect(await codeOf(() => context.menu.set(duplicate))).toBe('INVALID_ARGUMENT');
    expect(entries(context, win).map(menu => menu.label)).toEqual(['File', 'View']);
  });

  it('再次登记替换内容而不是叠加；登记空数组撤销登记，菜单栏回到标准菜单', async () => {
    const { context, win } = setup();
    await context.menu.set(sections);
    const registered = win.menus();
    await context.menu.set([{ label: 'Only', items: [{ id: 'one', label: 'One' }] }]);
    expect(win.menus()).toBe(registered);
    expect(entries(context, win).map(menu => menu.label)).toEqual(['Only']);
    await context.menu.set([]);
    expect(win.menus()).toBeNull();
    await context.menu.set(sections);
    expect(win.menus()).not.toBeNull();
  });

  it('多窗口应用每个窗口各自登记：两个窗口的菜单互不影响', async () => {
    const first = setup();
    const second = setup();
    await first.context.menu.set(sections);
    await second.context.menu.set([{ label: 'Other', items: [{ id: 'x', label: 'X' }] }]);
    expect(entries(first.context, first.win).map(menu => menu.label)).toEqual(['File', 'View']);
    expect(entries(second.context, second.win).map(menu => menu.label)).toEqual(['Other']);
  });
});

describe('DesktopAppContext：app', () => {
  it('open 只接受清单里登记的应用：登记的应用打开普通窗口，未登记、系统入口、网址与带参数的写法都是 INVALID_ARGUMENT', async () => {
    const { context, windows, notices } = setup();
    await context.app.open('calculator');
    expect(windows.open).toHaveBeenCalledExactlyOnceWith('calculator');
    for (const bad of [
      'nosuchapp',
      'launchpad',
      'trash',
      'https://evil.example/',
      'calculator?file=a',
      'calculator/x',
      ''
    ]) {
      expect(await codeOf(() => context.app.open(bad)), bad).toBe('INVALID_ARGUMENT');
    }
    expect(windows.open).toHaveBeenCalledTimes(1);
    expect(notices.every(notice => notice.code === 'INVALID_ARGUMENT')).toBe(true);
  });

  it('登记了却打不开（没有可打开的窗口）也是 INVALID_ARGUMENT，不悄悄成功', async () => {
    const { context, windows } = setup();
    windows.open.mockReturnValueOnce(null);
    expect(await codeOf(() => context.app.open('textedit'))).toBe('INVALID_ARGUMENT');
  });

  it('focus 与 quit 只作用于调用方自己：最小化的窗口聚焦就是还原；quit 关闭自己应用的窗口', async () => {
    const { context, win, windows } = setup();
    await context.app.focus();
    expect(windows.focus).toHaveBeenCalledExactlyOnceWith('w1');
    win.minimized.set(true);
    await context.app.focus();
    expect(windows.unminimize).toHaveBeenCalledExactlyOnceWith('w1');
    await context.app.quit();
    expect(windows.quitApp).toHaveBeenCalledExactlyOnceWith('notes');
  });
});

describe('DesktopAppContext：appearance', () => {
  it('读取主题、显示模式与强调色；写入走主题服务（全局系统设置），值只接受登记的取值集合', async () => {
    const { context, system, theme, notices } = setup();
    expect(await context.appearance.get()).toEqual({ theme: 'light', appearance: 'light', accent: 'multi' });
    await context.appearance.set({ appearance: 'dark', accent: 'green' });
    expect(theme.setAppearance).toHaveBeenCalledExactlyOnceWith('dark');
    expect(theme.setAccent).toHaveBeenCalledExactlyOnceWith('green');
    expect(system.theme()).toBe('dark');
    expect(await context.appearance.get()).toEqual({ theme: 'dark', appearance: 'dark', accent: 'green' });
    for (const bad of [{ appearance: 'neon' }, { accent: 'teal' }, {}, { wallpaper: 'forest' }]) {
      expect(await codeOf(() => context.appearance.set(bad as never))).toBe('INVALID_ARGUMENT');
    }
    expect(theme.setAppearance).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(4);
  });

  it('只补丁一项就只改那一项', async () => {
    const { context, theme } = setup();
    await context.appearance.set({ accent: 'red' });
    expect(theme.setAppearance).not.toHaveBeenCalled();
    expect(theme.setAccent).toHaveBeenCalledExactlyOnceWith('red');
  });

  it('只有 appearance 可读不可写；只有 appearance:write 可写不可读', async () => {
    const readOnly = setup({ capabilities: ['appearance'] });
    expect(await readOnly.context.appearance.get()).toBeDefined();
    expect(await codeOf(() => readOnly.context.appearance.set({ accent: 'red' }))).toBe('CAPABILITY_DENIED');
    const writeOnly = setup({ capabilities: ['appearance:write'] });
    expect(await codeOf(() => writeOnly.context.appearance.get())).toBe('CAPABILITY_DENIED');
    await writeOnly.context.appearance.set({ accent: 'red' });
    expect(writeOnly.theme.setAccent).toHaveBeenCalledWith('red');
  });

  it('外观变化推给订阅者；没变不重复推；退订后不再推', () => {
    const { context, system } = setup();
    const seen: unknown[] = [];
    const off = context.appearance.onChange(next => seen.push(next));
    context.publishAppearance();
    system.accent.set('blue');
    context.publishAppearance();
    context.publishAppearance();
    expect(seen).toEqual([{ theme: 'light', appearance: 'light', accent: 'blue' }]);
    off();
    system.accent.set('pink');
    context.publishAppearance();
    expect(seen).toHaveLength(1);
  });
});

describe('DesktopAppContext：窗口关闭、实例销毁与重试', () => {
  it('窗口开始关闭：之后的调用都是 WINDOW_CLOSED（不弹提示），副作用一个也没有', async () => {
    const { context, win, windows, notices } = setup();
    win.state.set('closing');
    expect(context.live).toBe(false);
    expect(await codeOf(() => context.window.setTitle('late'))).toBe('WINDOW_CLOSED');
    expect(await codeOf(() => context.app.quit())).toBe('WINDOW_CLOSED');
    expect(await codeOf(() => context.menu.set(sections))).toBe('WINDOW_CLOSED');
    expect(win.title()).toBe('Notes');
    expect(windows.quitApp).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    win.state.set('closed');
    expect(await codeOf(() => context.window.getState())).toBe('WINDOW_CLOSED');
  });

  it('解绑：菜单撤销、订阅全部取消、之后的调用 WINDOW_CLOSED，订阅新事件也是；解绑幂等', async () => {
    const { context, win, system, focused } = setup();
    const seen: unknown[] = [];
    context.window.onStateChange(state => seen.push(state));
    context.appearance.onChange(next => seen.push(next));
    context.menu.onCommand(command => seen.push(command));
    await context.menu.set(sections);
    const open = win.menus()!()[0]!.items[0] as MenuCommand;
    const cleanup = vi.fn();
    context.onDispose(cleanup);
    context.dispose();
    context.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(win.menus()).toBeNull();
    system.accent.set('red');
    focused.set(win);
    context.publishWindow();
    context.publishAppearance();
    open.run?.();
    expect(seen).toEqual([]);
    expect(await codeOf(() => context.menu.set(sections))).toBe('WINDOW_CLOSED');
    expect(() => context.window.onStateChange(() => undefined)).toThrow(
      expect.objectContaining({ code: 'WINDOW_CLOSED' })
    );
    const late = vi.fn();
    context.onDispose(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('重试创建了新实例：旧上下文的迟到调用按实例 ID 丢弃（WINDOW_CLOSED），没有任何副作用；新实例的上下文不受影响', async () => {
    const { context: stale, win, windows, registry, system, theme, services } = setup();
    win.attempt++;
    expect(stale.live).toBe(false);
    expect(await codeOf(() => stale.window.setTitle('stale title'))).toBe('WINDOW_CLOSED');
    expect(await codeOf(() => stale.window.close())).toBe('WINDOW_CLOSED');
    expect(win.title()).toBe('Notes');
    expect(windows.close).not.toHaveBeenCalled();
    const fresh = new DesktopAppContext({
      win,
      capabilities: ALL,
      apps: registry,
      windows,
      system,
      theme,
      notify: vi.fn(),
      ...services
    });
    await fresh.window.setTitle('fresh title');
    expect(win.title()).toBe('fresh title');
    expect(await codeOf(() => stale.window.setTitle('stale again'))).toBe('WINDOW_CLOSED');
    expect(win.title()).toBe('fresh title');
  });
});

describe('可见的失败原因（拒绝、参数非法、超时可见；用户取消是正常结果）', () => {
  it('同一个错误对象只提示一次；USER_CANCELLED 与 WINDOW_CLOSED 之类不提示；超时提示带方法', () => {
    const { context, notices } = setup();
    const denied = new DesktopError('CAPABILITY_DENIED', 'x');
    context.report(denied, 'menu.set');
    context.report(denied, 'menu.set');
    context.report(new DesktopError('USER_CANCELLED', 'x'), 'app.focus');
    context.report(new DesktopError('WINDOW_CLOSED', 'x'), 'app.focus');
    context.report(new DesktopError('BUSY', 'x'), 'app.focus');
    context.report(new DesktopError('TIMEOUT', 'x'), 'app.focus');
    expect(notices).toEqual([
      { code: 'CAPABILITY_DENIED', method: 'menu.set', text: '“Notes” isn’t allowed to use menu (menu.set).' },
      {
        code: 'TIMEOUT',
        method: 'app.focus',
        text: '“Notes” didn’t get an answer from the desktop in time (app.focus).'
      }
    ]);
  });
});

describe('DesktopAppContexts：创建上下文并把窗口状态与外观的变化推给应用', () => {
  function bound(options: { capabilities?: readonly DesktopCapability[] } = {}) {
    const registry = apps();
    Object.assign(registry.notes, { capabilities: options.capabilities ?? ALL });
    const system = new SystemState();
    const { windows, focused } = fakeWindows();
    const theme = {
      setAppearance: vi.fn((mode: 'light' | 'dark' | 'auto') => system.appearance.set(mode)),
      setAccent: vi.fn()
    };
    const toast = { show: vi.fn() };
    /* 磁盘服务的替身：是 FileSystem 的实例（`instanceof` 能认出来），所以「上下文够得到磁盘」会被下面的检查抓住。 */
    const disk = Object.assign(Object.create(FileSystem.prototype) as FileSystem, {
      run: vi.fn(),
      changes: new Subject<readonly string[][]>()
    });
    configureServices([
      DesktopAppContexts,
      AppNotifications,
      FilePanels,
      { provide: DESKTOP_APPS, useValue: registry },
      { provide: WindowManager, useValue: windows },
      { provide: SystemState, useValue: system },
      { provide: ThemeService, useValue: theme },
      { provide: Toast, useValue: toast },
      { provide: FileSystem, useValue: disk }
    ]);
    const win = new DesktopWindow('w1', registry.notes, {}, { left: 0, top: 0, width: 600, height: 400 });
    win.attempt = 1;
    win.state.set('ready');
    return { contexts: TestBed.inject(DesktopAppContexts), win, system, focused, toast, windows, disk };
  }

  it('能力取自清单：声明了什么授予什么，其余默认拒绝；默认用桌面的提示条给出可见原因', async () => {
    const { contexts, win, toast } = bound({ capabilities: ['window'] });
    const context = contexts.bind(win);
    await context.window.setTitle('ok');
    expect(win.title()).toBe('ok');
    expect(await codeOf(() => context.menu.set(sections))).toBe('CAPABILITY_DENIED');
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('“Notes” isn’t allowed to use menu (menu.set).');
  });

  it('没有 capabilities 字段的应用什么能力也没有', async () => {
    const registry = testApps();
    const win = new DesktopWindow('w3', registry.calculator, {}, { left: 0, top: 0, width: 1, height: 1 });
    win.attempt = 1;
    win.state.set('ready');
    configureServices([
      DesktopAppContexts,
      AppNotifications,
      FilePanels,
      { provide: DESKTOP_APPS, useValue: registry },
      { provide: WindowManager, useValue: fakeWindows().windows },
      { provide: SystemState, useValue: new SystemState() },
      { provide: ThemeService, useValue: { setAppearance: vi.fn(), setAccent: vi.fn() } },
      { provide: Toast, useValue: { show: vi.fn() } },
      {
        provide: FileSystem,
        useValue: Object.assign(Object.create(FileSystem.prototype), { run: vi.fn(), changes: new Subject() })
      }
    ]);
    const context = TestBed.inject(DesktopAppContexts).bind(win);
    expect(await codeOf(() => context.window.getState())).toBe('CAPABILITY_DENIED');
  });

  it('窗口状态与外观变化由 effect 推给订阅者；解绑后 effect 销毁，不再推', () => {
    const { contexts, win, system, focused } = bound();
    const context = contexts.bind(win, { notify: vi.fn() });
    const states: DesktopWindowState[] = [];
    const looks: unknown[] = [];
    context.window.onStateChange(state => states.push(state));
    context.appearance.onChange(next => looks.push(next));
    TestBed.tick();
    expect(states).toEqual([]);
    focused.set(win);
    system.accent.set('green');
    TestBed.tick();
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ focused: true });
    expect(looks).toEqual([{ theme: 'light', appearance: 'light', accent: 'green' }]);
    context.dispose();
    win.zoomed.set(true);
    system.accent.set('red');
    TestBed.tick();
    expect(states).toHaveLength(1);
    expect(looks).toHaveLength(1);
  });

  it('远程应用拿不到磁盘、本地库、偏好与注入器：上下文能到达的对象里没有它们（remote-web 不拿 RxDB 仓储与 OPFS 句柄）', () => {
    const { contexts, win, system, disk } = bound();
    const forbidden: (abstract new (...args: never[]) => unknown)[] = [
      FileSystem,
      DesktopData,
      Preferences,
      EnvironmentInjector
    ];
    const context = contexts.bind(win, { chrome: fakeChrome().chrome });
    /* 沿自有的数据属性走遍能到达的对象（不调用 getter，函数的闭包本来就够不到）。 */
    const seen = new Set<object>();
    const walk = (value: unknown): void => {
      if (typeof value !== 'object' || value === null || seen.has(value)) return;
      seen.add(value);
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && 'value' in descriptor) walk(descriptor.value);
      }
    };
    walk(context);
    expect(seen.has(win)).toBe(true);
    expect(seen.has(system)).toBe(true);
    /* 磁盘服务确实被注入给了工厂，但上下文拿到的只有三个窄操作的闭包。 */
    expect(seen.has(disk)).toBe(false);
    expect([...seen].some(object => object instanceof SystemState)).toBe(true);
    for (const type of forbidden)
      expect(
        [...seen].some(object => object instanceof type),
        type.name
      ).toBe(false);
    expect(Object.keys(context.window).sort()).toEqual(
      [
        'close',
        'getState',
        'minimize',
        'onStateChange',
        'restore',
        'setDecorations',
        'setDragRegions',
        'setTitle',
        'toggleMaximize'
      ].sort()
    );
    expect(Object.keys(context.menu).sort()).toEqual(['onCommand', 'set']);
    expect(Object.keys(context.app).sort()).toEqual(['focus', 'open', 'quit']);
    expect(Object.keys(context.appearance).sort()).toEqual(['get', 'onChange', 'set']);
    expect(Object.keys(context.notification)).toEqual(['post']);
    expect(Object.keys(context.clipboard).sort()).toEqual(['readText', 'writeText']);
    expect(Object.keys(context.filesystem).sort()).toEqual(['open', 'save']);
  });
});

describe('DesktopAppContext：notification', () => {
  it('条目归属调用方：来源的名称与图标取自登记表，内容原样交给通知中心，回执带条目标识', async () => {
    const { context, services } = setup({ capabilities: ['notification'] });
    const receipt = await context.notification.post({
      title: 'Build finished',
      body: 'main is green',
      dedupeKey: 'ci'
    });
    expect(receipt).toEqual({ id: 'n1' });
    expect(services.notifications.post).toHaveBeenCalledExactlyOnceWith(
      { id: 'notes', name: 'Notes', icon: 'app-notes' },
      { title: 'Build finished', body: 'main is green', dedupeKey: 'ci' }
    );
  });

  it('应用不能冒名：请求里带的来源、应用 ID、名称都是不认识的字段（INVALID_ARGUMENT），通知中心没有被调用', async () => {
    const { context, services, notices } = setup({ capabilities: ['notification'] });
    for (const extra of [{ appId: 'mail' }, { app: 'Mail' }, { sender: 'Mail' }, { name: 'Mail' }])
      expect(
        await codeOf(() => context.notification.post({ title: 'T', body: 'B', ...extra } as never)),
        JSON.stringify(extra)
      ).toBe('INVALID_ARGUMENT');
    expect(services.notifications.post).not.toHaveBeenCalled();
    expect(notices).toHaveLength(4);
  });

  it('图标只能是桌面登记的图标（登记表里的应用图标）或内联图片；别的 ID 与网址是 INVALID_ARGUMENT，窗口里有可见原因', async () => {
    const { context, services, notices } = setup({ capabilities: ['notification'] });
    await context.notification.post({ title: 'T', body: '', icon: 'app-calculator' });
    await context.notification.post({ title: 'T', body: '', icon: 'data:image/png;base64,AAAA' });
    expect(services.notifications.post).toHaveBeenCalledTimes(2);
    for (const icon of ['app-nothing-registered', 'https://evil.example/x.png', 'f-folder'])
      expect(await codeOf(() => context.notification.post({ title: 'T', body: '', icon })), icon).toBe(
        'INVALID_ARGUMENT'
      );
    expect(services.notifications.post).toHaveBeenCalledTimes(2);
    expect(notices.map(notice => notice.code)).toEqual(['INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'INVALID_ARGUMENT']);
    expect(notices[0]?.text).toBe('“Notes” sent a request the desktop couldn’t accept (notification.post).');
  });

  it('标题、正文、去重键超过上限，或标题为空，都是 INVALID_ARGUMENT；通知中心没有被调用', async () => {
    const { context, services } = setup({ capabilities: ['notification'] });
    const { titleLength, bodyLength, dedupeKeyLength } = DESKTOP_LIMITS.notification;
    for (const bad of [
      { title: '', body: 'B' },
      { title: 'x'.repeat(titleLength + 1), body: 'B' },
      { title: 'T', body: 'x'.repeat(bodyLength + 1) },
      { title: 'T', body: 'B', dedupeKey: 'k'.repeat(dedupeKeyLength + 1) },
      { title: 'T' }
    ])
      expect(await codeOf(() => context.notification.post(bad as never))).toBe('INVALID_ARGUMENT');
    expect(services.notifications.post).not.toHaveBeenCalled();
  });

  it('频率超限：通知中心拒绝时是 RATE_LIMITED（只回给应用，窗口里不弹提示）', async () => {
    const { context, services, notices } = setup({ capabilities: ['notification'] });
    services.notifications.post.mockReturnValueOnce({ ok: false, reason: 'rate-limited' });
    const error = (await rejection(
      Promise.resolve().then(() => context.notification.post({ title: 'T', body: 'B' }))
    )) as DesktopError;
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toContain(String(DESKTOP_LIMITS.notification.perMinute));
    expect(notices).toEqual([]);
  });

  it('已提交的通知不随窗口关闭撤回：窗口关闭、上下文解绑之后，通知中心里它还在，之后再提交是 WINDOW_CLOSED', async () => {
    const store = new AppNotifications();
    const { context, win, services } = setup({ capabilities: ['notification'] });
    services.notifications.post.mockImplementation((source, content) => store.post(source, content));
    await context.notification.post({ title: 'Stays', body: 'in the centre' });
    win.state.set('closing');
    context.dispose();
    expect(store.entries().map(entry => entry.title)).toEqual(['Stays']);
    expect(await codeOf(() => context.notification.post({ title: 'Late', body: '' }))).toBe('WINDOW_CLOSED');
    expect(store.entries()).toHaveLength(1);
  });
});

describe('DesktopAppContext：clipboard', () => {
  const denied = (name: 'NotAllowedError' | 'SecurityError') => new DOMException('browser says no', name);

  it('读取：文本来自浏览器的剪贴板；读与写分别声明', async () => {
    const { context, services } = setup({ capabilities: ['clipboard:read'] });
    expect(await context.clipboard.readText()).toBe('clipboard text');
    expect(services.clipboard.readText).toHaveBeenCalledOnce();
    expect(await codeOf(() => context.clipboard.writeText('x'))).toBe('CAPABILITY_DENIED');
    expect(services.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('读取被浏览器拒绝（权限提示被拒、没有焦点、没有异步剪贴板）是 BROWSER_PERMISSION_DENIED，只回给应用；别的错误原样抛出', async () => {
    const { context, services, notices } = setup({ capabilities: ['clipboard:read'] });
    services.clipboard.readText.mockRejectedValueOnce(denied('NotAllowedError'));
    expect(await codeOf(() => context.clipboard.readText())).toBe('BROWSER_PERMISSION_DENIED');
    services.clipboard.readText.mockRejectedValueOnce(denied('SecurityError'));
    expect(await codeOf(() => context.clipboard.readText())).toBe('BROWSER_PERMISSION_DENIED');
    expect(notices).toEqual([]);
    services.clipboard.readText.mockRejectedValueOnce(new TypeError('not a permission problem'));
    expect(await rejection(context.clipboard.readText())).toBeInstanceOf(TypeError);
  });

  it('权限提示开着的时候窗口关了：用户剪贴板里的内容不交给已经关闭的窗口，请求以 WINDOW_CLOSED 结束', async () => {
    const { context, services, win } = setup({ capabilities: ['clipboard:read'] });
    let answer!: (text: string) => void;
    services.clipboard.readText.mockImplementationOnce(() => new Promise<string>(resolve => (answer = resolve)));
    const pending = codeOf(() => context.clipboard.readText());
    await Promise.resolve();
    win.state.set('closing');
    context.dispose();
    answer('secret from the user clipboard');
    expect(await pending).toBe('WINDOW_CLOSED');
  });

  it('写入要求用户手势：有手势才写；没有手势是 BROWSER_PERMISSION_DENIED，浏览器的写入接口一次也没被调用（宿主不替用户写）', async () => {
    const { context, services, notices } = setup({ capabilities: ['clipboard:write'] });
    await context.clipboard.writeText('with a gesture');
    expect(services.clipboard.writeText).toHaveBeenCalledExactlyOnceWith('with a gesture');
    services.clipboard.userActive.mockReturnValue(false);
    const error = (await rejection(context.clipboard.writeText('no gesture'))) as DesktopError;
    expect(error.code).toBe('BROWSER_PERMISSION_DENIED');
    expect(error.message).toContain('用户手势');
    expect(services.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([]);
  });

  it('有手势但浏览器仍然拒绝写入（权限被拒）：BROWSER_PERMISSION_DENIED；空文本也是合法的写入', async () => {
    const { context, services } = setup({ capabilities: ['clipboard:write'] });
    services.clipboard.writeText.mockRejectedValueOnce(denied('NotAllowedError'));
    expect(await codeOf(() => context.clipboard.writeText('x'))).toBe('BROWSER_PERMISSION_DENIED');
    await context.clipboard.writeText('');
    expect(services.clipboard.writeText).toHaveBeenLastCalledWith('');
  });

  it('文本超过上限或不是文字：INVALID_ARGUMENT，窗口里有可见原因，浏览器没有被调用', async () => {
    const { context, services, notices } = setup({ capabilities: ['clipboard:write'] });
    expect(await codeOf(() => context.clipboard.writeText('x'.repeat(DESKTOP_LIMITS.clipboard.textLength + 1)))).toBe(
      'INVALID_ARGUMENT'
    );
    expect(await codeOf(() => context.clipboard.writeText(42 as never))).toBe('INVALID_ARGUMENT');
    expect(services.clipboard.userActive).not.toHaveBeenCalled();
    expect(services.clipboard.writeText).not.toHaveBeenCalled();
    expect(notices.map(notice => notice.method)).toEqual(['clipboard.writeText', 'clipboard.writeText']);
  });

  it('窗口关闭之后的读写都是 WINDOW_CLOSED，浏览器没有被调用', async () => {
    const { context, services, win } = setup({ capabilities: ['clipboard:read', 'clipboard:write'] });
    win.state.set('closed');
    expect(await codeOf(() => context.clipboard.readText())).toBe('WINDOW_CLOSED');
    expect(await codeOf(() => context.clipboard.writeText('x'))).toBe('WINDOW_CLOSED');
    expect(services.clipboard.readText).not.toHaveBeenCalled();
    expect(services.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe('DesktopAppContext：filesystem', () => {
  const READ: readonly DesktopCapability[] = ['filesystem:read'];
  const BOTH: readonly DesktopCapability[] = ['filesystem:read', 'filesystem:write'];
  const DOC = ['Users', 'prasenjit', 'Documents', 'note.md'];
  const bytes = (text: string) => new TextEncoder().encode(text);

  /** 等面板弹出来（请求经几个微任务才走到 `panels.show`）。 */
  const shown = async (services: ReturnType<typeof setup>['services'], count = 1) => {
    for (let turn = 0; turn < 20 && services.panels.shown.length < count; turn++) await Promise.resolve();
    return services.panels.shown[count - 1]!;
  };

  it('打开：弹出打开面板（带上谁在请求、类型过滤、大小上限），用户选定后返回内容快照、凭证与版本', async () => {
    const { context, services } = setup({ capabilities: READ });
    const opening = context.filesystem.open({ accept: ['.md'] });
    const panel = await shown(services);
    expect(panel.request).toMatchObject({
      mode: 'open',
      app: { id: 'notes', name: 'Notes', icon: 'app-notes' },
      accept: ['.md'],
      maxBytes: DESKTOP_LIMITS.filesystem.bytes,
      nameLength: DESKTOP_LIMITS.filesystem.nameLength,
      restoreFocus: services.refocus
    });
    expect(services.files.snapshot).not.toHaveBeenCalled();
    panel.submit({ kind: 'open', path: DOC });
    expect(await opening).toEqual({
      name: 'note.md',
      mime: 'text/markdown',
      size: 5,
      bytes: bytes('hello'),
      handle: 'h1',
      version: '1000:5'
    });
    expect(services.files.snapshot).toHaveBeenCalledExactlyOnceWith(DOC, DESKTOP_LIMITS.filesystem.bytes);
  });

  it('省略 accept 就不过滤；应用拿不到面板之外的任何文件：磁盘只读用户选定的那一个路径', async () => {
    const { context, services } = setup({ capabilities: READ });
    const opening = context.filesystem.open({});
    const panel = await shown(services);
    expect(panel.request.accept).toEqual([]);
    panel.submit({ kind: 'open', path: DOC });
    await opening;
    expect(services.files.snapshot.mock.calls.map(([path]) => path)).toEqual([DOC]);
  });

  it('用户取消（取消按钮、Esc）：USER_CANCELLED，桌面不弹错误，不碰磁盘；取消之后可以再开一个面板', async () => {
    const { context, services, notices } = setup({ capabilities: BOTH });
    const first = codeOf(() => context.filesystem.open({}));
    (await shown(services)).cancel();
    expect(await first).toBe('USER_CANCELLED');
    const second = codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') }));
    (await shown(services, 2)).cancel();
    expect(await second).toBe('USER_CANCELLED');
    expect(notices).toEqual([]);
    expect(services.files.snapshot).not.toHaveBeenCalled();
    expect(services.files.create).not.toHaveBeenCalled();
    expect(services.files.replace).not.toHaveBeenCalled();
  });

  it('同一实例同一时刻只开一个面板：重复请求（打开或保存）是 BUSY，不弹第二个面板；第一个结束后又可以请求', async () => {
    const { context, services } = setup({ capabilities: BOTH });
    const first = context.filesystem.open({});
    const panel = await shown(services);
    expect(await codeOf(() => context.filesystem.open({}))).toBe('BUSY');
    expect(await codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') }))).toBe('BUSY');
    expect(services.panels.show).toHaveBeenCalledTimes(1);
    panel.submit({ kind: 'open', path: DOC });
    await first;
    const again = context.filesystem.open({});
    (await shown(services, 2)).cancel();
    expect(await codeOf(() => again)).toBe('USER_CANCELLED');
  });

  it('带凭证的保存不开面板，所以不受 BUSY 影响：面板开着的时候，已授权的文件仍可以保存', async () => {
    const { context, services } = setup({ capabilities: BOTH });
    const opening = context.filesystem.open({});
    (await shown(services)).submit({ kind: 'open', path: DOC });
    const file = await opening;
    const second = context.filesystem.open({});
    const panel = await shown(services, 2);
    const saved = await context.filesystem.save({
      handle: file.handle,
      suggestedName: 'x',
      bytes: bytes('new'),
      expectedVersion: file.version
    });
    expect(saved.handle).toBe(file.handle);
    panel.cancel();
    await rejection(second);
  });

  it('等用户的那一段交给计时控制（不计入宿主的处理时限），选定之后读磁盘不在那一段里', async () => {
    const { context, services } = setup({ capabilities: READ });
    const { interaction, waiting, waits } = recordingInteraction();
    const duringRead: boolean[] = [];
    services.files.snapshot.mockImplementation(async () => {
      duringRead.push(waiting());
      return SNAPSHOT;
    });
    const opening = context.filesystem.open({}, interaction);
    const panel = await shown(services);
    expect(waiting()).toBe(true);
    panel.submit({ kind: 'open', path: DOC });
    await opening;
    expect(waits()).toBe(1);
    expect(waiting()).toBe(false);
    expect(duringRead).toEqual([false]);
  });

  it('选定之后文件已被删除或改名：FILE_NOT_FOUND；已超过大小上限：FILE_TOO_LARGE；都不发凭证', async () => {
    const { context, services } = setup({ capabilities: READ });
    services.files.snapshot.mockResolvedValueOnce({ kind: 'missing' });
    const missing = codeOf(() => context.filesystem.open({}));
    (await shown(services)).submit({ kind: 'open', path: DOC });
    expect(await missing).toBe('FILE_NOT_FOUND');
    services.files.snapshot.mockResolvedValueOnce({ kind: 'too-large', size: 999_999 });
    const large = codeOf(() => context.filesystem.open({}));
    (await shown(services, 2)).submit({ kind: 'open', path: DOC });
    expect(await large).toBe('FILE_TOO_LARGE');
    const retry = context.filesystem.open({});
    (await shown(services, 3)).submit({ kind: 'open', path: DOC });
    expect((await retry).handle).toBe('h1');
  });

  it('面板还开着时窗口关闭：面板随之关闭，请求以 WINDOW_CLOSED 结束，磁盘一次也没被读写', async () => {
    const { context, services, win, notices } = setup({ capabilities: BOTH });
    const opening = codeOf(() => context.filesystem.open({}));
    const panel = await shown(services);
    win.state.set('closing');
    context.dispose();
    expect(panel.closed).toBe(true);
    expect(await opening).toBe('WINDOW_CLOSED');
    const saving = codeOf(() => context.filesystem.save({ suggestedName: 'a', bytes: bytes('x') }));
    expect(await saving).toBe('WINDOW_CLOSED');
    expect(services.files.snapshot).not.toHaveBeenCalled();
    expect(services.files.create).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it('保存面板开着时窗口关闭：面板随之关闭，就算用户在关闭的同一刻选定，也不提交任何写入', async () => {
    const { context, services, win } = setup({ capabilities: BOTH });
    const saving = codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') }));
    const panel = await shown(services);
    win.state.set('closing');
    panel.submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: true });
    expect(await saving).toBe('WINDOW_CLOSED');
    expect(services.files.create).not.toHaveBeenCalled();
  });

  it('选定之后、读磁盘期间窗口关了：WINDOW_CLOSED，不发凭证', async () => {
    const { context, services, win } = setup({ capabilities: READ });
    services.files.snapshot.mockImplementationOnce(async () => {
      win.state.set('closing');
      return SNAPSHOT;
    });
    const opening = codeOf(() => context.filesystem.open({}));
    (await shown(services)).submit({ kind: 'open', path: DOC });
    expect(await opening).toBe('WINDOW_CLOSED');
  });

  describe('带凭证的保存', () => {
    async function opened(capabilities = BOTH) {
      const context = setup({ capabilities });
      const opening = context.context.filesystem.open({});
      (await shown(context.services)).submit({ kind: 'open', path: DOC });
      return { ...context, file: await opening };
    }

    it('①写回同一个文件，带着打开时的版本，返回新版本，凭证不变；不弹面板、不再请用户确认', async () => {
      const { context, services, file } = await opened();
      const saved = await context.filesystem.save({
        handle: file.handle,
        suggestedName: 'ignored.txt',
        bytes: bytes('edited'),
        expectedVersion: file.version
      });
      expect(saved).toEqual({ name: 'note.md', version: '2000:7', handle: file.handle });
      expect(services.files.replace).toHaveBeenCalledExactlyOnceWith(DOC, bytes('edited'), {
        modified: 1_000,
        size: 5
      });
      expect(services.panels.show).toHaveBeenCalledTimes(1);
      /* suggestedName 不能换目标：写的仍是打开的那个路径。 */
      expect(services.files.create).not.toHaveBeenCalled();
    });

    it('省略 expectedVersion 就不比对（应用明确选择覆盖），仍只写回这一个文件', async () => {
      const { context, services, file } = await opened();
      await context.filesystem.save({ handle: file.handle, suggestedName: 'x', bytes: bytes('y') });
      expect(services.files.replace).toHaveBeenCalledExactlyOnceWith(DOC, bytes('y'), undefined);
    });

    it('③磁盘上的文件已被改动：FILE_CHANGED，不写入；凭证仍然有效，应用可以改走另存或重新打开', async () => {
      const { context, services, file } = await opened();
      services.files.replace.mockResolvedValueOnce({ kind: 'changed' });
      expect(
        await codeOf(() =>
          context.filesystem.save({
            handle: file.handle,
            suggestedName: 'x',
            bytes: bytes('y'),
            expectedVersion: file.version
          })
        )
      ).toBe('FILE_CHANGED');
      expect(
        await context.filesystem.save({ handle: file.handle, suggestedName: 'x', bytes: bytes('y') })
      ).toMatchObject({ handle: file.handle });
    });

    it('③文件已被删除或改名：FILE_NOT_FOUND，不写入也不在原路径新建（上下文从不对这个路径调用创建）', async () => {
      const { context, services, file } = await opened();
      services.files.replace.mockResolvedValueOnce({ kind: 'missing' });
      const error = (await rejection(
        context.filesystem.save({
          handle: file.handle,
          suggestedName: 'x',
          bytes: bytes('y'),
          expectedVersion: file.version
        })
      )) as DesktopError;
      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.message).toContain('没有在原位置新建');
      expect(services.files.create).not.toHaveBeenCalled();
    });

    it('④不认识的凭证、别的窗口实例拿到的凭证：HANDLE_INVALID，磁盘不变', async () => {
      const first = await opened();
      const second = setup({ capabilities: BOTH });
      const request = { suggestedName: 'x', bytes: bytes('y') };
      expect(await codeOf(() => first.context.filesystem.save({ ...request, handle: 'made-up' }))).toBe(
        'HANDLE_INVALID'
      );
      expect(await codeOf(() => second.context.filesystem.save({ ...request, handle: first.file.handle }))).toBe(
        'HANDLE_INVALID'
      );
      expect(second.services.files.replace).not.toHaveBeenCalled();
      expect(first.services.files.replace).not.toHaveBeenCalled();
      /* 自己的凭证不受影响。 */
      expect((await first.context.filesystem.save({ ...request, handle: first.file.handle })).handle).toBe(
        first.file.handle
      );
    });

    it('④窗口关闭之后：旧上下文是 WINDOW_CLOSED；换成新实例的上下文用旧凭证是 HANDLE_INVALID，磁盘不变', async () => {
      const { context: old, win, registry, windows, system, theme, services, file } = await opened();
      win.state.set('closing');
      old.dispose();
      expect(
        await codeOf(() => old.filesystem.save({ handle: file.handle, suggestedName: 'x', bytes: bytes('y') }))
      ).toBe('WINDOW_CLOSED');
      win.state.set('ready');
      win.attempt++;
      const renewed = new DesktopAppContext({
        win,
        capabilities: BOTH,
        apps: registry,
        windows,
        system,
        theme,
        notify: vi.fn(),
        ...services
      });
      expect(
        await codeOf(() => renewed.filesystem.save({ handle: file.handle, suggestedName: 'x', bytes: bytes('y') }))
      ).toBe('HANDLE_INVALID');
      expect(services.files.replace).not.toHaveBeenCalled();
    });

    it('重试出了新实例：旧上下文的迟到保存按实例 ID 丢弃（WINDOW_CLOSED），磁盘不变', async () => {
      const { context, win, services, file } = await opened();
      win.attempt++;
      expect(
        await codeOf(() => context.filesystem.save({ handle: file.handle, suggestedName: 'x', bytes: bytes('late') }))
      ).toBe('WINDOW_CLOSED');
      expect(services.files.replace).not.toHaveBeenCalled();
      expect(services.files.create).not.toHaveBeenCalled();
    });

    it('只有 filesystem:write 也能带凭证保存（凭证来自自己另存的文件）；只有 filesystem:read 不能保存', async () => {
      const writeOnly = setup({ capabilities: ['filesystem:write'] });
      const saving = writeOnly.context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') });
      (await shown(writeOnly.services)).submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: false });
      const saved = await saving;
      expect(
        await writeOnly.context.filesystem.save({ handle: saved.handle, suggestedName: 'a.txt', bytes: bytes('x2') })
      ).toMatchObject({ name: 'a.txt' });
      const readOnly = await opened(READ);
      expect(
        await codeOf(() =>
          readOnly.context.filesystem.save({ handle: readOnly.file.handle, suggestedName: 'x', bytes: bytes('y') })
        )
      ).toBe('CAPABILITY_DENIED');
    });
  });

  describe('不带凭证的保存（保存面板）', () => {
    it('②弹出保存面板（预填建议的名字），用户选位置并确认覆盖才写；返回新文件的凭证，之后可以带凭证保存', async () => {
      const { context, services } = setup({ capabilities: BOTH });
      const saving = context.filesystem.save({ suggestedName: 'draft.txt', bytes: bytes('payload') });
      const panel = await shown(services);
      expect(panel.request).toMatchObject({ mode: 'save', suggestedName: 'draft.txt', accept: [] });
      expect(services.files.create).not.toHaveBeenCalled();
      panel.submit({ kind: 'save', dir: ['Users', 'prasenjit', 'Desktop'], name: 'final.txt', replace: true });
      const saved = await saving;
      expect(saved).toEqual({ name: 'final.txt', version: '3000:7', handle: 'h1' });
      expect(services.files.create).toHaveBeenCalledExactlyOnceWith(
        ['Users', 'prasenjit', 'Desktop', 'final.txt'],
        bytes('payload'),
        true
      );
      await context.filesystem.save({ handle: saved.handle, suggestedName: 'x', bytes: bytes('again') });
      expect(services.files.replace).toHaveBeenCalledExactlyOnceWith(
        ['Users', 'prasenjit', 'Desktop', 'final.txt'],
        bytes('again'),
        undefined
      );
    });

    it('应用不能跳过确认：用户没有确认覆盖（replace 为 false）时，传给磁盘的就是「不覆盖」', async () => {
      const { context, services } = setup({ capabilities: BOTH });
      const saving = context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') });
      (await shown(services)).submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: false });
      await saving;
      expect(services.files.create).toHaveBeenCalledWith(['Users', 'a.txt'], bytes('x'), false);
    });

    it('选定之后目标位置出现了别的内容：FILE_CHANGED；目标文件夹已被删除：FILE_NOT_FOUND；都没写、都不发凭证', async () => {
      const { context, services } = setup({ capabilities: BOTH });
      services.files.create.mockResolvedValueOnce({ kind: 'exists' });
      const exists = codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') }));
      (await shown(services)).submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: false });
      expect(await exists).toBe('FILE_CHANGED');
      services.files.create.mockResolvedValueOnce({ kind: 'missing-folder' });
      const gone = codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') }));
      (await shown(services, 2)).submit({ kind: 'save', dir: ['Users', 'Gone'], name: 'a.txt', replace: false });
      expect(await gone).toBe('FILE_NOT_FOUND');
      const fine = context.filesystem.save({ suggestedName: 'a.txt', bytes: bytes('x') });
      (await shown(services, 3)).submit({ kind: 'save', dir: ['Users'], name: 'a.txt', replace: false });
      expect((await fine).handle).toBe('h1');
    });

    it('内容超过 512 KiB 是 FILE_TOO_LARGE（不弹面板）；文件名非法是 INVALID_ARGUMENT', async () => {
      const { context, services, notices } = setup({ capabilities: BOTH });
      const tooLarge = new Uint8Array(DESKTOP_LIMITS.filesystem.bytes + 1);
      expect(await codeOf(() => context.filesystem.save({ suggestedName: 'a.txt', bytes: tooLarge }))).toBe(
        'FILE_TOO_LARGE'
      );
      expect(await codeOf(() => context.filesystem.save({ suggestedName: '../etc/passwd', bytes: bytes('x') }))).toBe(
        'INVALID_ARGUMENT'
      );
      expect(services.panels.show).not.toHaveBeenCalled();
      expect(notices.map(notice => notice.code)).toEqual(['INVALID_ARGUMENT']);
    });
  });
});
