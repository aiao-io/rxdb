/** 卷内路径：从 Macintosh HD 根起的各级名称，例如 `['Users', 'prasenjit', 'Desktop']`。 */
export type DiskPath = readonly string[];

/** 启动盘的名字，也是 Finder 路径的第一段。 */
export const VOLUME_NAME = 'Macintosh HD';
export const USER_NAME = 'prasenjit';

export const HOME: DiskPath = ['Users', USER_NAME];
export const DESKTOP: DiskPath = [...HOME, 'Desktop'];
/** 和 macOS 一样，废纸篓是主目录里的隐藏文件夹。 */
export const TRASH: DiskPath = [...HOME, '.Trash'];

/** Finder 里废纸篓的路径写法：不显示它在主目录里的真实位置。 */
const TRASH_PLACE = 'Trash';

/** 卷的顶层目录。虚拟机里它们挂在根目录下，和 Vivari 自己的 /bin、/tmp 等并列。 */
export const DISK_ROOTS: readonly string[] = ['Applications', 'Library', 'System', 'Users'];

export const toVmPath = (path: DiskPath): string => `/${path.join('/')}`;

export const fromVmPath = (vmPath: string): DiskPath => vmPath.split('/').filter(Boolean);

export const parentOf = (path: DiskPath): DiskPath => path.slice(0, -1);

export const isWithin = (path: DiskPath, dir: DiskPath): boolean =>
  path.length >= dir.length && dir.every((segment, i) => path[i] === segment);

export const samePath = (a: DiskPath, b: DiskPath): boolean => a.length === b.length && isWithin(a, b);

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
