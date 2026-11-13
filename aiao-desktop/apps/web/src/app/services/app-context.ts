import type {
  DesktopAppearance,
  DesktopAppearancePatch,
  DesktopArguments,
  DesktopCapability,
  DesktopErrorCode,
  DesktopHost,
  DesktopMenu,
  DesktopMenuCommand,
  DesktopMethod,
  DesktopWindowState
} from '@aiao/orbit/desktop';
import {
  DESKTOP_ERROR_PRESENTATION,
  DESKTOP_METHOD_CAPABILITIES,
  DesktopError,
  parseDesktopArguments
} from '@aiao/orbit/desktop';
import type { OrbitDragRegion } from '@aiao/orbit/window';
import { Injector, Service, Signal, computed, effect, inject, signal, untracked } from '@angular/core';

import { DESKTOP_APPS, DesktopAppId, DesktopAppRegistry, grantedCapabilities } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { MenuEntry, MenuSection, section } from './menu';
import { SystemState } from './system-state';
import { ThemeService } from './theme';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

/** 窗口里给用户看的一句原因（D-18 能力契约通用规则 2）：拒绝、参数非法、超时由桌面可见地说出来。 */
export interface DesktopNotice {
  /** 稳定错误码。 */
  readonly code: DesktopErrorCode;
  /** 触发它的方法，例如 `menu.set`。 */
  readonly method: DesktopMethod;
  /** 给用户看的一句话。 */
  readonly text: string;
}

/** 应用上下文需要的窗口管理操作；{@link WindowManager} 满足它。 */
export interface AppContextWindows {
  /** 当前前台窗口。 */
  readonly focused: Signal<DesktopWindow | null>;
  /** 打开已登记的应用；没有可打开的载荷时返回 null。 */
  open(appId: DesktopAppId): DesktopWindow | null;
  /** 提到前台。 */
  focus(id: string): void;
  /** 最小化。 */
  minimize(id: string): void;
  /** 从最小化还原。 */
  unminimize(id: string): void;
  /** 缩放。 */
  zoom(id: string): void;
  /** 关闭。 */
  close(id: string): void;
  /** 关闭一个应用的全部窗口。 */
  quitApp(appId: DesktopAppId): void;
}

/** 应用上下文读取系统外观所用的系统状态；{@link SystemState} 满足它。 */
export interface AppContextSystem {
  /** 屏幕上实际呈现的主题。 */
  readonly theme: Signal<'light' | 'dark'>;
  /** 用户选择的显示模式。 */
  readonly appearance: Signal<'light' | 'dark' | 'auto'>;
  /** 强调色。 */
  readonly accent: Signal<DesktopAppearance['accent']>;
}

/** 应用上下文写系统外观所走的服务；{@link ThemeService} 满足它。写入改的是全局系统设置，随设置服务持久化。 */
export interface AppContextTheme {
  /** 显示模式。 */
  setAppearance(mode: DesktopAppearance['appearance']): void;
  /** 强调色。 */
  setAccent(accent: DesktopAppearance['accent']): void;
}

/**
 * 窗口外观由窗口内容组件自己管（远程应用的标题栏显示、拖动层）：上下文只经这个接口转达，
 * 没有它的窗口（内置应用）不能隐藏桌面的标题栏，也没有可上报的拖动区。
 */
export interface AppContextChrome {
  /** 宿主此刻是否在画标题栏。 */
  decorations(): boolean;
  /** 显示或隐藏标题栏。 */
  setDecorations(decorations: boolean): void;
  /** 替换拖动区。 */
  setDragRegions(regions: readonly OrbitDragRegion[]): void;
}

/** 创建上下文所需的全部输入。上下文只拿这些，没有磁盘、数据库、偏好或注入器。 */
export interface AppContextOptions {
  /** 绑定的窗口：上下文绑定它此刻的实例 ID，实例换了（重试）或窗口关闭，上下文就失效。 */
  readonly win: DesktopWindow;
  /** 清单授予这个应用的能力；没有列出的一律 `CAPABILITY_DENIED`。 */
  readonly capabilities: readonly DesktopCapability[];
  /** 应用登记表，`app.open` 只接受其中登记的应用。 */
  readonly apps: DesktopAppRegistry;
  /** 窗口管理。 */
  readonly windows: AppContextWindows;
  /** 系统状态。 */
  readonly system: AppContextSystem;
  /** 主题服务。 */
  readonly theme: AppContextTheme;
  /** 窗口外观；内置应用没有。 */
  readonly chrome?: AppContextChrome;
  /** 给出窗口里的可见原因。 */
  readonly notify: (notice: DesktopNotice) => void;
}

const PLATFORM = 'macos';
const NO_CHROME = '这种窗口没有应用自绘的标题栏';

function closedWindow(): DesktopError {
  return new DesktopError('WINDOW_CLOSED', '窗口已关闭，或这个应用实例已被销毁');
}

function noticeText(app: string, error: DesktopError, method: DesktopMethod): string {
  switch (error.code) {
    case 'CAPABILITY_DENIED':
      return `“${app}” isn’t allowed to use ${DESKTOP_METHOD_CAPABILITIES[method]} (${method}).`;
    case 'INVALID_ARGUMENT':
      return `“${app}” sent a request the desktop couldn’t accept (${method}).`;
    default:
      return `“${app}” didn’t get an answer from the desktop in time (${method}).`;
  }
}

/**
 * 一个窗口实例的桌面能力上下文（ADESK-US-206 阶段 C，D-18）：绑定到 `appId` 与这一次实例，
 * 实现与远程应用相同的 {@link DesktopHost}——内置应用直接调用它，远程应用经 Orbit 的 `serveDesktop` 调用它，
 * 两条路径的能力名称、参数校验、成功结果与错误码一致。
 *
 * 每次调用依次检查：窗口与实例还在（否则 `WINDOW_CLOSED`）、清单声明了这项能力（否则 `CAPABILITY_DENIED`，
 * 默认拒绝）、参数合法（否则 `INVALID_ARGUMENT`）。拒绝、参数非法与超时同时在窗口里给出一句可见的原因，
 * 用户取消是正常结果，不弹提示。
 *
 * 它**不暴露** `FileSystem`、`DesktopData`、`Preferences` 或 `EnvironmentInjector`，也不持有它们：
 * 远程应用拿到的只有下面几类系统能力的结果，没有仓储、没有 OPFS 句柄。
 * 窗口关闭、实例销毁或被新实例取代后调用 {@link dispose}：菜单与命令、订阅全部解绑，之后的调用都是 `WINDOW_CLOSED`。
 */
export class DesktopAppContext implements DesktopHost {
  private readonly instanceId: string;
  private readonly granted: ReadonlySet<DesktopCapability>;
  private readonly sections = signal<readonly MenuSection[]>([]);
  private readonly stateListeners = new Set<(state: DesktopWindowState) => void>();
  private readonly commandListeners = new Set<(commandId: string) => void>();
  private readonly appearanceListeners = new Set<(appearance: DesktopAppearance) => void>();
  private readonly reported = new WeakSet<DesktopError>();
  private readonly teardown: (() => void)[] = [];
  private bound = true;
  private menusRegistered = false;
  private lastWindow = '';
  private lastAppearance = '';

  /** 绑定的应用。 */
  readonly appId: DesktopAppId;
  /** 当前窗口状态；读它的 effect 会随缩放、最小化、前台与标题栏显示变化而重算。 */
  readonly windowState: Signal<DesktopWindowState>;
  /** 当前系统外观；读它的 effect 会随主题、显示模式与强调色变化而重算。 */
  readonly appearanceState: Signal<DesktopAppearance>;

  /** window 能力。 */
  readonly window: DesktopHost['window'] = {
    getState: () => this.call('window.getState', null, () => this.windowState()),
    setTitle: title => this.call('window.setTitle', title, value => this.options.win.title.set(value)),
    minimize: () => this.call('window.minimize', null, () => this.options.windows.minimize(this.options.win.id)),
    restore: () => this.call('window.restore', null, () => this.options.windows.unminimize(this.options.win.id)),
    toggleMaximize: () =>
      this.call('window.toggleMaximize', null, () => this.options.windows.zoom(this.options.win.id)),
    close: () => this.call('window.close', null, () => this.options.windows.close(this.options.win.id)),
    setDecorations: flag => this.call('window.setDecorations', flag, value => this.setDecorations(value)),
    setDragRegions: regions =>
      this.call('window.setDragRegions', regions, value => this.chrome().setDragRegions(value)),
    onStateChange: listener => this.subscribe(this.stateListeners, 'window.getState', listener)
  };

  /** menu 能力。 */
  readonly menu: DesktopHost['menu'] = {
    set: menus => this.call('menu.set', menus, value => this.setMenus(value)),
    onCommand: listener => this.subscribe(this.commandListeners, 'menu.set', listener)
  };

  /** app 能力，只作用于调用方自己的应用。 */
  readonly app: DesktopHost['app'] = {
    open: appId => this.call('app.open', appId, value => this.openApp(value)),
    focus: () => this.call('app.focus', null, () => this.focusWindow()),
    quit: () => this.call('app.quit', null, () => this.options.windows.quitApp(this.options.win.appId))
  };

  /** appearance 能力：读取需要 `appearance`，写入需要另外声明 `appearance:write`。 */
  readonly appearance: DesktopHost['appearance'] = {
    get: () => this.call('appearance.get', null, () => this.appearanceState()),
    set: patch => this.call('appearance.set', patch, value => this.writeAppearance(value)),
    onChange: listener => this.subscribe(this.appearanceListeners, 'appearance.get', listener)
  };

  /** 这个上下文还有效：没被解绑、窗口没在关闭、窗口当前的实例仍是创建它时的那一个。 */
  get live(): boolean {
    const { win } = this.options;
    return this.bound && win.instanceId === this.instanceId && win.state() !== 'closing' && win.state() !== 'closed';
  }

  constructor(private readonly options: AppContextOptions) {
    const { win, system, windows } = options;
    this.appId = win.appId;
    this.instanceId = win.instanceId;
    this.granted = new Set(options.capabilities);
    this.windowState = computed(() => ({
      platform: PLATFORM,
      frame: win.app.kind === 'web' ? (win.app.web.frame ?? 'standard') : 'standard',
      decorations: options.chrome?.decorations() ?? true,
      focused: windows.focused() === win,
      maximized: win.zoomed(),
      minimized: win.minimized()
    }));
    this.appearanceState = computed(() => ({
      theme: system.theme(),
      appearance: system.appearance(),
      accent: system.accent()
    }));
    /* 推送的是变化，不是初始值：订阅者靠 getState / get 读初始状态。 */
    this.lastWindow = JSON.stringify(this.windowState());
    this.lastAppearance = JSON.stringify(this.appearanceState());
  }

  /** 把当前窗口状态推给订阅者；状态没变不推。由绑定它的 effect 调用。 */
  publishWindow(): void {
    this.publish(this.windowState(), this.stateListeners, key => (this.lastWindow = key), this.lastWindow);
  }

  /** 把当前系统外观推给订阅者；外观没变不推。由绑定它的 effect 调用。 */
  publishAppearance(): void {
    this.publish(
      this.appearanceState(),
      this.appearanceListeners,
      key => (this.lastAppearance = key),
      this.lastAppearance
    );
  }

  /**
   * 记下一个能力错误，并在需要时在窗口里给出可见的原因：拒绝、参数非法与超时可见；用户取消是正常结果、
   * 窗口已关闭本就无处可显示，都不提示。同一个错误对象只提示一次（线上请求的错误会先后经过上下文与 Orbit 服务两处）。
   */
  report(error: DesktopError, method: DesktopMethod): void {
    if (this.reported.has(error) || DESKTOP_ERROR_PRESENTATION[error.code] !== 'window') return;
    this.reported.add(error);
    this.options.notify({ code: error.code, method, text: noticeText(this.options.win.app.name, error, method) });
  }

  /** 登记解绑时要做的清理（例如销毁推送状态变化的 effect）；已经解绑就立刻执行。 */
  onDispose(cleanup: () => void): void {
    if (this.bound) this.teardown.push(cleanup);
    else cleanup();
  }

  /** 解绑：菜单与命令、全部订阅一并撤销，之后的调用都是 `WINDOW_CLOSED`。幂等。 */
  dispose(): void {
    if (!this.bound) return;
    this.bound = false;
    this.stateListeners.clear();
    this.commandListeners.clear();
    this.appearanceListeners.clear();
    this.unregisterMenus();
    for (const cleanup of this.teardown.splice(0)) cleanup();
  }

  private call<M extends DesktopMethod, R>(method: M, input: unknown, run: (args: DesktopArguments[M]) => R): R {
    this.guard(method);
    try {
      return run(parseDesktopArguments(method, input));
    } catch (error) {
      if (error instanceof DesktopError) this.report(error, method);
      throw error;
    }
  }

  /** 每次调用的前两道检查：窗口与实例还在（否则 WINDOW_CLOSED），清单声明了这项能力（否则 CAPABILITY_DENIED，默认拒绝）。 */
  private guard(method: DesktopMethod): void {
    try {
      if (!this.live) throw closedWindow();
      const capability = DESKTOP_METHOD_CAPABILITIES[method];
      if (!this.granted.has(capability))
        throw new DesktopError('CAPABILITY_DENIED', `清单没有声明 ${capability} 能力（${method}）`);
    } catch (error) {
      if (error instanceof DesktopError) this.report(error, method);
      throw error;
    }
  }

  /** 订阅推送同样受清单约束，用对应的读取方法的能力检查。 */
  private subscribe<T>(
    listeners: Set<(value: T) => void>,
    method: DesktopMethod,
    listener: (value: T) => void
  ): () => void {
    this.guard(method);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  private publish<T>(
    value: T,
    listeners: ReadonlySet<(value: T) => void>,
    remember: (key: string) => void,
    last: string
  ): void {
    const key = JSON.stringify(value);
    remember(key);
    if (!this.live || key === last) return;
    for (const listener of [...listeners]) listener(value);
  }

  private chrome(): AppContextChrome {
    const { chrome } = this.options;
    if (!chrome) throw new DesktopError('CAPABILITY_DENIED', NO_CHROME);
    return chrome;
  }

  private setDecorations(decorations: boolean): void {
    const { win } = this.options;
    const transparent = win.app.kind === 'web' && win.app.web.frame === 'transparent';
    if (!decorations && !transparent)
      throw new DesktopError('CAPABILITY_DENIED', `${win.app.name} 是标准窗口，不能隐藏桌面的标题栏`);
    this.chrome().setDecorations(decorations);
  }

  private setMenus(menus: readonly DesktopMenu[]): void {
    if (menus.length === 0) {
      this.unregisterMenus();
      return;
    }
    this.sections.set(menus.map(menu => this.toSection(menu)));
    if (this.menusRegistered) return;
    this.options.win.setMenus(this.sections.asReadonly());
    this.menusRegistered = true;
  }

  private unregisterMenus(): void {
    if (!this.menusRegistered) return;
    this.menusRegistered = false;
    this.sections.set([]);
    this.options.win.setMenus(null);
  }

  /** 命令 ID 在桌面里按 `<appId>:<commandId>` 加命名空间；应用收到回调时拿到的是它自己登记的 ID。 */
  private toSection(menu: DesktopMenu): MenuSection {
    const entries = menu.items.map((item): MenuEntry => {
      if (item.type === 'separator') return '-';
      return this.toCommand(item);
    });
    return section(menu.label, entries);
  }

  private toCommand(item: DesktopMenuCommand): MenuEntry {
    return {
      id: `${this.appId}:${item.id}`,
      label: item.label,
      ...(item.key === undefined ? {} : { key: item.key }),
      ...(item.disabled === undefined ? {} : { disabled: item.disabled }),
      ...(item.checked === undefined ? {} : { checked: item.checked }),
      run: () => this.dispatchCommand(item.id)
    };
  }

  private dispatchCommand(commandId: string): void {
    if (!this.live) return;
    for (const listener of [...this.commandListeners]) listener(commandId);
  }

  private openApp(appId: string): void {
    const app = this.options.apps[appId as DesktopAppId] as DesktopAppRegistry[DesktopAppId] | undefined;
    if (!app || app.kind === 'system')
      throw new DesktopError('INVALID_ARGUMENT', `${appId} 不是清单里登记、可以打开的应用`);
    if (!this.options.windows.open(app.id)) throw new DesktopError('INVALID_ARGUMENT', `${app.name} 没有可打开的窗口`);
  }

  private focusWindow(): void {
    const { win, windows } = this.options;
    if (win.minimized()) windows.unminimize(win.id);
    else windows.focus(win.id);
  }

  private writeAppearance(patch: DesktopAppearancePatch): void {
    const { theme } = this.options;
    if (patch.appearance !== undefined) theme.setAppearance(patch.appearance);
    if (patch.accent !== undefined) theme.setAccent(patch.accent);
  }
}

/** 创建上下文时窗口这一侧给的东西。 */
export interface BindOptions {
  /** 窗口外观（远程应用的窗口组件给；内置应用没有）。 */
  readonly chrome?: AppContextChrome;
  /** 窗口里给出可见原因；默认用桌面的全局提示条。 */
  readonly notify?: (notice: DesktopNotice) => void;
}

/**
 * 应用上下文的工厂：每个窗口实例创建一个 {@link DesktopAppContext}，能力取自清单。
 * 窗口状态与系统外观的变化由 effect 推给订阅者，上下文解绑时 effect 随之销毁。
 */
@Service({ autoProvided: false })
export class DesktopAppContexts {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly windows = inject(WindowManager);
  private readonly system = inject(SystemState);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(Toast);
  private readonly injector = inject(Injector);

  /** 为窗口当前的实例创建上下文。 */
  bind(win: DesktopWindow, options: BindOptions = {}): DesktopAppContext {
    const context = new DesktopAppContext({
      win,
      capabilities: grantedCapabilities(win.app),
      apps: this.apps,
      windows: this.windows,
      system: this.system,
      theme: this.theme,
      chrome: options.chrome,
      notify: options.notify ?? (notice => this.toast.show(notice.text))
    });
    const refs = [
      effect(
        () => {
          context.windowState();
          untracked(() => context.publishWindow());
        },
        { injector: this.injector }
      ),
      effect(
        () => {
          context.appearanceState();
          untracked(() => context.publishAppearance());
        },
        { injector: this.injector }
      )
    ];
    context.onDispose(() => {
      for (const ref of refs) ref.destroy();
    });
    return context;
  }
}
