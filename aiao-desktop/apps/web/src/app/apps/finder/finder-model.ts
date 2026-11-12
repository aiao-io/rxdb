import { FOLDER_KIND } from '../../disk/disk-kinds';
import { FsNode, visibleChildren } from '../../disk/disk-tree';
import { FileSystem } from '../../services/file-system';

export { nameSeed, shotKind } from '../../disk/thumbnails';

export type FinderSort = 'name' | 'date' | 'size' | 'kind';

/** 侧栏分组；图标以 `dot#` 开头的是标签色点。 */
export const SIDEBAR: readonly { readonly head: string; readonly items: readonly (readonly [string, string])[] }[] = [
  {
    head: 'Favourites',
    items: [
      ['AirDrop', 'g-airdrop'],
      ['Recents', 'g-clock-a'],
      ['Desktop', 'g-desktop'],
      ['Documents', 'g-docs'],
      ['Downloads', 'g-download'],
      ['Applications', 'g-apps'],
      ['prasenjit', 'g-folder-g']
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

const SORTS: Readonly<Record<FinderSort, (a: FsNode, b: FsNode) => number>> = {
  name: byName,
  date: (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  kind: (a, b) => String(a.k).localeCompare(b.k),
  size: (a, b) => (b.bytes ?? -1) - (a.bytes ?? -1)
};

/** 文件夹在前，其余按所选方式排序。 */
export const sortNodes = (list: FsNode[], sort: FinderSort): FsNode[] =>
  list.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return SORTS[sort](a, b);
  });

/** 当前路径下要显示的条目：虚拟位置、磁盘目录，或搜索结果。 */
export function folderContents(fs: FileSystem, path: readonly string[], query: string, sort: FinderSort): FsNode[] {
  const place = path[0];
  if (place === 'Recents') return fs.recents();
  if (place === 'AirDrop') return [];
  if (place === 'iCloud Drive') return [...ICLOUD];
  if (place === 'Network') return [virtualFolder('prasen-nas', 'f-hd')];
  const node = fs.get(path);
  const list = query ? fs.deepSearch(node, query).slice(0, 200) : [...visibleChildren(node)];
  return sortNodes(list, sort);
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
  selection: readonly string[]
): { readonly chain: readonly FinderColumn[]; readonly selection: readonly string[] } {
  const root = fs.get(path) ?? fs.root();
  const chain: FinderColumn[] = [{ node: root, items: first, file: false }];
  let current = root;
  for (let i = 0; i < selection.length; i++) {
    const next = visibleChildren(current).find(child => child.name === selection[i]);
    if (!next) return { chain, selection: selection.slice(0, i) };
    const items = next.children ? [...visibleChildren(next)].sort(columnOrder) : null;
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
