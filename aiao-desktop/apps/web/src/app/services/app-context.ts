import type {
  DesktopAppearance,
  DesktopAppearancePatch,
  DesktopArguments,
  DesktopCapability,
  DesktopErrorCode,
  DesktopHost,
  DesktopInteraction,
  DesktopMenu,
  DesktopMenuCommand,
  DesktopMethod,
  DesktopNotificationInput,
  DesktopNotificationReceipt,
  DesktopOpenOptions,
  DesktopOpenedFile,
  DesktopSaveRequest,
  DesktopSavedFile,
  DesktopWindowState
} from '@aiao/orbit/desktop';
import {
  DESKTOP_ERROR_PRESENTATION,
  DESKTOP_LIMITS,
  DESKTOP_METHOD_CAPABILITIES,
  DesktopError,
  parseDesktopArguments
} from '@aiao/orbit/desktop';
import type { OrbitDragRegion } from '@aiao/orbit/window';
import { Injector, Service, Signal, computed, effect, inject, signal, untracked } from '@angular/core';

import { mimeTypeOf } from '../disk/disk-kinds';
import type { DiskPath } from '../disk/disk-path';
import { AppContextFiles, FileStamp, appFilesOver, parseVersion, versionOf } from './app-files';
import { AppNotifications, NotificationContent, NotificationPost, NotificationSource } from './app-notifications';
import { AppCapabilityRestriction, appCapabilitySupport } from './browser-app-support';
import { AppContextClipboard, browserClipboard } from './browser-clipboard';
import { DESKTOP_APPS, DesktopAppId, DesktopAppRegistry } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { FilePanelRequest, FilePanelResult, FilePanelTicket, FilePanels } from './file-panels';
import { FileSystem } from './file-system';
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

/** 应用上下文提交通知所用的通知中心；{@link AppNotifications} 满足它。 */
export interface AppContextNotifications {
  /** 提交一条通知，条目归属 `source` 这个应用。 */
  post(source: NotificationSource, content: NotificationContent): NotificationPost;
}

/** 应用上下文弹出打开 / 保存面板所用的面板队列；{@link FilePanels} 满足它。 */
export interface AppContextPanels {
  /** 弹出一个面板；返回的凭据用来等结果或把面板收回。 */
  show(request: FilePanelRequest): FilePanelTicket;
}

/** 创建上下文所需的全部输入。上下文只拿这些，没有磁盘、数据库、偏好或注入器。 */
export interface AppContextOptions {
  /** 绑定的窗口：上下文绑定它此刻的实例 ID，实例换了（重试）或窗口关闭，上下文就失效。 */
  readonly win: DesktopWindow;
  /** 清单与浏览器支持共同决定的实际能力；没有列出的一律 `CAPABILITY_DENIED`。 */
  readonly capabilities: readonly DesktopCapability[];
  /** 当前浏览器禁用的能力；远程应用入口持续显示其原因。 */
  readonly restrictions?: readonly AppCapabilityRestriction[];
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
  /** 通知中心：`notification` 能力的去处。 */
  readonly notifications: AppContextNotifications;
  /** 系统剪贴板：`clipboard` 能力的去处。 */
  readonly clipboard: AppContextClipboard;
  /** 桌面的打开 / 保存面板。 */
  readonly panels: AppContextPanels;
  /** 面板选定之后读写那一个文件所用的窄磁盘操作；没有目录列表、没有仓储。 */
  readonly files: AppContextFiles;
  /** 面板关闭之后把焦点还给窗口里的应用（远程应用交回它的文档）；内置应用没有，由面板还回打开前的焦点元素。 */
  readonly refocus?: () => void;
  /** 生成新的文件凭证；默认是随机 UUID，单测里换成可预期的序列。 */
  readonly newHandle?: () => string;
}

const PLATFORM = 'macos';
const NO_CHROME = '这种窗口没有应用自绘的标题栏';
/** 直接调用（内置应用）时没有计时控制：等用户就是等，没有谁在计时。 */
const UNTIMED: DesktopInteraction = { waitForUser: pending => pending };

/** 用户选定的那一个文件的凭证：只记着它的位置，应用拿到的是不透明的字符串。 */
interface FileGrant {
  readonly path: DiskPath;
  readonly name: string;
}

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
 * 远程应用拿到的只有下面几类系统能力的结果，没有仓储、没有 OPFS 句柄；文件能力只经三个窄操作（{@link AppContextFiles}）读写用户在面板里选定的那一个文件。
 * 窗口关闭、实例销毁或被新实例取代后调用 {@link dispose}：菜单与命令、订阅全部解绑，还开着的文件面板随之关闭、不再提交任何写入，
 * 文件凭证全部失效，之后的调用都是 `WINDOW_CLOSED`。
 *
 * 文件凭证（`handle`）是这个上下文发的，只在这个上下文里认：换了窗口、重试出新实例、窗口关闭之后，旧凭证再用都是 `HANDLE_INVALID`。
 * 同一个上下文同一时刻只开一个文件面板，重复请求是 `BUSY`。
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
  private readonly handles = new Map<string, FileGrant>();
  private bound = true;
  private menusRegistered = false;
  private lastWindow = '';
  private lastAppearance = '';
  /** 一个需要用户操作的文件请求正在进行（面板开着，或选定之后在读写磁盘）。 */
  private fileRequest = false;
  /** 现在开着的文件面板。 */
  private panel: FilePanelTicket | undefined;

  /** 绑定的应用。 */
  readonly appId: DesktopAppId;
  /** 实际授予的能力，握手公告与请求授权共用这一份。 */
  readonly capabilities: readonly DesktopCapability[];
  /** 浏览器的能力限制，独立于短时错误提示。 */
  readonly restrictions: readonly AppCapabilityRestriction[];
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

  /** notification 能力：条目归属本应用，应用不能冒名。 */
  readonly notification: DesktopHost['notification'] = {
    post: input => this.call('notification.post', input, value => this.postNotification(value))
  };

  /** clipboard 能力：读与写分别声明；读由浏览器的权限提示决定，写要求用户手势。 */
  readonly clipboard: DesktopHost['clipboard'] = {
    readText: () => this.callAsync('clipboard.readText', null, () => this.readClipboard()),
    writeText: text => this.callAsync('clipboard.writeText', text, value => this.writeClipboard(value))
  };

  /** filesystem 能力：只作用于用户在桌面面板里选定的那一个文件。 */
  readonly filesystem: DesktopHost['filesystem'] = {
    open: (options, interaction) =>
      this.callAsync('filesystem.open', options, value => this.openFile(value, interaction ?? UNTIMED)),
    save: (request, interaction) =>
      this.callAsync('filesystem.save', request, value => this.saveFile(value, interaction ?? UNTIMED))
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
    this.capabilities = options.capabilities;
    this.restrictions = options.restrictions ?? [];
    this.granted = new Set(this.capabilities);
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
    /* 面板随窗口关闭，且不再提交任何写入（等面板的请求醒来时会发现窗口已关，以 WINDOW_CLOSED 结束）；凭证全部失效。 */
    this.panel?.close();
    this.panel = undefined;
    this.handles.clear();
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

  /**
   * 异步能力（剪贴板、文件）的统一入口：先过 {@link guard}，参数校验，再运行；任何一步以能力错误结束都在窗口里登记一次可见原因（需要的话）。
   * 用户取消、浏览器拒绝、窗口关闭这些结果只回给应用。
   */
  private async callAsync<M extends DesktopMethod, R>(
    method: M,
    input: unknown,
    run: (args: DesktopArguments[M]) => Promise<R>
  ): Promise<R> {
    try {
      this.guard(method);
      return await run(parseDesktopArguments(method, input));
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

  /** 条目归属调用方：来源的名称与图标取自登记表，不取应用自己填的；图标只能是登记表里的应用图标或内联图片。 */
  private postNotification(input: DesktopNotificationInput): DesktopNotificationReceipt {
    const { win, apps, notifications } = this.options;
    const { icon } = input;
    if (icon !== undefined && !icon.startsWith('data:image/') && !Object.values(apps).some(app => app.icon === icon))
      throw new DesktopError('INVALID_ARGUMENT', `图标 ${icon} 不是桌面登记的图标，也不是内联图片`);
    const posted = notifications.post({ id: win.app.id, name: win.app.name, icon: win.app.icon }, input);
    if (!posted.ok)
      throw new DesktopError(
        'RATE_LIMITED',
        `“${win.app.name}” 提交通知太频繁：每个应用每分钟最多 ${DESKTOP_LIMITS.notification.perMinute} 条`
      );
    return { id: posted.id };
  }

  /** 浏览器的拒绝（权限提示被拒、文档没有焦点、没有异步剪贴板）归成 `BROWSER_PERMISSION_DENIED`；别的错误原样抛出。 */
  private browserDenied(error: unknown, action: string): unknown {
    if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError'))
      return new DesktopError('BROWSER_PERMISSION_DENIED', `浏览器拒绝了${action}（${error.name}）`, { cause: error });
    return error;
  }

  private async readClipboard(): Promise<string> {
    let text: string;
    try {
      text = await this.options.clipboard.readText();
    } catch (error) {
      throw this.browserDenied(error, '读取剪贴板');
    }
    /* 权限提示开着的时候窗口关了：不把用户剪贴板里的内容交给已经关闭的窗口。 */
    if (!this.live) throw closedWindow();
    return text;
  }

  /** 宿主不替用户在没有手势时写剪贴板：请求必须落在宿主页面的用户手势有效期内。 */
  private async writeClipboard(text: string): Promise<void> {
    if (!this.options.clipboard.userActive())
      throw new DesktopError('BROWSER_PERMISSION_DENIED', '写剪贴板要由用户手势触发，这次请求不在用户手势的有效期内');
    try {
      await this.options.clipboard.writeText(text);
    } catch (error) {
      throw this.browserDenied(error, '写入剪贴板');
    }
  }

  /** 同一个上下文同一时刻只有一个需要用户操作的文件请求：重复请求是 `BUSY`。 */
  private async exclusiveFileRequest<R>(run: () => Promise<R>): Promise<R> {
    if (this.fileRequest) throw new DesktopError('BUSY', '这个应用实例已经有一个文件面板开着');
    this.fileRequest = true;
    try {
      return await run();
    } finally {
      this.fileRequest = false;
    }
  }

  /**
   * 弹出面板等用户选：等的这一段用 `interaction.waitForUser` 声明，不计入宿主的处理时限。
   * 窗口在面板开着时关了，面板被收回，这里以 `WINDOW_CLOSED` 结束，不再往下做任何事；用户取消是 `USER_CANCELLED`，桌面不弹错误。
   */
  private async choose(
    interaction: DesktopInteraction,
    request: Pick<FilePanelRequest, 'mode' | 'accept' | 'suggestedName'>
  ): Promise<FilePanelResult> {
    const { win, panels, refocus } = this.options;
    const ticket = panels.show({
      ...request,
      app: { id: win.app.id, name: win.app.name, icon: win.app.icon },
      maxBytes: DESKTOP_LIMITS.filesystem.bytes,
      nameLength: DESKTOP_LIMITS.filesystem.nameLength,
      restoreFocus: refocus
    });
    this.panel = ticket;
    let result: FilePanelResult | null;
    try {
      result = await interaction.waitForUser(ticket.result);
    } finally {
      this.panel = undefined;
    }
    if (!this.live) throw closedWindow();
    if (result === null) throw new DesktopError('USER_CANCELLED', '用户取消了');
    return result;
  }

  private issueHandle(path: DiskPath): string {
    const handle = (this.options.newHandle ?? (() => crypto.randomUUID()))();
    this.handles.set(handle, { path, name: path.at(-1) ?? '' });
    return handle;
  }

  private openFile(options: DesktopOpenOptions, interaction: DesktopInteraction): Promise<DesktopOpenedFile> {
    return this.exclusiveFileRequest(async () => {
      const picked = await this.choose(interaction, {
        mode: 'open',
        accept: options.accept ?? [],
        suggestedName: ''
      });
      if (picked.kind !== 'open') throw new Error('打开面板返回了不是打开的结果');
      const name = picked.path.at(-1) ?? '';
      const snapshot = await this.options.files.snapshot(picked.path, DESKTOP_LIMITS.filesystem.bytes);
      if (!this.live) throw closedWindow();
      if (snapshot.kind === 'missing') throw new DesktopError('FILE_NOT_FOUND', `“${name}” 在选定之后已被删除或改名`);
      if (snapshot.kind === 'too-large')
        throw new DesktopError(
          'FILE_TOO_LARGE',
          `“${name}” 有 ${snapshot.size} 字节，超过 ${DESKTOP_LIMITS.filesystem.bytes} 字节的上限`
        );
      return {
        name,
        mime: mimeTypeOf(name),
        size: snapshot.bytes.length,
        bytes: snapshot.bytes,
        handle: this.issueHandle(picked.path),
        version: versionOf(snapshot.stamp)
      };
    });
  }

  private saveFile(request: DesktopSaveRequest, interaction: DesktopInteraction): Promise<DesktopSavedFile> {
    const { handle } = request;
    if (handle !== undefined) return this.saveToGrant(request, handle);
    return this.exclusiveFileRequest(() => this.saveAs(request, interaction));
  }

  /** 带凭证：只把内容写回凭证对应的那一个文件，先比对版本；不再弹确认。 */
  private async saveToGrant(request: DesktopSaveRequest, handle: string): Promise<DesktopSavedFile> {
    const grant = this.handles.get(handle);
    if (!grant)
      throw new DesktopError(
        'HANDLE_INVALID',
        '这个文件凭证无效：它不是这个窗口实例拿到的，或者窗口已关闭、实例已被销毁或重试'
      );
    const expected = this.expectedStamp(request.expectedVersion);
    const saved = await this.options.files.replace(grant.path, request.bytes, expected);
    if (saved.kind === 'missing')
      throw new DesktopError('FILE_NOT_FOUND', `“${grant.name}” 已被删除或改名：没有写入，也没有在原位置新建`);
    if (saved.kind === 'changed')
      throw new DesktopError('FILE_CHANGED', `“${grant.name}” 在打开之后被改动过：没有写入`);
    return { name: grant.name, version: versionOf(saved.stamp), handle };
  }

  /** 不带凭证：弹保存面板，用户选位置与文件名、目标已存在时确认覆盖；确认之前窗口关了就不写。 */
  private async saveAs(request: DesktopSaveRequest, interaction: DesktopInteraction): Promise<DesktopSavedFile> {
    const picked = await this.choose(interaction, {
      mode: 'save',
      accept: [],
      suggestedName: request.suggestedName
    });
    if (picked.kind !== 'save') throw new Error('保存面板返回了不是保存的结果');
    const path = [...picked.dir, picked.name];
    const created = await this.options.files.create(path, request.bytes, picked.replace);
    if (created.kind === 'missing-folder')
      throw new DesktopError('FILE_NOT_FOUND', `选定的文件夹已被删除或改名：没有写入，也没有补建文件夹`);
    if (created.kind === 'exists')
      throw new DesktopError('FILE_CHANGED', `“${picked.name}” 在选定之后出现了别的内容：没有覆盖它`);
    return { name: picked.name, version: versionOf(created.stamp), handle: this.issueHandle(path) };
  }

  /** 应用交来的版本串已经由参数校验保证是 `<毫秒>:<字节数>`；这里还原成版本，省略就是不比对。 */
  private expectedStamp(version: string | undefined): FileStamp | undefined {
    if (version === undefined) return undefined;
    const stamp = parseVersion(version);
    if (!stamp) throw new DesktopError('INVALID_ARGUMENT', 'expectedVersion 不是 open 或 save 返回的版本');
    return stamp;
  }
}

/** 创建上下文时窗口这一侧给的东西。 */
export interface BindOptions {
  /** 窗口外观（远程应用的窗口组件给；内置应用没有）。 */
  readonly chrome?: AppContextChrome;
  /** 窗口里给出可见原因；默认用桌面的全局提示条。 */
  readonly notify?: (notice: DesktopNotice) => void;
  /** 文件面板关闭之后把焦点还给窗口里的应用（远程应用交回它的文档）。 */
  readonly refocus?: () => void;
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
  private readonly notifications = inject(AppNotifications);
  private readonly panels = inject(FilePanels);
  /** 磁盘服务只在这里被包成三个窄操作，上下文本身拿不到它。 */
  private readonly files = appFilesOver(inject(FileSystem));
  private readonly clipboard = browserClipboard();

  /** 为窗口当前的实例创建上下文。 */
  bind(win: DesktopWindow, options: BindOptions = {}): DesktopAppContext {
    const context = new DesktopAppContext({
      win,
      ...appCapabilitySupport(win.app),
      apps: this.apps,
      windows: this.windows,
      system: this.system,
      theme: this.theme,
      chrome: options.chrome,
      notify: options.notify ?? (notice => this.toast.show(notice.text)),
      notifications: this.notifications,
      clipboard: this.clipboard,
      panels: this.panels,
      files: this.files,
      refocus: options.refocus
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
