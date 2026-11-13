import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeDom, configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { testApps } from '../testing/desktop-apps';
import { DESKTOP_APPS, DesktopAppId, DesktopOpenOptions } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { DockState } from './dock-state';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

/** 开窗后的弹跳动画与关闭动画时长；窗口管理器靠定时器收尾，测试用假定时器推进。 */
const OPEN_MS = 320;
const CLOSE_MS = 200;

interface Harness {
  readonly wm: WindowManager;
  readonly toast: Toast;
  readonly dom: FakeDom;
  readonly dock: { bounce: ReturnType<typeof vi.fn>; stopBounce: ReturnType<typeof vi.fn> };
}

function setup(width = 1440, height = 900): Harness {
  stubViewport(width, height);
  const dom = configureServices([WindowManager, DockState, Toast, { provide: DESKTOP_APPS, useValue: testApps() }]);
  const dock = { bounce: vi.fn(), stopBounce: vi.fn() };
  TestBed.inject(DockState).attach({ ...dock, rectFor: () => ({ x: 0, y: 0, w: 48, h: 48 }) });
  return { wm: TestBed.inject(WindowManager), toast: TestBed.inject(Toast), dom, dock };
}

/** 模拟窗口框架组件：最小化、还原与缩放的状态变化与真实框架一致，只是不等动画。 */
function attachFrame(wm: WindowManager, win: DesktopWindow) {
  const frame = {
    minimize: vi.fn(() => {
      win.minimized.set(true);
      wm.focusFront();
    }),
    restore: vi.fn(() => {
      win.minimized.set(false);
      wm.raise(win);
      wm.focus(win.id);
    }),
    toggleZoom: vi.fn(() => win.zoomed.update(zoomed => !zoomed)),
    keepOnScreen: vi.fn()
  };
  win.frame = frame;
  return frame;
}

function open(wm: WindowManager, appId: DesktopAppId, options?: DesktopOpenOptions): DesktopWindow {
  const win = wm.open(appId, options);
  if (!win) throw new Error(`${appId} 应该能打开`);
  return win;
}

/** 打开并装上替身框架，返回窗口与框架的 spy。 */
function openFramed(wm: WindowManager, appId: DesktopAppId, options?: DesktopOpenOptions) {
  const win = open(wm, appId, options);
  return { win, frame: attachFrame(wm, win) };
}

/** 同一应用开 n 个窗口（Finder 与 force 选项允许多实例）。 */
const openMany = (wm: WindowManager, appId: DesktopAppId, count: number): DesktopWindow[] =>
  Array.from({ length: count }, () => open(wm, appId, { force: true }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WindowManager 打开窗口', () => {
  it('打开应用：新窗口登记在列表里，获得焦点并成为菜单栏的所属窗口，Dock 图标弹跳到窗口开完', () => {
    const { wm, dock } = setup();
    const win = open(wm, 'notes');
    expect(wm.windows()).toEqual([win]);
    expect(wm.get(win.id)).toBe(win);
    expect(win.appId).toBe('notes');
    expect(win.title()).toBe('Notes');
    expect(wm.focused()).toBe(win);
    expect(wm.menubarOwner()).toBe(win);
    expect(wm.front()).toBe(win);
    expect(win.zIndex()).toBeGreaterThan(0);
    expect(win.opening()).toBe(true);
    expect(dock.bounce).toHaveBeenCalledExactlyOnceWith('notes');
    expect(dock.stopBounce).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OPEN_MS);
    expect(win.opening()).toBe(false);
    expect(dock.stopBounce).toHaveBeenCalledExactlyOnceWith('notes');
  });

  it('每个窗口的 id 互不相同，get() 找不到的 id 返回 undefined', () => {
    const { wm } = setup();
    const [first, second] = openMany(wm, 'finder', 2);
    expect(first.id).not.toBe(second.id);
    expect(wm.get(first.id)).toBe(first);
    expect(wm.get(second.id)).toBe(second);
    expect(wm.get('nope')).toBeUndefined();
  });

  it('没有组件的系统入口打不开：提示 Unknown app，不新增窗口也不让 Dock 弹跳', () => {
    const { wm, toast, dock } = setup();
    expect(wm.open('launchpad')).toBeNull();
    expect(toast.message()).toBe('Unknown app: launchpad');
    expect(toast.visible()).toBe(true);
    expect(wm.windows()).toEqual([]);
    expect(wm.menubarOwner()).toBeNull();
    expect(dock.bounce).not.toHaveBeenCalled();
  });

  it('单实例应用再次打开：返回同一个窗口并提到最前，不新增窗口，也不再弹跳', () => {
    const { wm, dock } = setup();
    const notes = open(wm, 'notes');
    const calculator = open(wm, 'calculator');
    expect(wm.front()).toBe(calculator);

    expect(open(wm, 'notes')).toBe(notes);
    expect(wm.windows()).toHaveLength(2);
    expect(wm.front()).toBe(notes);
    expect(wm.focused()).toBe(notes);
    expect(dock.bounce).toHaveBeenCalledTimes(2);
  });

  it('单实例应用的窗口已最小化时再打开：从 Dock 还原它', () => {
    const { wm } = setup();
    const { win, frame } = openFramed(wm, 'notes');
    wm.minimize(win.id);
    expect(win.minimized()).toBe(true);

    expect(open(wm, 'notes')).toBe(win);
    expect(frame.restore).toHaveBeenCalledTimes(1);
    expect(win.minimized()).toBe(false);
    expect(wm.focused()).toBe(win);
    expect(wm.windows()).toHaveLength(1);
  });

  it('force 选项让单实例应用也新开一个窗口', () => {
    const { wm } = setup();
    const first = open(wm, 'notes');
    const second = open(wm, 'notes', { force: true });
    expect(second).not.toBe(first);
    expect(wm.byApp('notes')).toEqual([first, second]);
    expect(wm.focused()).toBe(second);
  });

  it('登记为多实例（single:false）的应用每次打开都是新窗口', () => {
    const { wm } = setup();
    const [first, second, third] = openMany(wm, 'finder', 3);
    expect(wm.byApp('finder')).toEqual([first, second, third]);
    expect(new Set(wm.windows().map(win => win.id)).size).toBe(3);
  });

  it('打开参数原样交给窗口，应用组件据此决定显示内容', () => {
    const { wm } = setup();
    const options = { path: ['Macintosh HD', 'Users'], select: 'a.txt' };
    expect(open(wm, 'finder', options).options).toBe(options);
  });

  it('runningApps 按应用去重，包含正在关闭但尚未移除的窗口', () => {
    const { wm } = setup();
    openMany(wm, 'finder', 2);
    const notes = open(wm, 'notes');
    expect(wm.runningApps()).toEqual(new Set(['finder', 'notes']));

    wm.close(notes.id);
    expect(wm.runningApps().has('notes')).toBe(true);
    vi.advanceTimersByTime(CLOSE_MS);
    expect(wm.runningApps()).toEqual(new Set(['finder']));
  });
});

describe('WindowManager 初始几何', () => {
  it('第一个窗口按应用登记的尺寸，水平略偏左居中、贴近菜单栏下方', () => {
    const { wm } = setup(1440, 900);
    expect(open(wm, 'finder').initialBox).toEqual({ left: 160, top: 51, width: 940, height: 600 });
  });

  it('打开参数的 w/h 优先于登记尺寸，登记里也没有时用 860×560', () => {
    const { wm } = setup();
    expect(open(wm, 'notes').initialBox).toMatchObject({ width: 860, height: 560 });
    expect(open(wm, 'calculator').initialBox).toMatchObject({ width: 254, height: 366 });
    expect(open(wm, 'terminal', { w: 500, h: 300 }).initialBox).toMatchObject({ width: 500, height: 300 });
  });

  it('窗口不会比视口大：宽度留 60px 边距，高度扣掉菜单栏和 Dock 的位置', () => {
    const { wm, dom } = setup(800, 600);
    dom.root.style.setProperty('--mb-h', '30px');
    const box = open(wm, 'finder').initialBox;
    expect(box.width).toBe(800 - 60);
    expect(box.height).toBe(600 - 30 - 90);
  });

  it('连续打开的窗口依次错开，满七个后回到起点', () => {
    const { wm } = setup();
    const boxes = openMany(wm, 'finder', 8).map(win => win.initialBox);
    for (let index = 1; index < 7; index++) {
      expect(boxes[index].left).toBeGreaterThan(boxes[index - 1].left);
      expect(boxes[index].top).toBeGreaterThan(boxes[index - 1].top);
    }
    expect(boxes[7]).toEqual(boxes[0]);
  });

  it('菜单栏高度读样式变量 --mb-h，没有时按 25px', () => {
    const { wm, dom } = setup();
    expect(wm.menubarHeight()).toBe(25);
    dom.root.style.setProperty('--mb-h', '38px');
    expect(wm.menubarHeight()).toBe(38);
  });

  it('可见高度 = 视口高 - 菜单栏 - Dock 占用（尺寸 + 间距），不受放大中的 Dock 影响', () => {
    const { wm, dom } = setup(1440, 900);
    expect(wm.visibleHeight()).toBe(900 - 25 - (14 + 5));
    dom.root.style.setProperty('--mb-h', '30px');
    dom.root.style.setProperty('--dock-size', '58px');
    dom.root.style.setProperty('--dock-bottom', '6px');
    expect(wm.visibleHeight()).toBe(900 - 30 - (58 + 14 + 6 + 5));
  });
});

describe('WindowManager 焦点与层叠', () => {
  it('focus 把窗口提到最上层并设为焦点，窗口之间的层级严格递增', () => {
    const { wm } = setup();
    const [first, second, third] = ['notes', 'calculator', 'terminal'].map(id => open(wm, id as DesktopAppId));
    expect(first.zIndex()).toBeLessThan(second.zIndex());
    expect(second.zIndex()).toBeLessThan(third.zIndex());
    expect(wm.focused()).toBe(third);

    wm.focus(first.id);
    expect(wm.focused()).toBe(first);
    expect(wm.menubarOwner()).toBe(first);
    expect(first.zIndex()).toBeGreaterThan(third.zIndex());
    expect(wm.front()).toBe(first);
  });

  it('focus 一个不存在、或正在关闭的窗口不起作用，不会改层级也不会改焦点', () => {
    const { wm } = setup();
    const keep = open(wm, 'notes');
    const leaving = open(wm, 'calculator');
    wm.focus(keep.id);
    wm.close(leaving.id);
    const keepZ = keep.zIndex();
    const leavingZ = leaving.zIndex();

    wm.focus('nope');
    wm.focus(leaving.id);
    expect(wm.focused()).toBe(keep);
    expect(keep.zIndex()).toBe(keepZ);
    expect(leaving.zIndex()).toBe(leavingZ);
  });

  it('raise 只抬高层级，不改变焦点', () => {
    const { wm } = setup();
    const first = open(wm, 'notes');
    const second = open(wm, 'calculator');
    wm.raise(first);
    expect(first.zIndex()).toBeGreaterThan(second.zIndex());
    expect(wm.focused()).toBe(second);
    expect(wm.front()).toBe(first);
  });

  it('front 是层级最高的可见窗口：最小化或正在关闭的窗口不算', () => {
    const { wm } = setup();
    const { win: back } = openFramed(wm, 'notes');
    const { win: top } = openFramed(wm, 'calculator');
    expect(wm.front()).toBe(top);

    wm.minimize(top.id);
    expect(wm.front()).toBe(back);
    wm.close(back.id);
    expect(wm.front()).toBeUndefined();
  });

  it('focusFront 把焦点交给最上层的可见窗口', () => {
    const { wm } = setup();
    const { win: back } = openFramed(wm, 'notes');
    const { win: top } = openFramed(wm, 'calculator');
    wm.raise(back);
    wm.focusFront();
    expect(wm.focused()).toBe(back);
    expect(top.zIndex()).toBeLessThan(back.zIndex());
  });

  it('没有窗口时 focusFront 什么也不做', () => {
    const { wm } = setup();
    wm.focusFront();
    expect(wm.focused()).toBeNull();
  });

  it('byApp 只返回该应用没有在关闭的窗口，按打开顺序排列', () => {
    const { wm } = setup();
    const [first, second] = openMany(wm, 'finder', 2);
    open(wm, 'notes');
    wm.close(first.id);
    expect(wm.byApp('finder')).toEqual([second]);
    expect(wm.byApp('terminal')).toEqual([]);
  });
});

describe('WindowManager 关闭窗口', () => {
  it('close：先标记正在关闭并通知应用释放资源，动画结束后才从列表移除', () => {
    const { wm } = setup();
    const win = open(wm, 'notes');
    const released = vi.fn();
    const completed = vi.fn();
    win.beforeClose.subscribe({ next: released, complete: completed });

    wm.close(win.id);
    expect(win.closing()).toBe(true);
    expect(released).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(wm.windows()).toEqual([win]);
    expect(wm.byApp('notes')).toEqual([]);

    vi.advanceTimersByTime(CLOSE_MS - 1);
    expect(wm.windows()).toEqual([win]);
    vi.advanceTimersByTime(1);
    expect(wm.windows()).toEqual([]);
    expect(wm.get(win.id)).toBeUndefined();
  });

  it('重复关闭同一个窗口，或关闭不存在的窗口：只通知一次，不报错', () => {
    const { wm } = setup();
    const win = open(wm, 'notes');
    const released = vi.fn();
    win.beforeClose.subscribe(released);
    wm.close(win.id);
    wm.close(win.id);
    wm.close('nope');
    vi.advanceTimersByTime(CLOSE_MS);
    expect(released).toHaveBeenCalledTimes(1);
    expect(wm.windows()).toEqual([]);
  });

  it('关闭最上层的窗口后，焦点和菜单栏回到下面的窗口', () => {
    const { wm } = setup();
    const { win: back } = openFramed(wm, 'notes');
    const { win: top } = openFramed(wm, 'calculator');
    wm.close(top.id);
    vi.advanceTimersByTime(CLOSE_MS);
    expect(wm.focused()).toBe(back);
    expect(wm.menubarOwner()).toBe(back);
    expect(wm.runningApps()).toEqual(new Set(['notes']));
  });

  it('关掉最后一个窗口后菜单栏没有所属窗口（回到 Finder），可以重新打开同一个单实例应用', () => {
    const { wm } = setup();
    const win = open(wm, 'notes');
    wm.close(win.id);
    vi.advanceTimersByTime(CLOSE_MS);
    expect(wm.menubarOwner()).toBeNull();
    expect(wm.windows()).toEqual([]);

    const reopened = open(wm, 'notes');
    expect(reopened).not.toBe(win);
    expect(wm.menubarOwner()).toBe(reopened);
  });

  it('正在关闭的单实例窗口不阻止再次打开：会新开一个窗口', () => {
    const { wm } = setup();
    const leaving = open(wm, 'notes');
    wm.close(leaving.id);
    const fresh = open(wm, 'notes');
    expect(fresh).not.toBe(leaving);
    expect(wm.byApp('notes')).toEqual([fresh]);
  });

  it('closeAll 关闭所有窗口，动画结束后列表清空', () => {
    const { wm } = setup();
    const windows = [...openMany(wm, 'finder', 2), open(wm, 'notes')];
    wm.closeAll();
    expect(windows.every(win => win.closing())).toBe(true);
    vi.advanceTimersByTime(CLOSE_MS);
    expect(wm.windows()).toEqual([]);
    expect(wm.runningApps().size).toBe(0);
  });

  it('quitApp 关闭该应用的全部窗口，其他应用不受影响', () => {
    const { wm } = setup();
    const finders = openMany(wm, 'finder', 2);
    const notes = open(wm, 'notes');
    wm.quitApp('finder');
    expect(finders.every(win => win.closing())).toBe(true);
    expect(notes.closing()).toBe(false);
    vi.advanceTimersByTime(CLOSE_MS);
    expect(wm.windows()).toEqual([notes]);
    expect(wm.focused()).toBe(notes);
  });
});

describe('WindowManager 最小化、缩放与框架', () => {
  it('minimize/unminimize/zoom 交给窗口框架组件执行，状态由框架改变', () => {
    const { wm } = setup();
    const { win, frame } = openFramed(wm, 'notes');

    wm.minimize(win.id);
    expect(frame.minimize).toHaveBeenCalledTimes(1);
    expect(win.minimized()).toBe(true);
    wm.unminimize(win.id);
    expect(frame.restore).toHaveBeenCalledTimes(1);
    expect(win.minimized()).toBe(false);
    wm.zoom(win.id);
    expect(frame.toggleZoom).toHaveBeenCalledTimes(1);
    expect(win.zoomed()).toBe(true);
  });

  it('窗口框架还没挂上（或 id 不存在）时这些操作什么也不做', () => {
    const { wm } = setup();
    const win = open(wm, 'notes');
    wm.minimize(win.id);
    wm.unminimize(win.id);
    wm.zoom(win.id);
    wm.minimize('nope');
    expect(win.minimized()).toBe(false);
    expect(win.zoomed()).toBe(false);
  });

  it('有可见的缩放窗口时菜单栏变为不透明；窗口最小化或关闭后恢复', () => {
    const { wm } = setup();
    const { win } = openFramed(wm, 'notes');
    expect(wm.opaqueMenubar()).toBe(false);

    wm.zoom(win.id);
    expect(wm.opaqueMenubar()).toBe(true);
    wm.minimize(win.id);
    expect(wm.opaqueMenubar()).toBe(false);
    wm.unminimize(win.id);
    expect(wm.opaqueMenubar()).toBe(true);
    wm.close(win.id);
    expect(wm.opaqueMenubar()).toBe(false);
  });

  it('keepOnScreen 让每个有框架的窗口各自检查边界，没有框架的窗口被跳过', () => {
    const { wm } = setup();
    const first = openFramed(wm, 'notes');
    const second = openFramed(wm, 'calculator');
    open(wm, 'terminal');
    wm.keepOnScreen();
    expect(first.frame.keepOnScreen).toHaveBeenCalledTimes(1);
    expect(second.frame.keepOnScreen).toHaveBeenCalledTimes(1);
  });
});

describe('WindowManager 针对最前窗口的命令', () => {
  it('closeFront、minimizeFront、zoomFront 只作用于最上层的可见窗口', () => {
    const { wm } = setup();
    const back = openFramed(wm, 'notes');
    const top = openFramed(wm, 'calculator');

    wm.zoomFront();
    expect(top.frame.toggleZoom).toHaveBeenCalledTimes(1);
    expect(back.frame.toggleZoom).not.toHaveBeenCalled();

    wm.minimizeFront();
    expect(top.win.minimized()).toBe(true);
    expect(back.win.minimized()).toBe(false);

    wm.closeFront();
    expect(back.win.closing()).toBe(true);
    expect(top.win.closing()).toBe(false);
  });

  it('quitFront 退出最前窗口所属的整个应用，包括它的其他窗口', () => {
    const { wm } = setup();
    const notes = open(wm, 'notes');
    const finders = openMany(wm, 'finder', 2);
    wm.quitFront();
    expect(finders.every(win => win.closing())).toBe(true);
    expect(notes.closing()).toBe(false);
  });

  it('没有可见窗口时这些命令都不起作用', () => {
    const { wm } = setup();
    wm.closeFront();
    wm.minimizeFront();
    wm.zoomFront();
    wm.quitFront();
    wm.hideOthers();
    wm.showAll();
    wm.cycle();
    expect(wm.windows()).toEqual([]);
  });

  it('hideOthers 最小化除最前窗口外的所有可见窗口；showAll 把最小化的窗口全部还原', () => {
    const { wm } = setup();
    const a = openFramed(wm, 'notes');
    const b = openFramed(wm, 'calculator');
    const c = openFramed(wm, 'terminal');
    wm.hideOthers();
    expect([a, b, c].map(item => item.win.minimized())).toEqual([true, true, false]);
    expect(c.frame.minimize).not.toHaveBeenCalled();
    expect(wm.front()).toBe(c.win);

    wm.showAll();
    expect([a, b, c].map(item => item.win.minimized())).toEqual([false, false, false]);
    expect(a.frame.restore).toHaveBeenCalledTimes(1);
    expect(b.frame.restore).toHaveBeenCalledTimes(1);
    expect(c.frame.restore).not.toHaveBeenCalled();
  });

  it('hideOthers 不会重复最小化已最小化或正在关闭的窗口', () => {
    const { wm } = setup();
    const hidden = openFramed(wm, 'notes');
    const leaving = openFramed(wm, 'calculator');
    openFramed(wm, 'terminal');
    wm.minimize(hidden.win.id);
    wm.close(leaving.win.id);
    wm.hideOthers();
    expect(hidden.frame.minimize).toHaveBeenCalledTimes(1);
    expect(leaving.frame.minimize).not.toHaveBeenCalled();
  });
});

describe('WindowManager 切换窗口', () => {
  it('cycle（⌘`）把最底层的可见窗口提到最前，连续按下轮流切换', () => {
    const { wm } = setup();
    const [a, b, c] = ['notes', 'calculator', 'terminal'].map(id => open(wm, id as DesktopAppId));
    expect(wm.front()).toBe(c);

    wm.cycle();
    expect(wm.front()).toBe(a);
    expect(wm.focused()).toBe(a);
    wm.cycle();
    expect(wm.front()).toBe(b);
    wm.cycle();
    expect(wm.front()).toBe(c);
  });

  it('cycle 跳过最小化的窗口；只剩一个可见窗口时不改变层级', () => {
    const { wm } = setup();
    const a = openFramed(wm, 'notes');
    const b = openFramed(wm, 'calculator');
    openFramed(wm, 'terminal');
    wm.minimize(a.win.id);

    wm.cycle();
    expect(wm.front()).toBe(b.win);
    expect(a.win.minimized()).toBe(true);

    wm.hideOthers();
    const zBefore = b.win.zIndex();
    wm.cycle();
    expect(b.win.zIndex()).toBe(zBefore);
    expect(wm.front()).toBe(b.win);
  });
});
