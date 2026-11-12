import { FileSystem, FsNode, file, folder } from '../../services/file-system';

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

/** 文件名的稳定种子：同一个文件生成的预览图永远一样。 */
export function nameSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return h;
}

/** 图片缩略图用到的构图：只取原图生成器的 0、1、3 三种。 */
export const shotKind = (name: string): number => [0, 1, 3][nameSeed(name) % 3];

const byName = (a: FsNode, b: FsNode): number => a.name.localeCompare(b.name, undefined, { numeric: true });

const SORTS: Readonly<Record<FinderSort, (a: FsNode, b: FsNode) => number>> = {
  name: byName,
  date: (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  kind: (a, b) => String(a.k).localeCompare(b.k),
  size: (a, b) => String(b.size ?? '').localeCompare(a.size ?? '')
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
  if (place === 'iCloud Drive') {
    return [folder('Desktop', []), folder('Documents', []), file('Keynote.key', 'f-app', '18 MB', 'Keynote', new Date(2026, 5, 2, 10, 24))];
  }
  if (place === 'Network') return [folder('prasen-nas', [], 'f-hd')];
  const node = fs.get(path);
  const list = query ? fs.deepSearch(node, query.toLowerCase()).slice(0, 200) : [...(node?.children ?? [])];
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
  const root = fs.get(path) ?? fs.root;
  const chain: FinderColumn[] = [{ node: root, items: first, file: false }];
  let current = root;
  for (let i = 0; i < selection.length; i++) {
    const next = current.children?.find(child => child.name === selection[i]);
    if (!next) return { chain, selection: selection.slice(0, i) };
    const items = next.children ? [...next.children].sort(columnOrder) : null;
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
