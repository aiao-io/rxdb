/**
 * @fileoverview 基于 Origin Private File System 的默认存储后端
 *
 * @remarks
 * 这里集中了所有 File System 句柄细节（`getDirectoryHandle` / `getFileHandle` /
 * `createWritable` / `getFile` / `move` / `entries` / `removeEntry`），
 * 服务层不再直接接触句柄。浏览器行为以此模块为准，桌面后端只需实现同一组语义。
 *
 * @module rxdb-plugin-storage/filesystem/opfs-filesystem
 */

import { StorageUnavailableError } from '../errors.js';
import {
  getDirectoryPathFromOpfsPath,
  getFileNameFromOpfsPath,
  normalizeDirectoryPath,
  normalizeRelativeOpfsPath
} from '../paths.js';
import type {
  StorageFilesystem,
  StorageFilesystemEntry,
  StorageFilesystemFactory,
  StorageFileWriter
} from './storage-filesystem.js';
import { isStorageNotFoundError } from './storage-filesystem.js';

type StorageDirectoryItemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, StorageDirectoryItemHandle]>;
};

type StorageManagerWithDirectory = StorageManager & {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
};

type MovableFileSystemHandle = FileSystemHandle & {
  move(destination: FileSystemDirectoryHandle | string, name?: string): Promise<void>;
};

/** `abort()` 是较新的规范增补，老实现（以及测试替身）只有 `close()`。 */
type WritableWithOptionalAbort = FileSystemWritableFileStream & {
  abort?: (reason?: unknown) => Promise<void>;
};

const isStorageManagerWithDirectory = (value: unknown): value is StorageManagerWithDirectory => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { getDirectory?: unknown };
  return typeof candidate.getDirectory === 'function';
};

const isMovableFileSystemHandle = (handle: FileSystemHandle): handle is MovableFileSystemHandle =>
  typeof (handle as { move?: unknown }).move === 'function';

/**
 * 取目录条目迭代器。
 *
 * @throws {@link StorageUnavailableError} 当前环境的目录句柄没有 `entries()` 时抛出。
 */
const readDirectoryEntries = (
  handle: FileSystemDirectoryHandle
): AsyncIterableIterator<[string, StorageDirectoryItemHandle]> => {
  const entries = (handle as DirectoryHandleWithEntries).entries;
  if (typeof entries !== 'function') {
    throw new StorageUnavailableError('FileSystemDirectoryHandle.entries is not supported in this environment');
  }

  return entries.call(handle);
};

/** 把 OPFS 可写流适配成 {@link StorageFileWriter}。 */
class OpfsFileWriter implements StorageFileWriter {
  constructor(private readonly writable: WritableWithOptionalAbort) {}

  async write(chunk: Blob | Uint8Array<ArrayBuffer>): Promise<void> {
    await this.writable.write(chunk);
  }

  async close(): Promise<void> {
    await this.writable.close();
  }

  /**
   * 丢弃本次写入。
   *
   * @remarks
   * 优先用 `abort()`：它保证已写入的分片不落盘。没有该方法时只能 `close()` 收尾 ——
   * 此时目标文件会留下半写内容，由服务层的快照补偿负责还原或删除。
   * 两条路径的异常都吞掉：这里只在错误处理路径上执行，再抛一次会盖住真正的失败原因。
   */
  async abort(reason: unknown): Promise<void> {
    if (typeof this.writable.abort === 'function') {
      try {
        await this.writable.abort(reason);
      } catch {
        return;
      }
      return;
    }

    try {
      await this.writable.close();
    } catch {
      return;
    }
  }
}

/** 把文件内容写进浏览器 OPFS 的默认后端。 */
export class OpfsStorageFilesystem implements StorageFilesystem {
  /** 已解析的存储根句柄；`dispose()` 后重新解析。 */
  #rootHandle: FileSystemDirectoryHandle | null = null;

  /** OPFS 下的跨上下文串行化由浏览器 Web Locks 承担，无需后端提供实现。 */
  readonly lockBackend: undefined = undefined;

  /** @param rootDir - 已规范化的存储根目录相对路径。 */
  constructor(private readonly rootDir: string) {}

  /** {@inheritDoc StorageFilesystem.ensureRoot} */
  async ensureRoot(): Promise<void> {
    await this.getRootHandle();
  }

  /** {@inheritDoc StorageFilesystem.ensureDirectory} */
  async ensureDirectory(directoryPath: string): Promise<void> {
    await this.getDirectoryHandle(directoryPath, true);
  }

  /** {@inheritDoc StorageFilesystem.directoryExists} */
  async directoryExists(directoryPath: string): Promise<boolean> {
    try {
      await this.getDirectoryHandle(directoryPath);
      return true;
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  /** {@inheritDoc StorageFilesystem.removeDirectory} */
  async removeDirectory(directoryPath: string): Promise<void> {
    try {
      const relativePath = normalizeDirectoryPath(directoryPath).slice(1);
      const parentHandle = await this.getDirectoryHandle(getDirectoryPathFromOpfsPath(relativePath));
      await parentHandle.removeEntry(getFileNameFromOpfsPath(relativePath), { recursive: true });
    } catch (error) {
      if (!isStorageNotFoundError(error)) {
        throw error;
      }
    }
  }

  /** {@inheritDoc StorageFilesystem.list} */
  async *list(directoryPath: string): AsyncGenerator<StorageFilesystemEntry> {
    const directoryHandle = await this.getDirectoryHandle(directoryPath);

    for await (const [name, handle] of readDirectoryEntries(directoryHandle)) {
      yield { name, kind: handle.kind };
    }
  }

  /** {@inheritDoc StorageFilesystem.fileExists} */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.getFileHandle(filePath);
      return true;
    } catch (error) {
      if (isStorageNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  /** {@inheritDoc StorageFilesystem.readBlob} */
  async readBlob(filePath: string): Promise<Blob> {
    const fileHandle = await this.getFileHandle(filePath);
    return fileHandle.getFile();
  }

  /** {@inheritDoc StorageFilesystem.openRead} */
  async openRead(filePath: string): Promise<ReadableStream<Uint8Array>> {
    const file = await this.readBlob(filePath);
    return file.stream();
  }

  /** {@inheritDoc StorageFilesystem.openWrite} */
  async openWrite(filePath: string): Promise<StorageFileWriter> {
    const fileHandle = await this.getFileHandle(filePath, true);
    return new OpfsFileWriter(await fileHandle.createWritable());
  }

  /** {@inheritDoc StorageFilesystem.removeFile} */
  async removeFile(filePath: string): Promise<void> {
    try {
      const directoryHandle = await this.getDirectoryHandle(getDirectoryPathFromOpfsPath(filePath));
      await directoryHandle.removeEntry(getFileNameFromOpfsPath(filePath));
    } catch (error) {
      if (!isStorageNotFoundError(error)) {
        throw error;
      }
    }
  }

  /** {@inheritDoc StorageFilesystem.supportsFileMove} */
  async supportsFileMove(filePath: string): Promise<boolean> {
    return isMovableFileSystemHandle(await this.getFileHandle(filePath));
  }

  /** {@inheritDoc StorageFilesystem.moveFile} */
  async moveFile(fromPath: string, toPath: string): Promise<void> {
    const handle = await this.getFileHandle(fromPath);
    if (!isMovableFileSystemHandle(handle)) {
      throw new StorageUnavailableError(`OPFS file no longer supports move(): ${fromPath}`);
    }

    await this.applyMove(handle, fromPath, toPath);
  }

  /** {@inheritDoc StorageFilesystem.supportsDirectoryMove} */
  async supportsDirectoryMove(directoryPath: string): Promise<boolean> {
    return isMovableFileSystemHandle(await this.getDirectoryHandle(directoryPath));
  }

  /** {@inheritDoc StorageFilesystem.moveDirectory} */
  async moveDirectory(fromPath: string, toPath: string): Promise<void> {
    const handle = await this.getDirectoryHandle(fromPath);
    if (!isMovableFileSystemHandle(handle)) {
      throw new StorageUnavailableError(`OPFS directory no longer supports move(): ${fromPath}`);
    }

    await this.applyMove(handle, fromPath, toPath);
  }

  /** {@inheritDoc StorageFilesystem.dispose} */
  dispose(): void {
    this.#rootHandle = null;
  }

  /**
   * 执行原生移动。
   *
   * @remarks
   * 同父目录时走单参形式（`move(name)`）—— 这是 OPFS 的原地改名，
   * 跨目录才需要先解析目标父句柄。
   */
  private async applyMove(handle: MovableFileSystemHandle, fromPath: string, toPath: string): Promise<void> {
    const targetName = getFileNameFromOpfsPath(toPath);
    const targetParentPath = getDirectoryPathFromOpfsPath(toPath);

    if (getDirectoryPathFromOpfsPath(fromPath) === targetParentPath) {
      await handle.move(targetName);
      return;
    }

    await handle.move(await this.getDirectoryHandle(targetParentPath, true), targetName);
  }

  /**
   * 解析并缓存存储根句柄。
   *
   * @throws {@link StorageUnavailableError} 当前环境没有 OPFS 时抛出。
   */
  private async getRootHandle(): Promise<FileSystemDirectoryHandle> {
    if (this.#rootHandle) {
      return this.#rootHandle;
    }

    if (typeof navigator === 'undefined' || !('storage' in navigator)) {
      throw new StorageUnavailableError('navigator.storage is not available');
    }

    if (!isStorageManagerWithDirectory(navigator.storage)) {
      throw new StorageUnavailableError('Origin Private File System is not supported in this environment');
    }

    let currentHandle = await navigator.storage.getDirectory();

    for (const segment of this.rootDir.split('/').filter(Boolean)) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
    }

    this.#rootHandle = currentHandle;
    return currentHandle;
  }

  private async getDirectoryHandle(directoryPath: string, create = false): Promise<FileSystemDirectoryHandle> {
    let currentHandle = await this.getRootHandle();

    for (const segment of normalizeDirectoryPath(directoryPath).split('/').filter(Boolean)) {
      currentHandle =
        create ?
          await currentHandle.getDirectoryHandle(segment, { create: true })
        : await currentHandle.getDirectoryHandle(segment);
    }

    return currentHandle;
  }

  private async getFileHandle(filePath: string, create = false): Promise<FileSystemFileHandle> {
    const normalizedPath = normalizeRelativeOpfsPath(filePath);
    const fileName = getFileNameFromOpfsPath(normalizedPath);
    const directoryHandle = await this.getDirectoryHandle(getDirectoryPathFromOpfsPath(normalizedPath), create);

    return create ? directoryHandle.getFileHandle(fileName, { create: true }) : directoryHandle.getFileHandle(fileName);
  }
}

/** 创建 OPFS 后端；这是 storage 插件的默认 {@link StorageFilesystemFactory}。 */
export const createOpfsStorageFilesystem: StorageFilesystemFactory = rootDir => new OpfsStorageFilesystem(rootDir);
