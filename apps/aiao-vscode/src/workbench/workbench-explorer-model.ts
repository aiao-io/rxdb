/** 资源管理器树的一行：文件，或（可能由单链目录合并成的）文件夹。 */
export interface ExplorerRow {
  /** 行标识：文件为完整路径，文件夹为（紧凑链中）最深目录的完整路径。 */
  readonly key: string;
  readonly kind: 'folder' | 'file';
  /** 缩进层级，从 1 起；紧凑链只占一级。 */
  readonly level: number;
  /** 标签片段；紧凑文件夹有多段，以分隔符连接显示。 */
  readonly segments: readonly string[];
  /** 与 segments 一一对应的目录路径（文件为空）。 */
  readonly segmentPaths: readonly string[];
  /** 可见祖先行的键，从最外层起。 */
  readonly ancestors: readonly string[];
  /** 仅文件夹有值。 */
  readonly expanded?: boolean;
}

export interface ExplorerRowOptions {
  readonly collapsed: ReadonlySet<string>;
  /** 对齐 VS Code 的 explorer.compactFolders：只含一个子文件夹的目录链合并成一行。 */
  readonly compact: boolean;
}

interface Node {
  readonly path: string;
  readonly name: string;
  readonly folders: Node[];
  readonly files: Node[];
}

const collator = new Intl.Collator(undefined, { numeric: true });

/** 与 VS Code 默认排序一致：忽略大小写差异优先、数字按数值、标点（含点开头）排在字母前。 */
export function compareExplorerNames(left: string, right: string): number {
  return (
    collator.compare(left, right) ||
    (left < right ? -1
    : left > right ? 1
    : 0)
  );
}

function buildTree(paths: readonly string[]): Node {
  const root: Node = { path: '', name: '', folders: [], files: [] };
  const folderIndex = new Map<string, Node>([['', root]]);
  for (const path of paths) {
    const parts = path.split('/');
    let parent = root;
    for (const [index, name] of parts.entries()) {
      const current = parts.slice(0, index + 1).join('/');
      if (index === parts.length - 1) {
        parent.files.push({ path: current, name, folders: [], files: [] });
        break;
      }
      let folder = folderIndex.get(current);
      if (!folder) {
        folder = { path: current, name, folders: [], files: [] };
        folderIndex.set(current, folder);
        parent.folders.push(folder);
      }
      parent = folder;
    }
  }
  return root;
}

function byName(left: Node, right: Node): number {
  return compareExplorerNames(left.name, right.name);
}

/** 紧凑文件夹：目录只含一个子目录（没有文件）时与该子目录合并成链。 */
function folderChain(folder: Node, compact: boolean): Node[] {
  const chain = [folder];
  let tail = folder;
  while (compact && tail.files.length === 0 && tail.folders.length === 1) {
    tail = tail.folders[0];
    chain.push(tail);
  }
  return chain;
}

function collectRows(
  parent: Node,
  level: number,
  ancestors: readonly string[],
  options: ExplorerRowOptions,
  rows: ExplorerRow[]
): void {
  for (const folder of parent.folders.toSorted(byName)) {
    const chain = folderChain(folder, options.compact);
    const deepest = chain[chain.length - 1];
    const expanded = !options.collapsed.has(deepest.path);
    rows.push({
      key: deepest.path,
      kind: 'folder',
      level,
      segments: chain.map(node => node.name),
      segmentPaths: chain.map(node => node.path),
      ancestors,
      expanded
    });
    if (expanded) collectRows(deepest, level + 1, [...ancestors, deepest.path], options, rows);
  }
  for (const file of parent.files.toSorted(byName)) {
    rows.push({ key: file.path, kind: 'file', level, segments: [file.name], segmentPaths: [], ancestors });
  }
}

/** 按 VS Code 规则展开成可见行：文件夹优先、自然排序、可选紧凑文件夹，折叠目录隐藏后代。 */
export function buildExplorerRows(paths: readonly string[], options: ExplorerRowOptions): ExplorerRow[] {
  const rows: ExplorerRow[] = [];
  collectRows(buildTree(paths), 1, [], options, rows);
  return rows;
}

/** 缩进规则：每级 8px；折叠箭头与文件图标同起点，文件名与目录名对齐（图标 16px + 间隙 6px）。 */
export function explorerRowGeometry(level: number): {
  readonly indent: number;
  readonly labelLeft: number;
  readonly guides: readonly number[];
} {
  return {
    indent: level * 8,
    labelLeft: level * 8 + 22,
    guides: Array.from({ length: level - 1 }, (_, index) => 16 + index * 8)
  };
}

/** 焦点行对应的「激活缩进参考线」所属目录：展开的目录取自身，否则取其父目录。 */
export function explorerActiveAncestor(rows: readonly ExplorerRow[], focusKey: string | null): string | null {
  const focused = rows.find(row => row.key === focusKey);
  if (!focused) return null;
  if (focused.kind === 'folder' && focused.expanded) return focused.key;
  return focused.ancestors.at(-1) ?? null;
}

/** 文件上的 Git 状态字母：与 VS Code 一致，已暂存优先，未跟踪（?）显示为 U。 */
export type ExplorerStatus = string;

/** 文件夹上传播的状态优先级，靠前者更显著；已删除不向上传播。 */
const FOLDER_STATUS_ORDER = ['M', 'A', 'R', 'T', 'C', 'U'] as const;

/** 按 Git 状态条目计算资源管理器装饰：文件各自的状态，以及向上传播到各级文件夹的状态。 */
export function explorerDecorations(
  entries: readonly { readonly path: string; readonly index: string; readonly worktree: string }[]
): { readonly files: ReadonlyMap<string, ExplorerStatus>; readonly folders: ReadonlyMap<string, ExplorerStatus> } {
  const files = new Map<string, ExplorerStatus>();
  const folders = new Map<string, ExplorerStatus>();
  for (const entry of entries) {
    const index = entry.index.trim();
    const worktree = entry.worktree.trim();
    const letter = (index && index !== '?' ? index : worktree).replace('?', 'U');
    if (!letter) continue;
    files.set(entry.path, letter);
    if (letter === 'D') continue;
    const parts = entry.path.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const folder = parts.slice(0, depth).join('/');
      const current = folders.get(folder);
      if (!current || rank(letter) < rank(current)) folders.set(folder, letter);
    }
  }
  return { files, folders };
}

function rank(status: ExplorerStatus): number {
  const index = FOLDER_STATUS_ORDER.indexOf(status as (typeof FOLDER_STATUS_ORDER)[number]);
  return index === -1 ? FOLDER_STATUS_ORDER.length : index;
}

/** 新建文件 / 文件夹的落点目录：选中文件夹取自身，选中文件取其父目录，其余落在根（空串）。 */
export function explorerCreationParent(rows: readonly ExplorerRow[], focusKey: string | null): string {
  const focused = rows.find(row => row.key === focusKey);
  if (!focused) return '';
  return focused.kind === 'folder' ? focused.key : (focused.ancestors.at(-1) ?? '');
}

/**
 * 树内输入行（新建文件 / 文件夹）的插入位置：新文件在该目录文件组之首，新文件夹在文件夹组之首
 * （空名称按排序规则本就排在最前），没有可比对的子项时落在该目录子树之后。
 */
export function explorerInsertion(
  rows: readonly ExplorerRow[],
  parent: string,
  kind: 'file' | 'folder'
): { readonly index: number; readonly level: number } {
  const parentIndex = parent ? rows.findIndex(row => row.key === parent) : -1;
  const level = parentIndex === -1 ? 1 : rows[parentIndex].level + 1;
  const isChild = (row: ExplorerRow): boolean => (row.ancestors.at(-1) ?? '') === parent;
  const first = rows.findIndex(
    (row, index) => index > parentIndex && isChild(row) && (kind === 'folder' || row.kind === 'file')
  );
  if (first !== -1) return { index: first, level };
  const after = rows.findIndex((row, index) => index > parentIndex && row.level < level);
  return { index: after === -1 ? rows.length : after, level };
}

/** 命名校验结果，文案由视图层按 VS Code 简体中文措辞渲染。 */
export type ExplorerNameError =
  | { readonly kind: 'empty' }
  | { readonly kind: 'slash' }
  | { readonly kind: 'invalid'; readonly name: string }
  | { readonly kind: 'exists'; readonly name: string };

/**
 * 校验树内输入的新名称：可含 `/` 以一次建立多级目录；同名文件 / 文件夹冲突，
 * 或路径中途有一级已被文件占用，都算「已存在」。重命名为自身（renaming）不算冲突。
 */
export function explorerNameError(
  files: readonly string[],
  parent: string,
  value: string,
  renaming?: string
): ExplorerNameError | null {
  const typed = value.trim();
  if (typed.startsWith('/')) return { kind: 'slash' };
  const name = typed.replace(/\/+$/, '');
  if (!name) return { kind: 'empty' };
  const segments = name.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\\0]/.test(segment)))
    return { kind: 'invalid', name };
  const target = parent ? `${parent}/${name}` : name;
  if (target === renaming) return null;
  const occupied = files.some(file => file === target || file.startsWith(`${target}/`));
  const blocked = segments
    .slice(0, -1)
    .some((_, index) => files.includes([parent, ...segments.slice(0, index + 1)].filter(Boolean).join('/')));
  return occupied || blocked ? { kind: 'exists', name } : null;
}
