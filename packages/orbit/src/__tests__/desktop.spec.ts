import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../bus.js';
import type {
  DesktopAppearance,
  DesktopAppearancePatch,
  DesktopCapability,
  DesktopHost,
  DesktopInteraction,
  DesktopMenu,
  DesktopMethod,
  DesktopOpenedFile,
  DesktopSavedFile,
  DesktopWindowState
} from '../desktop.js';
import {
  DESKTOP_APPEARANCE_VALUES,
  DESKTOP_CAPABILITIES,
  DESKTOP_ERROR_CODES,
  DESKTOP_ERROR_PRESENTATION,
  DESKTOP_LIMITS,
  DESKTOP_METHOD_CAPABILITIES,
  DESKTOP_PROP,
  DesktopError,
  desktopProps,
  getDesktop,
  parseDesktopArguments,
  serveDesktop
} from '../desktop.js';
import { OrbitError } from '../errors.js';
import type { OrbitClient, OrbitInstance, OrbitRequestHandler, OrbitState, OrbitValue } from '../types.js';

afterEach(() => {
  vi.useRealTimers();
});

const windowState: DesktopWindowState = {
  platform: 'macos',
  frame: 'transparent',
  decorations: true,
  focused: true,
  maximized: false,
  minimized: false
};
const appearance: DesktopAppearance = { theme: 'light', appearance: 'auto', accent: 'blue' };

/** 内存里的一对宿主实例与子应用连接：请求直接交给宿主登记的处理函数，宿主事件直接派发到子应用总线。 */
function connect(props: Record<string, OrbitValue> = desktopProps(IMPLEMENTED), instanceId = 'w1#1') {
  const handlers = new Map<string, OrbitRequestHandler>();
  const bus = new EventBus(() => undefined);
  const observers = new Set<(snapshot: { state: OrbitState }) => void>();
  let state: OrbitState = 'ready';
  const emitted: [string, OrbitValue][] = [];
  /** 应用侧事件处理函数抛出的错误：真实的端口会把它们交给子应用的 onError，而不是抛回宿主。 */
  const clientErrors: unknown[] = [];
  const instance = {
    get snapshot() {
      return { appId: 'code', instanceId, version: '1', url: 'https://code.example/', state };
    },
    onRequest(method: string, handler: OrbitRequestHandler) {
      if (handlers.has(method)) throw new OrbitError('INVALID_STATE', `请求处理函数重复：${method}`);
      handlers.set(method, handler);
      return () => handlers.delete(method);
    },
    emit(event: string, ...args: OrbitValue[]) {
      emitted.push([event, args[0] as OrbitValue]);
      try {
        bus.dispatch(event, args);
      } catch (error) {
        clientErrors.push(error);
      }
    },
    subscribe(observer: (snapshot: { state: OrbitState }) => void) {
      observers.add(observer);
      return () => observers.delete(observer);
    }
  } as unknown as OrbitInstance;
  /** 下一次请求在 RPC 层失败（模拟超时、连接已销毁等）。 */
  let failure: OrbitError | undefined;
  const disposeHandlers = new Set<() => void>();
  const client = {
    context: { props, instanceId },
    bus,
    onDispose(handler: () => void) {
      disposeHandlers.add(handler);
      return () => disposeHandlers.delete(handler);
    },
    async request(method: string, payload: OrbitValue = null) {
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      const handler = handlers.get(method);
      if (!handler) throw new OrbitError('UNKNOWN_METHOD', `未知操作：${method}`);
      try {
        return await handler(JSON.parse(JSON.stringify(payload)) as OrbitValue, new AbortController().signal);
      } catch (error) {
        throw new OrbitError('HANDLER_ERROR', error instanceof Error ? error.message : '请求处理失败');
      }
    }
  } as unknown as OrbitClient;
  return {
    instance,
    client,
    handlers,
    emitted,
    clientErrors,
    observers,
    transition(next: OrbitState) {
      state = next;
      for (const observer of [...observers]) observer({ state });
    },
    failNext(error: OrbitError) {
      failure = error;
    },
    /** 应用这一侧的连接断开（窗口关闭、实例销毁）：通知应用侧登记的断开处理函数。 */
    disposeClient() {
      for (const handler of [...disposeHandlers]) handler();
    }
  };
}

const opened: DesktopOpenedFile = {
  name: 'notes.md',
  mime: 'text/markdown',
  size: 3,
  bytes: new Uint8Array([104, 105, 33]),
  handle: 'handle-1',
  version: '1731000000000:3'
};
const saved: DesktopSavedFile = { name: 'notes.md', version: '1731000000500:5', handle: 'handle-1' };

/** 记录调用、可注入失败的宿主；事件监听器留在集合里，便于触发与检查解绑。 */
function fakeHost() {
  const calls: unknown[][] = [];
  const stateListeners = new Set<(state: DesktopWindowState) => void>();
  const commandListeners = new Set<(commandId: string) => void>();
  const appearanceListeners = new Set<(next: DesktopAppearance) => void>();
  const control = { fail: undefined as DesktopError | Error | undefined, hang: false };
  const record =
    <A extends unknown[]>(name: string, result: unknown = undefined) =>
    (...args: A) => {
      calls.push([name, ...args]);
      if (control.fail) throw control.fail;
      return control.hang ? new Promise<never>(() => undefined) : (result as never);
    };
  /** 文件能力的第二个参数是计时控制，不是业务参数：调用记录里只留业务参数，计时控制另存。 */
  const interactions: (DesktopInteraction | undefined)[] = [];
  const recordFile = (name: string, result: unknown) => (args: unknown, interaction?: DesktopInteraction) => {
    interactions.push(interaction);
    return record(name, result)(args);
  };
  const host: DesktopHost = {
    window: {
      getState: record('window.getState', windowState),
      setTitle: record('window.setTitle'),
      minimize: record('window.minimize'),
      restore: record('window.restore'),
      toggleMaximize: record('window.toggleMaximize'),
      close: record('window.close'),
      setDecorations: record('window.setDecorations'),
      setDragRegions: record('window.setDragRegions'),
      onStateChange(listener) {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      }
    },
    menu: {
      set: record('menu.set'),
      onCommand(listener) {
        commandListeners.add(listener);
        return () => commandListeners.delete(listener);
      }
    },
    app: { open: record('app.open'), focus: record('app.focus'), quit: record('app.quit') },
    appearance: {
      get: record('appearance.get', appearance),
      set: record('appearance.set'),
      onChange(listener) {
        appearanceListeners.add(listener);
        return () => appearanceListeners.delete(listener);
      }
    },
    notification: { post: record('notification.post', { id: 'n1' }) },
    clipboard: { readText: record('clipboard.readText', 'from clipboard'), writeText: record('clipboard.writeText') },
    filesystem: {
      open: recordFile('filesystem.open', opened),
      save: recordFile('filesystem.save', saved)
    }
  };
  return { host, calls, control, interactions, stateListeners, commandListeners, appearanceListeners };
}

/** 第一批能力：窗口、菜单、应用、外观。多数用例只关心它们。 */
const IMPLEMENTED: readonly DesktopCapability[] = ['window', 'menu', 'app', 'appearance', 'appearance:write'];

/** 清单里可以声明的全部能力。 */
const EVERYTHING: readonly DesktopCapability[] = [...DESKTOP_CAPABILITIES];

function setup(capabilities: readonly DesktopCapability[] = IMPLEMENTED) {
  const link = connect(desktopProps(capabilities));
  const hosted = fakeHost();
  const onError = vi.fn();
  const server = serveDesktop(link.instance, hosted.host, { capabilities, onError });
  const desktop = getDesktop(link.client)!;
  return { ...link, ...hosted, server, desktop, onError };
}

const sections: readonly DesktopMenu[] = [
  {
    label: 'File',
    items: [{ id: 'open', label: 'Open…', key: '⌘O' }, { type: 'separator' }, { id: 'save', label: 'Save' }]
  },
  { label: 'View', items: [{ id: 'zoom', label: 'Zoom', checked: true, disabled: false }] }
];

describe('能力契约的协议常量', () => {
  it('能力名取值全集：窗口、菜单、应用、外观，加通知、剪贴板与文件（读写分开授权）', () => {
    expect(DESKTOP_CAPABILITIES).toEqual([
      'window',
      'menu',
      'app',
      'appearance',
      'appearance:write',
      'notification',
      'clipboard:read',
      'clipboard:write',
      'filesystem:read',
      'filesystem:write'
    ]);
  });

  it('错误码表：通用的六个加阶段 D 的六个，不多不少', () => {
    expect(DESKTOP_ERROR_CODES).toEqual([
      'CAPABILITY_DENIED',
      'INVALID_ARGUMENT',
      'USER_CANCELLED',
      'BROWSER_PERMISSION_DENIED',
      'TIMEOUT',
      'WINDOW_CLOSED',
      'FILE_CHANGED',
      'FILE_NOT_FOUND',
      'FILE_TOO_LARGE',
      'HANDLE_INVALID',
      'BUSY',
      'RATE_LIMITED'
    ]);
  });

  it('桌面怎么呈现错误：用户取消是正常结果不提示；拒绝、参数非法、超时由桌面在窗口里给出可见原因；其余只回给应用', () => {
    expect(DESKTOP_ERROR_PRESENTATION).toEqual({
      CAPABILITY_DENIED: 'window',
      INVALID_ARGUMENT: 'window',
      USER_CANCELLED: 'silent',
      BROWSER_PERMISSION_DENIED: 'app',
      TIMEOUT: 'window',
      WINDOW_CLOSED: 'app',
      FILE_CHANGED: 'app',
      FILE_NOT_FOUND: 'app',
      FILE_TOO_LARGE: 'app',
      HANDLE_INVALID: 'app',
      BUSY: 'app',
      RATE_LIMITED: 'app'
    });
    expect(Object.keys(DESKTOP_ERROR_PRESENTATION)).toEqual([...DESKTOP_ERROR_CODES]);
  });

  it('超时、大小与频率上限是协议常量（阶段 C、D 实现前定下，改动要同步更新 README）', () => {
    expect(DESKTOP_LIMITS).toEqual({
      requestTimeoutMs: 5_000,
      callTimeoutMs: 7_000,
      titleLength: 256,
      dragRegions: 64,
      appIdLength: 64,
      menu: {
        sections: 12,
        itemsPerSection: 64,
        commands: 256,
        sectionLabelLength: 32,
        itemLabelLength: 64,
        shortcutLength: 16,
        commandIdLength: 64
      },
      notification: {
        titleLength: 120,
        bodyLength: 1_000,
        dedupeKeyLength: 128,
        iconBytes: 65_536,
        perMinute: 10,
        windowMs: 60_000,
        entriesPerApp: 20
      },
      clipboard: { textLength: 262_144 },
      filesystem: { bytes: 524_288, acceptEntries: 16, nameLength: 255 }
    });
  });

  it('常量之间自洽：宿主先超时、应用侧再兜底；文件内容编码后仍在消息上限内；剪贴板文本最坏编码仍在上限内', () => {
    const { requestTimeoutMs, callTimeoutMs, filesystem, clipboard } = DESKTOP_LIMITS;
    expect(callTimeoutMs).toBeGreaterThan(requestTimeoutMs);
    expect(callTimeoutMs).toBeLessThanOrEqual(120_000);
    const messageLimit = 1024 * 1024;
    expect(Math.ceil((filesystem.bytes * 4) / 3)).toBeLessThan(messageLimit - 4096);
    expect(clipboard.textLength * 3).toBeLessThan(messageLimit - 4096);
  });

  it('外观的取值集合是登记的：显示模式与强调色', () => {
    expect(DESKTOP_APPEARANCE_VALUES.appearance).toEqual(['light', 'dark', 'auto']);
    expect(DESKTOP_APPEARANCE_VALUES.accent).toEqual([
      'multi',
      'blue',
      'purple',
      'pink',
      'red',
      'orange',
      'yellow',
      'green',
      'graphite'
    ]);
  });

  it('能力注册表：每个方法归属一个能力，写外观要另外的 appearance:write', () => {
    for (const capability of Object.values(DESKTOP_METHOD_CAPABILITIES))
      expect(DESKTOP_CAPABILITIES).toContain(capability);
    expect(DESKTOP_METHOD_CAPABILITIES['appearance.get']).toBe('appearance');
    expect(DESKTOP_METHOD_CAPABILITIES['appearance.set']).toBe('appearance:write');
    expect(DESKTOP_METHOD_CAPABILITIES['menu.set']).toBe('menu');
    expect(DESKTOP_METHOD_CAPABILITIES['app.open']).toBe('app');
    expect(DESKTOP_METHOD_CAPABILITIES['notification.post']).toBe('notification');
    expect(DESKTOP_METHOD_CAPABILITIES['clipboard.readText']).toBe('clipboard:read');
    expect(DESKTOP_METHOD_CAPABILITIES['clipboard.writeText']).toBe('clipboard:write');
    expect(DESKTOP_METHOD_CAPABILITIES['filesystem.open']).toBe('filesystem:read');
    expect(DESKTOP_METHOD_CAPABILITIES['filesystem.save']).toBe('filesystem:write');
    /* 每项清单能力都有方法用它，没有悬空的能力名。 */
    expect(new Set(Object.values(DESKTOP_METHOD_CAPABILITIES))).toEqual(new Set(DESKTOP_CAPABILITIES));
  });
});

describe('参数校验（内置应用与远程应用共用）', () => {
  const rejects = (method: DesktopMethod, value: unknown) =>
    expect(() => parseDesktopArguments(method, value)).toThrow(
      expect.objectContaining({ name: 'DesktopError', code: 'INVALID_ARGUMENT' })
    );

  it('无参数的操作只接受 null', () => {
    expect(parseDesktopArguments('window.getState', null)).toBeNull();
    expect(parseDesktopArguments('app.quit', undefined)).toBeNull();
    rejects('window.minimize', 1);
    rejects('app.focus', {});
  });

  it('标题是不超过 256 个字符的字符串；标题栏开关是布尔值', () => {
    expect(parseDesktopArguments('window.setTitle', 'x'.repeat(256))).toHaveLength(256);
    rejects('window.setTitle', 'x'.repeat(257));
    rejects('window.setTitle', 42);
    expect(parseDesktopArguments('window.setDecorations', false)).toBe(false);
    rejects('window.setDecorations', 'no');
  });

  it('拖动区沿用窗口协议的矩形与挖空规则', () => {
    const region = { x: 0, y: 0, width: 800, height: 36, holes: [{ x: 70, y: 4, width: 28, height: 28 }] };
    expect(parseDesktopArguments('window.setDragRegions', [region])).toEqual([region]);
    rejects('window.setDragRegions', [{ ...region, width: -1 }]);
    rejects('window.setDragRegions', {});
    rejects(
      'window.setDragRegions',
      Array.from({ length: 65 }, () => region)
    );
  });

  it('菜单：命令加分隔线，规整后的结果不含多余字段', () => {
    expect(parseDesktopArguments('menu.set', sections)).toEqual([
      {
        label: 'File',
        items: [{ id: 'open', label: 'Open…', key: '⌘O' }, { type: 'separator' }, { id: 'save', label: 'Save' }]
      },
      { label: 'View', items: [{ id: 'zoom', label: 'Zoom', checked: true, disabled: false }] }
    ]);
    expect(parseDesktopArguments('menu.set', [])).toEqual([]);
    expect(
      parseDesktopArguments('menu.set', [{ label: 'Go', items: [{ type: 'command', id: 'a.b-c_1', label: 'A' }] }])
    ).toHaveLength(1);
  });

  it('菜单：同一次登记里命令 ID 重复 → INVALID_ARGUMENT，跨菜单也算重复', () => {
    const duplicate = [
      { label: 'File', items: [{ id: 'open', label: 'Open' }] },
      { label: 'Edit', items: [{ id: 'open', label: 'Open again' }] }
    ];
    expect(() => parseDesktopArguments('menu.set', duplicate)).toThrow(/open/);
    rejects('menu.set', duplicate);
  });

  it('菜单：结构、取值与上限都要合法', () => {
    const one = (item: unknown) => [{ label: 'File', items: [item] }];
    const bad: unknown[] = [
      {},
      [{}],
      [{ label: '', items: [] }],
      [{ label: ' ', items: [] }],
      [{ label: 'x'.repeat(33), items: [] }],
      [{ label: 'File', items: {} }],
      [{ label: 'File', items: [], extra: 1 }],
      one(null),
      one({ id: 'a' }),
      one({ id: 'a', label: '' }),
      one({ id: 'a', label: 'x'.repeat(65) }),
      one({ id: 'with space', label: 'A' }),
      one({ id: 'with:colon', label: 'A' }),
      one({ id: '', label: 'A' }),
      one({ id: 'x'.repeat(65), label: 'A' }),
      one({ id: 'a', label: 'A', key: 'x'.repeat(17) }),
      one({ id: 'a', label: 'A', key: 1 }),
      one({ id: 'a', label: 'A', disabled: 'yes' }),
      one({ id: 'a', label: 'A', checked: 1 }),
      one({ id: 'a', label: 'A', icon: 'x' }),
      one({ id: 'a', label: 'A', type: 'submenu' }),
      one({ type: 'separator', id: 'a' }),
      one({ id: 'a', label: 'A\u0000B' }),
      Array.from({ length: 13 }, (_, index) => ({ label: `M${index}`, items: [] })),
      [{ label: 'File', items: Array.from({ length: 65 }, (_, index) => ({ id: `c${index}`, label: 'C' })) }]
    ];
    for (const value of bad) rejects('menu.set', value);
  });

  it('菜单：命令总数不超过上限', () => {
    const wide = Array.from({ length: 5 }, (_, menu) => ({
      label: `M${menu}`,
      items: Array.from({ length: 52 }, (_, index) => ({ id: `m${menu}c${index}`, label: 'C' }))
    }));
    rejects('menu.set', wide);
  });

  it('应用 ID 是登记的标识形态：小写字母开头的字母、数字与连字符；网址、路径与带参数的写法一律拒绝', () => {
    expect(parseDesktopArguments('app.open', 'vscode')).toBe('vscode');
    expect(parseDesktopArguments('app.open', 'disk-util2')).toBe('disk-util2');
    for (const value of [
      '',
      'Finder',
      '1app',
      'https://evil.example/',
      'javascript:alert(1)',
      'a/b',
      'a b',
      'a?x=1',
      'x'.repeat(65),
      7,
      null
    ])
      rejects('app.open', value);
  });

  it('外观补丁：只接受登记的取值，至少一项，不认识的字段拒绝', () => {
    expect(parseDesktopArguments('appearance.set', { appearance: 'dark' })).toEqual({ appearance: 'dark' });
    expect(parseDesktopArguments('appearance.set', { accent: 'green', appearance: 'auto' })).toEqual({
      accent: 'green',
      appearance: 'auto'
    });
    for (const value of [
      {},
      null,
      'dark',
      { appearance: 'neon' },
      { accent: 'teal' },
      { theme: 'dark' },
      { appearance: 'dark', wallpaper: 'forest' },
      { appearance: 1 }
    ])
      rejects('appearance.set', value);
  });
});

describe('desktopProps 与 getDesktop', () => {
  it('宿主不提供桌面能力时得到 undefined，应用按普通网页运行', () => {
    expect(getDesktop(connect({ theme: 'dark' }).client)).toBeUndefined();
  });

  it('宿主把清单授予的能力放进启动属性，应用读到的是同一份', () => {
    expect(desktopProps(['window', 'appearance'])).toEqual({
      [DESKTOP_PROP]: { capabilities: ['window', 'appearance'] }
    });
    expect(desktopProps([])).toEqual({ [DESKTOP_PROP]: { capabilities: [] } });
    expect(getDesktop(connect(desktopProps(['window', 'appearance'])).client)?.capabilities).toEqual([
      'window',
      'appearance'
    ]);
  });

  it('应用读到不认识的能力名时忽略它、重复的合并：新版宿主可能授予旧 SDK 还不认识的能力，应用照常启动', () => {
    const props = { [DESKTOP_PROP]: { capabilities: ['window', 'teleport', 'window', 42, 'menu'] } };
    expect(getDesktop(connect(props).client)?.capabilities).toEqual(['window', 'menu']);
  });

  it('能力列表不合法就拒绝，不带着错误的能力启动', () => {
    expect(() => desktopProps(['window', 'window'])).toThrow(OrbitError);
    expect(() => desktopProps(['teleport' as never])).toThrow(OrbitError);
    expect(() => getDesktop(connect({ [DESKTOP_PROP]: 'window' }).client)).toThrow(OrbitError);
    expect(() => getDesktop(connect({ [DESKTOP_PROP]: { capabilities: 'window' } }).client)).toThrow(OrbitError);
    expect(() => getDesktop(connect({ [DESKTOP_PROP]: {} }).client)).toThrow(OrbitError);
  });
});

describe('serveDesktop 与 getDesktop：统一信封', () => {
  it('窗口：读取状态、改标题、最小化、还原、缩放、关闭、标题栏开关、拖动区，参数原样到宿主', async () => {
    const { desktop, calls } = setup();
    expect(await desktop.window.getState()).toEqual(windowState);
    await desktop.window.setTitle('demo — Aiao Code');
    await desktop.window.minimize();
    await desktop.window.restore();
    await desktop.window.toggleMaximize();
    await desktop.window.setDecorations(false);
    const region = { x: 0, y: 0, width: 800, height: 36, holes: [] };
    await desktop.window.setDragRegions([region]);
    await desktop.window.close();
    expect(calls).toEqual([
      ['window.getState'],
      ['window.setTitle', 'demo — Aiao Code'],
      ['window.minimize'],
      ['window.restore'],
      ['window.toggleMaximize'],
      ['window.setDecorations', false],
      ['window.setDragRegions', [region]],
      ['window.close']
    ]);
  });

  it('菜单、应用与外观：成功结果与参数一一对应', async () => {
    const { desktop, calls } = setup();
    await desktop.menu.set(sections);
    await desktop.app.open('notes');
    await desktop.app.focus();
    await desktop.app.quit();
    expect(await desktop.appearance.get()).toEqual(appearance);
    const patch: DesktopAppearancePatch = { appearance: 'dark', accent: 'purple' };
    await desktop.appearance.set(patch);
    expect(calls).toEqual([
      ['menu.set', parseDesktopArguments('menu.set', sections)],
      ['app.open', 'notes'],
      ['app.focus'],
      ['app.quit'],
      ['appearance.get'],
      ['appearance.set', patch]
    ]);
  });

  it('宿主的拒绝带着稳定错误码回到应用，同时回调 onError 让桌面给出可见原因', async () => {
    const { desktop, control, onError } = setup();
    control.fail = new DesktopError('CAPABILITY_DENIED', '菜单能力未在清单里声明');
    const error = await desktop.menu.set(sections).then(
      () => undefined,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(DesktopError);
    expect(error).toMatchObject({ code: 'CAPABILITY_DENIED', message: '菜单能力未在清单里声明' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'CAPABILITY_DENIED' }), 'menu.set');
    for (const code of DESKTOP_ERROR_CODES) {
      control.fail = new DesktopError(code, code);
      await expect(desktop.app.focus()).rejects.toMatchObject({ code });
    }
  });

  it('宿主自己的程序错误不冒充任何能力错误码：作为处理失败原样回给应用', async () => {
    const { desktop, control, onError } = setup();
    control.fail = new Error('宿主出 bug 了');
    await expect(desktop.app.focus()).rejects.toMatchObject({ code: 'HANDLER_ERROR', message: '宿主出 bug 了' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('线上的非法参数在宿主侧拒绝：INVALID_ARGUMENT，宿主函数不会被调用', async () => {
    const { client, calls, onError } = setup();
    const raw = (method: string, args: unknown) =>
      client.request(`desktop.${method}`, { instanceId: 'w1#1', args } as OrbitValue);
    expect(await raw('window.setTitle', 42)).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await raw('app.open', 'https://evil.example/')).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(
      await raw('menu.set', [
        {
          label: 'a',
          items: [
            { id: 'x', label: 'x' },
            { id: 'x', label: 'y' }
          ]
        }
      ])
    ).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(await client.request('desktop.window.setTitle', 'no-frame' as OrbitValue)).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(await client.request('desktop.window.setTitle', { instanceId: 'w1#1' } as OrbitValue)).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(await client.request('desktop.window.setTitle', { instanceId: 1, args: 'x' } as OrbitValue)).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(calls).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(6);
  });

  it('请求只认方法表里的操作：未登记的方法是 UNKNOWN_METHOD，旧版逐方法协议不在这条路径上', async () => {
    const { client, handlers } = setup();
    await expect(client.request('desktop.filesystem.list', null)).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
    await expect(client.request('desktop.filesystem.delete', null)).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
    await expect(client.request('window.minimize', null)).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
    expect([...handlers.keys()].sort()).toEqual(
      [
        'desktop.window.getState',
        'desktop.window.setTitle',
        'desktop.window.minimize',
        'desktop.window.restore',
        'desktop.window.toggleMaximize',
        'desktop.window.close',
        'desktop.window.setDecorations',
        'desktop.window.setDragRegions',
        'desktop.menu.set',
        'desktop.app.open',
        'desktop.app.focus',
        'desktop.app.quit',
        'desktop.appearance.get',
        'desktop.appearance.set',
        'desktop.notification.post',
        'desktop.clipboard.readText',
        'desktop.clipboard.writeText',
        'desktop.filesystem.open',
        'desktop.filesystem.save'
      ].sort()
    );
  });

  it('事件：窗口状态、菜单命令与外观变化推给应用；应用可退订；未就绪时不推', async () => {
    const { desktop, emitted, stateListeners, commandListeners, appearanceListeners, transition } = setup();
    const states: DesktopWindowState[] = [];
    const commands: string[] = [];
    const looks: DesktopAppearance[] = [];
    const offState = desktop.window.onStateChange(next => states.push(next));
    const offCommand = desktop.menu.onCommand(commandId => commands.push(commandId));
    const offAppearance = desktop.appearance.onChange(next => looks.push(next));
    for (const listener of stateListeners) listener({ ...windowState, focused: false });
    for (const listener of commandListeners) listener('open');
    for (const listener of appearanceListeners) listener({ ...appearance, theme: 'dark' });
    expect(states).toEqual([{ ...windowState, focused: false }]);
    expect(commands).toEqual(['open']);
    expect(looks).toEqual([{ ...appearance, theme: 'dark' }]);
    expect(emitted.map(([event]) => event)).toEqual([
      'desktop.window.state',
      'desktop.menu.command',
      'desktop.appearance.change'
    ]);
    offState();
    offCommand();
    offAppearance();
    for (const listener of stateListeners) listener(windowState);
    for (const listener of commandListeners) listener('save');
    for (const listener of appearanceListeners) listener(appearance);
    expect(states).toHaveLength(1);
    expect(commands).toEqual(['open']);
    expect(looks).toHaveLength(1);
    transition('loading');
    for (const listener of commandListeners) listener('save');
    expect(emitted).toHaveLength(6);
  });

  it('应用侧读不懂的结果与事件显式失败，不当作成功', async () => {
    const { desktop, host, stateListeners, clientErrors } = setup();
    vi.spyOn(host.appearance, 'get').mockReturnValue({ theme: 'sepia' } as never);
    await expect(desktop.appearance.get()).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    vi.spyOn(host.window, 'getState').mockReturnValue({ platform: 'macos' } as never);
    await expect(desktop.window.getState()).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    const seen = vi.fn();
    desktop.window.onStateChange(seen);
    for (const listener of stateListeners) listener({ platform: 'macos' } as never);
    expect(seen).not.toHaveBeenCalled();
    expect(clientErrors).toHaveLength(1);
    expect(clientErrors[0]).toBeInstanceOf(AggregateError);
  });
});

describe('默认拒绝：清单没声明的能力一律 CAPABILITY_DENIED', () => {
  const everyMethod: [DesktopMethod, unknown][] = [
    ['window.getState', null],
    ['window.setTitle', 'x'],
    ['window.minimize', null],
    ['window.restore', null],
    ['window.toggleMaximize', null],
    ['window.close', null],
    ['window.setDecorations', true],
    ['window.setDragRegions', []],
    ['menu.set', []],
    ['app.open', 'notes'],
    ['app.focus', null],
    ['app.quit', null],
    ['appearance.get', null],
    ['appearance.set', { appearance: 'dark' }],
    ['notification.post', { title: 'T', body: 'B' }],
    ['clipboard.readText', null],
    ['clipboard.writeText', 'x'],
    ['filesystem.open', {}],
    ['filesystem.save', { suggestedName: 'a.txt', bytes: 'aGk=' }]
  ];

  it('什么都没声明：每个方法都被拒绝，宿主函数一个也不会被调用，每次拒绝都通知桌面', async () => {
    const { client, calls, onError } = setup([]);
    for (const [method, args] of everyMethod) {
      const reply = await client.request(`desktop.${method}`, { instanceId: 'w1#1', args } as OrbitValue);
      expect(reply, method).toMatchObject({ ok: false, code: 'CAPABILITY_DENIED' });
    }
    expect(calls).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(everyMethod.length);
  });

  it('只声明 window：窗口操作成功，菜单、应用、外观被拒绝；拒绝先于参数校验，不泄露校验细节', async () => {
    const { desktop, client, calls } = setup(['window']);
    await desktop.window.setTitle('ok');
    await expect(desktop.menu.set(sections)).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    await expect(desktop.app.focus()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    await expect(desktop.appearance.get()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(await client.request('desktop.menu.set', { instanceId: 'w1#1', args: 'not even valid' })).toMatchObject({
      ok: false,
      code: 'CAPABILITY_DENIED'
    });
    expect(calls).toEqual([['window.setTitle', 'ok']]);
  });

  it('读与写分开授权：只有 appearance:write 不能读，只有 appearance 不能写', async () => {
    const readOnly = setup(['appearance']);
    expect(await readOnly.desktop.appearance.get()).toEqual(appearance);
    await expect(readOnly.desktop.appearance.set({ appearance: 'dark' })).rejects.toMatchObject({
      code: 'CAPABILITY_DENIED'
    });
    const writeOnly = setup(['appearance:write']);
    await expect(writeOnly.desktop.appearance.get()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    await writeOnly.desktop.appearance.set({ appearance: 'dark' });
    expect(writeOnly.calls).toEqual([['appearance.set', { appearance: 'dark' }]]);
  });

  it('推送也受清单约束：没声明的能力，宿主不为它订阅事件，应用也就收不到窗口状态、菜单命令或外观变化', () => {
    const none = setup([]);
    expect(none.stateListeners.size + none.commandListeners.size + none.appearanceListeners.size).toBe(0);
    const some = setup(['window', 'appearance']);
    expect([some.stateListeners.size, some.commandListeners.size, some.appearanceListeners.size]).toEqual([1, 0, 1]);
    const menuOnly = setup(['menu']);
    expect([menuOnly.stateListeners.size, menuOnly.commandListeners.size, menuOnly.appearanceListeners.size]).toEqual([
      0, 1, 0
    ]);
  });

  it('授予的是阶段 D 的能力名也不放行第一批的方法：能力与方法一一对应', async () => {
    const { desktop, calls } = setup([
      'notification',
      'clipboard:read',
      'clipboard:write',
      'filesystem:read',
      'filesystem:write'
    ]);
    await expect(desktop.app.focus()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    await expect(desktop.window.getState()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(calls).toEqual([]);
  });
});

describe('实例绑定与迟到调用', () => {
  it('请求带的实例 ID 与这条连接不符：按实例 ID 丢弃，WINDOW_CLOSED，宿主函数不会被调用', async () => {
    const { client, calls, onError } = setup();
    const stale = await client.request('desktop.window.setTitle', { instanceId: 'w1#0', args: 'late title' });
    expect(stale).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    expect(calls).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'WINDOW_CLOSED' }), 'window.setTitle');
  });

  it('实例销毁或失败之后，已派发出去的旧请求回调也被丢弃', async () => {
    for (const end of ['destroyed', 'failed'] as const) {
      const { handlers, calls, transition } = setup();
      const handler = handlers.get('desktop.window.setTitle')!;
      transition(end);
      const late = await handler({ instanceId: 'w1#1', args: 'late' }, new AbortController().signal);
      expect(late).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
      expect(calls).toEqual([]);
    }
  });

  it('实例结束时自动解绑：方法注销，宿主的订阅取消，之后宿主再触发事件也不会推给已结束的实例', () => {
    const { handlers, emitted, stateListeners, commandListeners, appearanceListeners, observers, transition } = setup();
    expect(handlers.size).toBeGreaterThan(0);
    transition('destroyed');
    expect(handlers.size).toBe(0);
    expect(stateListeners.size + commandListeners.size + appearanceListeners.size).toBe(0);
    expect(observers.size).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('手动 dispose 幂等：注销方法与订阅，迟到的旧回调 WINDOW_CLOSED', async () => {
    const { server, handlers, calls, commandListeners } = setup();
    const handler = handlers.get('desktop.menu.set')!;
    const listeners = [...commandListeners];
    server.dispose();
    server.dispose();
    expect(handlers.size).toBe(0);
    expect(commandListeners.size).toBe(0);
    expect(await handler({ instanceId: 'w1#1', args: [] }, new AbortController().signal)).toMatchObject({
      ok: false,
      code: 'WINDOW_CLOSED'
    });
    listeners.forEach(listener => listener('open'));
    expect(calls).toEqual([]);
  });

  it('同一实例不能登记两次桌面能力', () => {
    const { instance, host } = setup();
    expect(() => serveDesktop(instance, host, { capabilities: [] })).toThrow(OrbitError);
  });
});

describe('超时与 RPC 层错误', () => {
  it('宿主 5 秒内没处理完：TIMEOUT 信封，晚到的宿主结果被忽略', async () => {
    vi.useFakeTimers();
    const { desktop, control, onError } = setup();
    control.hang = true;
    const pending = desktop.app.focus().then(
      () => undefined,
      (reason: unknown) => reason
    );
    await vi.advanceTimersByTimeAsync(DESKTOP_LIMITS.requestTimeoutMs - 1);
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }), 'app.focus');
  });

  it('应用侧把 RPC 层的失败归到稳定错误码：超时、连接已销毁、载荷非法；其余照原样抛出', async () => {
    const { desktop, failNext } = setup();
    failNext(new OrbitError('TIMEOUT', '请求超时'));
    await expect(desktop.app.focus()).rejects.toMatchObject({ name: 'DesktopError', code: 'TIMEOUT' });
    failNext(new OrbitError('DESTROYED', '实例或连接已销毁'));
    await expect(desktop.app.focus()).rejects.toMatchObject({ name: 'DesktopError', code: 'WINDOW_CLOSED' });
    failNext(new OrbitError('INVALID_PAYLOAD', '消息必须是 JSON'));
    await expect(desktop.window.setTitle('x')).rejects.toMatchObject({
      name: 'DesktopError',
      code: 'INVALID_ARGUMENT'
    });
    failNext(new OrbitError('ABORTED', '操作已取消'));
    await expect(desktop.app.focus()).rejects.toMatchObject({ name: 'OrbitError', code: 'ABORTED' });
  });

  it('应用读不懂宿主的信封时显式失败', async () => {
    const { client, desktop } = setup();
    const bad: OrbitValue[] = [
      null,
      'ok',
      { ok: 'yes' },
      { ok: false, code: 'NOPE', message: 'x' },
      { ok: false, code: 'BUSY' }
    ];
    for (const reply of bad) {
      vi.spyOn(client, 'request').mockResolvedValueOnce(reply);
      await expect(desktop.app.focus()).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    }
  });
});

describe('参数校验：通知、剪贴板与文件', () => {
  const rejects = (method: DesktopMethod, value: unknown, code = 'INVALID_ARGUMENT') =>
    expect(() => parseDesktopArguments(method, value)).toThrow(expect.objectContaining({ name: 'DesktopError', code }));
  /** 1×1 的 PNG，解码后几十个字节。 */
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('通知：标题与正文必填，图标与去重键可选，规整后的结果不含多余字段', () => {
    expect(parseDesktopArguments('notification.post', { title: 'Build finished', body: '' })).toEqual({
      title: 'Build finished',
      body: ''
    });
    expect(
      parseDesktopArguments('notification.post', {
        title: 'T',
        body: 'line 1\nline\t2',
        icon: 'app-notes',
        dedupeKey: 'build:42'
      })
    ).toEqual({ title: 'T', body: 'line 1\nline\t2', icon: 'app-notes', dedupeKey: 'build:42' });
    expect(parseDesktopArguments('notification.post', { title: 'T', body: 'B', icon: PNG }).icon).toBe(PNG);
  });

  it('通知：标题、正文、去重键的长度与字符上限是协议常量；非法一律 INVALID_ARGUMENT', () => {
    const { titleLength, bodyLength, dedupeKeyLength } = DESKTOP_LIMITS.notification;
    expect(
      parseDesktopArguments('notification.post', { title: 'x'.repeat(titleLength), body: 'y'.repeat(bodyLength) })
    ).toMatchObject({ title: 'x'.repeat(titleLength) });
    const bad: unknown[] = [
      null,
      'text',
      {},
      { body: 'B' },
      { title: 'T' },
      { title: '', body: 'B' },
      { title: '   ', body: 'B' },
      { title: 'x'.repeat(titleLength + 1), body: 'B' },
      { title: 'T\u0007', body: 'B' },
      { title: 'T\nsecond line', body: 'B' },
      { title: 'T', body: 'y'.repeat(bodyLength + 1) },
      { title: 'T', body: 'B\u0000' },
      { title: 'T', body: 42 },
      { title: 'T', body: 'B', dedupeKey: '' },
      { title: 'T', body: 'B', dedupeKey: 'k'.repeat(dedupeKeyLength + 1) },
      { title: 'T', body: 'B', dedupeKey: 'a\u0000b' },
      { title: 'T', body: 'B', sender: 'Mail' },
      { title: 'T', body: 'B', appId: 'mail' },
      { title: 42, body: 'B' }
    ];
    for (const value of bad) rejects('notification.post', value);
  });

  it('通知的图标：登记图标的 ID 或不超过上限的内联图片；其余（网址、脚本、SVG、超限）都不要', () => {
    const { iconBytes } = DESKTOP_LIMITS.notification;
    const image = (bytes: number) => `data:image/png;base64,${btoa('a'.repeat(bytes))}`;
    expect(parseDesktopArguments('notification.post', { title: 'T', body: 'B', icon: image(iconBytes) }).icon).toBe(
      image(iconBytes)
    );
    const bad = [
      '',
      'https://evil.example/x.png',
      'javascript:alert(1)',
      '../app-notes',
      '#app-notes',
      'with space',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:text/html;base64,PGI+eDwvYj4=',
      'data:image/png;base64,not base64!',
      'data:image/png;utf8,abc',
      image(iconBytes + 1),
      'x'.repeat(100_000),
      42
    ];
    for (const icon of bad) rejects('notification.post', { title: 'T', body: 'B', icon });
  });

  it('剪贴板：读取不带参数；写入是不超过上限的任意文字（可以为空，可以含换行）', () => {
    expect(parseDesktopArguments('clipboard.readText', null)).toBeNull();
    rejects('clipboard.readText', 'x');
    expect(parseDesktopArguments('clipboard.writeText', '')).toBe('');
    expect(parseDesktopArguments('clipboard.writeText', 'a\nb\tc')).toBe('a\nb\tc');
    const { textLength } = DESKTOP_LIMITS.clipboard;
    expect(parseDesktopArguments('clipboard.writeText', 'x'.repeat(textLength))).toHaveLength(textLength);
    rejects('clipboard.writeText', 'x'.repeat(textLength + 1));
    rejects('clipboard.writeText', 42);
    rejects('clipboard.writeText', null);
  });

  it('打开：accept 只是显示过滤，扩展名与 MIME 类型转成小写，最多 16 项；不认识的写法与字段拒绝', () => {
    expect(parseDesktopArguments('filesystem.open', null)).toEqual({});
    expect(parseDesktopArguments('filesystem.open', undefined)).toEqual({});
    expect(parseDesktopArguments('filesystem.open', {})).toEqual({});
    expect(parseDesktopArguments('filesystem.open', { accept: ['.MD', '.txt', 'Text/*', 'image/png'] })).toEqual({
      accept: ['.md', '.txt', 'text/*', 'image/png']
    });
    expect(parseDesktopArguments('filesystem.open', { accept: [] })).toEqual({ accept: [] });
    const many = Array.from({ length: DESKTOP_LIMITS.filesystem.acceptEntries }, (_, index) => `.e${index}`);
    expect(parseDesktopArguments('filesystem.open', { accept: many })).toEqual({ accept: many });
    rejects('filesystem.open', { accept: [...many, '.more'] });
    for (const accept of [['md'], ['.'], ['*/*'], ['text/'], ['.a/b'], ['..md'], [''], [42], 'text/*', { 0: '.md' }])
      rejects('filesystem.open', { accept });
    rejects('filesystem.open', { accept: ['.md'], directory: true });
    rejects('filesystem.open', { path: '/etc/passwd' });
    rejects('filesystem.open', 'text/*');
  });

  it('保存：带凭证与版本写回，或不带凭证另存；内容可以是字节数组（直接调用）或 base64（线上）', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const direct = parseDesktopArguments('filesystem.save', { suggestedName: 'a.md', bytes });
    expect(direct).toEqual({ suggestedName: 'a.md', bytes });
    expect(direct.bytes).not.toBe(bytes);
    expect(parseDesktopArguments('filesystem.save', { suggestedName: 'a.md', bytes: 'AQID' })).toEqual({
      suggestedName: 'a.md',
      bytes
    });
    expect(
      parseDesktopArguments('filesystem.save', {
        handle: 'h-1.x_y',
        suggestedName: 'a.md',
        bytes: '',
        expectedVersion: '1731000000000:3'
      })
    ).toEqual({
      handle: 'h-1.x_y',
      suggestedName: 'a.md',
      bytes: new Uint8Array(0),
      expectedVersion: '1731000000000:3'
    });
    const buffer = new Uint8Array([9, 8]).buffer;
    expect(parseDesktopArguments('filesystem.save', { suggestedName: 'a', bytes: buffer }).bytes).toEqual(
      new Uint8Array([9, 8])
    );
  });

  it('保存：文件名、凭证、版本、内容的非法写法都是 INVALID_ARGUMENT', () => {
    const base = { suggestedName: 'a.md', bytes: 'AQID' };
    const bad: unknown[] = [
      null,
      'a.md',
      {},
      { bytes: 'AQID' },
      { suggestedName: 'a.md' },
      { ...base, suggestedName: '' },
      { ...base, suggestedName: '   ' },
      { ...base, suggestedName: 'a/b.md' },
      { ...base, suggestedName: 'a\\b.md' },
      { ...base, suggestedName: '.' },
      { ...base, suggestedName: '..' },
      { ...base, suggestedName: 'a\u0000.md' },
      { ...base, suggestedName: 'n'.repeat(DESKTOP_LIMITS.filesystem.nameLength + 1) },
      { ...base, suggestedName: 42 },
      { ...base, bytes: 'not base64!' },
      { ...base, bytes: 'AQI' },
      { ...base, bytes: 42 },
      { ...base, bytes: [1, 2, 3] },
      { ...base, handle: '' },
      { ...base, handle: 'has space' },
      { ...base, handle: 'x'.repeat(129) },
      { ...base, handle: 42 },
      { ...base, expectedVersion: '1:2' },
      { ...base, handle: 'h', expectedVersion: 'latest' },
      { ...base, handle: 'h', expectedVersion: '12:' },
      { ...base, handle: 'h', expectedVersion: 7 },
      { ...base, path: '/etc/passwd' },
      { ...base, overwrite: true }
    ];
    for (const value of bad) rejects('filesystem.save', value);
  });

  it('保存：内容超过 512 KiB 是 FILE_TOO_LARGE（不是 INVALID_ARGUMENT），恰好等于上限则放行；超大的 base64 文本不先解码', () => {
    const { bytes: limit } = DESKTOP_LIMITS.filesystem;
    expect(
      parseDesktopArguments('filesystem.save', { suggestedName: 'a', bytes: new Uint8Array(limit) }).bytes
    ).toHaveLength(limit);
    rejects('filesystem.save', { suggestedName: 'a', bytes: new Uint8Array(limit + 1) }, 'FILE_TOO_LARGE');
    rejects('filesystem.save', { suggestedName: 'a', bytes: new ArrayBuffer(limit + 1) }, 'FILE_TOO_LARGE');
    rejects('filesystem.save', { suggestedName: 'a', bytes: btoa('a'.repeat(limit + 1)) }, 'FILE_TOO_LARGE');
    const atob = vi.spyOn(globalThis, 'atob');
    rejects(
      'filesystem.save',
      { suggestedName: 'a', bytes: 'A'.repeat(Math.ceil(limit / 3) * 4 + 4) },
      'FILE_TOO_LARGE'
    );
    expect(atob).not.toHaveBeenCalled();
    atob.mockRestore();
  });
});

describe('通知、剪贴板与文件经统一信封', () => {
  /** 等应用侧的一个调用在下一轮微任务里落定。 */
  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('通知：参数原样到宿主，回执回到应用；宿主拒绝带着稳定错误码回来（RATE_LIMITED）', async () => {
    const { desktop, calls, host, onError } = setup(EVERYTHING);
    expect(
      await desktop.notification.post({ title: 'Build finished', body: 'main is green', dedupeKey: 'ci' })
    ).toEqual({
      id: 'n1'
    });
    expect(calls).toEqual([['notification.post', { title: 'Build finished', body: 'main is green', dedupeKey: 'ci' }]]);
    vi.spyOn(host.notification, 'post').mockImplementation(() => {
      throw new DesktopError('RATE_LIMITED', '每分钟最多 10 条');
    });
    await expect(desktop.notification.post({ title: 'again', body: '' })).rejects.toMatchObject({
      name: 'DesktopError',
      code: 'RATE_LIMITED'
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }), 'notification.post');
  });

  it('剪贴板：读与写分别授权；浏览器层的拒绝（BROWSER_PERMISSION_DENIED）原样回到应用', async () => {
    const { desktop, calls, host } = setup(['clipboard:read']);
    expect(await desktop.clipboard.readText()).toBe('from clipboard');
    await expect(desktop.clipboard.writeText('x')).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    const writer = setup(['clipboard:write']);
    await writer.desktop.clipboard.writeText('hello');
    await expect(writer.desktop.clipboard.readText()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(writer.calls).toEqual([['clipboard.writeText', 'hello']]);
    expect(calls).toEqual([['clipboard.readText']]);
    vi.spyOn(host.clipboard, 'readText').mockImplementation(() => {
      throw new DesktopError('BROWSER_PERMISSION_DENIED', '用户拒绝了剪贴板权限');
    });
    await expect(desktop.clipboard.readText()).rejects.toMatchObject({ code: 'BROWSER_PERMISSION_DENIED' });
  });

  it('打开：宿主先应答「已受理」，用户选定后结果经完成事件到达；字节在线上是 base64，应用拿到的是字节数组', async () => {
    const { desktop, calls, emitted, handlers, interactions } = setup(EVERYTHING);
    const file = await desktop.filesystem.open({ accept: ['.md'] });
    expect(file).toEqual(opened);
    /* 宿主拿到计时控制，用它声明哪一段是在等用户。 */
    expect(interactions).toHaveLength(1);
    expect(typeof interactions[0]?.waitForUser).toBe('function');
    expect(file.bytes).toBeInstanceOf(Uint8Array);
    expect(Object.isFrozen(file)).toBe(true);
    expect(calls).toEqual([['filesystem.open', { accept: ['.md'] }]]);
    const settled = emitted.filter(([event]) => event === 'desktop.request.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0]![1]).toMatchObject({
      requestId: 'w1#1/1',
      envelope: { ok: true, value: { name: 'notes.md', bytes: 'aGkh', handle: 'handle-1' } }
    });
    /* 应答本身只有「已受理」，不带内容。 */
    const raw = await handlers.get('desktop.filesystem.open')!(
      { instanceId: 'w1#1', args: {}, requestId: 'r-raw' },
      new AbortController().signal
    );
    expect(raw).toEqual({ ok: true, value: null });
  });

  it('保存：不带凭证走面板的形态（已受理 + 完成事件），带凭证直接应答、不收 requestId', async () => {
    const { desktop, calls, emitted, handlers } = setup(EVERYTHING);
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await desktop.filesystem.save({ suggestedName: 'a.md', bytes })).toEqual(saved);
    expect(emitted.filter(([event]) => event === 'desktop.request.settled')).toHaveLength(1);
    expect(
      await desktop.filesystem.save({
        handle: 'handle-1',
        suggestedName: 'a.md',
        bytes,
        expectedVersion: '1731000000000:3'
      })
    ).toEqual(saved);
    expect(emitted.filter(([event]) => event === 'desktop.request.settled')).toHaveLength(1);
    expect(calls).toEqual([
      ['filesystem.save', { suggestedName: 'a.md', bytes }],
      ['filesystem.save', { handle: 'handle-1', suggestedName: 'a.md', bytes, expectedVersion: '1731000000000:3' }]
    ]);
    const direct = await handlers.get('desktop.filesystem.save')!(
      { instanceId: 'w1#1', args: { handle: 'h', suggestedName: 'a', bytes: '' }, requestId: 'r1' },
      new AbortController().signal
    );
    expect(direct).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  });

  it('需要用户操作的请求：缺 requestId、重复的 requestId、不合规的 requestId 都是 INVALID_ARGUMENT，宿主不会被调用', async () => {
    const { handlers, calls, onError } = setup(EVERYTHING);
    const open = handlers.get('desktop.filesystem.open')!;
    const call = (payload: OrbitValue) => open(payload, new AbortController().signal);
    expect(await call({ instanceId: 'w1#1', args: {} })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(await call({ instanceId: 'w1#1', args: {}, requestId: 'has space' })).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(await call({ instanceId: 'w1#1', args: {}, requestId: 7 })).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT'
    });
    expect(calls).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it('重复的 requestId 在第一个请求还在等用户时被拒绝；落定之后同一个 ID 可以再用', async () => {
    const { handlers, host, calls } = setup(EVERYTHING);
    let finish!: (file: DesktopOpenedFile) => void;
    vi.spyOn(host.filesystem, 'open').mockImplementation(
      () => new Promise<DesktopOpenedFile>(resolve => (finish = resolve))
    );
    const open = handlers.get('desktop.filesystem.open')!;
    const send = () => open({ instanceId: 'w1#1', args: {}, requestId: 'r1' }, new AbortController().signal);
    expect(await send()).toEqual({ ok: true, value: null });
    expect(await send()).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', message: expect.stringContaining('r1') });
    finish(opened);
    await flush();
    expect(await send()).toEqual({ ok: true, value: null });
    expect(calls).toEqual([]);
  });

  it('用户取消、BUSY 这类稳定错误码经完成事件回到应用，同时通知桌面（onError）', async () => {
    const { desktop, host, onError } = setup(EVERYTHING);
    for (const code of ['USER_CANCELLED', 'BUSY', 'FILE_TOO_LARGE', 'FILE_NOT_FOUND', 'WINDOW_CLOSED'] as const) {
      vi.spyOn(host.filesystem, 'open').mockRejectedValueOnce(new DesktopError(code, `host says ${code}`));
      await expect(desktop.filesystem.open()).rejects.toMatchObject({
        name: 'DesktopError',
        code,
        message: `host says ${code}`
      });
      expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ code }), 'filesystem.open');
    }
    for (const code of ['FILE_CHANGED', 'FILE_NOT_FOUND', 'HANDLE_INVALID'] as const) {
      vi.spyOn(host.filesystem, 'save').mockImplementationOnce(() => {
        throw new DesktopError(code, code);
      });
      await expect(
        desktop.filesystem.save({ handle: 'handle-1', suggestedName: 'a', bytes: new Uint8Array(0) })
      ).rejects.toMatchObject({ code });
    }
  });

  it('宿主自己的程序错误不冒充任何错误码：交互式请求也作为处理失败（HANDLER_ERROR）回给应用', async () => {
    const { desktop, host, onError } = setup(EVERYTHING);
    vi.spyOn(host.filesystem, 'open').mockRejectedValueOnce(new Error('磁盘读坏了'));
    await expect(desktop.filesystem.open()).rejects.toMatchObject({
      name: 'OrbitError',
      code: 'HANDLER_ERROR',
      message: '磁盘读坏了'
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('文件读与写分开授权：只有 filesystem:read 能打开不能保存，只有 filesystem:write 能保存不能打开', async () => {
    const reader = setup(['filesystem:read']);
    expect(await reader.desktop.filesystem.open()).toEqual(opened);
    await expect(
      reader.desktop.filesystem.save({ suggestedName: 'a', bytes: new Uint8Array(1) })
    ).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    const writer = setup(['filesystem:write']);
    await expect(writer.desktop.filesystem.open()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(await writer.desktop.filesystem.save({ suggestedName: 'a', bytes: new Uint8Array(1) })).toEqual(saved);
    expect(reader.calls).toEqual([['filesystem.open', {}]]);
    expect(writer.calls).toEqual([['filesystem.save', { suggestedName: 'a', bytes: new Uint8Array(1) }]]);
  });

  it('应用读不懂宿主的文件结果与完成事件时显式失败，不当作成功', async () => {
    const { desktop, host } = setup(EVERYTHING);
    for (const broken of [
      { ...opened, bytes: undefined },
      { ...opened, version: 'latest' },
      { ...opened, handle: '' },
      null
    ]) {
      vi.spyOn(host.filesystem, 'open').mockResolvedValueOnce(broken as never);
      await expect(desktop.filesystem.open()).rejects.toMatchObject({ code: expect.stringMatching(/INVALID|HANDLER/) });
    }
    vi.spyOn(host.filesystem, 'save').mockResolvedValueOnce({ name: 'a' } as never);
    await expect(
      desktop.filesystem.save({ handle: 'h', suggestedName: 'a', bytes: new Uint8Array(0) })
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
  });

  it('应用的连接断开（窗口关闭、实例销毁）时还在等用户的调用以 WINDOW_CLOSED 结束', async () => {
    const { desktop, host, disposeClient } = setup(EVERYTHING);
    vi.spyOn(host.filesystem, 'open').mockImplementation(() => new Promise<DesktopOpenedFile>(() => undefined));
    const waiting = desktop.filesystem.open().then(
      () => 'resolved',
      (error: unknown) => (error as DesktopError).code
    );
    await flush();
    disposeClient();
    expect(await waiting).toBe('WINDOW_CLOSED');
  });

  it('请求还没被受理就失败（RPC 层错误、被拒绝）时不留下等待者：重试照常，也没有多余的完成事件', async () => {
    const { desktop, failNext, emitted } = setup(EVERYTHING);
    failNext(new OrbitError('TIMEOUT', '请求超时'));
    await expect(desktop.filesystem.open()).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(emitted).toEqual([]);
    expect(await desktop.filesystem.open()).toEqual(opened);
    expect(emitted.filter(([event]) => event === 'desktop.request.settled')).toHaveLength(1);
    const denied = setup([]);
    await expect(denied.desktop.filesystem.open()).rejects.toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(denied.emitted).toEqual([]);
  });

  it('不需要用户操作的请求不收 requestId：带了就是 INVALID_ARGUMENT', async () => {
    const { handlers, calls } = setup(EVERYTHING);
    const reply = await handlers.get('desktop.window.getState')!(
      { instanceId: 'w1#1', args: null, requestId: 'r1' },
      new AbortController().signal
    );
    expect(reply).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(calls).toEqual([]);
  });
});

describe('超时只计宿主处理请求的时间', () => {
  /** 一个由测试控制何时结束的「用户操作」。 */
  function userAction() {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => (finish = resolve));
    return { pending, finish };
  }

  it('用户在面板里停留多久都不会让请求超时：宿主 5 秒、应用 7 秒的时限都只管宿主自己的处理', async () => {
    vi.useFakeTimers();
    const { desktop, host, onError } = setup(EVERYTHING);
    const user = userAction();
    vi.spyOn(host.filesystem, 'open').mockImplementation(async (_options, interaction) => {
      await interaction!.waitForUser(user.pending);
      return opened;
    });
    const result = desktop.filesystem.open().then(
      file => file,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(onError).not.toHaveBeenCalled();
    user.finish();
    expect(await result).toEqual(opened);
    expect(onError).not.toHaveBeenCalled();
  });

  it('用户选定之后宿主读写磁盘卡住仍然是 TIMEOUT：宿主处理的时间照常计，且与等用户之前用掉的时间合计', async () => {
    vi.useFakeTimers();
    const { desktop, host, onError } = setup(EVERYTHING);
    const user = userAction();
    vi.spyOn(host.filesystem, 'open').mockImplementation(async (_options, interaction) => {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      await interaction!.waitForUser(user.pending);
      await new Promise(resolve => setTimeout(resolve, 10_000));
      return opened;
    });
    const result = desktop.filesystem.open().then(
      () => undefined,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(3_000 + 60_000);
    user.finish();
    /* 等用户之前已用掉 3 秒，还剩 2 秒；宿主继续处理 1999 毫秒时仍在时限内。 */
    await vi.advanceTimersByTimeAsync(1_999);
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ name: 'DesktopError', code: 'TIMEOUT' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }), 'filesystem.open');
  });

  it('多次等用户的停留都不计入；其间宿主自己处理的时间合计超过 5 秒才超时', async () => {
    vi.useFakeTimers();
    const { desktop, host } = setup(EVERYTHING);
    const first = userAction();
    const second = userAction();
    vi.spyOn(host.filesystem, 'save').mockImplementation(async (_request, interaction) => {
      await interaction!.waitForUser(first.pending);
      await new Promise(resolve => setTimeout(resolve, 2_000));
      await interaction!.waitForUser(second.pending);
      await new Promise(resolve => setTimeout(resolve, 2_900));
      return saved;
    });
    const result = desktop.filesystem.save({ suggestedName: 'a', bytes: new Uint8Array(0) });
    await vi.advanceTimersByTimeAsync(30_000);
    first.finish();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(30_000);
    second.finish();
    await vi.advanceTimersByTimeAsync(2_900);
    expect(await result).toEqual(saved);
  });

  it('带凭证的保存没有面板：宿主处理超过 5 秒就是 TIMEOUT，应用在 7 秒的兜底之前就收到它', async () => {
    vi.useFakeTimers();
    const { desktop, control, onError } = setup(EVERYTHING);
    control.hang = true;
    const result = desktop.filesystem.save({ handle: 'handle-1', suggestedName: 'a', bytes: new Uint8Array(0) }).then(
      () => undefined,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(DESKTOP_LIMITS.requestTimeoutMs);
    expect(await result).toMatchObject({ code: 'TIMEOUT' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }), 'filesystem.save');
  });

  it('应用等「已受理」的应答用 callTimeoutMs 兜底（RPC 层的超时归为 TIMEOUT）；兜底之后的完成事件不会误认', async () => {
    const { desktop, client, failNext } = setup(EVERYTHING);
    const request = vi.spyOn(client, 'request');
    await desktop.filesystem.open();
    expect(request).toHaveBeenCalledWith('desktop.filesystem.open', expect.objectContaining({ requestId: 'w1#1/1' }), {
      timeout: DESKTOP_LIMITS.callTimeoutMs
    });
    failNext(new OrbitError('TIMEOUT', '请求超时'));
    await expect(desktop.filesystem.open()).rejects.toMatchObject({ name: 'DesktopError', code: 'TIMEOUT' });
    await desktop.filesystem.open();
    expect(request).toHaveBeenLastCalledWith(
      'desktop.filesystem.open',
      expect.objectContaining({ requestId: 'w1#1/3' }),
      { timeout: DESKTOP_LIMITS.callTimeoutMs }
    );
  });

  it('实例销毁之后宿主才完成的交互式请求：结果不再送出，宿主函数也只被调用过那一次', async () => {
    const { desktop, host, emitted, transition, calls } = setup(EVERYTHING);
    let finish!: (file: DesktopOpenedFile) => void;
    vi.spyOn(host.filesystem, 'open').mockImplementation(() => new Promise(resolve => (finish = resolve)));
    void desktop.filesystem.open().catch(() => undefined);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    transition('destroyed');
    finish(opened);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(emitted.filter(([event]) => event === 'desktop.request.settled')).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('旧实例迟到的文件请求按实例 ID 丢弃：WINDOW_CLOSED，宿主函数不会被调用，也没有完成事件', async () => {
    const { handlers, calls, onError, emitted } = setup(EVERYTHING);
    const late = await handlers.get('desktop.filesystem.save')!(
      {
        instanceId: 'w1#0',
        args: { suggestedName: 'late.txt', bytes: 'aGk=' },
        requestId: 'late'
      },
      new AbortController().signal
    );
    expect(late).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    const lateWithHandle = await handlers.get('desktop.filesystem.save')!(
      {
        instanceId: 'w1#0',
        args: { handle: 'handle-1', suggestedName: 'late.txt', bytes: 'aGk=', expectedVersion: '1:1' }
      },
      new AbortController().signal
    );
    expect(lateWithHandle).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
    expect(calls).toEqual([]);
    expect(emitted).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
