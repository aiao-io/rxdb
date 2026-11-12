import { FOLDER_KIND, fileKind, formatSize, isPackageName } from './disk-kinds';
import { DiskPath, TRASH, VOLUME_NAME, samePath } from './disk-path';
import { DiskStore } from './disk-store';

/** 磁盘上的一个条目，Finder、桌面与聚焦搜索都读它。整棵树不可变，磁盘一变就重新扫描。 */
export interface FsNode {
  readonly name: string;
  /** 卷内路径；Finder 自己生成的虚拟条目（iCloud Drive、网络）为 `null`。 */
  readonly path: DiskPath | null;
  readonly kind: 'folder' | 'file';
  readonly icon: string;
  /** Finder「种类」一栏。 */
  readonly k: string;
  readonly date?: Date;
  readonly bytes?: number;
  readonly size?: string;
  /** 以点开头的名字，Finder 不显示。 */
  readonly hidden: boolean;
  /** 文件与程序包没有子项。 */
  readonly children?: readonly FsNode[];
}

const byName = (a: FsNode, b: FsNode): number => a.name.localeCompare(b.name, undefined, { numeric: true });

const newest = (nodes: readonly FsNode[]): Date | undefined => {
  const times = nodes.map(node => node.date?.getTime() ?? 0).filter(time => time > 0);
  return times.length ? new Date(Math.max(...times)) : undefined;
};

const folderIcon = (path: DiskPath): string => {
  if (!path.length) return 'f-hd';
  return samePath(path, TRASH) ? 'app-trash' : FOLDER_KIND.icon;
};

async function scanFile(store: DiskStore, path: DiskPath, name: string): Promise<FsNode> {
  const info = await store.info(path);
  const { kind, icon } = fileKind(name);
  return {
    name,
    path,
    kind: 'file',
    icon,
    k: kind,
    date: new Date(info.modified),
    bytes: info.size,
    size: formatSize(info.size),
    hidden: name.startsWith('.')
  };
}

/** 程序包：按文件显示，大小与日期汇总包内的全部文件。 */
async function scanPackage(store: DiskStore, path: DiskPath, name: string, emptyDate: Date): Promise<FsNode> {
  const contents = await scanFolder(store, path, name, emptyDate);
  const files = flatten(contents).filter(node => node.kind === 'file');
  const bytes = files.reduce((sum, node) => sum + (node.bytes ?? 0), 0);
  const { kind, icon } = fileKind(name);
  return {
    name,
    path,
    kind: 'file',
    icon,
    k: kind,
    date: contents.date,
    bytes,
    size: formatSize(bytes),
    hidden: name.startsWith('.')
  };
}

async function scanFolder(store: DiskStore, path: DiskPath, name: string, emptyDate: Date): Promise<FsNode> {
  const entries = await store.list(path);
  const children = await Promise.all(
    entries.map(entry => scanEntry(store, [...path, entry.name], entry.kind === 'directory', emptyDate))
  );
  children.sort(byName);
  return {
    name,
    path,
    kind: 'folder',
    icon: folderIcon(path),
    k: FOLDER_KIND.kind,
    date: newest(children) ?? emptyDate,
    hidden: name.startsWith('.'),
    children
  };
}

function scanEntry(store: DiskStore, path: DiskPath, directory: boolean, emptyDate: Date): Promise<FsNode> {
  const name = path.at(-1) ?? VOLUME_NAME;
  if (!directory) return scanFile(store, path, name);
  return isPackageName(name) ? scanPackage(store, path, name, emptyDate) : scanFolder(store, path, name, emptyDate);
}

function flatten(node: FsNode): FsNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
}

/** 读出整块磁盘。`emptyDate` 是空文件夹的日期：OPFS 不记录目录的修改时间。 */
export const scanDisk = (store: DiskStore, emptyDate: Date): Promise<FsNode> =>
  scanFolder(store, [], VOLUME_NAME, emptyDate);

/** 还没扫描完时的空卷。 */
export const emptyVolume = (): FsNode => ({
  name: VOLUME_NAME,
  path: [],
  kind: 'folder',
  icon: 'f-hd',
  k: FOLDER_KIND.kind,
  hidden: false,
  children: []
});

export const visibleChildren = (node: FsNode | null | undefined): readonly FsNode[] =>
  (node?.children ?? []).filter(child => !child.hidden);

export function nodeAt(root: FsNode, path: DiskPath): FsNode | null {
  let node: FsNode = root;
  for (const name of path) {
    const next = node.children?.find(child => child.name === name);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** 递归查找名字包含关键字的可见条目（不区分大小写），不进入隐藏文件夹与程序包。 */
export function searchNodes(node: FsNode | null, query: string, out: FsNode[] = []): FsNode[] {
  const needle = query.toLowerCase();
  for (const child of visibleChildren(node)) {
    if (child.name.toLowerCase().includes(needle)) out.push(child);
    searchNodes(child, needle, out);
  }
  return out;
}
