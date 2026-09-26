import {
  classifyBackupIoError,
  RXDB_BACKUP_CHUNK_SIZE,
  RxDBBackupError,
  type RxDBBackupArchiveReader,
  type RxDBBackupArchiveWriter,
  type RxDBBackupTrailer
} from '@aiao/rxdb';

/** PGlite 在 Emscripten 虚拟文件系统里的数据目录（IdbFs 下是指向挂载点的符号链接）。 */
export const PGLITE_DATA_DIR = '/pglite/data';

/**
 * 不进归档的文件名（任何深度）。
 *
 * @remarks
 * `postmaster.pid` / `postmaster.opts` 是进程运行态，带进目标会让下一次启动误以为有实例在跑；
 * `pg_internal.init` 是 relcache 缓存，PostgreSQL 启动时会删掉重建，也是官方基础备份明确排除的文件。
 */
export const PGLITE_EXCLUDED_FILES: ReadonlySet<string> = new Set([
  'postmaster.pid',
  'postmaster.opts',
  'pg_internal.init'
]);

/** Emscripten 打开的文件句柄（不透明）。 */
export type EmscriptenStream = object;

/**
 * 备份 / 恢复用到的 Emscripten `FS` 子集。
 *
 * @remarks
 * PGlite 的 d.ts 把 `Module.FS` 声明成 `any`，这里收窄成真正用到的几项，读写两端都只经这一份契约。
 */
export interface EmscriptenFS {
  readdir(path: string): string[];
  lstat(path: string): { mode: number; size: number };
  isDir(mode: number): boolean;
  isFile(mode: number): boolean;
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string, mode?: number): void;
  mkdirTree(path: string): void;
  open(path: string, flags: string): EmscriptenStream;
  read(stream: EmscriptenStream, buffer: Uint8Array, offset: number, length: number, position: number): number;
  write(stream: EmscriptenStream, buffer: Uint8Array, offset: number, length: number): number;
  close(stream: EmscriptenStream): void;
}

const fsError = (error: unknown, message: string): RxDBBackupError =>
  error instanceof RxDBBackupError ? error : classifyBackupIoError(error, message);

const childNames = (FS: EmscriptenFS, dir: string): string[] =>
  FS.readdir(dir)
    .filter(name => name !== '.' && name !== '..' && !PGLITE_EXCLUDED_FILES.has(name))
    .sort();

const copyFile = async (
  FS: EmscriptenFS,
  source: string,
  size: number,
  writer: RxDBBackupArchiveWriter,
  buffer: Uint8Array
): Promise<void> => {
  const stream = FS.open(source, 'r');
  try {
    let position = 0;
    while (position < size) {
      const length = FS.read(stream, buffer, 0, Math.min(buffer.length, size - position), position);
      if (length <= 0) throw new RxDBBackupError('io_error', `Data file shrank while being read: ${source}`);
      // 归档写入器会把字节拷进自己的帧，所以同一块缓冲区可以立刻复用。
      await writer.writeData(buffer.subarray(0, length));
      position += length;
    }
  } finally {
    FS.close(stream);
  }
};

const walk = async (
  FS: EmscriptenFS,
  dir: string,
  prefix: string,
  writer: RxDBBackupArchiveWriter,
  buffer: Uint8Array
): Promise<void> => {
  for (const name of childNames(FS, dir)) {
    const full = `${dir}/${name}`;
    const path = prefix === '' ? name : `${prefix}/${name}`;
    const stat = FS.lstat(full);
    if (FS.isDir(stat.mode)) {
      await writer.beginEntry({ path, kind: 'directory', size: 0 });
      await walk(FS, full, path, writer, buffer);
      continue;
    }
    if (!FS.isFile(stat.mode)) {
      throw new RxDBBackupError('io_error', `Unsupported file type in the data directory: ${path}`);
    }
    await writer.beginEntry({ path, kind: 'file', size: stat.size });
    await copyFile(FS, full, stat.size, writer, buffer);
  }
};

/**
 * 把 PGlite 数据目录按确定顺序流式写进归档。
 *
 * @remarks
 * 调用方必须已经独占运行时且刚做完 `CHECKPOINT`：遍历期间没有别的语句能改动文件，
 * 于是目录树就是一个一致快照。逐块读取，复用同一块 {@link RXDB_BACKUP_CHUNK_SIZE} 缓冲，
 * 在途字节与库大小无关。目录名按码点排序，父目录总在子项之前。
 *
 * @param FS - PGlite 运行时的 Emscripten 文件系统
 * @param writer - 已写完 manifest 的归档写入器
 * @throws RxDBBackupError `io_error` / `storage_full` / `aborted`，以及写入器自身的错误
 */
export const writeDataDirSnapshot = async (FS: EmscriptenFS, writer: RxDBBackupArchiveWriter): Promise<void> => {
  try {
    await walk(FS, PGLITE_DATA_DIR, '', writer, new Uint8Array(RXDB_BACKUP_CHUNK_SIZE));
  } catch (error) {
    throw fsError(error, 'Failed to read the PGlite data directory');
  }
};

const openEntry = (FS: EmscriptenFS, path: string, kind: 'file' | 'directory'): EmscriptenStream | undefined => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (PGLITE_EXCLUDED_FILES.has(name)) {
    throw new RxDBBackupError('corrupt_archive', `Archive contains a runtime-only file: ${path}`, {
      details: { field: 'entry.path', actual: path }
    });
  }
  const target = `${PGLITE_DATA_DIR}/${path}`;
  if (kind === 'directory') {
    FS.mkdir(target, 0o700);
    return undefined;
  }
  return FS.open(target, 'w');
};

/**
 * 把归档条目逐个写进（空的）PGlite 数据目录，直到结束标记。
 *
 * @remarks
 * 运行在 PGlite 初始化的 `initialSyncFs` 阶段——此时文件系统已挂载、PostgreSQL 还没启动，
 * 写完之后 PGlite 看到 `PG_VERSION` 就会直接「恢复已有库」而不是 initdb。
 * 摘要只在结束标记处校验，所以校验失败前文件已经写了一部分；调用方负责整体清理。
 *
 * @param FS - 目标运行时的 Emscripten 文件系统
 * @param reader - 已读完 manifest 的归档读取器
 * @returns 已校验的结束标记
 * @throws RxDBBackupError 读取器的归档错误，或 `corrupt_archive` / `io_error` / `storage_full`
 */
export const restoreDataDirEntries = async (
  FS: EmscriptenFS,
  reader: RxDBBackupArchiveReader
): Promise<RxDBBackupTrailer> => {
  if (!FS.analyzePath(PGLITE_DATA_DIR).exists) FS.mkdirTree(PGLITE_DATA_DIR);
  let stream: EmscriptenStream | undefined;
  try {
    for (;;) {
      const item = await reader.next();
      if (item.type === 'end') return item.trailer;
      if (item.type === 'data') {
        FS.write(stream!, item.bytes, 0, item.bytes.length);
        continue;
      }
      if (stream) FS.close(stream);
      stream = undefined;
      stream = openEntry(FS, item.header.path, item.header.kind);
    }
  } catch (error) {
    throw fsError(error, 'Failed to write the PGlite data directory');
  } finally {
    if (stream) FS.close(stream);
  }
};
