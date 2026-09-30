/**
 * host 侧 PGlite 数据目录的读写工具（US-217）。
 *
 * @remarks
 * 备份时逐块读出一棵数据目录树，恢复时判定目标是否为空、落盘与清理。遍历格式与浏览器端
 * `walkEmscriptenDataDir` 逐项一致：相对路径以 `/` 连接、不含根条目，子项按码点排序，
 * 父目录总在子项之前，运行态文件（`postmaster.pid` 等）在任何深度都不产出。
 *
 * @module pglite-host/pglite-host-data-dir
 */

import {
  DESKTOP_PGLITE_EXCLUDED_FILES,
  DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES,
  RxDBAdapterDesktopError,
  type DesktopPgliteDataDirItem,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { lstat, open, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** 文件系统错误码到桌面错误码；表外的一律按 host 自身故障上报，`cause` 保留原始错误。 */
const IO_ERROR_CODES = new Map<string, RxDBAdapterDesktopErrorCode>([
  ['ENOSPC', 'disk_full'],
  ['EDQUOT', 'disk_full'],
  ['EACCES', 'permission_denied'],
  ['EPERM', 'permission_denied'],
  ['EROFS', 'permission_denied'],
  ['ENOENT', 'file_not_found']
]);

/**
 * 取 Node 文件系统错误上的 errno 名（`ENOENT` 等）。
 *
 * @param error - 原始错误
 * @returns errno 名；不是 errno 形状的错误时为 `undefined`
 */
export const errnoOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * 把文件系统错误归一成桌面错误。
 *
 * @remarks
 * 已经是桌面错误的原样透传：遍历中途抛出的「文件变短」之类的判定比外层的笼统描述更准。
 * 磁盘写满必须单独成码，renderer 据此报 `storage_full`，调用方才知道腾出空间后重试即可。
 *
 * @param error - 原始错误
 * @param detail - 面向开发者的描述
 * @returns 桌面错误
 */
export const toHostIoError = (error: unknown, detail: string): RxDBAdapterDesktopError => {
  if (error instanceof RxDBAdapterDesktopError) return error;
  const code = IO_ERROR_CODES.get(errnoOf(error) ?? '') ?? 'host_internal_error';
  return new RxDBAdapterDesktopError(code, detail, { cause: error });
};

const childNames = async (directory: string): Promise<string[]> =>
  (await readdir(directory)).filter(name => !DESKTOP_PGLITE_EXCLUDED_FILES.has(name)).sort();

async function* readFileChunks(file: string, size: number, path: string): AsyncGenerator<DesktopPgliteDataDirItem> {
  const handle = await open(file, 'r');
  try {
    let position = 0;
    while (position < size) {
      // 每块独占一个恰好大小的 ArrayBuffer：结构化克隆会把整个 backing buffer 拷过进程边界，
      // 复用一块 64K 缓冲再切片出去，一个几字节的尾块也要搬满 64K（AC#9、AC#21）。
      const bytes = new Uint8Array(Math.min(DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES, size - position));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, position);
      if (bytesRead <= 0) {
        throw new RxDBAdapterDesktopError('host_internal_error', `data file shrank while being read: ${path}`);
      }
      yield { type: 'data', bytes: bytesRead === bytes.length ? bytes : bytes.slice(0, bytesRead) };
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

async function* walk(directory: string, prefix: string): AsyncGenerator<DesktopPgliteDataDirItem> {
  for (const name of await childNames(directory)) {
    const full = join(directory, name);
    const path = prefix === '' ? name : `${prefix}/${name}`;
    const stats = await lstat(full);
    if (stats.isDirectory()) {
      yield { type: 'entry', header: { path, kind: 'directory', size: 0 } };
      yield* walk(full, path);
      continue;
    }
    if (!stats.isFile()) {
      throw new RxDBAdapterDesktopError('host_internal_error', `unsupported file type in the data directory: ${path}`);
    }
    yield { type: 'entry', header: { path, kind: 'file', size: stats.size } };
    yield* readFileChunks(full, stats.size, path);
  }
}

/**
 * 按确定顺序逐块读出一个 PGlite 数据目录。
 *
 * @remarks
 * 调用方必须已经占住该目录上唯一的运行时连接并做完 `CHECKPOINT`：遍历期间没有语句能改动文件，
 * 目录树因此就是一个一致快照。同一时刻只有一块数据在途，与库大小无关；消费方不取下一项，
 * 就不会读下一块。提前结束（`return()`）时当前文件句柄在 `finally` 里关闭。
 *
 * @param directory - 数据目录的物理路径
 * @returns 数据目录各项；每个数据块独占自己的 `ArrayBuffer`
 * @throws {@link RxDBAdapterDesktopError} `disk_full` / `permission_denied` / `file_not_found` / `host_internal_error`
 */
export async function* walkPgliteDataDirectory(directory: string): AsyncGenerator<DesktopPgliteDataDirItem> {
  try {
    yield* walk(directory, '');
  } catch (error) {
    throw toHostIoError(error, 'failed to read the PGlite data directory');
  }
}

/**
 * 判定恢复目标是否可写：不存在，或是一个空目录。
 *
 * @remarks
 * 同名的普通文件算「不空」而不是 I/O 故障：它同样意味着那里已经有别的东西，恢复不能覆盖。
 *
 * @param directory - 数据目录的物理路径
 * @returns 可以在此恢复时为 `true`
 * @throws {@link RxDBAdapterDesktopError} 目录读不出来时
 */
export const isEmptyOrMissing = async (directory: string): Promise<boolean> => {
  try {
    return (await readdir(directory)).length === 0;
  } catch (error) {
    const errno = errnoOf(error);
    if (errno === 'ENOENT') return true;
    if (errno === 'ENOTDIR') return false;
    throw toHostIoError(error, 'failed to inspect the restore target');
  }
};

/**
 * 数据目录里是否有 `PG_VERSION`。
 *
 * @remarks
 * PGlite 打开一个没有 `PG_VERSION` 的目录时会**就地 initdb**。恢复校验前必须先确认它在，
 * 否则一份缺了它的归档会被悄悄换成一个全新的空库，然后以「系统表水位不符」之类不相干的
 * 原因失败，甚至通过校验。
 *
 * @param directory - 数据目录的物理路径
 * @returns 存在且是普通文件时为 `true`
 */
export const hasPgVersion = async (directory: string): Promise<boolean> => {
  try {
    return (await lstat(join(directory, 'PG_VERSION'))).isFile();
  } catch (error) {
    if (errnoOf(error) === 'ENOENT') return false;
    throw toHostIoError(error, 'failed to inspect the PGlite data directory');
  }
};

const syncHandle = async (path: string, flags: string): Promise<void> => {
  const handle = await open(path, flags);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/**
 * 目录项的持久化。
 *
 * @remarks
 * Windows 上目录打不开成可 fsync 的句柄，NTFS 的元数据日志随文件的 flush 一并落盘，跳过即可。
 */
const syncDirectory = async (directory: string): Promise<void> => {
  if (process.platform === 'win32') return;
  await syncHandle(directory, 'r');
};

const syncTreeEntries = async (directory: string): Promise<void> => {
  for (const name of await readdir(directory)) {
    const full = join(directory, name);
    if ((await lstat(full)).isDirectory()) await syncTreeEntries(full);
    // `r+` 而不是 `r`：Windows 的 FlushFileBuffers 要求句柄带写权限。
    else await syncHandle(full, 'r+');
  }
  await syncDirectory(directory);
};

/**
 * 把整棵数据目录（连同它在父目录里的目录项）逐一落盘。
 *
 * @remarks
 * 恢复标记只能在这一步完成之后删除：先删标记再掉电，重启后看到的是一个「没有标记、
 * 却缺了几页」的库，与完整恢复无从区分（AC#11）。
 *
 * @param directory - 数据目录的物理路径
 * @throws {@link RxDBAdapterDesktopError} 落盘失败时
 */
export const syncPgliteDataDirectory = async (directory: string): Promise<void> => {
  try {
    await syncTreeEntries(directory);
    await syncDirectory(dirname(directory));
  } catch (error) {
    throw toHostIoError(error, 'failed to persist the restored PGlite data directory');
  }
};

/**
 * 删除一棵数据目录；不存在时视为已删除。
 *
 * @param directory - 数据目录的物理路径
 * @throws {@link RxDBAdapterDesktopError} 删除失败时
 */
export const removePgliteDataDirectory = async (directory: string): Promise<void> => {
  try {
    // 重试针对 Windows：杀毒软件与索引服务会短暂占住刚关闭的文件，第一次删常以 EBUSY 失败。
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  } catch (error) {
    throw toHostIoError(error, 'failed to remove the PGlite data directory');
  }
};
