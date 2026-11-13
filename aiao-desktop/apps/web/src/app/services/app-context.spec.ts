import type {
  DesktopAccent,
  DesktopCapability,
  DesktopMenu,
  DesktopMethod,
  DesktopWindowState
} from '@aiao/orbit/desktop';
import { DESKTOP_CAPABILITIES, DESKTOP_METHOD_CAPABILITIES, DesktopError } from '@aiao/orbit/desktop';
import { EnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { fakeWindows } from '../testing/fake-windows';
import { AppContextChrome, DesktopAppContext, DesktopAppContexts, DesktopNotice } from './app-context';
import { DESKTOP_APPS, DesktopAppRegistry } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { FileSystem } from './file-system';
import { MenuCommand, isMenuCommand } from './menu';
import { SystemState } from './system-state';
import { ThemeService } from './theme';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

/** 全部第一批能力。 */
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
  const context = new DesktopAppContext({
    win,
    capabilities,
    apps: registry,
    windows,
    system,
    theme,
    chrome: withChrome ? chrome : undefined,
    notify: notice => notices.push(notice)
  });
  return { context, win, windows, focused, chrome, decorations, system, theme, notices, registry };
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
    const { context, win, windows, theme, chrome, notices } = setup({ capabilities: [] });
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
      ['appearance.set', () => context.appearance.set({ appearance: 'dark' })]
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
  });

  it('每个方法需要的能力来自 Orbit 的能力注册表：拿到了方法对应的能力就放行，别的能力不能代替', async () => {
    for (const capability of DESKTOP_CAPABILITIES) {
      const { context } = setup({ capabilities: [capability] });
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
        'appearance.set': () => context.appearance.set({ accent: 'blue' })
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
    const context = new DesktopAppContext({
      win,
      capabilities: ALL,
      apps: registry,
      windows,
      system,
      theme: { setAppearance: vi.fn(), setAccent: vi.fn() },
      notify: vi.fn()
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
    const { context: stale, win, windows, registry, system, theme } = setup();
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
      notify: vi.fn()
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
    configureServices([
      DesktopAppContexts,
      { provide: DESKTOP_APPS, useValue: registry },
      { provide: WindowManager, useValue: windows },
      { provide: SystemState, useValue: system },
      { provide: ThemeService, useValue: theme },
      { provide: Toast, useValue: toast }
    ]);
    const win = new DesktopWindow('w1', registry.notes, {}, { left: 0, top: 0, width: 600, height: 400 });
    win.attempt = 1;
    win.state.set('ready');
    return { contexts: TestBed.inject(DesktopAppContexts), win, system, focused, toast, windows };
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
      { provide: DESKTOP_APPS, useValue: registry },
      { provide: WindowManager, useValue: fakeWindows().windows },
      { provide: SystemState, useValue: new SystemState() },
      { provide: ThemeService, useValue: { setAppearance: vi.fn(), setAccent: vi.fn() } },
      { provide: Toast, useValue: { show: vi.fn() } }
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
    const { contexts, win, system } = bound();
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
  });
});
