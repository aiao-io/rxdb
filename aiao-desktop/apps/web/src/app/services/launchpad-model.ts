/**
 * 启动台的网格布局纯模型：顺序表、应用文件夹与拖放落点计算，不依赖 DOM 与服务，供启动台组件与单测直接使用。
 * 顺序表 `launchpad:order` 里每项要么是应用 id，要么是 `folder:<名字>` 文件夹标记；文件夹内容存在 `launchpad:folders`
 * （文件夹名 → 应用 id 列表）。文件夹里的应用不再单独出现在顺序表里。
 */
import type { DesktopAppId } from './desktop-apps';

/** 文件夹标记的前缀：顺序表里 `folder:<名字>` 代表一个文件夹瓦片。 */
export const FOLDER_PREFIX = 'folder:';

/** 顺序表里的一项：应用 id，或文件夹标记。 */
export type LaunchpadEntry = DesktopAppId | `${typeof FOLDER_PREFIX}${string}`;

/** 应用文件夹：文件夹名 → 组内应用（按显示顺序）。 */
export type LaunchpadFolders = Readonly<Record<string, readonly DesktopAppId[]>>;

/** 启动台网格顺序：应用与文件夹瓦片的混排。 */
export type LaunchpadOrder = readonly LaunchpadEntry[];

/** 一个瓦片的屏幕矩形（CSS 像素），`key` 是顺序表条目。 */
export interface LaunchpadTileRect {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 拖放落点：落在某个瓦片上，或落在瓦片之间的空位（`index` 是插入位置，0..瓦片数）。 */
export type LaunchpadDrop =
  { readonly kind: 'tile'; readonly key: string } | { readonly kind: 'slot'; readonly index: number };

/** 顺序表形状校验（偏好里读出来的原始 JSON）：字符串数组即可，具体合法性交给 {@link reconcileLaunchpad}。 */
export function isLaunchpadOrder(value: unknown): value is LaunchpadOrder {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

/** 文件夹形状校验：非空名字 → 字符串数组。 */
export function isLaunchpadFolders(value: unknown): value is LaunchpadFolders {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([name, apps]) => name.length > 0 && Array.isArray(apps) && apps.every(app => typeof app === 'string')
    )
  );
}

/** 顺序表逐项相等。 */
export function sameLaunchpadOrder(left: LaunchpadOrder, right: LaunchpadOrder): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/** 文件夹逐项相等（键序也要一致）。 */
export function sameLaunchpadFolders(left: LaunchpadFolders, right: LaunchpadFolders): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((name, index) => name === rightKeys[index] && sameLaunchpadOrder(left[name], right[name]))
  );
}

/**
 * 把库里读出来的布局与登记表对一遍：丢掉不认识的应用、空文件夹与悬空标记，应用登记表新增的应用补到末尾，
 * 文件夹里的应用不再留在顺序表里，重复条目只留第一个。没有需要修复的内容时原样返回入参（引用相等），
 * 调用方据此跳过写库。
 */
export function reconcileLaunchpad(
  order: LaunchpadOrder,
  folders: LaunchpadFolders,
  apps: readonly DesktopAppId[]
): { readonly order: LaunchpadOrder; readonly folders: LaunchpadFolders } {
  const valid = new Set<string>(apps);
  const cleaned: Record<string, readonly DesktopAppId[]> = {};
  const folded = new Set<string>();
  for (const [name, list] of Object.entries(folders)) {
    const kept: DesktopAppId[] = [];
    for (const id of list) {
      if (!valid.has(id) || folded.has(id)) continue;
      folded.add(id);
      kept.push(id);
    }
    if (kept.length) cleaned[name] = kept;
  }
  const seen = new Set<string>(folded);
  const keptOrder: LaunchpadEntry[] = [];
  for (const entry of order) {
    if (seen.has(entry)) continue;
    if (entry.startsWith(FOLDER_PREFIX)) {
      if (!(entry.slice(FOLDER_PREFIX.length) in cleaned)) continue;
      seen.add(entry);
      keptOrder.push(entry);
    } else if (valid.has(entry)) {
      seen.add(entry);
      keptOrder.push(entry);
    }
  }
  for (const app of apps) if (!seen.has(app)) keptOrder.push(app);
  const orderOut: LaunchpadOrder = keptOrder;
  const foldersOut: LaunchpadFolders = cleaned;
  return sameLaunchpadOrder(orderOut, order) && sameLaunchpadFolders(foldersOut, folders) ?
      { order, folders }
    : { order: orderOut, folders: foldersOut };
}

/**
 * 移动列表里的一项（应用或文件夹标记）到 `index`；`index` 是取出该项之后的插入位置（与 Dock 布局的 `move` 同约定）。
 * 条目不存在或位置没变时原样返回。泛型让「文件夹内重排」（元素全是应用）的结果仍是应用列表。
 */
export function moveLaunchpadEntry<T extends LaunchpadEntry>(
  list: readonly T[],
  entry: T,
  index: number
): readonly T[] {
  const from = list.indexOf(entry);
  if (from < 0) return list;
  const rest = list.filter(item => item !== entry);
  const at = Math.max(0, Math.min(rest.length, index));
  if (at === from) return list;
  const next = [...rest];
  next.splice(at, 0, entry);
  return next;
}

/** 应用所在的文件夹名；不在任何文件夹里为 `null`。 */
const folderOf = (folders: LaunchpadFolders, appId: DesktopAppId): string | null => {
  for (const [name, list] of Object.entries(folders)) if (list.includes(appId)) return name;
  return null;
};

/**
 * 把 `dragged` 拖到 `target` 上合成一个新文件夹（macOS 行为）：新文件夹放在 `target` 的位置，`target` 在前、`dragged` 在后。
 * `dragged` 若原本在某个文件夹里会先被移出（文件夹空了就删掉）。`target` 不在顺序表里（或已在文件夹里）时原样返回。
 */
export function createLaunchpadFolder(
  folders: LaunchpadFolders,
  order: LaunchpadOrder,
  dragged: DesktopAppId,
  target: DesktopAppId
): { readonly order: LaunchpadOrder; readonly folders: LaunchpadFolders } {
  if (dragged === target) return { order, folders };
  let nextFolders = folders;
  let nextOrder = order;
  const from = folderOf(folders, dragged);
  if (from !== null) {
    const after = removeFromLaunchpadFolder(folders, order, from, dragged);
    nextFolders = after.folders;
    nextOrder = after.order;
  }
  if (folderOf(nextFolders, target) !== null) return { order, folders };
  const targetIndex = nextOrder.indexOf(target);
  if (targetIndex < 0) return { order, folders };
  const name = nextLaunchpadFolderName(nextFolders);
  const draggedIndex = nextOrder.indexOf(dragged);
  const insertAt = targetIndex - (draggedIndex >= 0 && draggedIndex < targetIndex ? 1 : 0);
  const rest = nextOrder.filter(item => item !== target && item !== dragged);
  rest.splice(Math.min(insertAt, rest.length), 0, `${FOLDER_PREFIX}${name}`);
  return { order: rest, folders: { ...nextFolders, [name]: [target, dragged] } };
}

/** 把 `dragged` 加入名为 `name` 的文件夹（它若在别的文件夹里会先移出）；文件夹不存在或已在里面时原样返回。 */
export function addToLaunchpadFolder(
  folders: LaunchpadFolders,
  order: LaunchpadOrder,
  dragged: DesktopAppId,
  name: string
): { readonly order: LaunchpadOrder; readonly folders: LaunchpadFolders } {
  const target = folders[name];
  if (!target || target.includes(dragged)) return { order, folders };
  let nextFolders = folders;
  let nextOrder = order;
  const from = folderOf(folders, dragged);
  if (from !== null) {
    const after = removeFromLaunchpadFolder(folders, order, from, dragged);
    nextFolders = after.folders;
    nextOrder = after.order;
  }
  return {
    order: nextOrder.filter(item => item !== dragged),
    folders: { ...nextFolders, [name]: [...nextFolders[name], dragged] }
  };
}

/**
 * 把应用从文件夹里移出：回到顺序表里它文件夹标记的位置（标记不存在就放末尾）；文件夹空了就连标记一起删掉。
 * 应用不在这个文件夹里时原样返回。
 */
export function removeFromLaunchpadFolder(
  folders: LaunchpadFolders,
  order: LaunchpadOrder,
  name: string,
  appId: DesktopAppId
): { readonly order: LaunchpadOrder; readonly folders: LaunchpadFolders } {
  const list = folders[name];
  if (!list || !list.includes(appId)) return { order, folders };
  const rest = list.filter(app => app !== appId);
  const marker: `${typeof FOLDER_PREFIX}${string}` = `${FOLDER_PREFIX}${name}`;
  const markerIndex = order.indexOf(marker);
  const without =
    rest.length ? order.filter(item => item !== appId) : order.filter(item => item !== appId && item !== marker);
  const at = markerIndex >= 0 ? Math.min(markerIndex + (rest.length ? 1 : 0), without.length) : without.length;
  without.splice(at, 0, appId);
  const foldersOut: LaunchpadFolders =
    rest.length ?
      { ...folders, [name]: rest }
    : Object.fromEntries(Object.entries(folders).filter(([key]) => key !== name));
  return { order: without, folders: foldersOut };
}

/** 新文件夹的名字：`Folder 1`、`Folder 2`…，取现有编号的最大值加一。 */
export function nextLaunchpadFolderName(folders: LaunchpadFolders): string {
  const numbers = Object.keys(folders)
    .map(name => /^Folder (\d+)$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  return `Folder ${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
}

/**
 * 把指针位置解析成拖放落点（瓦片按行优先顺序传入）：落在瓦片矩形里就是那个瓦片；
 * 否则按「第一行顶边高于指针、或同一行里左边缘在指针右侧的瓦片」取插入位置，全都没有就插到末尾。
 */
export function resolveLaunchpadDrop(rects: readonly LaunchpadTileRect[], x: number, y: number): LaunchpadDrop {
  for (const rect of rects) {
    if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return { kind: 'tile', key: rect.key };
  }
  for (let index = 0; index < rects.length; index++) {
    const rect = rects[index];
    if (rect.top > y) return { kind: 'slot', index };
    if (y < rect.bottom && rect.left > x) return { kind: 'slot', index };
  }
  return { kind: 'slot', index: rects.length };
}
