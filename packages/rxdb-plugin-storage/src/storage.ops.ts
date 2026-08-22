import { StorageConflictError, StorageFetchError, StorageMimeTypeMissingError, StorageOfflineError } from './errors.js';
import { StorageFileMeta } from './file-meta.entity.js';
import type { StorageFilesystem, StorageFileWriter } from './filesystem/storage-filesystem.js';
import { isStorageNotFoundError } from './filesystem/storage-filesystem.js';
import { getFileNameFromOpfsPath } from './paths.js';
import {
    readStreamChunk,
    stripMimeParameters,
    throwAfterRollback,
    type FetchRemoteOptions,
    type StorageFileState,
    type StorageMetaPatch,
    type UploadOptions
} from './storage.helpers.js';

/** 文件读写 / 拉取 / 上传 sibling 需要的 Host。 */
export interface StorageFileOpsHost {
  readonly filesystem: StorageFilesystem;
  ensureLocalReady(): Promise<void>;
  getRequiredMeta(fileId: string): Promise<StorageFileMeta>;
  findMetaByOpfsPath(opfsPath: string): Promise<StorageFileMeta | null>;
  hasFile(opfsPath: string): Promise<boolean>;
  hasDirectory(directoryPath: string): Promise<boolean>;
  getAllMetas(): Promise<StorageFileMeta[]>;
  getMetaPatch(meta: StorageFileMeta): StorageMetaPatch;
  createMeta(meta: StorageFileMeta): Promise<StorageFileMeta>;
  updateMeta(meta: StorageFileMeta, patch: StorageMetaPatch): Promise<StorageFileMeta>;
  removeMeta(meta: StorageFileMeta): Promise<void>;
  instantiateMeta(initData: Partial<StorageFileMeta>): StorageFileMeta;
  createTemporaryFilePath(purpose: string): string;
  withPathLock<T>(opfsPaths: ReadonlyArray<string>, fn: () => Promise<T>): Promise<T>;
  removeFile(opfsPath: string): Promise<void>;
  removeDirectoryPath(directoryPath: string): Promise<void>;
  read(fileId: string): Promise<Blob>;
}

export async function fetchToOpfs(
  host: StorageFileOpsHost,
  normalizedPath: string,
  options: FetchRemoteOptions
): Promise<Blob> {
  await host.ensureLocalReady();

  const existingMeta = await host.findMetaByOpfsPath(normalizedPath);

  if (existingMeta && (await host.hasFile(normalizedPath))) {
    const cached = await host.filesystem.readBlob(normalizedPath);
    return options.mimeType ? cached.slice(0, cached.size, options.mimeType) : cached;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new StorageOfflineError(normalizedPath, options.url);
  }

  let response: Response;
  try {
    response = await globalThis.fetch(options.url, { signal: options.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new StorageOfflineError(normalizedPath, options.url);
    }
    throw error;
  }

  if (!response.ok) {
    throw new StorageFetchError(normalizedPath, options.url, response.status);
  }

  const rawContentType = response.headers.get('content-type');
  const headerMimeType = rawContentType ? stripMimeParameters(rawContentType) : null;
  const mimeType = options.mimeType ?? headerMimeType;
  if (!mimeType) {
    throw new StorageMimeTypeMissingError(normalizedPath, options.url);
  }

  const fileName = getFileNameFromOpfsPath(normalizedPath);
  const temporaryPath = host.createTemporaryFilePath('fetch');

  try {
    const size = await streamResponseToFile(host, response, temporaryPath, options.signal);
    options.signal?.throwIfAborted();

    // STOR-002：只对**提交阶段**加锁，不把网络下载圈进临界区 ——
    // 否则同路径的 upload 会被一次慢下载阻塞整程。提交阶段与 upload / rename 的
    // 「写文件 → 写 metadata → 补偿」是同一类临界区，必须串行。
    //
    // 读回也在锁内：提交完就放锁，下一个持锁者（同路径的 upload / rename / delete）
    // 会在读到之前把文件换掉甚至删掉 —— 于是 `fetch()` 要么返回别人的内容，要么直接
    // 撞上「文件不存在」，而调用方拿到的是一次自称成功的下载。
    const committed = await host.withPathLock([normalizedPath], async () => {
      await commitFetchedFile(host, normalizedPath, temporaryPath, size, fileName, mimeType);
      return host.filesystem.readBlob(normalizedPath);
    });

    return committed.slice(0, committed.size, mimeType);
  } finally {
    await host.removeFile(temporaryPath);
  }
}

async function commitFetchedFile(
  host: StorageFileOpsHost,
  normalizedPath: string,
  temporaryPath: string,
  size: number,
  fileName: string,
  mimeType: string
): Promise<void> {
  // 锁内重读：排队期间同路径可能已被 upload / rename 改写
  const existingMeta = await host.findMetaByOpfsPath(normalizedPath);
  const previousFile = await readFileIfExists(host, normalizedPath);
  const temporaryFile = await host.filesystem.readBlob(temporaryPath);
  try {
    await writeBlobToPath(host, normalizedPath, temporaryFile);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, normalizedPath, previousFile));
  }

  try {
    if (existingMeta) {
      await host.updateMeta(existingMeta, {
        name: fileName,
        mimeType,
        size,
        opfsPath: normalizedPath,
        contentVersion: (existingMeta.contentVersion || 0) + 1
      });
    } else {
      await host.createMeta(
        host.instantiateMeta({
          name: fileName,
          mimeType,
          size,
          opfsPath: normalizedPath,
          contentVersion: 1
        })
      );
    }
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, normalizedPath, previousFile));
  }
  await discardFileState(host, previousFile);
}

async function streamResponseToFile(
  host: StorageFileOpsHost,
  response: Response,
  opfsPath: string,
  signal?: AbortSignal
): Promise<number> {
  return streamReadableToFile(host, response.body, opfsPath, signal);
}

export async function streamReadableToFile(
  host: StorageFileOpsHost,
  stream: ReadableStream<Uint8Array> | null,
  opfsPath: string,
  signal?: AbortSignal
): Promise<number> {
  const writer = await host.filesystem.openWrite(opfsPath);
  const reader = stream?.getReader();
  let size = 0;

  try {
    if (!reader) {
      await writer.write(new Blob([]));
      await writer.close();
      return 0;
    }

    while (true) {
      signal?.throwIfAborted();
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      const writableChunk = new Uint8Array(chunk.value.byteLength);
      writableChunk.set(chunk.value);
      await writer.write(writableChunk);
    }
    signal?.throwIfAborted();
    await writer.close();
    return size;
  } catch (error) {
    await reader?.cancel(error).catch(() => undefined);
    await writer.abort(error);
    throw error;
  }
}

/** 带快照补偿的整块写入：失败时把目标恢复成写之前的样子。 */
export async function writeBlobToPath(host: StorageFileOpsHost, opfsPath: string, blob: Blob): Promise<void> {
  const previous = await readFileIfExists(host, opfsPath);
  try {
    await writeBlobWithoutRollback(host, opfsPath, blob);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previous));
  }
  await discardFileState(host, previous);
}

export async function writeBlobWithoutRollback(host: StorageFileOpsHost, opfsPath: string, blob: Blob): Promise<void> {
  let writer: StorageFileWriter | undefined;
  try {
    writer = await host.filesystem.openWrite(opfsPath);
    await writer.write(blob);
    await writer.close();
  } catch (error) {
    if (writer) {
      await writer.abort(error);
    }
    throw error;
  }
}

/**
 * `upload` 的临界区：检查 → 写文件 → 提交 meta 必须整段串行。
 *
 * @param host - 文件操作 Host
 * @param file - 待上传文件
 * @param options - 上传选项
 * @param opfsPath - 已解析的目标路径（同时是锁粒度）
 * @returns 新建或更新后的元数据
 *
 * @remarks
 * 这一段是 check-then-act。无互斥时两个并发的同路径 `upload` 会双双通过冲突检查，
 * 随后 B 的 meta 因 `opfs_path` 唯一索引写入失败、回滚走 `restoreFileState(path, null)`
 * → `removeFile(path)`，**把 A 刚成功注册的文件删掉**，留下「meta 在、文件不在」的孤儿 meta。
 *
 * 浏览器支持 Web Locks 时，临界区还会经过按 `rootDir` 隔离的同源锁，覆盖不同 tab
 * 的 storage service；没有该 API 的非浏览器测试环境退回进程内协议。
 */
export async function uploadLocked(
  host: StorageFileOpsHost,
  file: File,
  options: UploadOptions,
  opfsPath: string
): Promise<StorageFileMeta> {
  const existingMeta = await host.findMetaByOpfsPath(opfsPath);
  const previousFile = await readFileIfExists(host, opfsPath);

  if ((existingMeta || previousFile) && options.overwrite !== true) {
    await discardFileState(host, previousFile);
    throw new StorageConflictError(opfsPath);
  }

  try {
    await writeBlobToPath(host, opfsPath, file);
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previousFile));
  }

  let result: StorageFileMeta;
  try {
    if (existingMeta) {
      result = await host.updateMeta(existingMeta, {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        opfsPath,
        contentVersion: (existingMeta.contentVersion || 0) + 1
      });
    } else {
      result = await host.createMeta(
        host.instantiateMeta({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          opfsPath,
          contentVersion: 1
        })
      );
    }
  } catch (error) {
    return throwAfterRollback(error, () => restoreFileState(host, opfsPath, previousFile));
  }
  await discardFileState(host, previousFile);
  return result;
}

export async function deleteMetaAndFile(host: StorageFileOpsHost, meta: StorageFileMeta): Promise<void> {
  await host.removeMeta(meta);

  try {
    await host.removeFile(meta.opfsPath);
  } catch (error) {
    return throwAfterRollback(error, () => host.createMeta(meta).then(() => undefined));
  }
}

/**
 * 把当前内容流式复制到临时文件，作为可回滚快照。
 *
 * @param host - 文件操作 Host
 * @param opfsPath - 存储根下的相对路径
 * @returns 临时备份路径；文件不存在时返回 `null`
 *
 * @remarks
 * 不能保留 {@link StorageFilesystem.readBlob} 返回的 snapshot 后再覆写源文件，也不能用
 * `arrayBuffer()` 把大文件整体复制进 JS 堆。临时文件与源文件状态脱钩，
 * 复制过程的内存上限由流 chunk 大小决定。
 */
export async function readFileIfExists(host: StorageFileOpsHost, opfsPath: string): Promise<StorageFileState> {
  let backupPath: string | null = null;
  try {
    const source = await host.filesystem.openRead(opfsPath);
    backupPath = host.createTemporaryFilePath('rollback');
    await streamReadableToFile(host, source, backupPath);
    return { backupPath };
  } catch (error) {
    if (backupPath) await host.removeFile(backupPath);
    if (isStorageNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function restoreFileState(
  host: StorageFileOpsHost,
  opfsPath: string,
  previous: StorageFileState
): Promise<void> {
  if (previous) {
    const backup = await host.filesystem.openRead(previous.backupPath);
    await streamReadableToFile(host, backup, opfsPath);
    await host.removeFile(previous.backupPath);
    return;
  }

  await host.removeFile(opfsPath);
}

export async function discardFileState(host: StorageFileOpsHost, previous: StorageFileState): Promise<void> {
  if (previous) await host.removeFile(previous.backupPath);
}
