import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../bus.js';
import type {
  DesktopAppearance,
  DesktopAppearancePatch,
  DesktopCapability,
  DesktopHost,
  DesktopMenu,
  DesktopMethod,
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
  const client = {
    context: { props, instanceId },
    bus,
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
    }
  };
}

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
    }
  };
  return { host, calls, control, stateListeners, commandListeners, appearanceListeners };
}

/** 第一批已实现的能力，阶段 D 的先声明不实现。 */
const IMPLEMENTED: readonly DesktopCapability[] = ['window', 'menu', 'app', 'appearance', 'appearance:write'];

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
  it('能力名取值全集：第一批能力，阶段 D 的先声明', () => {
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
      notification: { titleLength: 120, bodyLength: 1_000, dedupeKeyLength: 128, iconBytes: 65_536, perMinute: 10 },
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
    expect(new Set(Object.values(DESKTOP_METHOD_CAPABILITIES))).toEqual(
      new Set(['window', 'menu', 'app', 'appearance', 'appearance:write'])
    );
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
    await expect(client.request('desktop.filesystem.open', null)).rejects.toMatchObject({ code: 'UNKNOWN_METHOD' });
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
        'desktop.appearance.set'
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
    ['appearance.set', { appearance: 'dark' }]
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
