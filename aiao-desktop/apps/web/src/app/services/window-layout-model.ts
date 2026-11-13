import { clamp } from '../shared/format';
import { DesktopAppId, DesktopAppManifests, DesktopOpenOptions, RestoreOptions } from './desktop-apps';
import type { WindowBox } from './desktop-window';
import type { FsNode } from './file-system';

/** 布局存成偏好表里的一行 JSON，键是前缀加标签页的会话标识；每个标签页只读写自己的键。 */
export const WINDOW_LAYOUT_PREFIX = 'windows:layout:';

/** 布局 JSON 的版本；读到别的版本一律不碰（可能是更新的构建写的）。 */
export const WINDOW_LAYOUT_VERSION = 1;

/** 标签页的会话标识存在会话存储（sessionStorage）的这个键下。 */
export const TAB_ID_KEY = 'aiao-desktop:tab-id';

/**
 * 其他标签页遗留的布局行，超过这么久没更新才清理：30 天。关闭的标签页可以被浏览器的「重新打开关闭的标签页」找回，
 * 整个浏览器重启后的「继续上次的会话」也会带回所有标签页的会话存储；隔了一两周回来是常事，所以阈值要长。
 * 一行布局只有几 KB，留久一点的代价远小于丢掉别人的布局。
 */
export const STALE_LAYOUT_AFTER = 30 * 24 * 60 * 60 * 1000;

/** 布局里的一个窗口。 */
export interface WindowRecord {
  readonly appId: DesktopAppId;
  /** 保存时应用的显示名：应用以后下线了，提示还能说出是哪个。 */
  readonly name: string;
  /** 缩放之前的几何：窗口缩放到全屏时记的是它还原后的位置与大小。 */
  readonly box: WindowBox;
  readonly minimized: boolean;
  readonly zoomed: boolean;
  readonly options: RestoreOptions;
}

/**
 * 一个标签页的窗口布局（偏好 `windows:layout:<会话标识>` 的值）。`windows` 按层叠顺序从后到前排列，
 * 所以最后一个没最小化的就是前台窗口，不另存。
 */
export interface WindowLayout {
  readonly version: typeof WINDOW_LAYOUT_VERSION;
  /** 写入时间（毫秒时间戳），清理遗留布局行时判断是否过期。 */
  readonly updatedAt: number;
  readonly windows: readonly WindowRecord[];
}

/** 一个窗口此刻的状态，由窗口管理器的窗口信号收集而来。 */
export interface WindowSource {
  readonly appId: DesktopAppId;
  readonly name: string;
  /** 层叠层级（z-index），越大越靠前。 */
  readonly layer: number;
  readonly box: WindowBox;
  readonly minimized: boolean;
  readonly zoomed: boolean;
  readonly options: RestoreOptions;
}

/** 没能恢复的原因：应用已下线、记录读不懂、窗口要打开的文件已经不在了。 */
export type SkipReason = 'retired' | 'unreadable' | 'file-missing';

/** 被跳过的窗口；`name` 为 `null` 表示连是哪个应用都认不出。 */
export interface SkippedWindow {
  readonly name: string | null;
  readonly reason: SkipReason;
}

/** 读取已保存布局的结果：能恢复的窗口（保持层叠顺序）、被跳过的窗口，以及整体是否读不懂。 */
export interface ParsedLayout {
  readonly windows: readonly WindowRecord[];
  readonly skipped: readonly SkippedWindow[];
  readonly unreadable: boolean;
}

/** 恢复的一步：重建哪个窗口、它原来的层叠位置（0 是最底层）、是否是前台窗口。 */
export interface RestoreStep {
  readonly record: WindowRecord;
  readonly layer: number;
  readonly foreground: boolean;
}

/** 会话存储里读写标识要用的两个方法。 */
export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isStrings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(isString);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 会话标识要拼进偏好键，只允许字母、数字和连字符。 */
const TAB_ID_FORMAT = /^[A-Za-z0-9-]{8,64}$/;

/** 开窗参数里每个能记的字段及其类型检查；不在表里的字段一律丢掉。 */
const OPTION_FIELDS: Readonly<Record<keyof RestoreOptions, (value: unknown) => boolean>> = {
  path: isStrings,
  section: isString,
  url: isString,
  file: isString,
  nodePath: isStrings
};

/** 布局行的偏好键。 */
export function windowLayoutKey(tabId: string): string {
  return `${WINDOW_LAYOUT_PREFIX}${tabId}`;
}

/**
 * 本标签页的会话标识：会话存储里已有合法的就沿用（刷新后不变），没有就生成一个存进去（新开的标签页各自不同）。
 * 存着的值不合法（被改过）就换一个新的。会话存储读写出错（浏览器禁用站点数据、配额）时错误原样抛出：
 * 不退回任何共享的标识，免得几个标签页互相覆盖布局，由调用方明确停用布局保存。
 */
export function tabSessionId(storage: TabStorage, create: () => string = () => crypto.randomUUID()): string {
  const existing = storage.getItem(TAB_ID_KEY);
  if (existing !== null && TAB_ID_FORMAT.test(existing)) return existing;
  const fresh = create();
  storage.setItem(TAB_ID_KEY, fresh);
  return fresh;
}

/** 开窗参数里能存进布局的部分（见 {@link RestoreOptions}）。 */
export function restoreOptionsOf(options: DesktopOpenOptions): RestoreOptions {
  const file = typeof options.file === 'string' ? options.file : options.file?.name;
  const nodePath = options.node?.path ?? undefined;
  return {
    ...(options.path !== undefined && { path: options.path }),
    ...(options.section !== undefined && { section: options.section }),
    ...(options.url !== undefined && { url: options.url }),
    ...(file !== undefined && { file }),
    ...(nodePath !== undefined && { nodePath })
  };
}

/**
 * 把保存的参数还原成开窗参数：带 `nodePath` 的按路径重新取磁盘节点（TextEdit、预览要用）；
 * 文件已经不在了返回 `null`，调用方跳过这个窗口并提示。
 */
export function resolveOpenOptions(
  options: RestoreOptions,
  nodeAt: (path: readonly string[]) => FsNode | null
): DesktopOpenOptions | null {
  const { nodePath, ...rest } = options;
  if (!nodePath) return rest;
  const node = nodeAt(nodePath);
  return node ? { ...rest, node } : null;
}

/** 把此刻的窗口状态整理成布局里的记录，按层叠从后到前排列（层级相同保持传入的先后）。 */
export function buildWindows(sources: readonly WindowSource[]): WindowRecord[] {
  return [...sources]
    .sort((a, b) => a.layer - b.layer)
    .map(({ appId, name, box, minimized, zoomed, options }) => ({ appId, name, box, minimized, zoomed, options }));
}

/**
 * 读取偏好里保存的布局。清单里已下线的应用、读不懂的窗口记录被跳过（带上原因，由调用方提示），其余窗口保持原来的层叠顺序；
 * 整体不是当前版本的布局时 `unreadable` 为真，不恢复任何窗口。窗口记录只保留认得的字段，应用名以当前清单为准。
 */
export function parseLayout(raw: unknown, manifests: DesktopAppManifests): ParsedLayout {
  if (raw === undefined) return { windows: [], skipped: [], unreadable: false };
  if (!isLayout(raw)) return { windows: [], skipped: [], unreadable: true };
  const windows: WindowRecord[] = [];
  const skipped: SkippedWindow[] = [];
  for (const item of raw['windows'] as readonly unknown[]) {
    const outcome = readWindow(item, manifests);
    if ('reason' in outcome) skipped.push(outcome);
    else windows.push(outcome);
  }
  return { windows, skipped, unreadable: false };
}

/**
 * 恢复的次序：先前台窗口（最上面一个没最小化的）；再按原来的层叠从上到下恢复其余可见窗口；
 * 最小化的窗口最后——它们只重建外框。每一步带着原来的层叠位置，所以先恢复谁都不影响最终的叠放。
 */
export function restoreSteps(windows: readonly WindowRecord[]): RestoreStep[] {
  const topDown = windows.map((record, layer) => ({ record, layer, foreground: false })).reverse();
  const visible = topDown.filter(step => !step.record.minimized);
  const hidden = topDown.filter(step => step.record.minimized);
  if (visible[0]) visible[0] = { ...visible[0], foreground: true };
  return [...visible, ...hidden];
}

/**
 * 视口变小之后把恢复的窗口拉回屏幕内，规则与窗口框架的 `keepOnScreen` 一致（见 {@link placeOnScreen}）；
 * 另外尺寸不小于应用的最小尺寸。比视口还大的窗口不缩小。
 */
export function fitBox(
  box: WindowBox,
  viewport: { readonly width: number; readonly height: number },
  menubar: number,
  min: { readonly width: number; readonly height: number }
): WindowBox {
  const placed = placeOnScreen(box, viewport, menubar);
  return { ...placed, width: Math.max(box.width, min.width), height: Math.max(box.height, min.height) };
}

/**
 * 窗口位置的保底规则（窗口框架的 `keepOnScreen` 与恢复共用）：左边缘至少让 120px 留在视口内（极窄的视口留 10px），
 * 上沿不进菜单栏、下沿至少让 40px 留在视口内。只改位置，不改尺寸。
 */
export function placeOnScreen(
  box: WindowBox,
  viewport: { readonly width: number; readonly height: number },
  menubar: number
): WindowBox {
  return {
    ...box,
    left: Math.min(box.left, Math.max(10, viewport.width - 120)),
    top: clamp(box.top, menubar, Math.max(menubar, viewport.height - 40))
  };
}

/** 没能恢复的窗口合成一条提示；没有就返回 `null`。 */
export function describeSkipped(skipped: readonly SkippedWindow[]): string | null {
  if (skipped.length === 0) return null;
  const head = skipped.length === 1 ? 'a window' : `${skipped.length} windows`;
  return `Couldn’t restore ${head}: ${skipped.map(describeOne).join('; ')}.`;
}

/**
 * 其他标签页遗留的、已过期的布局行：键在布局前缀下、不是本标签页的、能读懂（当前版本）且写入时间早于 `ttl` 之前。
 * 读不懂的行（更高的版本、损坏的值）不动——它可能属于另一个更新版本的标签页。
 */
export function staleLayoutRows<T extends { readonly key: string; readonly value: unknown }>(
  rows: readonly T[],
  ownKey: string,
  now: number,
  ttl: number
): T[] {
  return rows.filter(row => {
    if (row.key === ownKey || !row.key.startsWith(WINDOW_LAYOUT_PREFIX)) return false;
    const updatedAt = layoutTime(row.value);
    return updatedAt !== null && now - updatedAt > ttl;
  });
}

function describeOne(skipped: SkippedWindow): string {
  const subject = skipped.name === null ? 'a window' : `“${skipped.name}”`;
  switch (skipped.reason) {
    case 'retired':
      return `${subject} is no longer available`;
    case 'file-missing':
      return `${subject} no longer exists`;
    case 'unreadable':
      return `${subject} had unreadable settings`;
  }
}

/** 值是当前版本的布局外壳（版本、写入时间、窗口列表）。 */
function isLayout(raw: unknown): raw is JsonRecord {
  return (
    isRecord(raw) &&
    raw['version'] === WINDOW_LAYOUT_VERSION &&
    isFiniteNumber(raw['updatedAt']) &&
    Array.isArray(raw['windows'])
  );
}

/** 当前版本布局的写入时间；读不懂时为 `null`。 */
function layoutTime(value: unknown): number | null {
  return isLayout(value) ? (value['updatedAt'] as number) : null;
}

function isBox(value: unknown): value is WindowBox {
  if (!isRecord(value)) return false;
  const { left, top, width, height } = value;
  return (
    isFiniteNumber(left) &&
    isFiniteNumber(top) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  );
}

function readOptions(raw: unknown): RestoreOptions | null {
  if (!isRecord(raw)) return null;
  const options: Record<string, unknown> = {};
  for (const [key, valid] of Object.entries(OPTION_FIELDS)) {
    const value = raw[key];
    if (value === undefined) continue;
    if (!valid(value)) return null;
    options[key] = value;
  }
  return options as RestoreOptions;
}

/** 读一个窗口记录：能恢复就返回干净的记录，否则返回跳过的原因。 */
function readWindow(item: unknown, manifests: DesktopAppManifests): WindowRecord | SkippedWindow {
  if (!isRecord(item) || !isString(item['appId'])) return { name: null, reason: 'unreadable' };
  const appId = item['appId'];
  const manifest = Object.hasOwn(manifests, appId) ? manifests[appId as DesktopAppId] : undefined;
  if (!manifest || manifest.kind === 'system')
    return { name: isString(item['name']) ? item['name'] : appId, reason: 'retired' };
  const options = readOptions(item['options']);
  const box = item['box'];
  if (!isBox(box) || options === null || typeof item['minimized'] !== 'boolean' || typeof item['zoomed'] !== 'boolean')
    return { name: manifest.name, reason: 'unreadable' };
  const { left, top, width, height } = box;
  return {
    appId: manifest.id,
    name: manifest.name,
    box: { left, top, width, height },
    minimized: item['minimized'],
    zoomed: item['zoomed'],
    options
  };
}
