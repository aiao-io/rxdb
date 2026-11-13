import { extensionOf, formatSize, isPackageName, mimeTypeOf } from '../disk/disk-kinds';
import { DiskPath, HOME, VOLUME_NAME } from '../disk/disk-path';
import { FsNode, visibleChildren } from '../disk/disk-tree';
import type { FilePanelMode } from '../services/file-panels';

/*
 * 打开 / 保存面板的纯逻辑（ADESK-US-206 阶段 D）：哪些条目显示、哪些禁用并说明原因、方向键怎么移动、
 * 保存时文件名与目标的冲突怎么判。组件只管把它们接到界面与键盘上。
 */

/** 面板里的一行。 */
export interface PanelEntry {
  /** 磁盘上的节点（图标、大小、日期从它读）。 */
  readonly node: FsNode;
  /** 名字。 */
  readonly name: string;
  /** 是文件夹（可以进入）。 */
  readonly folder: boolean;
  /** 不能选定：太大的文件、程序包。仍然显示，让用户看到原因。 */
  readonly disabled: boolean;
  /** 禁用的原因，给用户看；没有禁用为 `null`。 */
  readonly reason: string | null;
}

/** 选取条目的方向键。 */
export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/**
 * 按 `accept`（扩展名 `.md`、MIME `text/*` 或 `image/png`）判断一个文件名要不要显示。`accept` 为空就都显示。
 * 这只是显示过滤，不是对内容的校验：MIME 由扩展名推断。
 */
export function acceptsName(accept: readonly string[], name: string): boolean {
  if (accept.length === 0) return true;
  const extension = extensionOf(name);
  const mime = mimeTypeOf(name);
  return accept.some(entry => {
    if (entry.startsWith('.')) return extension !== '' && entry === `.${extension}`;
    return entry.endsWith('/*') ? mime.startsWith(entry.slice(0, -1)) : mime === entry;
  });
}

/** 打开面板里不能选的原因：太大，或者是程序包（磁盘上是目录，没有可读的文件内容）。 */
function unselectable(node: FsNode, mode: FilePanelMode, maxBytes: number): string | null {
  if (isPackageName(node.name))
    return mode === 'open' ? 'Application — can’t be opened here' : 'Application — can’t be replaced';
  if (mode === 'open' && (node.bytes ?? 0) > maxBytes) return `Too large — the limit is ${formatSize(maxBytes)}`;
  return null;
}

/** 面板在一个文件夹里要显示的条目：隐藏文件不显示，不匹配 `accept` 的文件不显示，文件夹在前。 */
export function panelEntries(
  folder: FsNode | null,
  options: { readonly mode: FilePanelMode; readonly accept: readonly string[]; readonly maxBytes: number }
): PanelEntry[] {
  const entries = visibleChildren(folder).flatMap((node): PanelEntry[] => {
    const isFolder = node.kind === 'folder';
    if (!isFolder && !acceptsName(options.accept, node.name)) return [];
    const reason = isFolder ? null : unselectable(node, options.mode, options.maxBytes);
    return [{ node, name: node.name, folder: isFolder, disabled: reason !== null, reason }];
  });
  return [...entries.filter(entry => entry.folder), ...entries.filter(entry => !entry.folder)];
}

/** 方向键、Home、End 之后的当前行（没有当前行时是 -1）：不绕圈，到头就停在头。 */
export function moveActive(count: number, active: number, key: NavigationKey): number {
  if (count === 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (active < 0) return key === 'ArrowDown' ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, active + (key === 'ArrowDown' ? 1 : -1)));
}

/** 保存时文件名的问题（给用户看的一句话）；没有问题为 `null`。 */
export function fileNameProblem(name: string, limit: number): string | null {
  if (!name.trim()) return 'Enter a name for the file.';
  if (name === '.' || name === '..') return `“${name}” isn’t a valid file name.`;
  if (/[/\\]/.test(name)) return 'A file name can’t contain “/” or “\\”.';
  if (/\p{Cc}/u.test(name)) return 'A file name can’t contain control characters.';
  if (name.length > limit) return `A file name can have at most ${limit} characters.`;
  return null;
}

/** 保存时目标名字与文件夹里现有条目的关系。 */
export type SaveConflict =
  { readonly kind: 'none' } | { readonly kind: 'file' } | { readonly kind: 'folder' } | { readonly kind: 'package' };

/**
 * 目标名字在这个文件夹里是新的，还是已经有文件（要请用户确认覆盖）、同名文件夹或程序包（不能覆盖）。
 * 看文件夹里的全部条目（含隐藏文件、含被 `accept` 过滤掉的文件）：显示过滤不能让用户在看不见的地方静默覆盖。
 */
export function saveConflict(folder: FsNode | null, name: string): SaveConflict {
  const existing = folder?.children?.find(node => node.name === name);
  if (!existing) return { kind: 'none' };
  if (existing.kind === 'folder') return { kind: 'folder' };
  return isPackageName(existing.name) ? { kind: 'package' } : { kind: 'file' };
}

/** 路径的显示文字：`Macintosh HD › Users › prasenjit`。 */
export const pathLabel = (path: DiskPath): string => [VOLUME_NAME, ...path].join(' › ');

/** 面板开着时用户所在的文件夹还在不在；不在了（被别处删除、改名）就退到最近的还在的上级。 */
export function nearestFolder(path: DiskPath, nodeAt: (path: DiskPath) => FsNode | null): DiskPath {
  let current = path;
  while (current.length > 0 && nodeAt(current)?.kind !== 'folder') current = current.slice(0, -1);
  return current;
}

/** 面板一开始停在哪：用户的 Documents，没有就是主目录，再没有就是卷根。 */
export function startFolder(nodeAt: (path: DiskPath) => FsNode | null): DiskPath {
  return nearestFolder([...HOME, 'Documents'], nodeAt);
}
