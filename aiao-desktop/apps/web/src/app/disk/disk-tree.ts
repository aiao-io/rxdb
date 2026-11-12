import { FOLDER_KIND, fileKind, formatSize, isPackageName } from './disk-kinds';
import { DiskPath, TRASH, VOLUME_NAME, samePath } from './disk-path';
import { DiskStore } from './disk-store';

/** 磁盘上的一个条目，Finder、桌面与聚焦搜索都读它。整棵树不可变，磁盘一变就重新组装。 */
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

/** 组装目录树用的一行：库里的 `DesktopFile`，或单测里从存储后端列出来的条目。 */
export interface FileRow {
  readonly id: string;
  /** 卷根下的条目为 `null`。 */
  readonly parentId: string | null;
  readonly name: string;
  readonly folder: boolean;
  readonly size: number;
  /** 文件夹没有记录修改时间时为 `null`。 */
  readonly modified: Date | null;
}

/** 防御损坏的数据：父子链成环时最多展开这么多层。 */
const MAX_DEPTH = 64;

const byName = (a: FsNode, b: FsNode): number => a.name.localeCompare(b.name, undefined, { numeric: true });

const newest = (dates: readonly (Date | null | undefined)[]): Date | undefined => {
  const times = dates.map(date => date?.getTime() ?? 0).filter(time => time > 0);
  return times.length ? new Date(Math.max(...times)) : undefined;
};

const folderIcon = (path: DiskPath): string => (samePath(path, TRASH) ? 'app-trash' : FOLDER_KIND.icon);

const flatten = (node: FsNode): FsNode[] => [node, ...(node.children ?? []).flatMap(flatten)];

class TreeBuilder {
  private readonly children = new Map<string | null, FileRow[]>();

  constructor(
    rows: readonly FileRow[],
    private readonly emptyDate: Date
  ) {
    for (const row of rows) {
      const siblings = this.children.get(row.parentId) ?? [];
      siblings.push(row);
      this.children.set(row.parentId, siblings);
    }
  }

  root(): FsNode {
    const children = this.childrenOf(null, []);
    return {
      name: VOLUME_NAME,
      path: [],
      kind: 'folder',
      icon: 'f-hd',
      k: FOLDER_KIND.kind,
      date: newest(children.map(child => child.date)) ?? this.emptyDate,
      hidden: false,
      children
    };
  }

  private childrenOf(id: string | null, path: DiskPath): FsNode[] {
    if (path.length > MAX_DEPTH) return [];
    return (this.children.get(id) ?? []).map(row => this.node(row, [...path, row.name])).sort(byName);
  }

  private node(row: FileRow, path: DiskPath): FsNode {
    if (!row.folder) return this.file(row, path);
    const children = this.childrenOf(row.id, path);
    const date = newest([row.modified, ...children.map(child => child.date)]) ?? this.emptyDate;
    if (isPackageName(row.name)) return this.package(row, path, children, date);
    return {
      name: row.name,
      path,
      kind: 'folder',
      icon: folderIcon(path),
      k: FOLDER_KIND.kind,
      date,
      hidden: row.name.startsWith('.'),
      children
    };
  }

  private file(row: FileRow, path: DiskPath): FsNode {
    const { kind, icon } = fileKind(row.name);
    return {
      name: row.name,
      path,
      kind: 'file',
      icon,
      k: kind,
      date: row.modified ?? this.emptyDate,
      bytes: row.size,
      size: formatSize(row.size),
      hidden: row.name.startsWith('.')
    };
  }

  /** 程序包：按文件显示，大小汇总包内的全部文件。 */
  private package(row: FileRow, path: DiskPath, contents: readonly FsNode[], date: Date): FsNode {
    const bytes = contents
      .flatMap(flatten)
      .filter(node => node.kind === 'file')
      .reduce((sum, node) => sum + (node.bytes ?? 0), 0);
    const { kind, icon } = fileKind(row.name);
    return {
      name: row.name,
      path,
      kind: 'file',
      icon,
      k: kind,
      date,
      bytes,
      size: formatSize(bytes),
      hidden: row.name.startsWith('.')
    };
  }
}

/** 由扁平的行组装整棵树。`emptyDate` 用于既没有自身时间、也没有子项的文件夹。 */
export const buildTree = (rows: readonly FileRow[], emptyDate: Date): FsNode => new TreeBuilder(rows, emptyDate).root();

/** 逐层列出存储后端里的条目（单测与内存后端用）。目录没有修改时间，由 `emptyDate` 兜底显示。 */
export async function scanDisk(store: DiskStore, emptyDate: Date): Promise<FsNode> {
  const rows: FileRow[] = [];
  const walk = async (dir: DiskPath, parentId: string | null): Promise<void> => {
    for (const entry of await store.list(dir)) {
      const path = [...dir, entry.name];
      const id = path.join('/');
      const folder = entry.kind === 'directory';
      const info = folder ? null : await store.info(path);
      rows.push({ id, parentId, name: entry.name, folder, size: info?.size ?? 0, modified: info ? new Date(info.modified) : null });
      if (folder) await walk(path, id);
    }
  };
  await walk([], null);
  return buildTree(rows, emptyDate);
}

/** 还没读到库时的空卷。 */
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
