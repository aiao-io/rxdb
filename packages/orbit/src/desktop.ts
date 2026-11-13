import { OrbitError } from './errors.js';
import { copyValue, isRecord } from './payload.js';
import type { OrbitClient, OrbitInstance, OrbitObject, OrbitValue } from './types.js';
import {
  FRAMES,
  MAX_REGIONS,
  MAX_TITLE,
  PLATFORMS,
  invalid,
  readBoolean,
  readRegions,
  readTitle,
  trackDragRegions
} from './window-codec.js';
import type { OrbitDragRegion, OrbitWindowFrame, OrbitWindowPlatform } from './window.js';

/*
 * 桌面能力协议（ADESK-US-206「能力契约」）：应用经 Orbit 请求宿主的 window / menu / app / appearance，
 * 以及阶段 D 的 notification / clipboard / filesystem。内置应用与远程应用共用同一套能力名称、参数校验、
 * 成功结果与错误码——宿主侧用 `serveDesktop` 把一个 `DesktopHost` 接到 Orbit 实例上，
 * 内置应用直接调用同一个 `DesktopHost`，所以两条路径的语义不会分叉。
 */

/** 启动属性里放桌面能力信息（清单授予的能力）的键；没有它说明宿主不提供桌面能力。 */
export const DESKTOP_PROP = 'orbit.desktop';

/**
 * 能力名取值全集，清单 `capabilities` 逐项声明，默认拒绝。读写分开授权的能力用 `:read` / `:write` 区分；
 * `appearance` 只读，写入另外声明 `appearance:write`。notification、clipboard、filesystem 是阶段 D 的能力，
 * 名称先登记，方法在阶段 D 实现。
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
  'filesystem:write'
] as const;

/** 能力名。 */
export type DesktopCapability = (typeof DESKTOP_CAPABILITIES)[number];

/**
 * 稳定的错误码表：前六个是每项能力通用的结果分类，后六个由阶段 D 的 notification 与 filesystem 使用。
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
  'RATE_LIMITED'
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
  RATE_LIMITED: 'app'
};

/**
 * 协议常量：超时、大小与频率上限。阶段 C、D 实现前定下，单测断言这张表；改动时同步 README 的协议文档。
 *
 * - `requestTimeoutMs`：宿主处理一次请求的时限，只计宿主处理的时间——用户在桌面面板里选文件、确认覆盖的停留时间不计入；
 * - `callTimeoutMs`：应用侧等待结果的兜底时限，比宿主多留 2 秒，让宿主自己的 `TIMEOUT` 结果先到达；
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
  notification: { titleLength: 120, bodyLength: 1_000, dedupeKeyLength: 128, iconBytes: 65_536, perMinute: 10 },
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

/**
 * 宿主侧的桌面能力：每个实例一份，绑定到这个实例的窗口。方法拿到的参数已经校验过
 * （`serveDesktop` 与 `parseDesktopArguments` 共用同一套规则）；能力授权、窗口是否还在，由实现方再次检查。
 * 阶段 D 在这里增加 notification、clipboard、filesystem。
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
  appearance: 'desktop.appearance.change'
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

function readCommandEvent(value: unknown): string {
  if (!isRecord(value) || typeof value['commandId'] !== 'string') throw invalid('菜单命令事件无效');
  return value['commandId'];
}

/** 一个方法的完整规格：所属能力、参数校验、宿主调用、应用侧结果校验。 */
interface MethodSpec<M extends DesktopMethod> {
  readonly capability: DesktopCapability;
  parse(value: unknown): DesktopArguments[M];
  run(host: DesktopHost, args: DesktopArguments[M]): DesktopAwaitable<DesktopResults[M]>;
  read(value: unknown): DesktopResults[M];
}

/** 没有结果的宿主调用统一返回 null，线上结果不出现 undefined。 */
async function finish(action: DesktopAwaitable<void>): Promise<null> {
  await action;
  return null;
}

/**
 * 能力注册表：阶段 D 在这里增加 notification / clipboard / filesystem 的方法，
 * 先在 `DesktopArguments` 与 `DesktopResults` 里登记，再补规格——漏补编译不过。
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

/** 请求信封：实例 ID 加参数。实例 ID 是 Orbit 在握手时给应用的，宿主据此丢弃旧实例的迟到请求。 */
function readFrame(payload: OrbitValue): { instanceId: string; args: OrbitValue } {
  if (!isRecord(payload) || typeof payload['instanceId'] !== 'string' || !('args' in payload))
    throw bad('请求必须是 { instanceId, args }');
  onlyKeys(payload, ['instanceId', 'args'], '请求');
  return { instanceId: payload['instanceId'], args: payload['args'] as OrbitValue };
}

function withTimeout<T>(run: () => DesktopAwaitable<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DesktopError('TIMEOUT', `宿主在 ${milliseconds} 毫秒内没有处理完请求`)),
      milliseconds
    );
    Promise.resolve()
      .then(run)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

/**
 * 宿主在 Orbit 实例上登记桌面能力；装载前调用，应用握手后的第一个请求就能被处理。
 *
 * 每个请求依次检查：实例还在、请求带的实例 ID 与这条连接一致（不一致是旧实例的迟到请求，按实例 ID 丢弃）、
 * 能力已在清单里声明（默认拒绝）、参数合法、宿主在时限内处理完。失败都变成带稳定错误码的信封回给应用，
 * 并回调 `onError`；宿主自己的程序错误不冒充任何错误码，按处理失败原样回给应用。
 * 实例销毁或失败时自动解绑，也可以手动 `dispose()`。
 */
export function serveDesktop(instance: OrbitInstance, host: DesktopHost, options: DesktopServeOptions): DesktopServer {
  const granted: ReadonlySet<DesktopCapability> = new Set(readCapabilities(options.capabilities));
  const offs: (() => void)[] = [];
  let disposed = false;
  const live = () => !disposed && !['destroyed', 'failed'].includes(instance.snapshot.state);

  /** 信封上线前走一遍 JSON 复制：线上只有普通的 JSON 值。 */
  const wire = (envelope: DesktopEnvelope): OrbitValue => copyValue(envelope);

  const fail = (method: DesktopMethod, error: DesktopError): OrbitValue => {
    options.onError?.(error, method);
    return wire({ ok: false, code: error.code, message: error.message });
  };

  const handle = async <M extends DesktopMethod>(method: M, payload: OrbitValue): Promise<OrbitValue> => {
    try {
      if (!live()) throw closed();
      const frame = readFrame(payload);
      if (frame.instanceId !== instance.snapshot.instanceId) throw closed();
      const spec = METHODS[method];
      if (!granted.has(spec.capability)) throw denied(spec.capability);
      const args = parseDesktopArguments(method, frame.args);
      const value = await withTimeout(() => spec.run(host, args), DESKTOP_LIMITS.requestTimeoutMs);
      return wire({ ok: true, value: copyValue(value ?? null) });
    } catch (error) {
      if (error instanceof DesktopError) return fail(method, error);
      throw error;
    }
  };

  const push = (event: string, payload: OrbitValue) => {
    if (live() && ['ready', 'hidden'].includes(instance.snapshot.state)) instance.emit(event, payload);
  };

  for (const method of METHOD_NAMES)
    offs.push(instance.onRequest(`${WIRE_PREFIX}${method}`, payload => handle(method, payload)));
  /* 推送也是能力：没声明 window 的应用不会收到窗口状态，没声明 appearance 的应用不会收到外观变化。 */
  if (granted.has('window')) offs.push(host.window.onStateChange(state => push(EVENTS.window, { ...state })));
  if (granted.has('menu')) offs.push(host.menu.onCommand(commandId => push(EVENTS.menu, { commandId })));
  if (granted.has('appearance'))
    offs.push(host.appearance.onChange(appearance => push(EVENTS.appearance, { ...appearance })));

  const server: DesktopServer = {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs.splice(0)) off();
    }
  };
  offs.push(
    instance.subscribe(snapshot => {
      if (snapshot.state === 'destroyed' || snapshot.state === 'failed') server.dispose();
    })
  );
  return server;
}

/** 请求信封的回复：成功带值，失败带稳定错误码；其余形状一律读不懂。 */
function readEnvelope(value: unknown): DesktopEnvelope {
  if (!isRecord(value) || typeof value['ok'] !== 'boolean') throw invalid('宿主的回复不是桌面能力信封');
  if (value['ok']) return { ok: true, value: value['value'] as OrbitValue };
  const codes: readonly unknown[] = DESKTOP_ERROR_CODES;
  if (!codes.includes(value['code']) || typeof value['message'] !== 'string')
    throw invalid('宿主的失败信封缺少稳定错误码');
  return { ok: false, code: value['code'] as DesktopErrorCode, message: value['message'] };
}

/** 把 Orbit RPC 层的失败归到稳定错误码：超时、连接已销毁（窗口已关闭）、载荷不合法；其余照原样抛出。 */
function translate(error: unknown): unknown {
  if (!(error instanceof OrbitError)) return error;
  if (error.code === 'TIMEOUT') return new DesktopError('TIMEOUT', error.message, { cause: error });
  if (error.code === 'DESTROYED') return new DesktopError('WINDOW_CLOSED', error.message, { cause: error });
  if (error.code === 'INVALID_PAYLOAD') return new DesktopError('INVALID_ARGUMENT', error.message, { cause: error });
  return error;
}

function listen<T>(client: OrbitClient, event: string, read: (value: unknown) => T, handler: (value: T) => void) {
  const listener = (next: unknown) => handler(read(next));
  client.bus.$on(event, listener);
  return () => {
    client.bus.$off(event, listener);
  };
}

/**
 * 子应用拿到桌面能力；宿主不提供时返回 undefined，应用按普通网页运行。
 * 每个调用带本实例的 ID，成功时返回结果，失败时抛 {@link DesktopError}（稳定错误码）；
 * 没有在清单里声明的能力调用时稳定返回 `CAPABILITY_DENIED`。
 */
export function getDesktop(client: OrbitClient): OrbitDesktop | undefined {
  const initial = client.context.props[DESKTOP_PROP];
  if (initial === undefined) return undefined;
  if (!isRecord(initial)) throw invalid('桌面能力信息必须是对象');
  const capabilities = Object.freeze(readCapabilities(initial['capabilities']));
  const call = async <M extends DesktopMethod>(method: M, args: DesktopArguments[M]): Promise<DesktopResults[M]> => {
    const payload = { instanceId: client.context.instanceId, args } as unknown as OrbitValue;
    let reply: OrbitValue;
    try {
      reply = await client.request(`${WIRE_PREFIX}${method}`, payload, { timeout: DESKTOP_LIMITS.callTimeoutMs });
    } catch (error) {
      throw translate(error);
    }
    const envelope = readEnvelope(reply);
    if (!envelope.ok) throw new DesktopError(envelope.code, envelope.message);
    return METHODS[method].read(envelope.value);
  };
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
      trackDragRegions: (root = document) =>
        trackDragRegions(regions => void call('window.setDragRegions', regions), root)
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
    }
  };
}
