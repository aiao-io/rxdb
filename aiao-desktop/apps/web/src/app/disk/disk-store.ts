import { DiskPath, toVmPath } from './disk-path';

export type DiskEntryKind = 'file' | 'directory';

export interface DiskEntry {
  readonly name: string;
  readonly kind: DiskEntryKind;
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

/** 磁盘的存储后端：浏览器里是 OPFS，单测里是内存。路径都是卷内路径。 */
export interface DiskStore {
  /** 列出目录；目录不存在时抛 `ENOENT`。 */
  list(dir: DiskPath): Promise<DiskEntry[]>;
  /** 路径的类型；不存在时为 `null`。 */
  kindOf(path: DiskPath): Promise<DiskEntryKind | null>;
  info(file: DiskPath): Promise<DiskFileInfo>;
  read(file: DiskPath): Promise<Uint8Array>;
  /** 写入整个文件，缺失的父目录一并创建。 */
  write(file: DiskPath, data: Uint8Array): Promise<void>;
  /** 递归创建目录。 */
  mkdir(dir: DiskPath): Promise<void>;
  /** 递归删除；路径不存在时什么也不做。 */
  remove(path: DiskPath): Promise<void>;
  /** 移动或改名，文件的修改时间不变；目标已存在时抛 `EEXIST`。 */
  move(from: DiskPath, to: DiskPath): Promise<void>;
}
