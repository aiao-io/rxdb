import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { configureServices } from '../testing/angular';
import { stubViewport } from '../testing/browser';
import { StubApp, testApps } from '../testing/desktop-apps';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { ApplicationRuntime } from './application-runtime';
import { AppLoader, DESKTOP_APPS, DesktopAppId, DesktopAppRegistry } from './desktop-apps';
import { DesktopWindow, WindowBox } from './desktop-window';
import { DockState } from './dock-state';
import { FileSystem, FsNode } from './file-system';
import { BootRun, Session } from './session';
import { Toast } from './toast';
import { RESTORE_YIELD, TAB_STORAGE, WindowLayoutStore } from './window-layout';
import { TabStorage, WINDOW_LAYOUT_PREFIX, windowLayoutKey } from './window-layout-model';
import { WindowManager } from './window-manager';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const TAB = 'tab-aaaa-0001';
const OWN = windowLayoutKey(TAB);
const BOX: WindowBox = { left: 100, top: 80, width: 600, height: 400 };

/** 库里存的布局（只列断言用到的字段）。 */
interface Saved {
  readonly version: number;
  readonly updatedAt: number;
  readonly windows: readonly {
    readonly appId: string;
    readonly box: WindowBox;
    readonly minimized: boolean;
    readonly zoomed: boolean;
    readonly options: object;
  }[];
}

/** 存进偏好的一个窗口记录。 */
const rec = (appId: DesktopAppId, overrides: Record<string, unknown> = {}) => ({
  appId,
  name: appId,
  box: BOX,
  minimized: false,
  zoomed: false,
  options: {},
  ...overrides
});

/** 存进偏好的布局：窗口按层叠从后到前。 */
const layoutOf = (...windows: readonly unknown[]) => ({ version: 1, updatedAt: NOW - 1000, windows });

/** 内存里的会话存储：同一份对象代表同一个标签页（刷新后还在）。 */
function memoryStorage(initial?: string): TabStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>(initial ? [['aiao-desktop:tab-id', initial]] : []);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

interface Options {
  /** 本标签页已存的布局。 */
  readonly own?: unknown;
  /** 偏好表里的其他行（其他标签页的布局、别的偏好）。 */
  readonly others?: Readonly<Record<string, unknown>>;
  /** 会话存储；`null` 是浏览器取不到会话存储。默认是已有标识 {@link TAB} 的存储。 */
  readonly storage?: TabStorage | null;
  /** 磁盘上存在的文件（卷内路径）。 */
  readonly files?: readonly (readonly string[])[];
  readonly fsReady?: Promise<void>;
  readonly failLoad?: Error;
  readonly viewport?: readonly [number, number];
  /** 把 terminal 登记为 restore: deferred（与真实清单一致）。 */
  readonly deferTerminal?: boolean;
}

function setup(options: Options = {}) {
  const [width, height] = options.viewport ?? [1440, 900];
  stubViewport(width, height);
  const data = new FakeDesktopData();
  const table = data.table<{ id?: string; key: string; value: unknown }>(SystemPreference);
  if (options.own !== undefined) table.seed([{ key: OWN, value: options.own }]);
  for (const [key, value] of Object.entries(options.others ?? {})) table.seed([{ key, value }]);
  if (options.failLoad) data.repository.mockRejectedValueOnce(options.failLoad);

  /* 登记表里每个应用的装载函数都包成 spy，断言“恢复时没有请求载荷”。 */
  const loads = new Map<DesktopAppId, ReturnType<typeof vi.fn<AppLoader>>>();
  const base = testApps(options.deferTerminal === false ? {} : { terminal: { restore: 'deferred' } });
  const apps = Object.fromEntries(
    Object.entries(base).map(([id, app]) => {
      if (!app.load) return [id, app];
      const load = vi.fn<AppLoader>(async () => StubApp);
      loads.set(id as DesktopAppId, load);
      return [id, { ...app, load }];
    })
  ) as unknown as DesktopAppRegistry;

  const files = options.files ?? [];
  const fs = {
    whenReady: vi.fn(() => options.fsReady ?? Promise.resolve()),
    nodeAt: vi.fn((path: readonly string[]) =>
      files.some(file => file.join('/') === path.join('/')) ?
        ({ name: path.at(-1), path, kind: 'file' } as unknown as FsNode)
      : null
    )
  };
  const session = { boot: signal<BootRun | null>(null), locked: signal(false) };
  /* 恢复时窗口之间让出主线程：用例手动放行每一次，才看得到“逐个”。 */
  const gates: (() => void)[] = [];
  const yielded = vi.fn(() => new Promise<void>(resolve => gates.push(resolve)));
  const storage = options.storage === undefined ? memoryStorage(TAB) : options.storage;

  configureServices([
    WindowLayoutStore,
    WindowManager,
    DockState,
    Toast,
    ApplicationRuntime,
    Preferences,
    { provide: DesktopData, useValue: data },
    { provide: FileSystem, useValue: fs },
    { provide: Session, useValue: session },
    { provide: TAB_STORAGE, useValue: storage },
    { provide: RESTORE_YIELD, useValue: yielded },
    { provide: DESKTOP_APPS, useValue: apps }
  ]);
  TestBed.inject(DockState).attach({
    bounce: vi.fn(),
    stopBounce: vi.fn(),
    focusApp: vi.fn(),
    rectFor: () => ({ x: 0, y: 0, w: 48, h: 48 })
  });
  const wm = TestBed.inject(WindowManager);
  const store = TestBed.inject(WindowLayoutStore);
  const toast = TestBed.inject(Toast);
  const create = vi.spyOn(table, 'create');
  const update = vi.spyOn(table, 'update');

  return {
    store,
    wm,
    toast,
    table,
    data,
    session,
    fs,
    loads,
    yielded,
    gates,
    storage,
    create,
    update,
    /** 本标签页保存的布局；还没存过为 undefined。 */
    saved: () => table.rows.find(row => row.key === OWN)?.value as Saved | undefined,
    savedApps: () =>
      (table.rows.find(row => row.key === OWN)?.value as Saved | undefined)?.windows.map(item => item.appId),
    /** 写库的次数（新建加更新，含失败的）。 */
    writeCount: () => create.mock.calls.length + update.mock.calls.length,
    writes: () => table.rows.filter(row => row.key === OWN),
    win: (appId: DesktopAppId): DesktopWindow => {
      const found = wm.byApp(appId).at(-1);
      if (!found) throw new Error(`没有 ${appId} 窗口`);
      return found;
    },
    apps: () => wm.windows().map(win => win.appId)
  };
}

type Context = ReturnType<typeof setup>;

/** 窗口当前的几何（信号里的值）。 */
const BOX_OF = (win: DesktopWindow): WindowBox => win.box();

/** 让已排队的微任务（读库、串行写库）和刚好到点的计时器都跑完。 */
const settle = () => vi.advanceTimersByTimeAsync(0);

/** 触发 effect，再让它引起的异步写库跑完。 */
async function tick(): Promise<void> {
  TestBed.tick();
  await settle();
}

/** 放行一次“让出主线程”。 */
async function release(ctx: Context): Promise<void> {
  ctx.gates.shift()?.();
  await settle();
}

/** 恢复到底：每次让出都立刻放行。 */
async function restoreAll(ctx: Context): Promise<number> {
  const done = ctx.store.restore();
  for (let guard = 0; guard < 50; guard++) {
    await settle();
    if (ctx.gates.length === 0) break;
    await release(ctx);
  }
  return done;
}

/** 恢复到底，再让 effect 与写库都稳定下来。 */
async function started(options: Options = {}) {
  const ctx = setup(options);
  const restored = await restoreAll(ctx);
  await tick();
  return { ...ctx, restored };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('默认的会话存储与让出主线程', () => {
  it('TAB_STORAGE 默认取浏览器的 sessionStorage；访问它就抛错（站点数据被禁用）时是 null', () => {
    const browser = memoryStorage();
    vi.stubGlobal('sessionStorage', browser);
    configureServices([]);
    expect(TestBed.inject(TAB_STORAGE)).toBe(browser);

    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('The operation is insecure.');
      }
    });
    try {
      configureServices([]);
      expect(TestBed.inject(TAB_STORAGE)).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    }
  });

  it('RESTORE_YIELD 默认让给下一个宏任务：当前这一轮微任务里还没完成', async () => {
    configureServices([]);
    const pause = TestBed.inject(RESTORE_YIELD);
    let resumed = false;
    const waiting = pause().then(() => (resumed = true));
    await Promise.resolve();
    expect(resumed).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await waiting;
    expect(resumed).toBe(true);
  });
});

describe('WindowLayoutStore 标签页会话', () => {
  it('布局存在以会话标识命名的偏好键下；刷新后（同一份会话存储）还是同一个键', () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    const key = first.store.key;
    expect(key).toMatch(new RegExp(`^${WINDOW_LAYOUT_PREFIX}[A-Za-z0-9-]{8,64}$`));
    expect(storage.data.get('aiao-desktop:tab-id')).toBe(key?.slice(WINDOW_LAYOUT_PREFIX.length));

    const reloaded = setup({ storage });
    expect(reloaded.store.key).toBe(key);
  });

  it('新开的标签页（另一份会话存储）有自己的键', () => {
    const a = setup({ storage: memoryStorage() });
    const b = setup({ storage: memoryStorage() });
    expect(a.store.key).not.toBeNull();
    expect(b.store.key).not.toBe(a.store.key);
  });

  it('会话存储取不到：停用布局保存，不退回共享的键；桌面可见后提示一次，窗口照常开', async () => {
    const ctx = setup({ storage: null });
    expect(ctx.store.key).toBeNull();
    expect(await restoreAll(ctx)).toBe(0);
    ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.table.rows).toEqual([]);
    expect(ctx.toast.message()).toBe('Window positions won’t be remembered: this browser blocks tab storage.');
    expect(ctx.wm.windows()).toHaveLength(1);
  });

  it('会话存储读写时抛错同样停用，并提示', async () => {
    const blocked: TabStorage = {
      getItem: () => {
        throw new Error('The operation is insecure.');
      },
      setItem: () => undefined
    };
    const ctx = setup({ storage: blocked });
    expect(ctx.store.key).toBeNull();
    await restoreAll(ctx);
    await tick();
    expect(ctx.toast.message()).toContain('won’t be remembered');
    expect(ctx.table.rows).toEqual([]);
  });
});

describe('WindowLayoutStore 恢复', () => {
  it('没存过布局：恢复 0 个窗口（桌面页据此打开默认的 Finder），也不写库', async () => {
    const ctx = await started();
    expect(ctx.restored).toBe(0);
    expect(ctx.wm.windows()).toEqual([]);
    expect(ctx.writeCount()).toBe(0);
  });

  it('空布局（用户关光了窗口）也是 0：没有可恢复的窗口', async () => {
    const ctx = await started({ own: layoutOf() });
    expect(ctx.restored).toBe(0);
    expect(ctx.toast.message()).toBe('');
  });

  it('等偏好库和磁盘都就绪之后才恢复：磁盘没挂好时一个窗口都不开', async () => {
    let mounted!: () => void;
    const fsReady = new Promise<void>(resolve => (mounted = resolve));
    const ctx = setup({ own: layoutOf(rec('finder')), fsReady });
    const done = ctx.store.restore();
    await settle();
    expect(ctx.fs.whenReady).toHaveBeenCalled();
    expect(ctx.wm.windows()).toEqual([]);
    mounted();
    await restoreAll(ctx);
    expect(await done).toBe(1);
    expect(ctx.apps()).toEqual(['finder']);
  });

  it('恢复位置、大小、最小化与缩放状态和开窗参数', async () => {
    const own = layoutOf(
      rec('finder', {
        box: { left: 120, top: 90, width: 700, height: 450 },
        options: { path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'] }
      }),
      rec('notes', { minimized: true, box: { left: 300, top: 200, width: 500, height: 380 } }),
      rec('calculator', { zoomed: true })
    );
    const ctx = await started({ own });
    expect(ctx.restored).toBe(3);
    const finder = ctx.win('finder');
    expect(finder.box()).toEqual({ left: 120, top: 90, width: 700, height: 450 });
    expect(finder.initialBox).toEqual({ left: 120, top: 90, width: 700, height: 450 });
    expect(finder.options).toEqual({ path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'] });
    const notes = ctx.win('notes');
    expect(notes.minimized()).toBe(true);
    expect(notes.box()).toEqual({ left: 300, top: 200, width: 500, height: 380 });
    expect(ctx.win('calculator').zoomed()).toBe(true);
    expect(finder.zoomed()).toBe(false);
  });

  it('两个 Finder 窗口各自恢复（多实例应用）', async () => {
    const ctx = await started({
      own: layoutOf(
        rec('finder', { options: { path: ['Trash'] } }),
        rec('finder', { options: { path: ['Macintosh HD'] } })
      )
    });
    expect(ctx.restored).toBe(2);
    expect(ctx.wm.byApp('finder').map(win => win.options.path)).toEqual([['Trash'], ['Macintosh HD']]);
  });

  it('先恢复前台窗口并立即装载，其余可见窗口从上到下逐个恢复（每个之间让出主线程），最小化的最后', async () => {
    const ctx = setup({
      own: layoutOf(rec('finder'), rec('notes', { minimized: true }), rec('music'), rec('calculator'))
    });
    const done = ctx.store.restore();
    await settle();
    expect(ctx.apps()).toEqual(['calculator']);
    expect(ctx.loads.get('calculator')).toHaveBeenCalledTimes(1);
    expect(ctx.loads.get('music')).not.toHaveBeenCalled();
    expect(ctx.yielded).toHaveBeenCalledTimes(1);

    await release(ctx);
    expect(ctx.apps()).toEqual(['music', 'calculator']);
    expect(ctx.yielded).toHaveBeenCalledTimes(2);
    await release(ctx);
    expect(ctx.apps()).toEqual(['finder', 'music', 'calculator']);
    await release(ctx);
    expect(ctx.apps()).toEqual(['finder', 'notes', 'music', 'calculator']);
    expect(await done).toBe(4);
    expect(ctx.yielded).toHaveBeenCalledTimes(3);
  });

  it('恢复分几批进行，窗口的最终前后顺序仍与刷新前一致，前台窗口拿到焦点', async () => {
    const ctx = await started({ own: layoutOf(rec('notes'), rec('finder'), rec('calculator'), rec('music')) });
    const byLayer = [...ctx.wm.windows()].sort((a, b) => a.zIndex() - b.zIndex()).map(win => win.appId);
    expect(byLayer).toEqual(['notes', 'finder', 'calculator', 'music']);
    expect(ctx.wm.front()?.appId).toBe('music');
    expect(ctx.wm.focused()?.appId).toBe('music');
  });

  it('最小化的窗口只重建外框：不请求载荷，从 Dock 第一次还原时才装载', async () => {
    const ctx = await started({ own: layoutOf(rec('notes', { minimized: true }), rec('calculator')) });
    const notes = ctx.win('notes');
    expect(notes.state()).toBe('registered');
    expect(ctx.loads.get('notes')).not.toHaveBeenCalled();
    expect(ctx.loads.get('calculator')).toHaveBeenCalledTimes(1);
    expect(ctx.wm.front()?.appId).toBe('calculator');

    notes.frame = {
      minimize: vi.fn(),
      restore: vi.fn(() => {
        notes.minimized.set(false);
        ctx.wm.focus(notes.id);
      }),
      toggleZoom: vi.fn(),
      keepOnScreen: vi.fn(),
      focusContent: vi.fn(),
      holdsFocus: vi.fn(() => false)
    };
    ctx.wm.unminimize(notes.id);
    await settle();
    expect(ctx.loads.get('notes')).toHaveBeenCalledTimes(1);
    expect(notes.state()).toBe('ready');
  });

  it('重型应用（清单声明 restore: deferred）只重建外框，哪怕它就是前台窗口；第一次点击才装载', async () => {
    const ctx = await started({ own: layoutOf(rec('calculator'), rec('terminal')) });
    const terminal = ctx.win('terminal');
    expect(ctx.wm.front()).toBe(terminal);
    expect(ctx.wm.focused()).toBe(terminal);
    expect(terminal.state()).toBe('registered');
    expect(ctx.loads.get('terminal')).not.toHaveBeenCalled();
    expect(ctx.loads.get('calculator')).toHaveBeenCalledTimes(1);

    ctx.wm.activate(terminal.id);
    await settle();
    expect(terminal.state()).toBe('ready');
    expect(ctx.loads.get('terminal')).toHaveBeenCalledTimes(1);
  });

  it('是否延后只看清单的 restore 字段，不看应用 id：终端没声明延后时恢复就立即装载（集成应用同理）', async () => {
    const ctx = await started({ own: layoutOf(rec('terminal')), deferTerminal: false });
    expect(ctx.win('terminal').state()).toBe('ready');
    expect(ctx.loads.get('terminal')).toHaveBeenCalledTimes(1);
  });

  it('保存的布局没有 Finder 也不会多出一个：返回的数量是恢复出来的窗口数', async () => {
    const ctx = await started({ own: layoutOf(rec('notes'), rec('calculator')) });
    expect(ctx.restored).toBe(2);
    expect(ctx.apps()).not.toContain('finder');
    expect(ctx.wm.front()?.appId).toBe('calculator');
  });

  it('清单里已下线的应用被跳过：其余窗口照常恢复，桌面可见后给一条提示', async () => {
    const own = layoutOf(rec('notes'), rec('podcasts', { name: 'Podcasts' }), rec('calculator'));
    const ctx = await started({ own });
    expect(ctx.restored).toBe(2);
    expect(ctx.apps().sort()).toEqual(['calculator', 'notes']);
    expect(ctx.toast.message()).toBe('Couldn’t restore a window: “Podcasts” is no longer available.');
    expect(ctx.toast.visible()).toBe(true);
  });

  it('所有窗口都不能恢复：数量是 0（桌面页据此打开默认的 Finder），提示照给', async () => {
    const ctx = await started({ own: layoutOf(rec('podcasts', { name: 'Podcasts' })) });
    expect(ctx.restored).toBe(0);
    expect(ctx.toast.message()).toContain('“Podcasts” is no longer available');
  });

  it('提示要等桌面真的看得见：开机画面和登录界面期间不弹，之后才弹', async () => {
    const ctx = setup({ own: layoutOf(rec('podcasts', { name: 'Podcasts' })) });
    ctx.session.boot.set({ id: 0, mode: 'startup' });
    await restoreAll(ctx);
    await tick();
    expect(ctx.toast.message()).toBe('');

    ctx.session.boot.set(null);
    ctx.session.locked.set(true);
    await tick();
    expect(ctx.toast.message()).toBe('');

    ctx.session.locked.set(false);
    await tick();
    expect(ctx.toast.message()).toContain('“Podcasts” is no longer available');
    ctx.toast.show('later');
    await tick();
    expect(ctx.toast.message()).toBe('later');
  });

  it('TextEdit / 预览：按保存的路径取回磁盘节点；文件已经不在了就跳过并提示', async () => {
    const own = layoutOf(
      rec('textedit', { options: { file: 'a.txt', nodePath: ['Users', 'a.txt'] } }),
      rec('preview', { options: { file: 'gone.png', nodePath: ['Users', 'gone.png'] } }),
      rec('textedit', { options: {} })
    );
    const ctx = await started({ own, files: [['Users', 'a.txt']] });
    expect(ctx.restored).toBe(2);
    const [withFile, untitled] = ctx.wm.byApp('textedit');
    expect(withFile?.options.node?.path).toEqual(['Users', 'a.txt']);
    expect(withFile?.options.file).toBe('a.txt');
    expect(untitled?.options.node).toBeUndefined();
    expect(ctx.wm.byApp('preview')).toEqual([]);
    expect(ctx.toast.message()).toBe('Couldn’t restore a window: “gone.png” no longer exists.');
  });

  it('读不懂的窗口记录被跳过并提示，其余窗口恢复', async () => {
    const ctx = await started({ own: layoutOf({ appId: 'notes', box: 'nope' }, rec('calculator')) });
    expect(ctx.restored).toBe(1);
    expect(ctx.toast.message()).toBe('Couldn’t restore a window: “Notes” had unreadable settings.');
  });

  it('整个布局读不懂（损坏、更高的版本）：什么也不恢复，提示用户，下一次布局变化把它覆盖成可读的', async () => {
    const ctx = await started({ own: { version: 9, updatedAt: 1, windows: 'x' } });
    expect(ctx.restored).toBe(0);
    expect(ctx.toast.message()).toBe('Couldn’t read the saved window layout, so the desktop starts fresh.');
    ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.saved()).toMatchObject({ version: 1, windows: [{ appId: 'notes' }] });
  });

  it('保存的窗口在视口变小后被拉回屏幕内，并把修正后的几何写回', async () => {
    const own = layoutOf(rec('notes', { box: { left: 1300, top: 700, width: 600, height: 400 } }));
    const ctx = await started({ own, viewport: [800, 600] });
    expect(ctx.win('notes').box()).toMatchObject({ left: 680, top: 560 });
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.saved()?.windows[0]?.box).toMatchObject({ left: 680, top: 560 });
  });

  it('偏好库连不上：不恢复也不写，不抛未处理的拒绝，窗口照常开', async () => {
    const ctx = setup({ failLoad: new Error('db down') });
    expect(await restoreAll(ctx)).toBe(0);
    ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.table.rows).toEqual([]);
    expect(ctx.wm.windows()).toHaveLength(1);
  });

  it('重复调用 restore 只恢复一次', async () => {
    const ctx = setup({ own: layoutOf(rec('notes')) });
    const first = ctx.store.restore();
    const second = ctx.store.restore();
    expect(second).toBe(first);
    await restoreAll(ctx);
    expect(ctx.wm.windows()).toHaveLength(1);
  });
});

describe('WindowLayoutStore 写回', () => {
  it('恢复完成之前不写：别把还没恢复出来的空桌面写成布局，覆盖掉已存的', async () => {
    const own = layoutOf(rec('notes'), rec('calculator'));
    const ctx = setup({ own });
    ctx.wm.open('music');
    await tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(0);
    expect(ctx.saved()).toEqual(own);
  });

  it('恢复进行到一半（还在让出主线程）也不写', async () => {
    const own = layoutOf(rec('notes'), rec('calculator'), rec('music'));
    const ctx = setup({ own });
    void ctx.store.restore();
    await settle();
    expect(ctx.apps()).toEqual(['music']);
    await tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(0);
    expect(ctx.saved()).toEqual(own);
  });

  it('没有变化就不写：恢复出来的窗口与保存的一致', async () => {
    const own = layoutOf(rec('notes', { name: 'Notes' }), rec('calculator', { name: 'Calculator' }));
    const ctx = await started({ own });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(0);
  });

  it('保存的布局里有被跳过的窗口：恢复后写回一份干净的布局', async () => {
    const own = layoutOf(rec('notes'), rec('podcasts', { name: 'Podcasts' }));
    const ctx = await started({ own });
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.savedApps()).toEqual(['notes']);
  });

  it('打开窗口后停手 0.4 秒才写一次，值带版本、写入时间和窗口记录', async () => {
    const ctx = await started();
    const win = ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(399);
    expect(ctx.saved()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.writeCount()).toBe(1);
    expect(ctx.saved()).toEqual({
      version: 1,
      updatedAt: NOW + 400,
      windows: [{ appId: 'notes', name: 'Notes', box: win?.box(), minimized: false, zoomed: false, options: {} }]
    });
  });

  it('连续的拖动、缩放、切换窗口合并成一次写入，记的是最后的状态', async () => {
    const ctx = await started();
    const notes = ctx.wm.open('notes');
    const calculator = ctx.wm.open('calculator');
    await tick();
    await vi.advanceTimersByTimeAsync(300);
    notes?.box.set({ left: 10, top: 40, width: 500, height: 300 });
    await tick();
    await vi.advanceTimersByTimeAsync(300);
    ctx.wm.focus(notes?.id ?? '');
    await tick();
    await vi.advanceTimersByTimeAsync(399);
    expect(ctx.writeCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.writeCount()).toBe(1);
    expect(ctx.savedApps()).toEqual(['calculator', 'notes']);
    expect(ctx.saved()?.windows[1]?.box).toEqual({ left: 10, top: 40, width: 500, height: 300 });
    expect(calculator?.zIndex()).toBeLessThan(notes?.zIndex() ?? 0);
  });

  it('最小化、缩放状态变化会写回', async () => {
    const ctx = await started();
    const win = ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    win?.minimized.set(true);
    win?.zoomed.set(true);
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.saved()?.windows[0]).toMatchObject({ minimized: true, zoomed: true });
  });

  it('应用上报的开窗参数（Finder 换了目录）会写回；没上报时按开窗参数记', async () => {
    const ctx = await started();
    const finder = ctx.wm.open('finder', { path: ['Macintosh HD'], select: 'x', force: true });
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.saved()?.windows[0]?.options).toEqual({ path: ['Macintosh HD'] });

    finder?.restoreOptions.set({ path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'] });
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.saved()?.windows[0]?.options).toEqual({ path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'] });
  });

  it('内容没变的信号更新不触发写入', async () => {
    const ctx = await started();
    const win = ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    const before = ctx.writeCount();
    win?.box.set({ ...BOX_OF(win) });
    win?.title.set('Notes — changed title');
    await tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(before);
  });

  it('用户主动关闭窗口：立即从布局里移除，不等防抖；正在关闭的窗口不再被记录', async () => {
    const ctx = await started();
    const notes = ctx.wm.open('notes');
    const calculator = ctx.wm.open('calculator');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.savedApps()).toEqual(['notes', 'calculator']);

    calculator?.box.set({ left: 1, top: 30, width: 400, height: 300 });
    await tick();
    ctx.wm.close(notes?.id ?? '');
    await tick();
    expect(ctx.savedApps()).toEqual(['calculator']);
    expect(ctx.saved()?.windows[0]?.box).toEqual({ left: 1, top: 30, width: 400, height: 300 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ctx.writeCount()).toBe(2);
  });

  it('关掉最后一个窗口：写成空布局（刷新后不会把关掉的窗口找回来）', async () => {
    const ctx = await started();
    const win = ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    ctx.wm.close(win?.id ?? '');
    await tick();
    expect(ctx.saved()?.windows).toEqual([]);
  });

  it('flush 把待写的布局立刻写出去（页面隐藏、关闭时用）；没有待写的就什么也不做', async () => {
    const ctx = await started();
    ctx.store.flush();
    await settle();
    expect(ctx.writeCount()).toBe(0);

    ctx.wm.open('notes');
    await tick();
    ctx.store.flush();
    await settle();
    expect(ctx.writeCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(1);
  });

  it('flush 先把还没来得及触发 effect 的改动算进去：页面隐藏的瞬间发生的拖动也不丢', async () => {
    const ctx = await started();
    const win = ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.writeCount()).toBe(1);

    win?.box.set({ left: 5, top: 30, width: 500, height: 300 });
    ctx.store.flush();
    await settle();
    expect(ctx.saved()?.windows[0]?.box).toEqual({ left: 5, top: 30, width: 500, height: 300 });
    expect(ctx.writeCount()).toBe(2);
  });

  it('只读写自己的键：其他标签页的布局不会被覆盖', async () => {
    const other = layoutOf(rec('finder'));
    const otherKey = windowLayoutKey('other-tab-0002');
    const ctx = await started({ others: { [otherKey]: other, 'dock:layout': { version: 1, items: [] } } });
    ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.table.rows.find(row => row.key === otherKey)?.value).toBe(other);
    expect(ctx.writes()).toHaveLength(1);
    expect(ctx.table.rows.map(row => row.key).sort()).toEqual([otherKey, 'dock:layout', OWN].sort());
  });

  it('只恢复自己的窗口：别的标签页的布局里有什么都不会出现在本标签页', async () => {
    const otherKey = windowLayoutKey('other-tab-0002');
    const ctx = await started({ own: layoutOf(rec('notes')), others: { [otherKey]: layoutOf(rec('calculator')) } });
    expect(ctx.apps()).toEqual(['notes']);
  });

  it('写库失败：提示用户（同一轮失败只提示一次），内存里的窗口不受影响；写成功后再失败会再提示', async () => {
    const ctx = await started();
    const show = vi.spyOn(ctx.toast, 'show');
    ctx.create.mockRejectedValueOnce(new Error('disk full')).mockRejectedValueOnce(new Error('disk full'));
    ctx.wm.open('notes');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    ctx.wm.open('calculator');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith('Couldn’t save the window layout.');
    expect(ctx.wm.windows()).toHaveLength(2);

    ctx.wm.open('music');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(ctx.savedApps()).toEqual(['notes', 'calculator', 'music']);

    ctx.update.mockRejectedValueOnce(new Error('disk full again'));
    ctx.wm.open('textedit');
    await tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('销毁服务时取消待写的计时器', async () => {
    const ctx = await started();
    ctx.wm.open('notes');
    await tick();
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(ctx.writeCount()).toBe(0);
  });
});

describe('WindowLayoutStore 清理遗留的布局行', () => {
  const stale = (days: number) => ({ version: 1, updatedAt: NOW - days * DAY, windows: [] });

  it('恢复之后清掉超过 30 天没更新的其他标签页的布局；近期的、本标签页自己的、别的偏好都留着', async () => {
    const others = {
      [windowLayoutKey('old-tab-0001')]: stale(31),
      [windowLayoutKey('old-tab-0002')]: stale(200),
      [windowLayoutKey('recent-tab-1')]: stale(29),
      'dock:layout': { version: 1, items: [] },
      'system:settings': { appearance: 'dark' }
    };
    const ctx = await started({ own: stale(400), others });
    expect(ctx.table.rows.map(row => row.key).sort()).toEqual(
      [OWN, windowLayoutKey('recent-tab-1'), 'dock:layout', 'system:settings'].sort()
    );
  });

  it('读不懂的行（更高的版本、损坏的值）不删', async () => {
    const others = {
      [windowLayoutKey('future-tab-1')]: { version: 2, updatedAt: NOW - 400 * DAY, windows: [] },
      [windowLayoutKey('broken-tab-1')]: 'junk'
    };
    const ctx = await started({ others });
    expect(ctx.table.rows).toHaveLength(2);
  });

  it('清理失败只记日志，不影响桌面', async () => {
    const others = { [windowLayoutKey('old-tab-0001')]: stale(90) };
    const ctx = setup({ others });
    vi.spyOn(ctx.table, 'remove').mockRejectedValueOnce(new Error('locked'));
    expect(await restoreAll(ctx)).toBe(0);
    await tick();
    expect(console.error).toHaveBeenCalledWith('清理遗留的窗口布局失败', expect.any(Error));
  });

  it('会话存储不可用时不清理（没有自己的键就不知道哪些是别人的）', async () => {
    const others = { [windowLayoutKey('old-tab-0001')]: stale(90) };
    const ctx = setup({ others, storage: null });
    await restoreAll(ctx);
    await tick();
    expect(ctx.table.rows).toHaveLength(1);
  });
});
