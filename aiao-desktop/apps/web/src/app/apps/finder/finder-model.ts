import { FOLDER_KIND } from '../../disk/disk-kinds';
import { FsNode, visibleChildren } from '../../disk/disk-tree';
import type { TagColor } from '../../disk/tags';
import type { FinderView } from '../../services/desktop-menus';
import { FileSystem } from '../../services/file-system';
import { USER_PROFILE } from '../../shared/user-profile';

export interface FileOperationRequest {
  readonly kind: 'restore' | 'open-with';
  readonly node: FsNode;
}

export type FinderSort = 'name' | 'date' | 'size' | 'kind';

/** 排序方向：升序或降序。 */
export type FinderSortDirection = 'asc' | 'desc';

/** 每种排序的默认方向：与 macOS 一致——名称、种类升序，日期、大小降序（新的、大的在前）。 */
export const defaultSortDirection = (sort: FinderSort): FinderSortDirection =>
  sort === 'date' || sort === 'size' ? 'desc' : 'asc';

/** 右键菜单与 View Options 里的七种标签颜色（macOS 的默认标签）；值是小写 TagColor，菜单显示时首字母大写。 */
export const FINDER_TAG_COLORS: readonly TagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];

/** 图标大小的范围（px）。 */
export const ICON_SIZE_MIN = 16;
export const ICON_SIZE_MAX = 128;
/** 图标网格行距的范围（px）。 */
export const GRID_SPACING_MIN = 0;
export const GRID_SPACING_MAX = 100;
/** 图标文字大小的范围（px）。 */
export const TEXT_SIZE_MIN = 10;
export const TEXT_SIZE_MAX = 16;

/**
 * 每个目录记一份的视图设置（ADESK-US-109，View Options）：查看方式、排序与图标外观。
 * 打开窗口时按目录恢复；`view:…` 键只有真实磁盘目录才有，虚拟位置（最近使用、AirDrop）不持久化。
 */
export interface FinderViewSettings {
  readonly view: FinderView;
  readonly sort: FinderSort;
  readonly direction: FinderSortDirection;
  readonly iconSize: number;
  readonly gridSpacing: number;
  readonly textSize: number;
}

export const DEFAULT_VIEW_SETTINGS: FinderViewSettings = {
  view: 'icon',
  sort: 'name',
  direction: 'asc',
  iconSize: 52,
  gridSpacing: 14,
  textSize: 12
};

const VIEW_NAMES: ReadonlySet<string> = new Set(['icon', 'list', 'column', 'gallery']);
const SORT_NAMES: ReadonlySet<string> = new Set(['name', 'date', 'size', 'kind']);

/** 偏好库里取出的值是不是一份完整的视图设置；缺字段或类型不符时丢弃（用目录默认值）。 */
export const isFinderViewSettings = (value: unknown): value is FinderViewSettings => {
  const settings = value as Partial<FinderViewSettings> | null;
  return (
    typeof settings === 'object' &&
    settings !== null &&
    typeof settings.view === 'string' &&
    VIEW_NAMES.has(settings.view) &&
    typeof settings.sort === 'string' &&
    SORT_NAMES.has(settings.sort) &&
    (settings.direction === 'asc' || settings.direction === 'desc') &&
    typeof settings.iconSize === 'number' &&
    typeof settings.gridSpacing === 'number' &&
    typeof settings.textSize === 'number'
  );
};

/** 目录（Finder 路径）对应的视图设置偏好键。 */
export const viewSettingsKey = (finderPath: readonly string[]): string => `finder:view:${finderPath.join('/')}`;

/** 侧栏分组；图标以 `dot#` 开头的是标签色点。 */
export interface FinderSidebarGroup {
  readonly head: string;
  readonly items: readonly (readonly [name: string, icon: string])[];
}

export const FAVOURITES_GROUP = 'Favourites';

export const SIDEBAR: readonly FinderSidebarGroup[] = [
  {
    head: FAVOURITES_GROUP,
    items: [
      ['AirDrop', 'g-airdrop'],
      ['Recents', 'g-clock-a'],
      ['Desktop', 'g-desktop'],
      ['Documents', 'g-docs'],
      ['Downloads', 'g-download'],
      ['Applications', 'g-apps'],
      [USER_PROFILE.name, 'g-folder-g']
    ]
  },
  { head: 'iCloud', items: [['iCloud Drive', 'g-icloud-o']] },
  {
    head: 'Locations',
    items: [
      ['Macintosh HD', 'g-hd'],
      ['Network', 'g-network']
    ]
  },
  {
    head: 'Tags',
    items: [
      ['Red', 'dot#ff5f57'],
      ['Orange', 'dot#ff9f0a'],
      ['Green', 'dot#30d158'],
      ['Blue', 'dot#0a84ff']
    ]
  }
];

/** 侧栏里这些位置不是磁盘目录，而是 Finder 自己生成的视图。 */
export const VIRTUAL_PLACES = ['iCloud Drive', 'AirDrop', 'Recents', 'Network'];
export const TAG_PLACES = ['Red', 'Orange', 'Green', 'Blue'];

/** iCloud Drive 与网络里的条目不在本机磁盘上，只是 Finder 画出来的。 */
const virtualFolder = (name: string, icon = FOLDER_KIND.icon): FsNode => ({
  name,
  path: null,
  kind: 'folder',
  icon,
  k: FOLDER_KIND.kind,
  date: new Date(2026, 6, 12, 9, 41),
  hidden: false,
  children: []
});

const ICLOUD: readonly FsNode[] = [
  virtualFolder('Desktop'),
  virtualFolder('Documents'),
  {
    name: 'Keynote.key',
    path: null,
    kind: 'file',
    icon: 'f-app',
    k: 'Keynote',
    size: '18 MB',
    date: new Date(2026, 5, 2, 10, 24),
    hidden: false
  }
];

const byName = (a: FsNode, b: FsNode): number => a.name.localeCompare(b.name, undefined, { numeric: true });

/** 每种排序的升序比较器；降序由调用方把结果取反（`sortNodes` 的 `direction`）。 */
const SORTS: Readonly<Record<FinderSort, (a: FsNode, b: FsNode) => number>> = {
  name: byName,
  date: (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
  kind: (a, b) => String(a.k).localeCompare(b.k),
  size: (a, b) => (a.bytes ?? -1) - (b.bytes ?? -1)
};

/** 文件夹在前，其余按所选方式与方向排序。 */
export const sortNodes = (list: FsNode[], sort: FinderSort, direction: FinderSortDirection = 'asc'): FsNode[] => {
  const comparator = SORTS[sort];
  return list.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    const order = comparator(a, b);
    return direction === 'asc' ? order : -order;
  });
};

const finderChildren = (node: FsNode | null, showHidden: boolean): readonly FsNode[] =>
  showHidden ? (node?.children ?? []) : visibleChildren(node);

/** 当前路径下要显示的条目：虚拟位置、磁盘目录，或搜索结果。 */
export function folderContents(
  fs: FileSystem,
  path: readonly string[],
  query: string,
  sort: FinderSort,
  showHidden: boolean,
  direction: FinderSortDirection = 'asc'
): FsNode[] {
  const place = path[0];
  if (place === 'Recents') return fs.recents();
  if (place === 'AirDrop') return [];
  if (place === 'iCloud Drive') return [...ICLOUD];
  if (place === 'Network') return [virtualFolder('prasen-nas', 'f-hd')];
  const node = fs.get(path);
  const list = query ? fs.deepSearch(node, query).slice(0, 200) : [...finderChildren(node, showHidden)];
  return sortNodes(list, sort, direction);
}

/** 分栏视图的一栏；`file` 为真时它是末端文件，显示为预览而不是列表。 */
export interface FinderColumn {
  readonly node: FsNode;
  readonly items: readonly FsNode[] | null;
  readonly file: boolean;
}

/** 顺着分栏选择一路展开；选择链里失效的部分会被截掉。 */
export function columnChain(
  fs: FileSystem,
  path: readonly string[],
  first: readonly FsNode[],
  selection: readonly string[],
  showHidden: boolean
): { readonly chain: readonly FinderColumn[]; readonly selection: readonly string[] } {
  const root = fs.get(path) ?? fs.root();
  const chain: FinderColumn[] = [{ node: root, items: first, file: false }];
  let current = root;
  for (let i = 0; i < selection.length; i++) {
    const next = finderChildren(current, showHidden).find(child => child.name === selection[i]);
    if (!next) return { chain, selection: selection.slice(0, i) };
    const items = next.children ? [...finderChildren(next, showHidden)].sort(columnOrder) : null;
    chain.push({ node: next, items, file: next.kind === 'file' });
    current = next;
    if (next.kind === 'file') return { chain, selection: selection.slice(0, i + 1) };
  }
  return { chain, selection };
}

const columnOrder = (a: FsNode, b: FsNode): number => {
  if (a.kind === b.kind) return a.name.localeCompare(b.name);
  return a.kind === 'folder' ? -1 : 1;
};
