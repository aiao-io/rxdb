import { USER_PROFILE } from '../shared/user-profile';

/** 卷内路径：从 Macintosh HD 根起的各级名称。 */
export type DiskPath = readonly string[];

/** 启动盘的名字，也是 Finder 路径的第一段。 */
export const VOLUME_NAME = 'Macintosh HD';

export const HOME: DiskPath = ['Users', USER_PROFILE.shortName];
export const DESKTOP: DiskPath = [...HOME, 'Desktop'];
/** 和 macOS 一样，废纸篓是主目录里的隐藏文件夹。 */
export const TRASH: DiskPath = [...HOME, '.Trash'];

/** Finder 里废纸篓的路径写法：不显示它在主目录里的真实位置。 */
const TRASH_PLACE = 'Trash';

/** 卷的顶层目录。虚拟机里它们挂在根目录下，和 Vivari 自己的 /bin、/tmp 等并列。 */
export const DISK_ROOTS: readonly string[] = ['Applications', 'Library', 'System', 'Users'];

export const toVmPath = (path: DiskPath): string => `/${path.join('/')}`;

export const fromVmPath = (vmPath: string): DiskPath => vmPath.split('/').filter(Boolean);

/** 以虚拟机的当前目录解析 POSIX 路径。 */
export function resolveVmPath(base: DiskPath, path: string): DiskPath {
  const result = path.startsWith('/') ? [] : [...base];
  for (const part of path.split('/')) {
    if (part === '..') result.pop();
    else if (part && part !== '.') result.push(part);
  }
  return result;
}

export const parentOf = (path: DiskPath): DiskPath => path.slice(0, -1);

export const isWithin = (path: DiskPath, dir: DiskPath): boolean =>
  path.length >= dir.length && dir.every((segment, i) => path[i] === segment);

export const samePath = (a: DiskPath, b: DiskPath): boolean => a.length === b.length && isWithin(a, b);

/** 用账户显示名呈现主目录路径。 */
export const displayDiskPath = (path: DiskPath): DiskPath =>
  isWithin(path, HOME) ? [HOME[0], USER_PROFILE.name, ...path.slice(HOME.length)] : path;

const HOME_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Public', '.Trash'];

/** 系统管理的根目录和标准主目录不能被移动、删除或作为批次清理目标。 */
export const isRequiredDiskPath = (path: DiskPath): boolean =>
  path.length <= 1 ||
  path[0] === 'System' ||
  samePath(path, HOME) ||
  (path.length === HOME.length + 1 && isWithin(path, HOME) && HOME_FOLDERS.includes(path[HOME.length]));

/** 卷内路径对应的 Finder 路径：`['Macintosh HD', …]`，废纸篓里的条目以 `Trash` 开头。 */
export function finderPathOf(path: DiskPath): readonly string[] {
  if (isWithin(path, TRASH)) return [TRASH_PLACE, ...path.slice(TRASH.length)];
  return [VOLUME_NAME, ...path];
}

/** Finder 路径对应的卷内路径；侧栏里的虚拟位置（最近使用、AirDrop 等）返回 `null`。 */
export function diskPathOf(finderPath: readonly string[]): DiskPath | null {
  if (finderPath[0] === VOLUME_NAME) return finderPath.slice(1);
  if (finderPath[0] === TRASH_PLACE) return [...TRASH, ...finderPath.slice(1)];
  return null;
}

/** 同名时在扩展名前追加序号：`untitled folder 2`、`a 2.md`。 */
export function uniqueName(existing: readonly string[], name: string): string {
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let index = 2;
  while (taken.has(`${stem} ${index}${extension}`)) index++;
  return `${stem} ${index}${extension}`;
}

/** 移进废纸篓时记录原路径，在篓内改名保留，移出时清除。 */
export function movedOrigin(from: DiskPath, to: DiskPath, original?: DiskPath | null): DiskPath | null {
  if (!isWithin(to, TRASH)) return null;
  return isWithin(from, TRASH) ? (original ?? null) : [...from];
}
