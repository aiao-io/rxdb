import { clamp } from '../shared/format';
import { DesktopAppId, DesktopAppManifests, DockZone, defaultDockApps } from './desktop-apps';

/** 布局里的一个应用。 */
export interface DockAppItem {
  readonly type: 'app';
  readonly id: DesktopAppId;
}

/** 应用区与尾部区之间的分隔线。 */
export interface DockDividerItem {
  readonly type: 'divider';
}

export type DockLayoutItem = DockAppItem | DockDividerItem;

/**
 * Dock 的固定布局（存在系统偏好 `dock:layout` 里）。
 *
 * 不变量：恰好一条分隔线；分隔线之前是应用区（`dockZone: 'apps'`），之后是尾部区（`'trailing'`，例如废纸篓）；
 * 同一个应用至多出现一次；`dockRemovable: false` 的固定项一定在。来自存储的内容必须先过 {@link repairLayout}，
 * 本文件里的其余函数都假定输入满足不变量，并且不改动传入的布局。
 */
export interface DockLayout {
  readonly version: 1;
  readonly items: readonly DockLayoutItem[];
}

/** Dock 里实际显示的一格：固定项，或本标签页正在运行但未固定的临时项，或分隔线。 */
export type DockSlotItem =
  { readonly type: 'app'; readonly id: DesktopAppId; readonly temporary: boolean } | DockDividerItem;

const DIVIDER: DockDividerItem = { type: 'divider' };
const appItem = (id: DesktopAppId): DockAppItem => ({ type: 'app', id });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const zoneOf = (manifests: DesktopAppManifests, id: DesktopAppId): DockZone => manifests[id].dockZone ?? 'apps';

/** 分隔线在 `items` 里的下标。 */
export function dividerIndex(layout: DockLayout): number {
  return layout.items.findIndex(item => item.type === 'divider');
}

/** 全部固定的应用（应用区在前、尾部区在后），不含分隔线。 */
export function pinnedApps(layout: DockLayout): DesktopAppId[] {
  return layout.items.flatMap(item => (item.type === 'app' ? [item.id] : []));
}

/** 应用是否已固定在 Dock 里。 */
export function isPinned(layout: DockLayout, appId: DesktopAppId): boolean {
  return layout.items.some(item => item.type === 'app' && item.id === appId);
}

/**
 * 能不能固定到 Dock：有 `.app` 身份（出现在 Applications）的应用，或默认就固定在 Dock 的系统入口。
 * About This Mac 这类借 Finder 名义开的窗口两者都不是，没有固定的意义。
 */
export function isPinnable(manifests: DesktopAppManifests, appId: DesktopAppId): boolean {
  const app = manifests[appId];
  return app.showInApplications || app.defaultPinned;
}

/** 已固定、且清单允许移除。 */
export function canUnpin(layout: DockLayout, appId: DesktopAppId, manifests: DesktopAppManifests): boolean {
  return isPinned(layout, appId) && manifests[appId].dockRemovable;
}

/** 清单的默认布局：应用区的项、一条分隔线、尾部区的项（顺序来自 `dockOrder`）。 */
export function defaultLayout(manifests: DesktopAppManifests): DockLayout {
  const { apps, trailing } = defaultDockApps(manifests);
  return { version: 1, items: [...apps.map(appItem), DIVIDER, ...trailing.map(appItem)] };
}

/** 存储的内容和修复后的布局是否一致（序列化后逐字相同）；用来决定要不要把修复结果写回。 */
export function sameLayout(raw: unknown, layout: DockLayout): boolean {
  return JSON.stringify(raw) === JSON.stringify(layout);
}

/**
 * 修复来自存储的布局：偏好内容损坏，或清单升级后应用上线 / 下线。
 * 只丢掉未知的 appId、重复项和非法形状的项（含不能固定的应用），保持其余的用户顺序；
 * 补回 `dockRemovable: false` 的固定项（紧跟默认顺序里前一个仍在的项，前面没有就放区域开头）；
 * 重新保证恰好一条分隔线，应用区的项在前、尾部区的项在后。
 * 整体无法识别（不是 v1 布局）时就是没有可保留的内容，回到清单的默认布局。
 */
export function repairLayout(raw: unknown, manifests: DesktopAppManifests): DockLayout {
  if (!isRecord(raw) || raw['version'] !== 1 || !Array.isArray(raw['items'])) return defaultLayout(manifests);
  const saved = validApps(raw['items'], manifests);
  const inZone = (zone: DockZone) => saved.filter(id => zoneOf(manifests, id) === zone);
  const zone = (name: DockZone) => withProtected(inZone(name), name, manifests).map(appItem);
  return { version: 1, items: [...zone('apps'), DIVIDER, ...zone('trailing')] };
}

/**
 * 固定一个应用。`index` 是插入位置（该位置原来的项后移），不给就放在所属区域的末尾（应用区是分隔线之前）；
 * 被夹在所属区域之内，应用不会越过分隔线。已固定、或不能固定的应用不改动，返回原布局。
 */
export function pin(
  layout: DockLayout,
  appId: DesktopAppId,
  index: number | undefined,
  manifests: DesktopAppManifests
): DockLayout {
  if (isPinned(layout, appId) || !isPinnable(manifests, appId)) return layout;
  const [start, end] = zoneRange(layout, zoneOf(manifests, appId));
  const at = index === undefined ? end : clamp(index, start, end);
  return { ...layout, items: insertAt(layout.items, at, appItem(appId)) };
}

/** 取消固定；`dockRemovable: false` 的固定项和没固定的应用不改动，返回原布局。 */
export function unpin(layout: DockLayout, appId: DesktopAppId, manifests: DesktopAppManifests): DockLayout {
  if (!canUnpin(layout, appId, manifests)) return layout;
  return { ...layout, items: layout.items.filter(item => item.type !== 'app' || item.id !== appId) };
}

/**
 * 调整固定应用的顺序。`toIndex` 是先把它取出之后要插入的位置（与 {@link slotIndexAt} 在“去掉被拖应用”的布局上算出的槽位一致），
 * 被夹在所属区域之内。没固定、或落在原位置时返回原布局。
 */
export function move(
  layout: DockLayout,
  appId: DesktopAppId,
  toIndex: number,
  manifests: DesktopAppManifests
): DockLayout {
  const from = layout.items.findIndex(item => item.type === 'app' && item.id === appId);
  if (from < 0) return layout;
  const rest = { ...layout, items: layout.items.filter((_, index) => index !== from) };
  const [start, end] = zoneRange(rest, zoneOf(manifests, appId));
  const items = insertAt(rest.items, clamp(toIndex, start, end), appItem(appId));
  return items.every((item, index) => sameItem(item, layout.items[index])) ? layout : { ...layout, items };
}

/** 本标签页正在运行、但没有固定的应用，按运行顺序；没有 `.app` 身份的窗口（About This Mac）不产生临时图标。 */
export function temporaryApps(
  layout: DockLayout,
  running: Iterable<DesktopAppId>,
  manifests: DesktopAppManifests
): DesktopAppId[] {
  return [...running].filter(id => !isPinned(layout, id) && manifests[id].showInApplications);
}

/** 屏幕上的格子：临时项接在最后一个固定应用之后、分隔线之前；运行态只叠加显示，不改固定顺序。 */
export function dockSlots(layout: DockLayout, temporary: readonly DesktopAppId[]): DockSlotItem[] {
  const slots = layout.items.map((item): DockSlotItem =>
    item.type === 'app' ? { type: 'app', id: item.id, temporary: false } : item
  );
  const extra = temporary.map((id): DockSlotItem => ({ type: 'app', id, temporary: true }));
  slots.splice(dividerIndex(layout), 0, ...extra);
  return slots;
}

/**
 * 指针 x 对应的插入槽位：`centers` 是应用区里各固定应用（拖动中的除外）静止时的中心，从左到右；
 * 返回第一个中心不小于 x 的下标，都在左边时为 `centers.length`（应用区末尾）。
 */
export function slotIndexAt(centers: readonly number[], x: number): number {
  const index = centers.findIndex(center => center >= x);
  return index < 0 ? centers.length : index;
}

const sameItem = (a: DockLayoutItem, b: DockLayoutItem | undefined): boolean =>
  a.type === b?.type && (a.type === 'divider' || (b.type === 'app' && a.id === b.id));

const insertAt = (items: readonly DockLayoutItem[], index: number, item: DockLayoutItem): DockLayoutItem[] => [
  ...items.slice(0, index),
  item,
  ...items.slice(index)
];

/** 区域在 `items` 里可插入的下标范围 [start, end]（含两端）。 */
function zoneRange(layout: DockLayout, zone: DockZone): readonly [number, number] {
  const divider = dividerIndex(layout);
  return zone === 'apps' ? [0, divider] : [divider + 1, layout.items.length];
}

/** 存储项里有效的应用 id：已知、能固定、第一次出现；分隔线和非法形状的项都不在其中（分隔线由调用方重新放置）。 */
function validApps(items: readonly unknown[], manifests: DesktopAppManifests): DesktopAppId[] {
  const seen = new Set<string>();
  const valid: DesktopAppId[] = [];
  for (const item of items) {
    if (!isRecord(item) || item['type'] !== 'app') continue;
    const id = item['id'];
    if (typeof id !== 'string' || seen.has(id) || !Object.hasOwn(manifests, id)) continue;
    seen.add(id);
    if (isPinnable(manifests, id as DesktopAppId)) valid.push(id as DesktopAppId);
  }
  return valid;
}

/** 补回区域里缺的 `dockRemovable: false` 固定项：紧跟默认顺序里前一个仍在的项，前面没有就放区域开头。 */
function withProtected(ids: readonly DesktopAppId[], zone: DockZone, manifests: DesktopAppManifests): DesktopAppId[] {
  const result = [...ids];
  const defaults = defaultDockApps(manifests)[zone];
  defaults.forEach((id, index) => {
    if (manifests[id].dockRemovable || result.includes(id)) return;
    const before = defaults.slice(0, index).findLast(candidate => result.includes(candidate));
    result.splice(before === undefined ? 0 : result.indexOf(before) + 1, 0, id);
  });
  return result;
}
