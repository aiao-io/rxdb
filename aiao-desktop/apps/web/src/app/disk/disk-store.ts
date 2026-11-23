import { DiskPath, toVmPath } from './disk-path';

export type DiskEntryKind = 'file' | 'directory';

export interface DiskEntry {
  readonly name: string;
  readonly kind: DiskEntryKind;
  /** 废纸篓条目移入前的位置；旧条目没有此信息。 */
  readonly originalPath?: DiskPath;
}

export interface DiskFileInfo {
  readonly size: number;
  /** 修改时间，毫秒时间戳。 */
  readonly modified: number;
}

export type DiskErrorCode = 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'EACCES';

/** 磁盘操作的错误，错误码沿用 POSIX 的写法。 */
export class DiskError extends Error {
  constructor(
    readonly code: DiskErrorCode,
    readonly path: DiskPath,
    message = `${code}: ${toVmPath(path)}`
  ) {
    super(message);
    this.name = 'DiskError';
  }
}

export const isMissing = (error: unknown): boolean =>
  error instanceof DiskError && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/**
 * 同级已有只在大小写上不同的名字：数据库的唯一索引不区分大小写（保留大小写，像 macOS），所以它们是同一个名字。
 * 在 `path` 创建、改名或移动之前抛它，而不是让唯一索引的约束错误冒到界面；`existing` 是已经占着名字的那一个。
 */
export const nameTaken = (path: DiskPath, existing: string): DiskError =>
  new DiskError(
    'EEXIST',
    path,
    `Another item named “${existing}” already exists in this folder (names are not case-sensitive).`
  );

/**
 * 磁盘的存储后端：浏览器里是 OPFS，单测里是内存。路径都是卷内路径。
 *
 * 路径查找是精确的（`Docs/a.txt` 与 `docs/a.txt` 是两条路径），而创建与改名按库的唯一索引判重：
 * 同级已有只在大小写上不同的名字时，`write`、`mkdir`、`move` 抛 `EEXIST`（见 {@link nameTaken}），既不覆盖那个节点也不新建。
 */
export interface DiskStore {
  /** 列出目录；目录不存在时抛 `ENOENT`。 */
  list(dir: DiskPath): Promise<DiskEntry[]>;
  /** 路径的类型；不存在时为 `null`。 */
  kindOf(path: DiskPath): Promise<DiskEntryKind | null>;
  info(file: DiskPath): Promise<DiskFileInfo>;
  read(file: DiskPath): Promise<Uint8Array>;
  /**
   * 写入整个文件，缺失的父目录一并创建。这是显式的创建入口（终端重定向、`touch`、另存），已有文件就覆盖；
   * 路径上要新建的名字（文件或目录）和同级已有的名字只差大小写时抛 `EEXIST`。
   */
  write(file: DiskPath, data: Uint8Array): Promise<void>;
  /**
   * 覆盖一个**已存在**的文件（保存已打开的文件，ADESK-US-105）：文件或它的父目录不存在时抛 `ENOENT`，目标是目录时抛 `EISDIR`；
   * 不创建文件、不补建父目录。保存时目标已被别的标签页删掉、移走或改名，就该失败，而不是在原路径悄悄新建。
   */
  replace(file: DiskPath, data: Uint8Array): Promise<void>;
  /** 递归创建目录；要新建的名字和同级已有的名字（目录或文件）只差大小写时抛 `EEXIST`。 */
  mkdir(dir: DiskPath): Promise<void>;
  /** 递归删除；路径不存在时什么也不做。 */
  remove(path: DiskPath): Promise<void>;
  /**
   * 移动或改名，文件的修改时间不变；目标已存在、或同级有另一个节点的名字与目标只差大小写时抛 `EEXIST`。
   * 把节点改成只差大小写的自己的名字（`Report.txt` → `report.txt`）是允许的。
   */
  move(from: DiskPath, to: DiskPath): Promise<void>;
}
