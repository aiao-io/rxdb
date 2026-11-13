import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { StubApp, testApps } from '../testing/desktop-apps';
import { ApplicationRuntime } from './application-runtime';
import { AppLoader, DESKTOP_APPS, DesktopAppId, DesktopAppRegistry } from './desktop-apps';
import { DesktopWindow, WindowBox } from './desktop-window';
import { DockState } from './dock-state';
import { Toast } from './toast';
import { WindowManager, WindowRestoreSpec } from './window-manager';

const BOX: WindowBox = { left: 100, top: 80, width: 600, height: 400 };

/** 装载函数的 spy：用来断言“恢复时没有请求应用载荷”。 */
const loaders = () => {
  const calls = new Map<DesktopAppId, ReturnType<typeof vi.fn<AppLoader>>>();
  const apps = testApps({ terminal: { restore: 'deferred' } });
  const spied = Object.fromEntries(
    Object.entries(apps).map(([id, app]) => {
      if (!app.load) return [id, app];
      const load = vi.fn<AppLoader>(async () => StubApp);
      calls.set(id as DesktopAppId, load);
      return [id, { ...app, load }];
    })
  ) as unknown as DesktopAppRegistry;
  return { apps: spied, calls };
};

function setup(width = 1440, height = 900) {
  stubViewport(width, height);
  const { apps, calls } = loaders();
  const dom = configureServices([
    WindowManager,
    DockState,
    Toast,
    ApplicationRuntime,
    { provide: DESKTOP_APPS, useValue: apps }
  ]);
  const dock = { bounce: vi.fn(), stopBounce: vi.fn(), focusApp: vi.fn() };
  TestBed.inject(DockState).attach({ ...dock, rectFor: () => ({ x: 0, y: 0, w: 48, h: 48 }) });
  return { wm: TestBed.inject(WindowManager), calls, dock, dom };
}

const spec = (appId: DesktopAppId, overrides: Partial<WindowRestoreSpec> = {}): WindowRestoreSpec => ({
  appId,
  options: {},
  box: BOX,
  minimized: false,
  zoomed: false,
  layer: 11,
  foreground: false,
  ...overrides
});

function restore(wm: WindowManager, item: WindowRestoreSpec): DesktopWindow {
  const win = wm.restore(item);
  if (!win) throw new Error(`${item.appId} 应该能恢复`);
  return win;
}

/** 模拟窗口框架组件：最小化与还原的状态变化与真实框架一致，只是不等动画。 */
function attachFrame(wm: WindowManager, win: DesktopWindow) {
  const frame = {
    minimize: vi.fn(() => win.minimized.set(true)),
    restore: vi.fn(() => {
      win.minimized.set(false);
      win.hidden.set(false);
      wm.raise(win);
      wm.focus(win.id);
    }),
    toggleZoom: vi.fn(),
    keepOnScreen: vi.fn(),
    focusContent: vi.fn(),
    holdsFocus: vi.fn(() => false)
  };
  win.frame = frame;
  return frame;
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WindowManager 预留层叠位置', () => {
  it('reserveLayers 返回区间起点，连续预留互不重叠；之后新开的窗口都在预留区间之上', () => {
    const { wm } = setup();
    const first = wm.reserveLayers(3);
    const second = wm.reserveLayers(2);
    expect(second).toBe(first + 3);
    const opened = wm.open('notes');
    expect(opened?.zIndex()).toBeGreaterThan(second + 2);
  });

  it('预留 0 个位置什么也不占', () => {
    const { wm } = setup();
    expect(wm.reserveLayers(0)).toBe(wm.reserveLayers(0));
  });
});

describe('WindowManager 按布局记录重建窗口', () => {
  it('窗口登记在列表里，参数原样交给应用，层叠位置取记录的，不弹跳 Dock 图标也没有开窗动画', () => {
    const { wm, dock } = setup();
    const options = { path: ['Macintosh HD', 'Users'] };
    const win = restore(wm, spec('finder', { options, layer: 17 }));
    expect(wm.windows()).toEqual([win]);
    expect(win.appId).toBe('finder');
    expect(win.options).toBe(options);
    expect(win.zIndex()).toBe(17);
    expect(win.opening()).toBe(false);
    expect(win.closing()).toBe(false);
    expect(dock.bounce).not.toHaveBeenCalled();
    expect(wm.runningApps()).toEqual(new Set(['finder']));
  });

  it('桌面启动期间恢复出来的窗口是 quiet 的：不抢键盘焦点，页面刚打开时第一次 Tab 仍从菜单栏开始（ADESK-US-108）', () => {
    const { wm } = setup();
    expect(restore(wm, spec('notes')).quiet).toBe(true);
    wm.started = true;
    expect(restore(wm, spec('calculator')).quiet).toBe(false);
  });

  it('同一个应用可以恢复多个窗口，单实例应用的两个窗口也各自重建（不走“已打开就复用”）', () => {
    const { wm } = setup();
    const a = restore(wm, spec('notes', { layer: 11 }));
    const b = restore(wm, spec('notes', { layer: 12 }));
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
    expect(wm.byApp('notes')).toEqual([a, b]);
  });

  it('层叠只看记录的位置，不看恢复的先后：先恢复的前台窗口也在最上面', () => {
    const { wm } = setup();
    const base = wm.reserveLayers(3);
    const top = restore(wm, spec('calculator', { layer: base + 3, foreground: true }));
    const bottom = restore(wm, spec('finder', { layer: base + 1 }));
    const middle = restore(wm, spec('notes', { layer: base + 2 }));
    expect(top.zIndex()).toBeGreaterThan(middle.zIndex());
    expect(middle.zIndex()).toBeGreaterThan(bottom.zIndex());
    expect(wm.front()).toBe(top);
  });

  it('窗口列表也按层叠位置排：先恢复前台窗口，列表里它仍排在后面（byApp 的“最后一个”就是最靠前的）', () => {
    const { wm } = setup();
    const base = wm.reserveLayers(3);
    const top = restore(wm, spec('finder', { layer: base + 3, foreground: true }));
    const bottom = restore(wm, spec('finder', { layer: base + 1 }));
    const middle = restore(wm, spec('finder', { layer: base + 2 }));
    expect(wm.windows()).toEqual([bottom, middle, top]);
    expect(wm.byApp('finder').at(-1)).toBe(top);
    const later = wm.open('notes');
    expect(wm.windows().at(-1)).toBe(later);
  });

  it('前台窗口拿到焦点和菜单栏；非前台窗口恢复时不抢焦点', () => {
    const { wm } = setup();
    const front = restore(wm, spec('calculator', { layer: 13, foreground: true }));
    const behind = restore(wm, spec('finder', { layer: 12 }));
    expect(wm.focused()).toBe(front);
    expect(wm.menubarOwner()).toBe(front);
    expect(behind.zIndex()).toBeLessThan(front.zIndex());
    expect(wm.focused()).toBe(front);
  });

  it('没有前台窗口（全是最小化的）时焦点保持为空', () => {
    const { wm } = setup();
    restore(wm, spec('notes', { minimized: true }));
    expect(wm.focused()).toBeNull();
    expect(wm.front()).toBeUndefined();
  });

  it('没有组件的系统入口和不认识的应用恢复不了：返回 null，不新增窗口', () => {
    const { wm } = setup();
    expect(wm.restore(spec('launchpad'))).toBeNull();
    expect(wm.restore(spec('ghost' as DesktopAppId))).toBeNull();
    expect(wm.windows()).toEqual([]);
  });
});

describe('WindowManager 恢复时的装载策略', () => {
  it('普通窗口：马上开始装载，装好后就绪', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('notes', { foreground: true }));
    expect(win.state()).toBe('loading');
    expect(calls.get('notes')).toHaveBeenCalledTimes(1);
    await settle();
    expect(win.state()).toBe('ready');
    expect(win.content()).toBe(StubApp);
  });

  it('清单声明 restore: deferred 的应用只重建外框，不请求载荷；哪怕它是前台窗口', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('terminal', { foreground: true }));
    await settle();
    expect(win.state()).toBe('registered');
    expect(win.content()).toBeNull();
    expect(wm.focused()).toBe(win);
    expect(wm.front()).toBe(win);
    expect(calls.get('terminal')).not.toHaveBeenCalled();
  });

  it('最小化的窗口只重建外框：藏在 Dock 里、不请求载荷、不参与前台和层叠判断', async () => {
    const { wm, calls } = setup();
    const visible = restore(wm, spec('finder', { layer: 11, foreground: true }));
    const mini = restore(wm, spec('notes', { layer: 12, minimized: true }));
    await settle();
    expect(mini.minimized()).toBe(true);
    expect(mini.hidden()).toBe(true);
    expect(mini.state()).toBe('registered');
    expect(calls.get('notes')).not.toHaveBeenCalled();
    expect(wm.front()).toBe(visible);
    expect(wm.runningApps().has('notes')).toBe(true);
  });

  it('缩放过的窗口恢复成缩放状态（菜单栏随之变不透明），最小化的缩放窗口不算', () => {
    const { wm } = setup();
    restore(wm, spec('notes', { zoomed: true, minimized: true }));
    expect(wm.opaqueMenubar()).toBe(false);
    const zoomed = restore(wm, spec('finder', { zoomed: true }));
    expect(zoomed.zoomed()).toBe(true);
    expect(wm.opaqueMenubar()).toBe(true);
  });
});

describe('WindowManager 恢复时的几何', () => {
  it('在屏幕内的窗口原样恢复，初始几何与 box 信号一致', () => {
    const { wm } = setup();
    const win = restore(wm, spec('notes'));
    expect(win.initialBox).toEqual(BOX);
    expect(win.box()).toEqual(BOX);
  });

  it('视口变小后拉回屏幕内（沿用 keepOnScreen 的规则），尺寸不小于应用的最小尺寸', () => {
    const { wm } = setup(800, 600);
    const far = restore(wm, spec('notes', { box: { left: 1300, top: 700, width: 600, height: 400 } }));
    expect(far.initialBox).toMatchObject({ left: 680, top: 560, width: 600, height: 400 });
    expect(far.box()).toEqual(far.initialBox);
    const tiny = restore(wm, spec('terminal', { box: { left: 10, top: 40, width: 50, height: 50 } }));
    expect(tiny.initialBox).toMatchObject({ width: 420, height: 220 });
  });

  it('菜单栏高度读样式变量：窗口上沿不会进菜单栏', () => {
    const { wm, dom } = setup();
    dom.root.style.setProperty('--mb-h', '38px');
    expect(restore(wm, spec('notes', { box: { ...BOX, top: 0 } })).initialBox.top).toBe(38);
  });
});

describe('WindowManager 激活延后的窗口', () => {
  it('activate 装载延后的窗口；对没有这个 id 的窗口、已经在装载的窗口什么也不做', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('terminal'));
    wm.activate('nope');
    wm.activate(win.id);
    expect(win.state()).toBe('loading');
    wm.activate(win.id);
    await settle();
    expect(win.state()).toBe('ready');
    expect(calls.get('terminal')).toHaveBeenCalledTimes(1);
  });

  it('最小化的窗口第一次还原时才装载内容；之后再最小化、还原不会重新装载', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('notes', { minimized: true }));
    const frame = attachFrame(wm, win);
    await settle();
    expect(calls.get('notes')).not.toHaveBeenCalled();

    wm.unminimize(win.id);
    expect(frame.restore).toHaveBeenCalledTimes(1);
    expect(win.state()).toBe('loading');
    await settle();
    expect(win.state()).toBe('ready');
    expect(win.minimized()).toBe(false);
    expect(wm.focused()).toBe(win);

    wm.minimize(win.id);
    wm.unminimize(win.id);
    await settle();
    expect(calls.get('notes')).toHaveBeenCalledTimes(1);
  });

  it('窗口框架还在做别的动画（restore 没生效）时，最小化的窗口仍保持未装载', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('notes', { minimized: true }));
    win.frame = {
      minimize: vi.fn(),
      restore: vi.fn(),
      toggleZoom: vi.fn(),
      keepOnScreen: vi.fn(),
      focusContent: vi.fn(),
      holdsFocus: vi.fn(() => false)
    };
    wm.unminimize(win.id);
    await settle();
    expect(win.state()).toBe('registered');
    expect(calls.get('notes')).not.toHaveBeenCalled();
  });

  it('没挂框架的窗口、不存在的 id：unminimize 什么也不做', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('notes', { minimized: true }));
    wm.unminimize(win.id);
    wm.unminimize('nope');
    await settle();
    expect(win.state()).toBe('registered');
    expect(calls.get('notes')).not.toHaveBeenCalled();
  });

  it('用户再次“打开”这个应用（Dock、启动台、聚焦搜索）时，延后的窗口随即装载', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('terminal'));
    expect(wm.open('terminal')).toBe(win);
    expect(win.state()).toBe('loading');
    await settle();
    expect(calls.get('terminal')).toHaveBeenCalledTimes(1);
  });

  it('只是切换焦点（点标题栏、⌘`）不会装载延后的窗口', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('terminal', { layer: 11 }));
    restore(wm, spec('finder', { layer: 12, foreground: true }));
    wm.cycle();
    expect(wm.focused()).toBe(win);
    wm.focus(win.id);
    await settle();
    expect(win.state()).toBe('registered');
    expect(calls.get('terminal')).not.toHaveBeenCalled();
  });

  it('关闭一个没装载过的窗口：不会触发装载，窗口正常移除', async () => {
    const { wm, calls } = setup();
    const win = restore(wm, spec('terminal'));
    wm.close(win.id);
    await vi.advanceTimersByTimeAsync(200);
    expect(wm.windows()).toEqual([]);
    expect(win.state()).toBe('closed');
    expect(calls.get('terminal')).not.toHaveBeenCalled();
  });
});
