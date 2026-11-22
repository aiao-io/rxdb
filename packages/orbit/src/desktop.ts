import { registerService, reportSafely } from './callbacks.js';
import { OrbitError } from './errors.js';
import { copyValue, isRecord, MAX_BYTES } from './payload.js';
import type { OrbitClient, OrbitInstance, OrbitObject, OrbitValue } from './types.js';
import {
  FRAMES,
  invalid,
  MAX_REGIONS,
  MAX_TITLE,
  PLATFORMS,
  readBoolean,
  readRegions,
  readTitle,
  trackDragRegions
} from './window-codec.js';
import type { OrbitDragRegion, OrbitWindowFrame, OrbitWindowPlatform } from './window.js';
import { workspaceReceiver, workspaceSender } from './workspace-transfer.js';

/*
 * 桌面能力协议（ADESK-US-206「能力契约」）：应用经 Orbit 请求宿主的 window / menu / app / appearance，
 * 以及 notification / clipboard / filesystem。内置应用与远程应用共用同一套能力名称、参数校验、
 * 成功结果与错误码——宿主侧用 `serveDesktop` 把一个 `DesktopHost` 接到 Orbit 实例上，
 * 内置应用直接调用同一个 `DesktopHost`，所以两条路径的语义不会分叉。
 *
 * 需要用户在桌面面板里操作的请求（`filesystem.open`、不带凭证的 `filesystem.save`）不占着一个 RPC 等用户：
 * 宿主先应答「已受理」，用户操作完（或取消、窗口关闭）再用 `desktop.request.settled` 事件送达最终结果。
 * Orbit 的 RPC 时限上限是 120 秒，而用户在面板里停留多久不该有上限（通用规则 3：超时只计宿主处理请求的时间）。
 */

/** 启动属性里放桌面能力信息（清单授予的能力）的键；没有它说明宿主不提供桌面能力。 */
export const DESKTOP_PROP = 'orbit.desktop';

/** 桌面传给 Aiao Code 的当前工作区标识；只传不透明的 projectId。 */
export const DESKTOP_WORKSPACE_PROJECT_ID_PROP = 'aiao-desktop.workspace-project-id';

/**
 * 能力名取值全集，清单 `capabilities` 逐项声明，默认拒绝。读写分开授权的能力用 `:read` / `:write` 区分；
 * `appearance` 只读，写入另外声明 `appearance:write`；`clipboard` 与 `filesystem` 同理读写分开。
 */
export const DESKTOP_CAPABILITIES = [
  'window',
  'menu',
  'app',
  'appearance',
  'appearance:write',
  'notification',
  'clipboard:read',
  'clipboard:write',
  'filesystem:read',
  'filesystem:write',
  'workspace'
] as const;

/** 能力名。 */
export type DesktopCapability = (typeof DESKTOP_CAPABILITIES)[number];

/**
 * 稳定的错误码表：前六个是通用错误，其余由通知与文件能力使用。
 * 应用按错误码分支，不匹配错误文本。
 */
export const DESKTOP_ERROR_CODES = [
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
  'RATE_LIMITED',
  'RESULT_UNKNOWN'
] as const;

/** 稳定的错误码。 */
export type DesktopErrorCode = (typeof DESKTOP_ERROR_CODES)[number];

/** 桌面怎么呈现一个错误：`window` 在窗口里给出一句可见的原因；`silent` 是正常结果、不弹提示；`app` 只回给应用。 */
export type DesktopErrorPresentation = 'window' | 'silent' | 'app';

/**
 * 每个错误码的呈现方式：用户取消是正常结果，调用方收到取消码后安静结束，桌面不弹错误；
 * 拒绝、参数非法与超时由桌面在窗口里给出一句可见的原因；其余交给应用自己处理。
 */
export const DESKTOP_ERROR_PRESENTATION: Readonly<Record<DesktopErrorCode, DesktopErrorPresentation>> = {
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
  RATE_LIMITED: 'app',
  RESULT_UNKNOWN: 'app'
};

/**
 * 协议常量：超时、大小与频率上限。阶段 C、D 实现前定下，单测断言这张表；改动时同步 README 的协议文档。
 *
 * - `requestTimeoutMs`：宿主处理一次请求的时限，只计宿主处理的时间——用户在桌面面板里选文件、确认覆盖的停留时间不计入
 *   （宿主用 {@link DesktopInteraction.waitForUser} 声明哪一段是在等用户，那一段暂停计时，之后接着算剩下的时间）；
 * - `callTimeoutMs`：应用侧等待宿主**应答**的兜底时限，比宿主多留 2 秒，让宿主自己的 `TIMEOUT` 结果先到达；
 *   需要用户操作的请求，它只管「已受理」的应答，用户操作的最终结果没有时限；
 * - `notification`：标题、正文、去重键、内联图片（解码后字节数）的上限；`perMinute` 是同一应用在 `windowMs` 内最多提交几条，
 *   `entriesPerApp` 是通知中心里每个应用最多保留几条（超出的旧条目被挤掉）；
 * - `clipboard.textLength`：剪贴板文本的字符数；
 * - `filesystem`：`bytes` 是一次打开或保存的文件内容字节数，`acceptEntries` 是 `accept` 的条数，`nameLength` 是文件名字符数；
 * - 文件内容经 base64 放进 JSON 消息，`filesystem.bytes` 编码后仍在 Orbit 的 1 MiB 消息上限之内。
 */
export const DESKTOP_LIMITS = {
  requestTimeoutMs: 5_000,
  callTimeoutMs: 7_000,
  titleLength: MAX_TITLE,
  dragRegions: MAX_REGIONS,
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
} as const;

/** `appearance.set` 与 `appearance.get` 只接受 / 返回的登记取值集合。 */
export const DESKTOP_APPEARANCE_VALUES = {
  appearance: ['light', 'dark', 'auto'],
  accent: ['multi', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite']
} as const;

/** 用户选择的显示模式：`auto` 跟随宿主系统。 */
export type DesktopAppearanceMode = (typeof DESKTOP_APPEARANCE_VALUES.appearance)[number];

/** 强调色。 */
export type DesktopAccent = (typeof DESKTOP_APPEARANCE_VALUES.accent)[number];

/** 带稳定错误码的桌面能力错误：宿主与应用两侧抛出的是同一个类。 */
export class DesktopError extends Error {
  /** 创建带稳定错误码的错误。 */
  constructor(
    /** 稳定错误码，应用按它分支。 */
    readonly code: DesktopErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'DesktopError';
  }
}

/** 同步结果或 Promise。 */
export type DesktopAwaitable<T> = T | Promise<T>;

/** 窗口状态：在窗口协议的状态之上多一个是否最小化。 */
export interface DesktopWindowState {
  /** 宿主的外观平台。 */
  readonly platform: OrbitWindowPlatform;
  /** 运营方给这个应用批准的窗口外观。 */
  readonly frame: OrbitWindowFrame;
  /** 宿主此刻是否在画标题栏。 */
  readonly decorations: boolean;
  /** 窗口是否在前台。 */
  readonly focused: boolean;
  /** 窗口是否已缩放到铺满可用区域。 */
  readonly maximized: boolean;
  /** 窗口是否已最小化到 Dock。 */
  readonly minimized: boolean;
}

/** 菜单里的一条命令。命令 ID 只在本应用内有意义；桌面内部用 `<appId>:<commandId>` 区分各应用。 */
export interface DesktopMenuCommand {
  /** 省略或 `command`。 */
  readonly type?: 'command';
  /** 命令 ID：字母或数字开头，其后字母、数字、`.`、`_`、`-`，不含冒号，同一次登记里不能重复。 */
  readonly id: string;
  /** 菜单项文字。 */
  readonly label: string;
  /** 快捷键提示文字（例如 `⌘O`），只用于显示，不绑定按键。 */
  readonly key?: string;
  /** 是否禁用。 */
  readonly disabled?: boolean;
  /** 是否带勾选标记。 */
  readonly checked?: boolean;
}

/** 菜单里的分隔线。 */
export interface DesktopMenuSeparator {
  /** 固定为 `separator`。 */
  readonly type: 'separator';
}

/** 菜单项：命令或分隔线。 */
export type DesktopMenuItem = DesktopMenuCommand | DesktopMenuSeparator;

/** 菜单栏上的一个菜单标题及其下拉项。 */
export interface DesktopMenu {
  /** 菜单标题。 */
  readonly label: string;
  /** 下拉项。 */
  readonly items: readonly DesktopMenuItem[];
}

/** 系统外观。 */
export interface DesktopAppearance {
  /** 屏幕上实际呈现的主题。 */
  readonly theme: 'light' | 'dark';
  /** 用户选择的显示模式。 */
  readonly appearance: DesktopAppearanceMode;
  /** 强调色。 */
  readonly accent: DesktopAccent;
}

/** `appearance.set` 的补丁：至少一项，只接受登记的取值。 */
export interface DesktopAppearancePatch {
  /** 显示模式。 */
  readonly appearance?: DesktopAppearanceMode;
  /** 强调色。 */
  readonly accent?: DesktopAccent;
}

/** 宿主实现的 window 能力，只作用于这个实例自己的窗口。 */
export interface DesktopWindowHost {
  /** 读取窗口状态。 */
  getState(): DesktopAwaitable<DesktopWindowState>;
  /** 设置标题。 */
  setTitle(title: string): DesktopAwaitable<void>;
  /** 最小化。 */
  minimize(): DesktopAwaitable<void>;
  /** 从最小化还原。 */
  restore(): DesktopAwaitable<void>;
  /** 缩放或还原。 */
  toggleMaximize(): DesktopAwaitable<void>;
  /** 关闭。 */
  close(): DesktopAwaitable<void>;
  /** 显示或隐藏宿主的标题栏。 */
  setDecorations(decorations: boolean): DesktopAwaitable<void>;
  /** 替换应用的拖动区。 */
  setDragRegions(regions: readonly OrbitDragRegion[]): DesktopAwaitable<void>;
  /** 订阅窗口状态变化；返回退订函数。 */
  onStateChange(listener: (state: DesktopWindowState) => void): () => void;
}

/** 宿主实现的 menu 能力。 */
export interface DesktopMenuHost {
  /** 登记（替换）本窗口的菜单；空数组撤销登记。 */
  set(menus: readonly DesktopMenu[]): DesktopAwaitable<void>;
  /** 订阅用户点选的菜单命令（应用自己的命令 ID）；返回退订函数。 */
  onCommand(listener: (commandId: string) => void): () => void;
}

/** 宿主实现的 app 能力，只作用于调用方自己的应用。 */
export interface DesktopAppHost {
  /** 打开清单里已登记的应用。 */
  open(appId: string): DesktopAwaitable<void>;
  /** 聚焦调用方自己的窗口。 */
  focus(): DesktopAwaitable<void>;
  /** 退出调用方自己的应用。 */
  quit(): DesktopAwaitable<void>;
}

/** 宿主实现的 appearance 能力。 */
export interface DesktopAppearanceHost {
  /** 读取系统外观。 */
  get(): DesktopAwaitable<DesktopAppearance>;
  /** 写入系统外观（全局系统设置，持久化）。 */
  set(patch: DesktopAppearancePatch): DesktopAwaitable<void>;
  /** 订阅外观变化；返回退订函数。 */
  onChange(listener: (appearance: DesktopAppearance) => void): () => void;
}

/** 通知中心里的一条通知的内容，应用提交的部分。条目归属哪个应用、显示什么名称与图标由宿主按调用方决定，应用不能冒名。 */
export interface DesktopNotificationInput {
  /** 标题，1～`DESKTOP_LIMITS.notification.titleLength` 个字符，不含控制字符。 */
  readonly title: string;
  /** 正文，最多 `DESKTOP_LIMITS.notification.bodyLength` 个字符；可以为空，可以换行与制表，不含其他控制字符。 */
  readonly body: string;
  /** 通知自己的图片：宿主登记的图标 ID，或内联图片（`data:image/png|jpeg|gif|webp;base64,…`，解码后不超过 `iconBytes`）。 */
  readonly icon?: string;
  /** 去重键：同一应用相同的去重键，新通知覆盖旧通知而不是叠加。 */
  readonly dedupeKey?: string;
}

/** 提交通知的回执。 */
export interface DesktopNotificationReceipt {
  /** 通知中心里这一条通知的标识。 */
  readonly id: string;
}

/** 宿主实现的 notification 能力。 */
export interface DesktopNotificationHost {
  /** 向通知中心提交一条通知；同一应用每分钟的条数有上限，超限是 `RATE_LIMITED`。 */
  post(notification: DesktopNotificationInput): DesktopAwaitable<DesktopNotificationReceipt>;
}

/** 宿主实现的 clipboard 能力：影响范围是用户机器的系统剪贴板，不是虚拟磁盘。 */
export interface DesktopClipboardHost {
  /** 读取剪贴板文本；浏览器的权限提示被拒绝是 `BROWSER_PERMISSION_DENIED`。 */
  readText(): DesktopAwaitable<string>;
  /** 写入剪贴板文本；请求不在用户手势的有效期内是 `BROWSER_PERMISSION_DENIED`，宿主不替用户在没有手势时写剪贴板。 */
  writeText(text: string): DesktopAwaitable<void>;
}

/** `filesystem.open` 的选项。 */
export interface DesktopOpenOptions {
  /**
   * 只做显示过滤的类型列表（最多 `DESKTOP_LIMITS.filesystem.acceptEntries` 项）：扩展名（`.md`）或 MIME 类型（`text/*`、`image/png`）。
   * 它不限制用户能选什么——面板只是不显示不匹配的文件。
   */
  readonly accept?: readonly string[];
}

/** `filesystem.open` 的结果：用户选定的那一个文件的内容快照，加上只能把内容写回这个文件的实例绑定凭证。 */
export interface DesktopOpenedFile {
  /** 文件名（不含目录）。 */
  readonly name: string;
  /** MIME 类型，按扩展名推断。 */
  readonly mime: string;
  /** 内容字节数。 */
  readonly size: number;
  /** 内容快照。 */
  readonly bytes: Uint8Array;
  /** 实例绑定的凭证：只能把内容写回这个文件，不能读别的文件、列目录或换目标；窗口关闭、实例销毁或重试之后失效。 */
  readonly handle: string;
  /** 打开时的版本（修改时间与大小）：不透明字符串，应用不解析它，保存时原样作为 `expectedVersion` 交回。 */
  readonly version: string;
}

/** `filesystem.save` 的请求。 */
export interface DesktopSaveRequest {
  /**
   * 凭证：写回 `open` 或上一次 `save` 授权的那一个文件，不再弹面板、也不再请用户确认。
   * 不带凭证的保存一律弹出桌面的保存面板，由用户选位置，目标已存在时要求用户确认覆盖。
   */
  readonly handle?: string;
  /** 建议的文件名：保存面板里预填；带凭证时不起作用（目标就是凭证对应的文件）。 */
  readonly suggestedName: string;
  /** 要写入的内容，最多 `DESKTOP_LIMITS.filesystem.bytes` 字节。 */
  readonly bytes: Uint8Array;
  /** 应用打开（或上次保存）时拿到的版本，只能与 `handle` 一起给；磁盘上的文件版本不符就是 `FILE_CHANGED`，不写入。 */
  readonly expectedVersion?: string;
}

/** `filesystem.save` 的结果。 */
export interface DesktopSavedFile {
  /** 写入的文件名（不含目录）。 */
  readonly name: string;
  /** 写入之后的新版本，下一次保存用它作 `expectedVersion`。 */
  readonly version: string;
  /** 这个文件的凭证：带凭证保存时是同一个；保存面板里另存时是新选定的文件的新凭证。 */
  readonly handle: string;
}

/** 宿主侧 Git 工作区请求。工作区只暴露受控 RPC，不暴露 OPFS 句柄或宿主内部服务。 */
export const DESKTOP_WORKSPACE_OPERATIONS = [
  'open',
  'save',
  'remove',
  'rename',
  'move',
  'status',
  'stage',
  'unstage',
  'readDiff',
  'discardWorking',
  'commit',
  'pull',
  'history',
  'restore'
] as const;

export type DesktopWorkspaceOperation = (typeof DESKTOP_WORKSPACE_OPERATIONS)[number];

/** 已编码的文件内容和仓库内的相对路径。 */
export interface DesktopWorkspaceFile {
  readonly path: string;
  readonly base64: string;
}

/** 工作区请求只能指向宿主为当前窗口选定的项目。保存采用乐观版本检查。 */
export type DesktopWorkspaceRequest = { readonly projectId: string } & (
  | { readonly operation: 'open' | 'status' | 'history' | 'pull' }
  | {
      readonly operation: 'save';
      readonly files: readonly DesktopWorkspaceFile[];
      readonly expectedRevision: number;
      readonly removedPaths?: readonly string[];
    }
  | { readonly operation: 'remove' | 'discardWorking'; readonly path: string }
  | { readonly operation: 'rename' | 'move'; readonly path: string; readonly destination: string }
  | { readonly operation: 'stage' | 'unstage'; readonly paths: readonly string[] }
  | { readonly operation: 'readDiff'; readonly path: string; readonly kind: 'working' | 'staged' }
  | { readonly operation: 'commit'; readonly message: string }
  | { readonly operation: 'restore'; readonly oid: string }
);

/** 宿主实现的 Git 工作区能力。 */
export interface DesktopWorkspaceHost {
  call(request: DesktopWorkspaceRequest): DesktopAwaitable<OrbitValue>;
}

/**
 * 宿主处理一个需要用户操作的请求时拿到的计时控制：宿主等用户（面板里选文件、确认覆盖）的那一段包进
 * {@link DesktopInteraction.waitForUser}，`serveDesktop` 暂停宿主处理时限的计时，用户操作完再接着算剩下的时间。
 */
export interface DesktopInteraction {
  /** Orbit 在请求超时、取消或服务解绑时终止此信号，宿主可据此关闭面板。 */
  readonly signal?: AbortSignal;
  /** 保存开始时调用；在不可撤销的写入前调用返回的函数。已取消则抛错，否则从此处起不能保证未写入。 */
  prepareSave?(): () => void;
  /** 等待用户操作；返回 `pending` 的结果。等待期间不计入 `DESKTOP_LIMITS.requestTimeoutMs`。 */
  waitForUser<T>(pending: Promise<T>): Promise<T>;
}

/** 宿主实现的 filesystem 能力：`filesystem` 指桌面的虚拟磁盘，打开与保存由桌面自己的面板提供。 */
export interface DesktopFilesystemHost {
  /**
   * 弹出桌面的打开面板，用户选定一个文件；取消是 `USER_CANCELLED`，同一实例已有面板开着是 `BUSY`。
   * 直接调用（内置应用）时 `interaction` 可以省略。
   */
  open(options: DesktopOpenOptions, interaction?: DesktopInteraction): DesktopAwaitable<DesktopOpenedFile>;
  /**
   * 保存：带凭证写回同一个文件（先比对版本）；不带凭证弹出保存面板，用户选位置并确认覆盖。
   * 直接调用（内置应用）时 `interaction` 可以省略。
   */
  save(request: DesktopSaveRequest, interaction?: DesktopInteraction): DesktopAwaitable<DesktopSavedFile>;
}

/**
 * 宿主侧的桌面能力：每个实例一份，绑定到这个实例的窗口。方法拿到的参数已经校验过
 * （`serveDesktop` 与 `parseDesktopArguments` 共用同一套规则）；能力授权、窗口是否还在，由实现方再次检查。
 */
export interface DesktopHost {
  /** 窗口。 */
  readonly window: DesktopWindowHost;
  /** 菜单。 */
  readonly menu: DesktopMenuHost;
  /** 应用。 */
  readonly app: DesktopAppHost;
  /** 外观。 */
  readonly appearance: DesktopAppearanceHost;
  /** 通知。 */
  readonly notification: DesktopNotificationHost;
  /** 剪贴板。 */
  readonly clipboard: DesktopClipboardHost;
  /** 文件。 */
  readonly filesystem: DesktopFilesystemHost;
  /** Git 工作区。 */
  readonly workspace?: DesktopWorkspaceHost;
}

/** 应用侧的 window 能力。 */
export interface DesktopWindowClient {
  /** 读取窗口状态。 */
  getState(): Promise<DesktopWindowState>;
  /** 设置标题（最多 256 个字符）。 */
  setTitle(title: string): Promise<void>;
  /** 最小化。 */
  minimize(): Promise<void>;
  /** 从最小化还原。 */
  restore(): Promise<void>;
  /** 在缩放铺满与原尺寸之间切换。 */
  toggleMaximize(): Promise<void>;
  /** 关闭窗口。 */
  close(): Promise<void>;
  /** 显示或隐藏宿主的标题栏；只有 `transparent` 外观的窗口可以隐藏。 */
  setDecorations(decorations: boolean): Promise<void>;
  /** 上报拖动区。 */
  setDragRegions(regions: readonly OrbitDragRegion[]): Promise<void>;
  /** 订阅宿主推送的窗口状态变化；返回退订函数。 */
  onStateChange(handler: (state: DesktopWindowState) => void): () => void;
  /** 跟踪 root 下带 `data-orbit-drag-region` 的元素，把拖动区上报给宿主；返回停止函数。 */
  trackDragRegions(root?: Document | Element): () => void;
}

/** 应用侧的 menu 能力。 */
export interface DesktopMenuClient {
  /** 登记本窗口的菜单；同一次登记里命令 ID 重复是 `INVALID_ARGUMENT`。 */
  set(menus: readonly DesktopMenu[]): Promise<void>;
  /** 订阅用户点选的菜单命令；回调收到的是应用自己登记的命令 ID。返回退订函数。 */
  onCommand(handler: (commandId: string) => void): () => void;
}

/** 应用侧的 app 能力。 */
export interface DesktopAppClient {
  /** 打开清单里已登记的应用；未登记的 ID、网址一律是 `INVALID_ARGUMENT`。 */
  open(appId: string): Promise<void>;
  /** 聚焦自己的窗口。 */
  focus(): Promise<void>;
  /** 退出自己的应用。 */
  quit(): Promise<void>;
}

/** 应用侧的 appearance 能力。 */
export interface DesktopAppearanceClient {
  /** 读取系统外观（需要 `appearance`）。 */
  get(): Promise<DesktopAppearance>;
  /** 写入系统外观（需要另外声明 `appearance:write`）。 */
  set(patch: DesktopAppearancePatch): Promise<void>;
  /** 订阅外观变化；返回退订函数。 */
  onChange(handler: (appearance: DesktopAppearance) => void): () => void;
}

/** 应用侧的 notification 能力。 */
export interface DesktopNotificationClient {
  /** 向桌面的通知中心提交一条通知，条目归属本应用；已提交的通知留在通知中心由用户清除，不随窗口关闭撤回。 */
  post(notification: DesktopNotificationInput): Promise<DesktopNotificationReceipt>;
}

/** 应用侧的 clipboard 能力（需要 `clipboard:read` / `clipboard:write`，并且登记表 `allow` 里授予了对应的浏览器权限）。 */
export interface DesktopClipboardClient {
  /** 读取剪贴板文本（由浏览器的权限提示决定，用户拒绝是 `BROWSER_PERMISSION_DENIED`）。 */
  readText(): Promise<string>;
  /** 写入剪贴板文本（要求请求落在用户手势的有效期内，否则是 `BROWSER_PERMISSION_DENIED`）。 */
  writeText(text: string): Promise<void>;
}

/** 应用侧的 filesystem 能力（读与写分别需要 `filesystem:read`、`filesystem:write`）。 */
export interface DesktopFilesystemClient {
  /** 弹出桌面的打开面板；用户选定一个文件时返回它的内容与凭证，取消是 `USER_CANCELLED`。用户在面板里停留的时间没有时限。 */
  open(options?: DesktopOpenOptions): Promise<DesktopOpenedFile>;
  /** 保存：带 `handle` 写回已授权的文件；不带 `handle` 弹出保存面板由用户选位置并确认覆盖。 */
  save(request: DesktopSaveRequest): Promise<DesktopSavedFile>;
}

/** 应用侧的 Git 工作区能力。 */
export interface DesktopWorkspaceClient {
  call(request: DesktopWorkspaceRequest): Promise<OrbitValue>;
}

/** 应用拿到的桌面能力。所有能力都在，但未在清单里声明的能力调用时稳定返回 `CAPABILITY_DENIED`。 */
export interface OrbitDesktop {
  /** 清单授予这个应用的能力。 */
  readonly capabilities: readonly DesktopCapability[];
  /** 窗口。 */
  readonly window: DesktopWindowClient;
  /** 菜单。 */
  readonly menu: DesktopMenuClient;
  /** 应用。 */
  readonly app: DesktopAppClient;
  /** 外观。 */
  readonly appearance: DesktopAppearanceClient;
  /** 通知。 */
  readonly notification: DesktopNotificationClient;
  /** 剪贴板。 */
  readonly clipboard: DesktopClipboardClient;
  /** 文件。 */
  readonly filesystem: DesktopFilesystemClient;
  /** Git 工作区。 */
  readonly workspace: DesktopWorkspaceClient;
}

/** 每个方法的参数。键是方法名（线上请求名是 `desktop.<方法名>`）。 */
export interface DesktopArguments {
  /** 读取窗口状态。 */
  'window.getState': null;
  /** 设置标题。 */
  'window.setTitle': string;
  /** 最小化。 */
  'window.minimize': null;
  /** 还原。 */
  'window.restore': null;
  /** 缩放。 */
  'window.toggleMaximize': null;
  /** 关闭。 */
  'window.close': null;
  /** 标题栏开关。 */
  'window.setDecorations': boolean;
  /** 拖动区。 */
  'window.setDragRegions': readonly OrbitDragRegion[];
  /** 登记菜单。 */
  'menu.set': readonly DesktopMenu[];
  /** 打开应用。 */
  'app.open': string;
  /** 聚焦。 */
  'app.focus': null;
  /** 退出。 */
  'app.quit': null;
  /** 读取外观。 */
  'appearance.get': null;
  /** 写入外观。 */
  'appearance.set': DesktopAppearancePatch;
  /** 提交通知。 */
  'notification.post': DesktopNotificationInput;
  /** 读剪贴板。 */
  'clipboard.readText': null;
  /** 写剪贴板。 */
  'clipboard.writeText': string;
  /** 打开文件。 */
  'filesystem.open': DesktopOpenOptions;
  /** 保存文件。 */
  'filesystem.save': DesktopSaveRequest;
  /** 调用桌面 Git 工作区。 */
  'workspace.call': DesktopWorkspaceRequest;
}

/** 每个方法成功时的结果；没有结果的方法是 `null`。 */
export interface DesktopResults {
  /** 窗口状态。 */
  'window.getState': DesktopWindowState;
  /** 无。 */
  'window.setTitle': null;
  /** 无。 */
  'window.minimize': null;
  /** 无。 */
  'window.restore': null;
  /** 无。 */
  'window.toggleMaximize': null;
  /** 无。 */
  'window.close': null;
  /** 无。 */
  'window.setDecorations': null;
  /** 无。 */
  'window.setDragRegions': null;
  /** 无。 */
  'menu.set': null;
  /** 无。 */
  'app.open': null;
  /** 无。 */
  'app.focus': null;
  /** 无。 */
  'app.quit': null;
  /** 外观。 */
  'appearance.get': DesktopAppearance;
  /** 无。 */
  'appearance.set': null;
  /** 回执。 */
  'notification.post': DesktopNotificationReceipt;
  /** 文本。 */
  'clipboard.readText': string;
  /** 无。 */
  'clipboard.writeText': null;
  /** 打开的文件。 */
  'filesystem.open': DesktopOpenedFile;
  /** 保存的文件。 */
  'filesystem.save': DesktopSavedFile;
  /** 工作区返回的 JSON 值。 */
  'workspace.call': OrbitValue;
}

/** 能力方法名。 */
export type DesktopMethod = keyof DesktopArguments;

/** 线上结果信封：成功。 */
export interface DesktopSuccess {
  /** 恒为 true。 */
  readonly ok: true;
  /** 成功值；没有结果的方法是 `null`。 */
  readonly value: OrbitValue;
}

/** 线上结果信封：带稳定错误码的失败。 */
export interface DesktopFailure {
  /** 恒为 false。 */
  readonly ok: false;
  /** 稳定错误码。 */
  readonly code: DesktopErrorCode;
  /** 给人看的说明，不要匹配它。 */
  readonly message: string;
  /** 保存超时或断连时是否可能已写入；旧宿主没有此标记。 */
  readonly resultUnknown?: boolean;
}

/** 线上的结果信封：成功，或带稳定错误码的失败。 */
export type DesktopEnvelope = DesktopSuccess | DesktopFailure;

/** `serveDesktop` 的选项。 */
export interface DesktopServeOptions {
  /** 清单授予的能力；没有列在这里的能力一律 `CAPABILITY_DENIED`，宿主函数不会被调用。 */
  readonly capabilities: readonly DesktopCapability[];
  /**
   * 每个以错误结束的请求回调一次（包括 `USER_CANCELLED`，由调用方按 {@link DESKTOP_ERROR_PRESENTATION} 决定要不要显示），
   * 桌面据此在窗口里给出一句可见的原因。
   */
  readonly onError?: (error: DesktopError, method: DesktopMethod) => void;
}

/** 宿主侧的桌面能力服务。 */
export interface DesktopServer {
  /** 注销全部方法与订阅；之后迟到的旧请求回调一律 `WINDOW_CLOSED`。实例销毁或失败时自动调用。幂等。 */
  dispose(): void;
}

const WIRE_PREFIX = 'desktop.';
const EVENTS = {
  window: 'desktop.window.state',
  menu: 'desktop.menu.command',
  appearance: 'desktop.appearance.change',
  /** 需要用户操作的请求的最终结果：`{ requestId, envelope }`，宿主自己的程序错误是 `{ requestId, handlerError }`。 */
  settled: 'desktop.request.settled'
} as const;

function bad(message: string): DesktopError {
  return new DesktopError('INVALID_ARGUMENT', message);
}

function readNone(value: unknown): null {
  if (value !== null && value !== undefined) throw bad('该操作不接受参数');
  return null;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], what: string): void {
  const extra = Object.keys(value).find(key => !allowed.includes(key));
  if (extra !== undefined) throw bad(`${what}不认识的字段：${extra}`);
}

const CONTROL = /\p{Cc}/u;
const COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const APP_ID = /^[a-z][a-z0-9-]*$/;

function readText(value: unknown, max: number, what: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || CONTROL.test(value))
    throw bad(`${what}必须是 1～${max} 个字符的文字，不含控制字符`);
  return value;
}

function readCommandId(value: unknown): string {
  const max = DESKTOP_LIMITS.menu.commandIdLength;
  if (typeof value !== 'string' || value.length > max || !COMMAND_ID.test(value))
    throw bad(`命令 ID 必须是 1～${max} 个字符：字母或数字开头，其后字母、数字、点、下划线与连字符`);
  return value;
}

interface MenuTally {
  readonly ids: Set<string>;
  commands: number;
}

function readCommand(value: Record<string, unknown>, tally: MenuTally): DesktopMenuCommand {
  onlyKeys(value, ['type', 'id', 'label', 'key', 'disabled', 'checked'], '菜单命令');
  if (value['type'] !== undefined && value['type'] !== 'command') throw bad('菜单项 type 只能是 command 或 separator');
  const id = readCommandId(value['id']);
  if (tally.ids.has(id)) throw bad(`菜单命令 ID 重复：${id}`);
  tally.ids.add(id);
  if (++tally.commands > DESKTOP_LIMITS.menu.commands) throw bad(`菜单命令最多 ${DESKTOP_LIMITS.menu.commands} 个`);
  const command: { -readonly [K in keyof DesktopMenuCommand]: DesktopMenuCommand[K] } = {
    id,
    label: readText(value['label'], DESKTOP_LIMITS.menu.itemLabelLength, '菜单项文字')
  };
  if (value['key'] !== undefined)
    command.key = readText(value['key'], DESKTOP_LIMITS.menu.shortcutLength, '快捷键提示');
  for (const flag of ['disabled', 'checked'] as const) {
    if (value[flag] === undefined) continue;
    if (typeof value[flag] !== 'boolean') throw bad(`${flag} 必须是布尔值`);
    command[flag] = value[flag];
  }
  return command;
}

function readMenuItem(value: unknown, tally: MenuTally): DesktopMenuItem {
  if (!isRecord(value)) throw bad('菜单项必须是对象');
  if (value['type'] !== 'separator') return readCommand(value, tally);
  onlyKeys(value, ['type'], '分隔线');
  return { type: 'separator' };
}

function readMenu(value: unknown, tally: MenuTally): DesktopMenu {
  if (!isRecord(value)) throw bad('菜单必须是对象');
  onlyKeys(value, ['label', 'items'], '菜单');
  const limit = DESKTOP_LIMITS.menu.itemsPerSection;
  const items = value['items'];
  if (!Array.isArray(items) || items.length > limit) throw bad(`菜单的 items 必须是最多 ${limit} 项的数组`);
  return {
    label: readText(value['label'], DESKTOP_LIMITS.menu.sectionLabelLength, '菜单标题'),
    items: items.map(item => readMenuItem(item, tally))
  };
}

function readMenus(value: unknown): readonly DesktopMenu[] {
  const limit = DESKTOP_LIMITS.menu.sections;
  if (!Array.isArray(value) || value.length > limit) throw bad(`菜单必须是最多 ${limit} 项的数组`);
  const tally: MenuTally = { ids: new Set(), commands: 0 };
  return value.map(menu => readMenu(menu, tally));
}

function readAppId(value: unknown): string {
  const max = DESKTOP_LIMITS.appIdLength;
  if (typeof value !== 'string' || value.length > max || !APP_ID.test(value))
    throw bad('应用 ID 必须是清单里登记的标识（小写字母开头的字母、数字与连字符），不接受网址或带参数的写法');
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw bad(`${what}只接受：${allowed.join('、')}`);
  return value as T;
}

function readAppearancePatch(value: unknown): DesktopAppearancePatch {
  if (!isRecord(value)) throw bad('外观补丁必须是对象');
  onlyKeys(value, ['appearance', 'accent'], '外观补丁');
  if (value['appearance'] === undefined && value['accent'] === undefined) throw bad('外观补丁至少要有一项');
  const patch: { appearance?: DesktopAppearanceMode; accent?: DesktopAccent } = {};
  if (value['appearance'] !== undefined)
    patch.appearance = oneOf(value['appearance'], DESKTOP_APPEARANCE_VALUES.appearance, 'appearance');
  if (value['accent'] !== undefined) patch.accent = oneOf(value['accent'], DESKTOP_APPEARANCE_VALUES.accent, 'accent');
  return patch;
}

function readFlags(value: Record<string, unknown>, keys: readonly string[], what: string): boolean[] {
  const flags = keys.map(key => value[key]);
  if (!flags.every(flag => typeof flag === 'boolean')) throw invalid(`${what}字段无效`);
  return flags as boolean[];
}

function readDesktopWindowState(value: unknown): DesktopWindowState {
  if (!isRecord(value)) throw invalid('窗口状态必须是对象');
  const { platform, frame } = value;
  const [decorations, focused, maximized, minimized] = readFlags(
    value,
    ['decorations', 'focused', 'maximized', 'minimized'],
    '窗口状态'
  );
  if (!PLATFORMS.includes(String(platform)) || !FRAMES.includes(String(frame))) throw invalid('窗口状态字段无效');
  return Object.freeze({ platform, frame, decorations, focused, maximized, minimized } as DesktopWindowState);
}

function readDesktopAppearance(value: unknown): DesktopAppearance {
  if (!isRecord(value)) throw invalid('外观必须是对象');
  const { theme, appearance, accent } = value;
  const known = (list: readonly string[], item: unknown) => typeof item === 'string' && list.includes(item);
  if (
    !known(['light', 'dark'], theme) ||
    !known(DESKTOP_APPEARANCE_VALUES.appearance, appearance) ||
    !known(DESKTOP_APPEARANCE_VALUES.accent, accent)
  )
    throw invalid('外观字段无效');
  return Object.freeze({ theme, appearance, accent } as DesktopAppearance);
}

function readNull(value: unknown): null {
  if (value !== null) throw invalid('结果必须是 null');
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const ICON_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ICON_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const FILE_VERSION = /^\d{1,16}:\d{1,12}$/;
const FILE_HANDLE = /^[A-Za-z0-9_.-]{1,128}$/;
const ACCEPT_EXTENSION = /^\.[a-z0-9][a-z0-9._+-]{0,31}$/;
const ACCEPT_MIME = /^[a-z]+\/(?:\*|[a-z0-9][a-z0-9.+_-]{0,126})$/;
/** 换行与制表以外的控制字符：正文允许这两种，其余都不要。 */
const CONTROL_EXCEPT_WHITESPACE = /(?![\n\t])\p{Cc}/u;

/** base64 编码后的最大字符数（解码后不超过 `bytes` 字节）。 */
const encodedLength = (bytes: number): number => Math.ceil(bytes / 3) * 4;

/** 将协议中的 base64 文本还原为文件字节。 */
export function decodeBase64(text: string, what = 'bytes'): Uint8Array<ArrayBuffer> {
  if (text.length % 4 !== 0 || !BASE64.test(text)) throw bad(`${what}必须是 base64 文本`);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** 将文件字节编码为可经 JSON 传输的文本。 */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

/** 文件内容：字节数组（直接调用）或 base64 文本（线上）；超过 `filesystem.bytes` 是 `FILE_TOO_LARGE`。 */
function readFileBytes(value: unknown): Uint8Array {
  const limit = DESKTOP_LIMITS.filesystem.bytes;
  const tooLarge = () => new DesktopError('FILE_TOO_LARGE', `文件内容超过 ${limit} 字节的上限`);
  let bytes: Uint8Array;
  if (value instanceof Uint8Array) bytes = value.slice();
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
  else if (typeof value === 'string') {
    if (value.length > encodedLength(limit)) throw tooLarge();
    bytes = decodeBase64(value, 'bytes');
  } else throw bad('bytes 必须是字节数组或 base64 文本');
  if (bytes.length > limit) throw tooLarge();
  return bytes;
}

function readBody(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || CONTROL_EXCEPT_WHITESPACE.test(value))
    throw bad(`正文必须是最多 ${max} 个字符的文字，只允许换行与制表这两种控制字符`);
  return value;
}

/** 图标的形状：登记图标的 ID，或大小合规的内联图片；ID 是不是宿主登记过的，由宿主再核对。 */
function readNotificationIcon(value: unknown): string {
  const { iconBytes } = DESKTOP_LIMITS.notification;
  if (typeof value !== 'string' || value.length > encodedLength(iconBytes) + 64)
    throw bad('图标必须是登记的图标 ID，或不超过上限的内联图片（data:image/png|jpeg|gif|webp;base64,…）');
  const image = ICON_IMAGE.exec(value);
  if (!image) {
    if (!ICON_ID.test(value)) throw bad('图标必须是登记的图标 ID，或内联图片（data:image/png|jpeg|gif|webp;base64,…）');
    return value;
  }
  const encoded = image[1]!;
  const padding =
    encoded.endsWith('==') ? 2
    : encoded.endsWith('=') ? 1
    : 0;
  if (!BASE64.test(encoded) || (encoded.length / 4) * 3 - padding > iconBytes)
    throw bad(`内联图片必须是合法的 base64，解码后不超过 ${iconBytes} 字节`);
  return value;
}

function readNotification(value: unknown): DesktopNotificationInput {
  if (!isRecord(value)) throw bad('通知必须是对象');
  onlyKeys(value, ['title', 'body', 'icon', 'dedupeKey'], '通知');
  const limits = DESKTOP_LIMITS.notification;
  const notification: { -readonly [K in keyof DesktopNotificationInput]: DesktopNotificationInput[K] } = {
    title: readText(value['title'], limits.titleLength, '标题'),
    body: readBody(value['body'], limits.bodyLength)
  };
  if (value['icon'] !== undefined) notification.icon = readNotificationIcon(value['icon']);
  if (value['dedupeKey'] !== undefined)
    notification.dedupeKey = readText(value['dedupeKey'], limits.dedupeKeyLength, '去重键');
  return notification;
}

function readClipboardText(value: unknown): string {
  const max = DESKTOP_LIMITS.clipboard.textLength;
  if (typeof value !== 'string' || value.length > max) throw bad(`剪贴板文本必须是最多 ${max} 个字符的文字`);
  if (new TextEncoder().encode(JSON.stringify(value)).length > CLIPBOARD_JSON_BYTES)
    throw bad('剪贴板文本经 JSON 编码后超出消息预算');
  return value;
}

/** 为最坏情况下的实例 ID（128 个需转义的码元）和信封字段保留 1 KiB。 */
const CLIPBOARD_JSON_BYTES = MAX_BYTES - 1024;

function readAccept(value: unknown): string[] {
  const max = DESKTOP_LIMITS.filesystem.acceptEntries;
  if (!Array.isArray(value) || value.length > max) throw bad(`accept 必须是最多 ${max} 项的数组`);
  return value.map(item => {
    const entry = typeof item === 'string' ? item.toLowerCase() : '';
    if (!ACCEPT_EXTENSION.test(entry) && !ACCEPT_MIME.test(entry))
      throw bad('accept 的每一项必须是扩展名（.md）或 MIME 类型（text/*、image/png）');
    return entry;
  });
}

const WORKSPACE_FILE_BYTES = 2 * 1024 * 1024;

function workspacePath(value: unknown): string {
  const path = readText(value, 240, 'path');
  if (
    path.includes('\\') ||
    path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
  )
    throw bad('工作区路径必须位于当前仓库的工作目录内');
  return path;
}

function workspacePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 2000) throw bad('工作区路径列表无效');
  return value.map(workspacePath);
}

function workspaceFile(value: unknown): DesktopWorkspaceFile {
  if (!isRecord(value)) throw bad('无效的工作区文件');
  onlyKeys(value, ['path', 'base64'], '工作区文件');
  const base64 = value['base64'];
  if (
    typeof base64 !== 'string' ||
    base64.length > encodedLength(WORKSPACE_FILE_BYTES) ||
    base64.length % 4 !== 0 ||
    !BASE64.test(base64)
  )
    throw bad('工作区文件的大小或编码无效');
  return { path: workspacePath(value['path']), base64 };
}

function readWorkspaceRequest(value: unknown): DesktopWorkspaceRequest {
  if (!isRecord(value)) throw bad('工作区请求必须是对象');
  const operation = oneOf(value['operation'], DESKTOP_WORKSPACE_OPERATIONS, '工作区操作');
  const projectId = readText(value['projectId'], 64, 'projectId');
  const keys = (...extra: string[]) => onlyKeys(value, ['operation', 'projectId', ...extra], '工作区请求');
  switch (operation) {
    case 'open':
    case 'status':
    case 'pull':
    case 'history':
      keys();
      return { projectId, operation };
    case 'remove':
    case 'discardWorking':
      keys('path');
      return { projectId, operation, path: workspacePath(value['path']) };
    case 'move':
    case 'rename':
      keys('path', 'destination');
      return {
        projectId,
        operation,
        path: workspacePath(value['path']),
        destination: workspacePath(value['destination'])
      };
    case 'stage':
    case 'unstage':
      keys('paths');
      return { projectId, operation, paths: workspacePaths(value['paths']) };
    case 'readDiff':
      keys('path', 'kind');
      return {
        projectId,
        operation,
        path: workspacePath(value['path']),
        kind: oneOf(value['kind'], ['working', 'staged'] as const, '差异类型')
      };
    case 'commit':
      keys('message');
      return { projectId, operation, message: readBody(value['message'], 4096) };
    case 'restore':
      keys('oid');
      return { projectId, operation, oid: readText(value['oid'], 64, 'oid') };
    case 'save': {
      keys('files', 'expectedRevision', 'removedPaths');
      const revision = value['expectedRevision'];
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)
        throw bad('保存必须带工作区版本');
      if (!Array.isArray(value['files']) || value['files'].length > 2000) throw bad('无效的工作区文件列表');
      const files = value['files'].map(workspaceFile);
      if (files.reduce((bytes, file) => bytes + file.base64.length * 0.75, 0) > 20 * 1024 * 1024 + 2 * files.length)
        throw bad('保存内容超过工作区上限');
      return {
        projectId,
        operation,
        files,
        expectedRevision: revision,
        ...(value['removedPaths'] === undefined ? {} : { removedPaths: workspacePaths(value['removedPaths']) })
      };
    }
  }
}

function readOpenOptions(value: unknown): DesktopOpenOptions {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw bad('打开选项必须是对象');
  onlyKeys(value, ['accept'], '打开选项');
  return value['accept'] === undefined ? {} : { accept: readAccept(value['accept']) };
}

/** 建议的文件名：1～`nameLength` 个字符，不含路径分隔符与控制字符，不是 `.` 或 `..`。 */
function readFileName(value: unknown): string {
  const max = DESKTOP_LIMITS.filesystem.nameLength;
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    CONTROL.test(value) ||
    /[/\\]/.test(value) ||
    value === '.' ||
    value === '..'
  )
    throw bad(`文件名必须是 1～${max} 个字符，不含路径分隔符与控制字符，也不能是 . 或 ..`);
  return value;
}

function readSaveRequest(value: unknown): DesktopSaveRequest {
  if (!isRecord(value)) throw bad('保存请求必须是对象');
  onlyKeys(value, ['handle', 'suggestedName', 'bytes', 'expectedVersion'], '保存请求');
  const request: { -readonly [K in keyof DesktopSaveRequest]: DesktopSaveRequest[K] } = {
    suggestedName: readFileName(value['suggestedName']),
    bytes: readFileBytes(value['bytes'])
  };
  if (value['handle'] !== undefined) {
    if (typeof value['handle'] !== 'string' || !FILE_HANDLE.test(value['handle'])) throw bad('handle 不是文件凭证');
    request.handle = value['handle'];
  }
  if (value['expectedVersion'] !== undefined) {
    if (request.handle === undefined) throw bad('expectedVersion 只能与 handle 一起给');
    if (typeof value['expectedVersion'] !== 'string' || !FILE_VERSION.test(value['expectedVersion']))
      throw bad('expectedVersion 必须是 open 或 save 返回的版本');
    request.expectedVersion = value['expectedVersion'];
  }
  return request;
}

function readReceipt(value: unknown): DesktopNotificationReceipt {
  if (!isRecord(value) || typeof value['id'] !== 'string' || !value['id'] || value['id'].length > 128)
    throw invalid('通知回执无效');
  return { id: value['id'] };
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw invalid('结果必须是文字');
  return value;
}

function readFileFields(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw invalid(`${what}必须是对象`);
  const { name, version, handle } = value;
  const text = (item: unknown): boolean => typeof item === 'string' && item.length > 0;
  if (!text(name) || !text(version) || !text(handle) || !FILE_VERSION.test(version as string))
    throw invalid(`${what}字段无效`);
  return value;
}

function readOpenedFile(value: unknown): DesktopOpenedFile {
  const fields = readFileFields(value, '打开的文件');
  const { size, mime, bytes } = fields;
  if (typeof mime !== 'string' || typeof bytes !== 'string' || !Number.isSafeInteger(size) || (size as number) < 0)
    throw invalid('打开的文件字段无效');
  if ((size as number) > DESKTOP_LIMITS.filesystem.bytes || bytes.length !== encodedLength(size as number))
    throw invalid('文件大小超限或与编码长度不符');
  const content = decodeBytesResult(bytes);
  if (content.length !== size) throw invalid('文件大小与实际内容不符');
  return Object.freeze({
    name: fields['name'] as string,
    mime,
    size: size as number,
    bytes: content,
    handle: fields['handle'] as string,
    version: fields['version'] as string
  });
}

/** 应用读到的内容：base64 文本解码成字节；不合法就是协议错误，不当作成功。 */
function decodeBytesResult(text: string): Uint8Array {
  try {
    return decodeBase64(text, 'bytes');
  } catch {
    throw invalid('文件内容不是 base64 文本');
  }
}

function readSavedFile(value: unknown): DesktopSavedFile {
  const fields = readFileFields(value, '保存的文件');
  return Object.freeze({
    name: fields['name'] as string,
    version: fields['version'] as string,
    handle: fields['handle'] as string
  });
}

function readCommandEvent(value: unknown): string {
  if (!isRecord(value) || typeof value['commandId'] !== 'string') throw invalid('菜单命令事件无效');
  return value['commandId'];
}

/**
 * 一个方法的完整规格：所属能力、参数校验、宿主调用、应用侧结果校验。
 * 线上只有 JSON 值：字节数组这类值在应用侧发出前用 `encodeArguments` 编码、宿主侧应答前用 `encodeResult` 编码，
 * 收到后分别由 `parse` 与 `read` 还原。
 */
interface MethodSpec<M extends DesktopMethod> {
  readonly capability: DesktopCapability;
  /** 这次调用是否要用户在桌面面板里操作：是就走「已受理 + 完成事件」的形态，宿主的处理时限不计用户停留的时间。 */
  readonly interactive?: (args: DesktopArguments[M]) => boolean;
  parse(value: unknown): DesktopArguments[M];
  encodeArguments?(args: DesktopArguments[M]): OrbitValue;
  run(
    host: DesktopHost,
    args: DesktopArguments[M],
    interaction: DesktopInteraction
  ): DesktopAwaitable<DesktopResults[M]>;
  encodeResult?(result: DesktopResults[M]): OrbitValue;
  read(value: unknown): DesktopResults[M];
}

/** 没有结果的宿主调用统一返回 null，线上结果不出现 undefined。 */
async function finish(action: DesktopAwaitable<void>): Promise<null> {
  await action;
  return null;
}

/**
 * 能力注册表：新增一项能力，先在 `DesktopArguments` 与 `DesktopResults` 里登记，再补规格——漏补编译不过。
 */
const METHODS: { readonly [M in DesktopMethod]: MethodSpec<M> } = {
  'window.getState': {
    capability: 'window',
    parse: readNone,
    run: host => host.window.getState(),
    read: readDesktopWindowState
  },
  'window.setTitle': {
    capability: 'window',
    parse: readTitle,
    run: (host, title) => finish(host.window.setTitle(title)),
    read: readNull
  },
  'window.minimize': {
    capability: 'window',
    parse: readNone,
    run: host => finish(host.window.minimize()),
    read: readNull
  },
  'window.restore': {
    capability: 'window',
    parse: readNone,
    run: host => finish(host.window.restore()),
    read: readNull
  },
  'window.toggleMaximize': {
    capability: 'window',
    parse: readNone,
    run: host => finish(host.window.toggleMaximize()),
    read: readNull
  },
  'window.close': {
    capability: 'window',
    parse: readNone,
    run: host => finish(host.window.close()),
    read: readNull
  },
  'window.setDecorations': {
    capability: 'window',
    parse: readBoolean,
    run: (host, decorations) => finish(host.window.setDecorations(decorations)),
    read: readNull
  },
  'window.setDragRegions': {
    capability: 'window',
    parse: readRegions,
    run: (host, regions) => finish(host.window.setDragRegions(regions)),
    read: readNull
  },
  'menu.set': {
    capability: 'menu',
    parse: readMenus,
    run: (host, menus) => finish(host.menu.set(menus)),
    read: readNull
  },
  'app.open': {
    capability: 'app',
    parse: readAppId,
    run: (host, appId) => finish(host.app.open(appId)),
    read: readNull
  },
  'app.focus': { capability: 'app', parse: readNone, run: host => finish(host.app.focus()), read: readNull },
  'app.quit': { capability: 'app', parse: readNone, run: host => finish(host.app.quit()), read: readNull },
  'appearance.get': {
    capability: 'appearance',
    parse: readNone,
    run: host => host.appearance.get(),
    read: readDesktopAppearance
  },
  'appearance.set': {
    capability: 'appearance:write',
    parse: readAppearancePatch,
    run: (host, patch) => finish(host.appearance.set(patch)),
    read: readNull
  },
  'notification.post': {
    capability: 'notification',
    parse: readNotification,
    run: (host, notification) => host.notification.post(notification),
    read: readReceipt
  },
  'clipboard.readText': {
    capability: 'clipboard:read',
    parse: readNone,
    run: host => host.clipboard.readText(),
    encodeResult: readClipboardText,
    read: value => readClipboardText(readString(value))
  },
  'clipboard.writeText': {
    capability: 'clipboard:write',
    parse: readClipboardText,
    encodeArguments: readClipboardText,
    run: (host, text) => finish(host.clipboard.writeText(text)),
    read: readNull
  },
  'filesystem.open': {
    capability: 'filesystem:read',
    interactive: () => true,
    parse: readOpenOptions,
    run: (host, options, interaction) => host.filesystem.open(options, interaction),
    encodeResult: file => {
      if (file.bytes.length !== file.size || file.size > DESKTOP_LIMITS.filesystem.bytes) throw invalid('文件大小无效');
      return { ...file, bytes: encodeBase64(file.bytes) };
    },
    read: readOpenedFile
  },
  'filesystem.save': {
    capability: 'filesystem:write',
    /* 带凭证写回已授权的文件，不弹面板，宿主处理时限照常计；不带凭证才弹保存面板。 */
    interactive: request => !isRecord(request) || request['handle'] === undefined,
    parse: readSaveRequest,
    /* 不是字节数组的 bytes 原样发出，由宿主按参数规则拒绝（INVALID_ARGUMENT），客户端不替宿主判断。 */
    encodeArguments: request => {
      if (!isRecord(request) || !(request.bytes instanceof Uint8Array)) return request as unknown as OrbitValue;
      if (request.bytes.length > DESKTOP_LIMITS.filesystem.bytes)
        throw new DesktopError('FILE_TOO_LARGE', `文件内容超过 ${DESKTOP_LIMITS.filesystem.bytes} 字节的上限`);
      return { ...request, bytes: encodeBase64(request.bytes) };
    },
    run: (host, request, interaction) => host.filesystem.save(request, interaction),
    read: readSavedFile
  },
  'workspace.call': {
    capability: 'workspace',
    parse: readWorkspaceRequest,
    run: (host, request) => host.workspace?.call(request) ?? Promise.reject(denied('workspace')),
    read: value => copyValue(value)
  }
};

const METHOD_NAMES = Object.keys(METHODS) as DesktopMethod[];

/** 每个方法需要的能力。宿主与内置应用的权限检查都读这张表，不各自维护一份。 */
export const DESKTOP_METHOD_CAPABILITIES: Readonly<Record<DesktopMethod, DesktopCapability>> = Object.freeze(
  Object.fromEntries(METHOD_NAMES.map(method => [method, METHODS[method].capability])) as Record<
    DesktopMethod,
    DesktopCapability
  >
);

/** 能力名列表的校验：只接受登记的能力名，不重复。 */
function readCapabilities(value: unknown): DesktopCapability[] {
  const known: readonly string[] = DESKTOP_CAPABILITIES;
  if (!Array.isArray(value)) throw invalid('能力列表必须是数组');
  const names = value.map(item => {
    if (typeof item !== 'string' || !known.includes(item)) throw invalid(`不认识的能力：${String(item)}`);
    return item as DesktopCapability;
  });
  if (new Set(names).size !== names.length) throw invalid('能力列表里有重复项');
  return names;
}

/**
 * 应用读宿主给的能力列表：必须是数组；不认识的能力名忽略（新版宿主可能授予旧 SDK 还不认识的能力，
 * 应用本来也用不了它们，宿主一侧才是授权的依据），重复的合并。
 */
function readGranted(value: unknown): DesktopCapability[] {
  const known: readonly string[] = DESKTOP_CAPABILITIES;
  if (!Array.isArray(value)) throw invalid('能力列表必须是数组');
  const names = value.filter((item): item is DesktopCapability => typeof item === 'string' && known.includes(item));
  return [...new Set(names)];
}

/** 宿主创建实例时放进启动属性的桌面能力信息：清单授予这个应用的能力。 */
export function desktopProps(capabilities: readonly DesktopCapability[]): OrbitObject {
  return { [DESKTOP_PROP]: { capabilities: readCapabilities(capabilities) } };
}

/**
 * 校验一个方法的参数，不合法抛 `DesktopError('INVALID_ARGUMENT')`。`serveDesktop` 处理线上请求时用它，
 * 内置应用的上下文用同一个函数校验直接调用的参数，所以两条路径的参数规则一致。
 */
export function parseDesktopArguments<M extends DesktopMethod>(method: M, value: unknown): DesktopArguments[M] {
  try {
    return METHODS[method].parse(value);
  } catch (error) {
    if (error instanceof OrbitError && error.code === 'INVALID_PAYLOAD') throw bad(error.message);
    throw error;
  }
}

function denied(capability: DesktopCapability): DesktopError {
  return new DesktopError('CAPABILITY_DENIED', `清单没有声明 ${capability} 能力`);
}

function closed(): DesktopError {
  return new DesktopError('WINDOW_CLOSED', '窗口已关闭，或这个应用实例已被销毁');
}

/** 请求信封：实例 ID、参数，需要用户操作的请求再加请求 ID（完成事件靠它对上号）。 */
interface Frame {
  readonly instanceId: string;
  readonly args: OrbitValue;
  readonly requestId?: string;
}

const REQUEST_ID = /^[\x21-\x7e]{1,200}$/;

/** 请求信封：实例 ID 加参数。实例 ID 是 Orbit 在握手时给应用的，宿主据此丢弃旧实例的迟到请求。 */
function readFrame(payload: OrbitValue): Frame {
  if (!isRecord(payload) || typeof payload['instanceId'] !== 'string' || !('args' in payload))
    throw bad('请求必须是 { instanceId, args }');
  onlyKeys(payload, ['instanceId', 'args', 'requestId'], '请求');
  const frame = { instanceId: payload['instanceId'], args: payload['args'] as OrbitValue };
  if (payload['requestId'] === undefined) return frame;
  if (typeof payload['requestId'] !== 'string' || !REQUEST_ID.test(payload['requestId']))
    throw bad('requestId 必须是 1～200 个可见字符');
  return { ...frame, requestId: payload['requestId'] };
}

/**
 * 在宿主处理时限内运行一次宿主调用，**只计宿主处理的时间**：宿主等用户操作（面板里选文件、确认覆盖）的那一段包进
 * `interaction.waitForUser`，计时暂停，用户操作完再接着算剩下的时间——所以用户在面板里停留多久都不会让请求超时，
 * 超时或取消时终止宿主信号；保存越过提交边界后则不能保证尚未写入。
 */
async function withBudget<T>(
  run: (interaction: DesktopInteraction) => DesktopAwaitable<T>,
  method: DesktopMethod,
  cancelled: AbortSignal
): Promise<T> {
  if (cancelled.aborted) throw closed();
  const deadline = new AbortController();
  const signal = AbortSignal.any([cancelled, deadline.signal]);
  const stopped = Promise.withResolvers<never>();
  let savePhase: 'untracked' | 'preparing' | 'writing' = 'untracked';
  const interrupt = () => {
    const cause = deadline.signal.aborted ? new DesktopError('TIMEOUT', '宿主处理请求超时') : closed();
    stopped.reject(method === 'filesystem.save' && savePhase !== 'preparing' ? unknownSave(cause) : cause);
  };
  signal.addEventListener('abort', interrupt, { once: true });
  let remaining: number = DESKTOP_LIMITS.requestTimeoutMs;
  let startedAt = Date.now();
  let waits = 0;
  const arm = () => setTimeout(() => deadline.abort(), Math.max(0, remaining));
  let timer = arm();
  const interaction: DesktopInteraction = {
    signal,
    prepareSave() {
      signal.throwIfAborted();
      if (savePhase !== 'untracked') throw new Error('保存请求只能登记一次提交');
      savePhase = 'preparing';
      return () => {
        signal.throwIfAborted();
        savePhase = 'writing';
      };
    },
    async waitForUser(pending) {
      if (waits++ === 0) {
        clearTimeout(timer);
        remaining -= Date.now() - startedAt;
      }
      try {
        return await Promise.race([pending, stopped.promise]);
      } finally {
        if (--waits === 0 && !signal.aborted) {
          startedAt = Date.now();
          timer = arm();
        }
      }
    }
  };
  try {
    const work = Promise.resolve().then(() => {
      signal.throwIfAborted();
      return run(interaction);
    });
    return await Promise.race([stopped.promise, work]);
  } catch (error) {
    if (
      method === 'filesystem.save' &&
      error instanceof DesktopError &&
      error.code === 'TIMEOUT' &&
      !deadline.signal.aborted
    )
      throw unknownSave(error);
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', interrupt);
  }
}

function unknownSave(cause: unknown): DesktopError {
  return new DesktopError('RESULT_UNKNOWN', '无法确认保存结果，请核对文件后再重试', { cause });
}

/** 宿主的结果上线前的样子：先按规格编码（字节数组变 base64），再走一遍 JSON 复制，线上只有普通的 JSON 值。 */
function packResult<M extends DesktopMethod>(spec: MethodSpec<M>, value: DesktopResults[M]): OrbitValue {
  return copyValue(spec.encodeResult ? spec.encodeResult(value) : (value ?? null));
}

/**
 * 宿主在 Orbit 实例上登记桌面能力；装载前调用，应用握手后的第一个请求就能被处理。
 *
 * 每个请求依次检查：实例还在、请求带的实例 ID 与这条连接一致（不一致是旧实例的迟到请求，按实例 ID 丢弃）、
 * 能力已在清单里声明（默认拒绝）、参数合法、宿主在时限内处理完（只计宿主处理的时间，见 {@link DesktopInteraction}）。
 * 失败都变成带稳定错误码的信封回给应用，并回调 `onError`；宿主自己的程序错误不冒充任何错误码，按处理失败原样回给应用。
 *
 * 需要用户在桌面面板里操作的请求（`filesystem.open`、不带凭证的 `filesystem.save`）带一个 `requestId`：前面这些检查通过后
 * 宿主立刻应答「已受理」，宿主调用在后台跑，结果（成功、稳定错误码，或宿主自己的程序错误）用 `desktop.request.settled`
 * 事件送达。实例销毁或失败之后迟到的结果不再送出。
 * 实例销毁或失败时自动解绑，也可以手动 `dispose()`。
 */
export function serveDesktop(instance: OrbitInstance, host: DesktopHost, options: DesktopServeOptions): DesktopServer {
  const granted: ReadonlySet<DesktopCapability> = new Set(readCapabilities(options.capabilities));
  const pending = new Set<string>();
  const lifetime = new AbortController();
  const connectedInstance = () => !['destroyed', 'failed'].includes(instance.snapshot.state);
  const live = () => !lifetime.signal.aborted && connectedInstance();

  /** 信封上线前走一遍 JSON 复制：线上只有普通的 JSON 值。 */
  const wire = (envelope: DesktopEnvelope): OrbitValue => copyValue(envelope);

  const fail = (method: DesktopMethod, error: DesktopError): OrbitValue => {
    reportSafely(() => options.onError?.(error, method));
    const message = error.message.slice(0, 4096);
    if (error.code === 'RESULT_UNKNOWN') {
      const code =
        error.cause instanceof DesktopError && error.cause.code === 'WINDOW_CLOSED' ? 'WINDOW_CLOSED' : 'TIMEOUT';
      return { ok: false, code, message, resultUnknown: true };
    }
    if (method === 'filesystem.save' && error.code === 'TIMEOUT')
      return { ok: false, code: error.code, message, resultUnknown: false };
    return wire({ ok: false, code: error.code, message });
  };

  const push = (event: string, payload: OrbitValue) => {
    if (live() && ['ready', 'hidden'].includes(instance.snapshot.state)) instance.emit(event, payload);
  };

  /** 需要用户操作的请求：应答「已受理」，宿主调用在后台跑，结果走完成事件。 */
  const begin = <M extends DesktopMethod>(
    method: M,
    spec: MethodSpec<M>,
    args: DesktopArguments[M],
    requestId: string | undefined,
    signal: AbortSignal
  ): OrbitValue => {
    if (requestId === undefined) throw bad('需要用户操作的请求必须带 requestId');
    if (pending.has(requestId)) throw bad(`请求 ID 重复：${requestId}`);
    pending.add(requestId);
    const settle = (result: OrbitValue) => {
      if (connectedInstance()) instance.emit(EVENTS.settled, { requestId, ...(result as OrbitObject) });
    };
    /* 宿主返回了没法编码的结果（程序错误）也要走到完成事件：否则应用永远等不到结果。 */
    void withBudget(interaction => spec.run(host, args, interaction), method, signal)
      .then(value => packResult(spec, value))
      .then(value => settle({ envelope: wire({ ok: true, value }) }))
      .catch((error: unknown) =>
        settle(
          error instanceof DesktopError ?
            { envelope: fail(method, error) }
          : { handlerError: error instanceof Error ? error.message.slice(0, 4096) : '请求处理失败' }
        )
      )
      .finally(() => pending.delete(requestId));
    return wire({ ok: true, value: null });
  };

  const receiveWorkspace = workspaceReceiver(async value => {
    if (!live() || !host.workspace) throw denied('workspace');
    return host.workspace.call(parseDesktopArguments('workspace.call', value));
  });

  const handle = async <M extends DesktopMethod>(
    method: M,
    payload: OrbitValue,
    rpc: AbortSignal
  ): Promise<OrbitValue> => {
    try {
      if (!live()) throw closed();
      const frame = readFrame(payload);
      if (frame.instanceId !== instance.snapshot.instanceId) throw closed();
      const spec = METHODS[method];
      if (!granted.has(spec.capability)) throw denied(spec.capability);
      if (method === 'workspace.call')
        return wire({ ok: true, value: await receiveWorkspace(frame.args as OrbitValue) });
      const args = parseDesktopArguments(method, frame.args);
      const signal = AbortSignal.any([rpc, lifetime.signal]);
      if (spec.interactive?.(args)) return begin(method, spec, args, frame.requestId, signal);
      if (frame.requestId !== undefined) throw bad('这个请求不需要 requestId');
      const value = await withBudget(interaction => spec.run(host, args, interaction), method, signal);
      return wire({ ok: true, value: packResult(spec, value) });
    } catch (error) {
      if (error instanceof DesktopError) return fail(method, error);
      throw error;
    }
  };

  const unregister = registerService(add => {
    for (const method of METHOD_NAMES)
      add(instance.onRequest(`${WIRE_PREFIX}${method}`, (payload, signal) => handle(method, payload, signal)));
    if (granted.has('window')) add(host.window.onStateChange(state => push(EVENTS.window, { ...state })));
    if (granted.has('menu')) add(host.menu.onCommand(commandId => push(EVENTS.menu, { commandId })));
    if (granted.has('appearance'))
      add(host.appearance.onChange(appearance => push(EVENTS.appearance, { ...appearance })));
    add(
      instance.subscribe(({ state }) => {
        if (state === 'destroyed' || state === 'failed') dispose();
      })
    );
  });
  function dispose() {
    lifetime.abort();
    unregister();
  }
  return { dispose };
}

/** 请求信封的回复：成功带值，失败带稳定错误码；其余形状一律读不懂。 */
function unpack(value: unknown, method: DesktopMethod): OrbitValue {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') throw invalid('宿主的回复不是桌面能力信封');
  if (value['ok']) return value['value'] as OrbitValue;
  const codes: readonly unknown[] = DESKTOP_ERROR_CODES;
  if (!codes.includes(value['code']) || typeof value['message'] !== 'string')
    throw invalid('宿主的失败信封缺少稳定错误码');
  const error = new DesktopError(value['code'] as DesktopErrorCode, value['message']);
  if (value['resultUnknown'] === true) throw new DesktopError('RESULT_UNKNOWN', error.message, { cause: error });
  if (method === 'filesystem.save' && error.code === 'TIMEOUT' && value['resultUnknown'] !== false)
    throw unknownSave(error);
  throw error;
}

/** 把 Orbit RPC 层的失败归到稳定错误码：超时、连接已销毁（窗口已关闭）、载荷不合法；其余照原样抛出。 */
function translate(error: unknown, method: DesktopMethod): unknown {
  if (!(error instanceof OrbitError)) return error;
  if (method === 'filesystem.save' && ['TIMEOUT', 'DESTROYED', 'ABORTED'].includes(error.code))
    return unknownSave(error);
  if (error.code === 'TIMEOUT') return new DesktopError('TIMEOUT', error.message, { cause: error });
  if (error.code === 'DESTROYED') return new DesktopError('WINDOW_CLOSED', error.message, { cause: error });
  if (error.code === 'INVALID_PAYLOAD') return new DesktopError('INVALID_ARGUMENT', error.message, { cause: error });
  return error;
}

async function requestDesktop(client: OrbitClient, method: DesktopMethod, payload: OrbitObject): Promise<OrbitValue> {
  let reply: OrbitValue;
  try {
    reply = await client.request(`${WIRE_PREFIX}${method}`, payload, {
      timeout: method === 'workspace.call' ? 65000 : DESKTOP_LIMITS.callTimeoutMs
    });
  } catch (error) {
    throw translate(error, method);
  }
  return unpack(reply, method);
}

function listen<T>(client: OrbitClient, event: string, read: (value: unknown) => T, handler: (value: T) => void) {
  const listener = (next: unknown) => handler(read(next));
  client.bus.$on(event, listener);
  return () => {
    client.bus.$off(event, listener);
  };
}

/** 应用侧正在等的需要用户操作的请求。 */
interface Waiter {
  resolve(value: OrbitValue): void;
  reject(error: unknown): void;
  readonly method: DesktopMethod;
}

interface InteractiveRequests {
  start(method: DesktopMethod): { id: string; outcome: Promise<OrbitValue>; forget(): void };
}

const connections = new WeakMap<OrbitClient, InteractiveRequests>();

function interactiveRequests(client: OrbitClient): InteractiveRequests {
  const existing = connections.get(client);
  if (existing) return existing;
  const waiters = new Map<string, Waiter>();
  let sequence = 0;
  client.bus.$on(EVENTS.settled, settled => {
    if (!isRecord(settled) || typeof settled['requestId'] !== 'string') throw invalid('请求的完成事件无效');
    const waiter = waiters.get(settled['requestId']);
    if (!waiter) return;
    waiters.delete(settled['requestId']);
    try {
      if (typeof settled['handlerError'] === 'string') throw new OrbitError('HANDLER_ERROR', settled['handlerError']);
      waiter.resolve(unpack(settled['envelope'], waiter.method));
    } catch (error) {
      waiter.reject(error);
    }
  });
  client.onDispose(() => {
    for (const waiter of waiters.values())
      waiter.reject(waiter.method === 'filesystem.save' ? unknownSave(closed()) : closed());
    waiters.clear();
  });
  const requests: InteractiveRequests = {
    start(method) {
      const id = String(++sequence);
      const deferred = Promise.withResolvers<OrbitValue>();
      waiters.set(id, { ...deferred, method });
      // 完成事件可能早于受理应答；在等应答期间也要接住拒绝。
      void deferred.promise.catch(() => undefined);
      return { id, outcome: deferred.promise, forget: () => waiters.delete(id) };
    }
  };
  connections.set(client, requests);
  return requests;
}

/**
 * 子应用拿到桌面能力；宿主不提供时返回 undefined，应用按普通网页运行。
 * 每个调用带本实例的 ID，成功时返回结果，失败时抛 {@link DesktopError}（稳定错误码）；
 * 没有在清单里声明的能力调用时稳定返回 `CAPABILITY_DENIED`。
 *
 * 需要用户在桌面面板里操作的调用（`filesystem.open`、不带凭证的 `filesystem.save`）先等宿主应答「已受理」
 * （这一步有 `callTimeoutMs` 的时限），再等宿主用完成事件送达最终结果——用户在面板里停留的时间没有时限；
 * 断连时读请求以 `WINDOW_CLOSED` 结束；无法确认写入结果时保存以 `RESULT_UNKNOWN` 结束。
 */
export function getDesktop(client: OrbitClient): OrbitDesktop | undefined {
  const initial = client.context.props[DESKTOP_PROP];
  if (initial === undefined) return undefined;
  if (!isRecord(initial)) throw invalid('桌面能力信息必须是对象');
  const capabilities = Object.freeze(readGranted(initial['capabilities']));
  const call = async <M extends DesktopMethod>(method: M, args: DesktopArguments[M]): Promise<DesktopResults[M]> => {
    const spec = METHODS[method];
    const wireArgs = spec.encodeArguments ? spec.encodeArguments(args) : (args as OrbitValue);
    const payload: Record<string, OrbitValue> = { instanceId: client.context.instanceId, args: wireArgs };
    const pending = spec.interactive?.(args) ? interactiveRequests(client).start(method) : undefined;
    if (pending) payload['requestId'] = pending.id;
    try {
      const value = await requestDesktop(client, method, payload);
      return spec.read(pending ? await pending.outcome : value);
    } finally {
      pending?.forget();
    }
  };
  const workspaceCall = workspaceSender(args =>
    requestDesktop(client, 'workspace.call', { instanceId: client.context.instanceId, args })
  );
  const done = async (action: Promise<null>): Promise<void> => {
    await action;
  };
  return {
    capabilities,
    window: {
      getState: () => call('window.getState', null),
      setTitle: title => done(call('window.setTitle', title)),
      minimize: () => done(call('window.minimize', null)),
      restore: () => done(call('window.restore', null)),
      toggleMaximize: () => done(call('window.toggleMaximize', null)),
      close: () => done(call('window.close', null)),
      setDecorations: decorations => done(call('window.setDecorations', decorations)),
      setDragRegions: regions => done(call('window.setDragRegions', regions)),
      onStateChange: handler => listen(client, EVENTS.window, readDesktopWindowState, handler),
      trackDragRegions: (root = document) => trackDragRegions(regions => call('window.setDragRegions', regions), root)
    },
    menu: {
      set: menus => done(call('menu.set', menus)),
      onCommand: handler => listen(client, EVENTS.menu, readCommandEvent, handler)
    },
    app: {
      open: appId => done(call('app.open', appId)),
      focus: () => done(call('app.focus', null)),
      quit: () => done(call('app.quit', null))
    },
    appearance: {
      get: () => call('appearance.get', null),
      set: patch => done(call('appearance.set', patch)),
      onChange: handler => listen(client, EVENTS.appearance, readDesktopAppearance, handler)
    },
    notification: { post: notification => call('notification.post', notification) },
    clipboard: {
      readText: () => call('clipboard.readText', null),
      writeText: text => done(call('clipboard.writeText', text))
    },
    filesystem: {
      open: (options = {}) => call('filesystem.open', options),
      save: request => call('filesystem.save', request)
    },
    workspace: {
      call: request => workspaceCall(request)
    }
  };
}
