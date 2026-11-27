import { extensionOf, formatSize, isPackageName, mimeTypeOf } from '../disk/disk-kinds';
import { DiskPath, HOME, VOLUME_NAME, displayDiskPath, sameName } from '../disk/disk-path';
import { FsNode, visibleChildren } from '../disk/disk-tree';
import { DESKTOP_MESSAGES_EN } from '../i18n/messages-en';
import type { FilePanelMode } from '../services/file-panels';

/*
 * 打开 / 保存面板的纯逻辑（ADESK-US-206 阶段 D）：哪些条目显示、哪些禁用并说明原因、方向键怎么移动、
 * 保存时文件名与目标的冲突怎么判。组件只管把它们接到界面与键盘上。
 */

/** 目录 key 的翻译器：组件传 `i18n.t`；spec 在无 i18n 的 Node 环境里跑，缺省用随包英文目录（应用的基线语言）。 */
export type PanelText = (key: string, params?: Record<string, unknown>) => string;

/** v1 只支持 `{name}` 形式的简单插值，与随包目录的 ICU 子集一致。 */
const enText: PanelText = (key, params = {}) =>
  DESKTOP_MESSAGES_EN[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    params[name] === undefined ? placeholder : String(params[name])
  );

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
function unselectable(node: FsNode, mode: FilePanelMode, maxBytes: number, t: PanelText): string | null {
  if (isPackageName(node.name))
    return t(mode === 'open' ? 'shell.filePanel.appCannotOpenHere' : 'shell.filePanel.appCannotReplaceHere');
  if (mode === 'open' && (node.bytes ?? 0) > maxBytes)
    return t('shell.filePanel.tooLarge', { size: formatSize(maxBytes) });
  return null;
}

/** 面板在一个文件夹里要显示的条目：隐藏文件不显示，不匹配 `accept` 的文件不显示，文件夹在前。 */
export function panelEntries(
  folder: FsNode | null,
  options: { readonly mode: FilePanelMode; readonly accept: readonly string[]; readonly maxBytes: number },
  t: PanelText = enText
): PanelEntry[] {
  const entries = visibleChildren(folder).flatMap((node): PanelEntry[] => {
    const isFolder = node.kind === 'folder';
    if (!isFolder && !acceptsName(options.accept, node.name)) return [];
    const reason = isFolder ? null : unselectable(node, options.mode, options.maxBytes, t);
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
export function fileNameProblem(name: string, limit: number, t: PanelText = enText): string | null {
  if (!name.trim()) return t('shell.filePanel.enterName');
  if (name === '.' || name === '..') return t('shell.filePanel.invalidName', { name });
  if (/[/\\]/.test(name)) return t('shell.filePanel.slashInName');
  if (/\p{Cc}/u.test(name)) return t('shell.filePanel.controlChars');
  if (name.length > limit) return t('shell.filePanel.nameTooLong', { limit });
  return null;
}

/**
 * 保存时目标名字与文件夹里现有条目的关系；已有的条目带着它现在的名字（只差大小写的也算同名，与库的唯一索引同口径，
 * 所以这个名字可能和用户输入的大小写不同）。
 */
export type SaveConflict =
  | { readonly kind: 'none' }
  | { readonly kind: 'file'; readonly name: string }
  | { readonly kind: 'folder'; readonly name: string }
  | { readonly kind: 'package'; readonly name: string };

/**
 * 目标名字在这个文件夹里是新的，还是已经有文件（要请用户确认覆盖）、同名文件夹或程序包（不能覆盖）；
 * 只在大小写上不同的名字也算已有（库的唯一索引不区分大小写，照输入的名字新建会撞上它）。精确同名的优先。
 * 看文件夹里的全部条目（含隐藏文件、含被 `accept` 过滤掉的文件）：显示过滤不能让用户在看不见的地方静默覆盖。
 */
export function saveConflict(folder: FsNode | null, name: string): SaveConflict {
  const children = folder?.children ?? [];
  const existing = children.find(node => node.name === name) ?? children.find(node => sameName(node.name, name));
  if (!existing) return { kind: 'none' };
  if (existing.kind === 'folder') return { kind: 'folder', name: existing.name };
  return { kind: isPackageName(existing.name) ? 'package' : 'file', name: existing.name };
}

/**
 * 保存要写到的名字：覆盖已有文件时用它现在的名字（按用户输入的大小写写会撞上同名，覆盖要落在那个节点上），
 * 否则就是输入的名字。
 */
export const saveName = (conflict: SaveConflict, typed: string): string =>
  conflict.kind === 'file' ? conflict.name : typed;

/** 路径的显示文字，例如 `Macintosh HD › Users › Steve Jobs`。 */
export const pathLabel = (path: DiskPath): string => [VOLUME_NAME, ...displayDiskPath(path)].join(' › ');

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
