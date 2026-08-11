/**
 * @fileoverview 文件存储服务实现
 * 基于 Origin Private File System (OPFS) 提供完整的文件存储能力
 *
 * 支持功能：
 * - 文件上传（upload）、读取（read）、下载（download）
 * - 文件预览（preview）、对象URL生成（createObjectUrl）
 * - 目录操作（createDirectory、renameDirectory）
 * - 文件操作（rename、delete、list、listEntries）
 * - 变化监听（watch）和存储清理（clear）
 *
 * @module rxdb-plugin-storage/storage-service
 */

import type { IRepository, RxDB } from '@aiao/rxdb';
import { defer, from, map, Observable, startWith, Subject, switchMap } from 'rxjs';
import {
  StorageConflictError,
  StorageDestroyedError,
  StorageFetchError,
  StorageFetchUrlConflictError,
  StorageInvalidPathError,
  StorageMimeTypeMissingError,
  StorageOfflineError,
  StoragePreviewLimitError,
  StorageUnavailableError
} from './errors.js';
import { StorageFileMeta } from './file-meta.entity.js';
import { ObjectUrlRegistry, StoragePreviewResult } from './object-url.js';
import { PathLockManager } from './path-lock.js';

const DEFAULT_PREVIEW_LIMIT_BYTES = 50 * 1024 * 1024;
type StorageMetaEntityType = typeof StorageFileMeta;
type StorageFindWhere = {
  combinator: 'and';
  rules: Array<{
    field: 'id' | 'opfsPath';
    operator: '=';
    value: string;
  }>;
};
type StorageFindOptions = {
  where: StorageFindWhere;
  limit?: number;
  offset?: number;
};
type LocalAdapterName = Parameters<RxDB['connect']>[0];
type StorageDirectoryItemHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, StorageDirectoryItemHandle]>;
};
type StorageManagerWithDirectory = StorageManager & {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
};
type MovableFileSystemHandle = FileSystemHandle & {
  move(name: string): Promise<void>;
};
type StorageMetaPatch = Pick<StorageFileMeta, 'name' | 'mimeType' | 'size' | 'opfsPath' | 'contentVersion'>;
type StorageFileState = { readonly backupPath: string } | null;
type DirectoryCopyJournal = {
  files: Array<{ opfsPath: string; previous: StorageFileState }>;
  createdDirectories: string[];
};
const EMPTY_WHERE: StorageFindWhere = { combinator: 'and', rules: [] };

/** Storage 插件安装选项。 */
export interface RxDBStoragePluginOptions {
  /** OPFS 下的存储根目录名；默认值为 `files`。 */
  rootDir?: string;
  /** 允许创建预览 URL 的最大字节数；默认值为 50 MiB。 */
  previewLimitBytes?: number;
}

/** 文件上传选项。 */
export interface UploadOptions {
  /** 目标目录；默认值为根目录 `/`。 */
  path?: string;
  /** 同路径已存在时是否原位替换内容并递增 `contentVersion`。 */
  overwrite?: boolean;
}

/** 文件下载选项。 */
export interface DownloadOptions {
  /** 保存对话框或浏览器下载使用的建议文件名；默认使用 metadata 中的名称。 */
  suggestedName?: string;
}

/** metadata 列表查询选项。 */
export interface ListOptions {
  /**
   * 要列出的目录，省略即整库。
   *
   * @remarks
   * `''` 与 `'/'` 等价，都表示根目录 —— 二者都会被 {@link normalizeDirectoryPath} 规范化为 `'/'`。
   * 想要「根目录及其全部子目录」请显式传 {@link ListOptions.recursive}，
   * 不要靠省略 `path` 来表达（STOR-005）。
   */
  path?: string;
  /**
   * 是否连同子目录一起返回。
   *
   * @defaultValue false（只返回 `path` 下的直属文件）
   * @remarks
   * 省略 `path` 时本选项无意义：不限定目录本就返回整库全部 metadata。
   */
  recursive?: boolean;
}

/** 目录创建选项。 */
export interface CreateDirectoryOptions {
  /** 新目录的父路径；默认值为根目录 `/`。 */
  path?: string;
}

/** 文件或目录重命名选项。 */
export interface RenameOptions {
  /**
   * 是否完整替换同名目标。
   *
   * 文件替换保留源 metadata ID；目录替换删除目标独有文件和 metadata，不做树合并。
   */
  overwrite?: boolean;
}

/**
 * 远程拉取选项。
 *
 * `fetch()` 通过它把远程 URL 缓存到 OPFS，并把 Blob 同步返回。
 */
export interface FetchRemoteOptions {
  /** 远程资源 URL，需返回 2xx；非 2xx 抛 {@link StorageFetchError}。 */
  url: string;
  /**
   * 强制覆盖返回 Blob 的 MIME 类型。
   *
   * 未提供时 fetch 将使用响应的 `Content-Type` 头（自动 strip `; charset=...` 等参数）；
   * 两者都缺失会抛 {@link StorageMimeTypeMissingError}，不做 `application/octet-stream` 兜底。
   */
  mimeType?: string;
  /** 透传给底层 fetch 的 AbortSignal；触发时抛 `AbortError`。 */
  signal?: AbortSignal;
}

/**
 * 从 `Content-Type` 头中剥离参数（charset / boundary 等），仅保留 `type/subtype`。
 *
 * `image/jpeg; charset=binary` → `image/jpeg`
 */
const stripMimeParameters = (value: string): string => {
  const semicolon = value.indexOf(';');
  return (semicolon === -1 ? value : value.slice(0, semicolon)).trim().toLowerCase();
};

/** 浏览目录时返回的子目录条目。 */
export interface StorageDirectoryEntry {
  /** 用于可辨识联合的目录标记。 */
  kind: 'directory';
  /** 目录名称。 */
  name: string;
  /** 以 `/` 开头的 storage 绝对路径。 */
  path: string;
}

/** 浏览目录时返回的文件条目。 */
export interface StorageFileEntry {
  /** 用于可辨识联合的文件标记。 */
  kind: 'file';
  /** 文件名称。 */
  name: string;
  /** 以 `/` 开头的 storage 绝对路径。 */
  path: string;
  /** 与 OPFS 文件对应的持久化 metadata。 */
  meta: StorageFileMeta;
}

/** {@link RxdbFileStorage.listEntries} 返回的目录或文件条目。 */
export type StorageBrowserEntry = StorageDirectoryEntry | StorageFileEntry;

const validateStoragePathSegments = (path: string): string[] => {
  if (path.includes('\\') || path.includes('\0')) {
    throw new StorageInvalidPathError(path);
  }

  const rawSegments = path.split('/');
  const segments: string[] = [];

  for (const [index, segment] of rawSegments.entries()) {
    const isBoundary = index === 0 || index === rawSegments.length - 1;
    if (segment === '' && isBoundary) {
      continue;
    }
    if (segment === '' || segment !== segment.trim() || segment === '.' || segment === '..') {
      throw new StorageInvalidPathError(path);
    }
    segments.push(segment);
  }

  return segments;
};

const validateStorageName = (name: string): string => {
  const segments = validateStoragePathSegments(name);
  if (segments.length !== 1 || name.includes('/')) {
    throw new StorageInvalidPathError(name);
  }
  return segments[0];
};

/**
 * 把目录路径规范化为以 `/` 开头且不带结尾 `/` 的形式。
 *
 * @throws {@link StorageInvalidPathError} 路径含空段、反斜杠、`.`、`..` 或首尾空白时抛出。
 */
export const normalizeDirectoryPath = (path?: string): string => {
  const source = path ?? '/';
  if (source === '') {
    return '/';
  }
  const segments = validateStoragePathSegments(source);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
};

/**
 * 等待 `task`，但在 `signal` abort 时**只拒绝本次等待**，不影响 `task` 自身。
 *
 * @remarks
 * STOR-003：多个调用方共享同一个 in-flight 下载时，跟随者取消自己的 signal
 * 不应该、也不能取消别人共用的下载；反过来，跟随者的 signal 也不能被无视 ——
 * 早先直接 `await inFlight` 就是后者，跟随者 abort 后仍会一直挂到下载结束。
 */
const raceAbortSignal = <T>(task: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return task;
  signal.throwIfAborted();

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    task.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
};

const readStreamChunk = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> => {
  if (!signal) return reader.read();
  signal.throwIfAborted();

  let onAbort: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([reader.read(), abort]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
};

/**
 * 把 storage 路径规范化为不带开头 `/` 的 OPFS 相对路径。
 *
 * @throws {@link StorageInvalidPathError} 路径包含非法段时抛出。
 */
export const normalizeRelativeOpfsPath = (path: string): string => validateStoragePathSegments(path).join('/');

/** 把 OPFS 相对路径转换成以 `/` 开头的 storage 绝对路径。 */
export const toAbsoluteStoragePath = (path?: string): string => {
  const normalized = normalizeRelativeOpfsPath(path ?? '');
  return normalized ? `/${normalized}` : '/';
};

/** 返回 OPFS 相对路径的最后一个路径段。 */
export const getFileNameFromOpfsPath = (opfsPath: string): string => {
  const normalized = normalizeRelativeOpfsPath(opfsPath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex === -1 ? normalized : normalized.slice(lastSlashIndex + 1);
};

/** 返回 OPFS 相对路径所在的 storage 绝对目录。 */
export const getDirectoryPathFromOpfsPath = (opfsPath: string): string => {
  const normalized = normalizeRelativeOpfsPath(opfsPath);
  const lastSlashIndex = normalized.lastIndexOf('/');
  return lastSlashIndex === -1 ? '/' : `/${normalized.slice(0, lastSlashIndex)}`;
};

/**
 * 连接 storage 目录和文件名，返回 OPFS 相对路径。
 *
 * @throws {@link StorageInvalidPathError} 目录或文件名非法时抛出。
 */
export const joinDirectoryAndFileName = (directoryPath: string | undefined, fileName: string): string => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedFileName = validateStorageName(fileName);

  return normalizedDirectoryPath === '/' ? normalizedFileName : (
      `${normalizedDirectoryPath.slice(1)}/${normalizedFileName}`
    );
};

/**
 * 连接父目录和子目录名，返回 storage 绝对路径。
 *
 * @throws {@link StorageInvalidPathError} 任一路径段非法时抛出。
 */
export const joinDirectoryPath = (directoryPath: string | undefined, directoryName: string): string => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedDirectoryName = validateStorageName(directoryName);

  return normalizedDirectoryPath === '/' ?
      `/${normalizedDirectoryName}`
    : `${normalizedDirectoryPath}/${normalizedDirectoryName}`;
};

/** 判断文件是否直属于指定目录。 */
export const isOpfsPathInDirectory = (opfsPath: string, directoryPath?: string): boolean =>
  getDirectoryPathFromOpfsPath(opfsPath) === normalizeDirectoryPath(directoryPath);

/** 判断文件是否位于指定目录或其任意子目录中。 */
export const isOpfsPathInsideDirectory = (opfsPath: string, directoryPath?: string): boolean => {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  if (normalizedDirectoryPath === '/') return true;

  const normalizedOpfsPath = normalizeRelativeOpfsPath(opfsPath);
  const normalizedDirectoryPrefix = `${normalizedDirectoryPath.slice(1)}/`;

  return (
    normalizedOpfsPath === normalizedDirectoryPath.slice(1) || normalizedOpfsPath.startsWith(normalizedDirectoryPrefix)
  );
};

const isNotFoundError = (error: unknown): boolean => {
  if (error instanceof DOMException) {
    return error.name === 'NotFoundError';
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'NotFoundError'
  );
};

const getDirectoryEntries = (
  handle: FileSystemDirectoryHandle
): AsyncIterableIterator<[string, StorageDirectoryItemHandle]> => {
  const entries = (handle as DirectoryHandleWithEntries).entries;
  if (typeof entries !== 'function') {
    throw new Error('FileSystemDirectoryHandle.entries is not supported in this environment');
  }

  return entries.call(handle);
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
 * 用 OPFS 保存文件、用 RxDB 保存 metadata 的文件存储服务。
 *
 * @remarks
 * 同一路径写入在当前实例内串行执行。{@link destroy} 会先拒绝新任务、等待已开始的写任务，
 * 再释放对象 URL 和 OPFS 句柄；销毁后的实例不能重新初始化。
 */
export class RxdbFileStorage {
  #rootHandle: FileSystemDirectoryHandle | null = null;
  readonly #changes$ = new Subject<void>();
  #lifecycle: 'active' | 'destroying' | 'destroyed' = 'active';
  #activeWrites = 0;
  #temporaryFileSequence = 0;
  readonly #writeIdleWaiters = new Set<() => void>();
  #destroyPromise: Promise<void> | null = null;
  /**
   * 进行中的远程拉取，按规范化 OPFS 路径索引。
   *
   * @remarks
   * 必须连同 `url` 一起记录：只按路径去重会让「同路径、不同 URL」的后到调用
   * 静默拿到前一个 URL 的字节（STOR-003）。
   */
  readonly #inFlightFetches = new Map<string, { readonly url: string; readonly task: Promise<Blob> }>();

  /** 进程内与同源跨上下文共用的路径锁；首次写入时按根目录建立命名空间。 */
  #locks: PathLockManager | null = null;

  private get previewLimitBytes(): number {
    return this.options.previewLimitBytes ?? DEFAULT_PREVIEW_LIMIT_BYTES;
  }

  private get rootDir(): string {
    return normalizeRelativeOpfsPath(this.options.rootDir || 'files');
  }

  private get locks(): PathLockManager {
    return (this.#locks ??= new PathLockManager(`rxdb-storage:${this.rootDir}`));
  }

  /** 当前由服务持有、尚未回收的对象 URL 数量。 */
  get activeObjectUrlCount(): number {
    return this.objectUrls.size;
  }

  /**
   * 创建文件存储服务。
   *
   * @param rxdb - metadata 所属 RxDB 实例。
   * @param options - OPFS 根目录与预览限制。
   * @param entityType - metadata 实体类型；主要用于测试或定制实体。
   * @param objectUrls - 对象 URL 所有权注册表。
   */
  constructor(
    private readonly rxdb: RxDB,
    private readonly options: RxDBStoragePluginOptions = {},
    private readonly entityType: StorageMetaEntityType = StorageFileMeta,
    private readonly objectUrls: ObjectUrlRegistry = new ObjectUrlRegistry()
  ) {}

  /**
   * 初始化 OPFS 根目录。
   *
   * @throws {@link StorageUnavailableError} 当前环境不支持 OPFS 时抛出。
   * @throws {@link StorageDestroyedError} 服务已开始销毁时抛出。
   */
  async init(): Promise<void> {
    this.assertActive();
    await this.getStorageRootHandle();
  }

  /**
   * 把文件写入 OPFS 并提交 metadata。
   *
   * @returns 新建或更新后的 metadata；覆盖时保留原 ID 并递增 `contentVersion`。
   * @throws {@link StorageConflictError} 目标已存在且未启用 overwrite 时抛出。
   * @throws {@link StorageDestroyedError} 服务已开始销毁时抛出。
   */
  async upload(file: File, options: UploadOptions = {}): Promise<StorageFileMeta> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      const opfsPath = joinDirectoryAndFileName(options.path, file.name);
      return await this.withPathLock([opfsPath], () => this.uploadLocked(file, options, opfsPath));
    } finally {
      finishWrite();
    }
  }

  /**
   * 读取 metadata 对应的 OPFS 文件快照。
   *
   * @throws 文件 ID 不存在、OPFS 文件缺失或服务已销毁时抛出。
   */
  async read(fileId: string): Promise<Blob> {
    await this.ensureLocalReady();

    const meta = await this.getRequiredMeta(fileId);
    const fileHandle = await this.getFileHandleByOpfsPath(meta.opfsPath);
    return fileHandle.getFile();
  }

  /**
   * 从远程 URL 拉取资源并持久化到 OPFS。
   *
   * 行为：
   * - 若 `opfsPath` 已存在缓存，直接返回缓存 Blob，不发请求（永久缓存，不做 ETag/TTL 判定）。
   * - 同一路径的并发调用共享同一 in-flight Promise；mimeType 不一致的后到 caller 会等
   *   in-flight 完成后从缓存读取（此时 OPFS 已就绪），独立应用自己的 mimeType 返回 — 但
   *   **不会修改已落盘的 meta.mimeType**：首个完成的 caller 决定 meta 上的 mime。
   * - `navigator.onLine === false` 立即抛 {@link StorageOfflineError}。
   * - 响应 MIME 取 `options.mimeType` ?? `Content-Type` 头（自动 strip 参数）；两者都缺抛
   *   {@link StorageMimeTypeMissingError}。
   * - `options.signal` 已 abort 立即抛 `AbortError`，下载中途 abort 不会污染缓存。
   *
   * @param opfsPath OPFS 内的相对路径（如 `images/foo.png`），将规范化后作为缓存 key。
   * @param options 见 {@link FetchRemoteOptions}。
   * @returns 持久化到 OPFS 的 Blob，`type` 等于最终 MIME。
   *
   * @remark cached 命中分支：`options.mimeType` 仅影响**本次返回 Blob 的 type**，
   *  不修改已存的 meta.mimeType；下次通过 `read(meta.id)` 读取仍是原 mime。
   */
  async fetch(opfsPath: string, options: FetchRemoteOptions): Promise<Blob> {
    const finishWrite = this.beginWrite();
    try {
      options.signal?.throwIfAborted();

      if (opfsPath.endsWith('/')) {
        throw new StorageInvalidPathError(opfsPath);
      }
      const normalizedPath = normalizeRelativeOpfsPath(opfsPath);
      if (!normalizedPath) {
        throw new StorageInvalidPathError(opfsPath);
      }
      validateStorageName(getFileNameFromOpfsPath(normalizedPath));
      const inFlight = this.#inFlightFetches.get(normalizedPath);

      if (inFlight) {
        // STOR-003：不同 URL 落到同一路径必须显式拒绝，不能把前一个 URL 的字节当成本次结果
        if (inFlight.url !== options.url) {
          throw new StorageFetchUrlConflictError(normalizedPath, inFlight.url, options.url);
        }
        // STOR-003：等待共享任务时只 race 本 waiter 自己的 signal —— 取消它不得取消
        // 其他调用者共享的下载
        const shared = await raceAbortSignal(inFlight.task, options.signal);
        if (!options.mimeType || options.mimeType === shared.type) {
          return shared;
        }
        return await this.fetchToOpfs(normalizedPath, options);
      }

      const task = this.fetchToOpfs(normalizedPath, options);
      this.#inFlightFetches.set(normalizedPath, { url: options.url, task });

      try {
        return await task;
      } finally {
        this.#inFlightFetches.delete(normalizedPath);
      }
    } finally {
      finishWrite();
    }
  }

  /**
   * 创建包含显式 dispose 所有权的预览结果。
   *
   * @throws {@link StoragePreviewLimitError} 文件超过配置的预览上限时抛出。
   */
  async preview(fileId: string): Promise<StoragePreviewResult> {
    const blob = await this.read(fileId);

    if (blob.size > this.previewLimitBytes) {
      throw new StoragePreviewLimitError(this.previewLimitBytes);
    }

    return this.objectUrls.createPreview(blob);
  }

  /**
   * 为文件创建由本服务持有的对象 URL。
   *
   * 调用方应使用 {@link revokeObjectUrl} 释放；{@link destroy} 会回收所有残留 URL。
   */
  async createObjectUrl(fileId: string): Promise<string> {
    const blob = await this.read(fileId);
    return this.objectUrls.create(blob);
  }

  /** 释放此前由 {@link createObjectUrl} 创建的 URL；重复释放是空操作。 */
  revokeObjectUrl(url: string): void {
    this.objectUrls.revoke(url);
  }

  /**
   * 通过文件选择器或浏览器下载链接保存文件。
   *
   * 只有用户取消文件选择器会静默返回；写入阶段的错误保持原样抛出。
   */
  async download(fileId: string, options: DownloadOptions = {}): Promise<void> {
    this.assertActive();
    const meta = await this.getRequiredMeta(fileId);
    const blob = await this.read(fileId);
    const suggestedName = options.suggestedName || meta.name;

    const windowWithPicker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };

    if (windowWithPicker.showSaveFilePicker) {
      // 只有「选择器阶段」的 AbortError 才是用户取消，可静默返回。
      // 写入阶段的 AbortError（磁盘满、写入被中断）若也吞掉，调用方会以为文件已保存 —— 静默假成功。
      let saveHandle: Awaited<ReturnType<NonNullable<typeof windowWithPicker.showSaveFilePicker>>>;
      try {
        saveHandle = await windowWithPicker.showSaveFilePicker({ suggestedName });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        throw error;
      }

      const writable = await saveHandle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await this.cleanupFailedWritable(writable, error);
        throw error;
      }
      return;
    }

    const url = this.objectUrls.create(blob);
    const anchor = document.createElement('a');
    let appended = false;

    try {
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      appended = true;
      anchor.click();
    } finally {
      if (appended) {
        anchor.remove();
      }
      this.objectUrls.revoke(url);
    }
  }

  /** 按 ID 返回 metadata；不存在时返回 `null`。 */
  async getMeta(fileId: string): Promise<StorageFileMeta | null> {
    await this.ensureLocalReady();
    return this.findMetaById(fileId);
  }

  /**
   * 列出 metadata。
   *
   * - 省略 `path`：返回整库全部 metadata（跨目录）。
   * - 指定 `path`：默认只返回该目录的**直属**文件；`recursive: true` 则连同子目录。
   *
   * @remarks
   * STOR-005：此前过滤条件写作 `options.path ? ... : true`，于是 `path: ''`
   * 虽然被 {@link normalizeDirectoryPath} 规范化成根目录，却因为空字符串是假值
   * 而落进「未限定目录」分支返回全树 —— 同一个规范化结果对应两套行为。
   * 现在一律以「`path` 是否被显式传入」判定，`''` 与 `'/'` 行为一致。
   * README 早先声称本方法「只返回当前目录直属文件」，与默认行为不符，已同步更正。
   */
  async list(options: ListOptions = {}): Promise<StorageFileMeta[]> {
    await this.ensureLocalReady();

    const allMetas = await this.getAllMetas();
    const scoped = options.path === undefined ? allMetas : this.filterMetasByDirectory(allMetas, options);

    return [...scoped].sort((left, right) => left.opfsPath.localeCompare(right.opfsPath));
  }

  /**
   * 列出指定目录的直属目录和已被 metadata 跟踪的直属文件。
   *
   * 孤立 OPFS 文件不会暴露给调用方，结果按目录优先、名称升序排列。
   */
  async listEntries(options: ListOptions = {}): Promise<StorageBrowserEntry[]> {
    await this.ensureLocalReady();

    const directoryPath = normalizeDirectoryPath(options.path);
    const directoryHandle = await this.getDirectoryHandleByPath(directoryPath);
    const directFiles = await this.list({ path: directoryPath });
    const fileMap = new Map(directFiles.map(meta => [meta.opfsPath, meta]));
    const entries: StorageBrowserEntry[] = [];

    for await (const [name, handle] of getDirectoryEntries(directoryHandle)) {
      if (handle.kind === 'directory') {
        entries.push({
          kind: 'directory',
          name,
          path: joinDirectoryPath(directoryPath, name)
        });
        continue;
      }

      const opfsPath = joinDirectoryAndFileName(directoryPath, name);
      const meta = fileMap.get(opfsPath);

      if (!meta) {
        continue;
      }

      entries.push({
        kind: 'file',
        name: meta.name,
        path: toAbsoluteStoragePath(meta.opfsPath),
        meta
      });
    }

    return entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }

  /**
   * 创建目录及缺失的父目录。
   *
   * @returns 新目录的 storage 绝对路径。
   */
  async createDirectory(name: string, options: CreateDirectoryOptions = {}): Promise<string> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      const directoryPath = joinDirectoryPath(options.path, name);
      await this.getDirectoryHandleByPath(directoryPath, true);
      return directoryPath;
    } finally {
      finishWrite();
    }
  }

  /**
   * 在原目录内重命名文件。
   *
   * 支持 OPFS `move()` 时优先原生移动；overwrite 会完整替换目标并保留源 metadata ID。
   */
  async rename(fileId: string, newName: string, options: RenameOptions = {}): Promise<StorageFileMeta> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      const meta = await this.getRequiredMeta(fileId);
      const targetOpfsPath = normalizeRelativeOpfsPath(
        joinDirectoryAndFileName(getDirectoryPathFromOpfsPath(meta.opfsPath), newName)
      );

      if (targetOpfsPath === meta.opfsPath) {
        return meta;
      }

      // STOR-002：source 与 target 必须一次性一起锁住 —— 只锁其一时，另一路径上的
      // 并发 upload 会在预检之后、覆写之前提交，随后被本次的补偿回滚删掉。
      return await this.withPathLock([meta.opfsPath, targetOpfsPath], () =>
        this.renameLocked(fileId, newName, targetOpfsPath, options)
      );
    } finally {
      finishWrite();
    }
  }

  /**
   * 在原父目录内重命名整棵目录树。
   *
   * overwrite 是 replace 语义：目标独有文件和 metadata 会删除，不会与源树合并。
   */
  async renameDirectory(directoryPath: string, newName: string, options: RenameOptions = {}): Promise<string> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      // STOR-002：目录改名影响的路径集合在开始前无法枚举完整（期间还会有新文件落进来），
      // 因此取独占锁而不是逐路径加锁。
      return await this.withExclusiveLock(() => this.renameDirectoryLocked(directoryPath, newName, options));
    } finally {
      finishWrite();
    }
  }

  /** 删除 metadata 及其 OPFS 文件；两者任一失败时执行补偿。 */
  async delete(fileId: string): Promise<void> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      const meta = await this.getRequiredMeta(fileId);
      // STOR-002：删除同样是「写 metadata → 删 OPFS → 失败则补偿」，必须与同路径的
      // upload / rename 串行，否则补偿会把并发写入的新内容一并删掉。
      await this.withPathLock([meta.opfsPath], async () => {
        const current = await this.findMetaById(fileId);
        if (!current) return;
        await this.deleteMetaAndFile(current);
      });
    } finally {
      finishWrite();
    }
  }

  /**
   * 观察单个文件的 metadata 变化。
   *
   * 订阅后立即发出当前值；删除后发出 `null`，服务销毁后流完成。
   */
  watch(fileId: string): Observable<StorageFileMeta | null> {
    return defer(() =>
      from(this.ensureLocalReady()).pipe(
        switchMap(() =>
          this.#changes$.pipe(
            startWith(undefined),
            switchMap(() => from(this.findMetaById(fileId)))
          )
        ),
        map(meta => meta ?? null)
      )
    );
  }

  /** 清空全部存储，或删除指定目录子树中的文件与 metadata。 */
  async clear(path?: string): Promise<void> {
    const finishWrite = this.beginWrite();
    try {
      await this.ensureLocalReady();

      // STOR-002：与 renameDirectory 同理，清库的作用域是整棵子树，取独占锁。
      await this.withExclusiveLock(() => this.clearLocked(path));
    } finally {
      finishWrite();
    }
  }

  /**
   * 永久销毁当前服务实例。
   *
   * 首次调用立即拒绝新任务，等待已开始的写任务结束，再回收资源；重复调用返回同一 Promise。
   */
  destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise;

    this.#lifecycle = 'destroying';
    this.#destroyPromise = this.waitForWrites().then(() => {
      this.objectUrls.clear();
      this.#changes$.complete();
      this.#rootHandle = null;
      this.#lifecycle = 'destroyed';
    });
    return this.#destroyPromise;
  }

  private assertActive(): void {
    if (this.#lifecycle !== 'active') throw new StorageDestroyedError();
  }

  private beginWrite(): () => void {
    this.assertActive();
    this.#activeWrites += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.#activeWrites -= 1;
      if (this.#activeWrites !== 0) return;
      for (const resolve of this.#writeIdleWaiters) resolve();
      this.#writeIdleWaiters.clear();
    };
  }

  private waitForWrites(): Promise<void> {
    if (this.#activeWrites === 0) return Promise.resolve();
    return new Promise(resolve => this.#writeIdleWaiters.add(resolve));
  }

  private filterMetasByDirectory(metas: StorageFileMeta[], options: ListOptions): StorageFileMeta[] {
    const directoryPath = normalizeDirectoryPath(options.path);
    if (options.recursive === true) {
      return directoryPath === '/' ? metas : (
          metas.filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, directoryPath))
        );
    }
    return metas.filter(meta => isOpfsPathInDirectory(meta.opfsPath, directoryPath));
  }

  private async renameLocked(
    fileId: string,
    newName: string,
    targetOpfsPath: string,
    options: RenameOptions
  ): Promise<StorageFileMeta> {
    // 锁内重读：排队期间 meta 可能已被前一个持锁者改动
    const meta = await this.getRequiredMeta(fileId);
    const targetMeta = await this.findMetaByOpfsPath(targetOpfsPath);
    if (targetMeta && targetMeta.id !== fileId && options.overwrite !== true) {
      throw new StorageConflictError(targetOpfsPath);
    }
    if (!targetMeta && options.overwrite !== true && (await this.hasFile(targetOpfsPath))) {
      throw new StorageConflictError(targetOpfsPath);
    }
    const originalMeta = this.getMetaPatch(meta);
    const previousTarget = await this.readFileIfExists(targetOpfsPath);
    const sourceHandle = await this.getFileHandleByOpfsPath(originalMeta.opfsPath);
    if (isMovableFileSystemHandle(sourceHandle)) {
      return this.renameFileWithMove(
        meta,
        targetMeta,
        sourceHandle,
        validateStorageName(newName),
        targetOpfsPath,
        originalMeta,
        previousTarget
      );
    }

    const blob = await this.read(fileId);
    let removedTargetMeta: StorageFileMeta | null = null;
    let updatedMeta: StorageFileMeta | null = null;
    try {
      if (targetMeta && targetMeta.id !== fileId) {
        await this.removeMeta(targetMeta);
        removedTargetMeta = targetMeta;
      }
      await this.writeBlobToFileHandle(targetOpfsPath, blob);
      updatedMeta = await this.updateMeta(meta, {
        ...originalMeta,
        name: validateStorageName(newName),
        opfsPath: targetOpfsPath
      });
      await this.removeFile(originalMeta.opfsPath);
      await this.discardFileState(previousTarget);
      return updatedMeta;
    } catch (error) {
      return this.throwAfterRollback(
        error,
        () => (updatedMeta ? this.updateMeta(updatedMeta, originalMeta).then(() => undefined) : Promise.resolve()),
        () => (removedTargetMeta ? this.createMeta(removedTargetMeta).then(() => undefined) : Promise.resolve()),
        () => this.restoreFileState(targetOpfsPath, previousTarget)
      );
    }
  }

  private async renameFileWithMove(
    meta: StorageFileMeta,
    targetMeta: StorageFileMeta | null,
    sourceHandle: MovableFileSystemHandle,
    newName: string,
    targetOpfsPath: string,
    originalMeta: StorageMetaPatch,
    previousTarget: StorageFileState
  ): Promise<StorageFileMeta> {
    let removedTargetMeta: StorageFileMeta | null = null;
    let updatedMeta: StorageFileMeta | null = null;
    let moved = false;

    try {
      if (targetMeta && targetMeta.id !== meta.id) {
        await this.removeMeta(targetMeta);
        removedTargetMeta = targetMeta;
      }
      await this.removeFile(targetOpfsPath);
      await sourceHandle.move(newName);
      moved = true;
      updatedMeta = await this.updateMeta(meta, {
        ...originalMeta,
        name: newName,
        opfsPath: targetOpfsPath
      });
      await this.discardFileState(previousTarget);
      return updatedMeta;
    } catch (error) {
      return this.throwAfterRollback(
        error,
        () => (updatedMeta ? this.updateMeta(updatedMeta, originalMeta).then(() => undefined) : Promise.resolve()),
        async () => {
          if (!moved) return;
          const targetHandle = await this.getFileHandleByOpfsPath(targetOpfsPath);
          if (!isMovableFileSystemHandle(targetHandle)) {
            throw new Error('Moved OPFS file no longer supports move()');
          }
          await targetHandle.move(originalMeta.name);
        },
        () => (removedTargetMeta ? this.createMeta(removedTargetMeta).then(() => undefined) : Promise.resolve()),
        () => this.restoreFileState(targetOpfsPath, previousTarget)
      );
    }
  }

  private async renameDirectoryLocked(directoryPath: string, newName: string, options: RenameOptions): Promise<string> {
    const sourcePath = normalizeDirectoryPath(directoryPath);
    if (sourcePath === '/') {
      throw new Error('Root directory cannot be renamed');
    }

    const targetPath = normalizeDirectoryPath(
      joinDirectoryPath(getDirectoryPathFromOpfsPath(sourcePath.slice(1)), newName)
    );

    if (targetPath === sourcePath) {
      return sourcePath;
    }

    const targetExists = await this.hasDirectory(targetPath);
    if (targetExists && options.overwrite !== true) {
      throw new Error(`Directory already exists at path: ${targetPath}`);
    }

    const allMetas = await this.getAllMetas();
    const sourcePrefix = normalizeRelativeOpfsPath(sourcePath);
    const targetPrefix = normalizeRelativeOpfsPath(targetPath);
    const moves = allMetas
      .filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, sourcePath))
      .map(meta => {
        const original = this.getMetaPatch(meta);
        const relativeOpfsPath = original.opfsPath.slice(sourcePrefix.length).replace(/^\//, '');
        return {
          meta,
          original,
          targetOpfsPath: [targetPrefix, relativeOpfsPath].filter(Boolean).join('/')
        };
      });

    const targetMetas = allMetas.filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, targetPath));
    if (options.overwrite !== true && targetMetas.length > 0) {
      throw new StorageConflictError(targetMetas[0].opfsPath);
    }

    const sourceHandle = await this.getDirectoryHandleByPath(sourcePath);
    const targetHandle = targetExists ? await this.getDirectoryHandleByPath(targetPath) : null;
    if (isMovableFileSystemHandle(sourceHandle) && (!targetHandle || isMovableFileSystemHandle(targetHandle))) {
      return this.renameDirectoryWithMove(sourceHandle, targetHandle, sourcePath, targetPath, moves, targetMetas);
    }

    const backupPath =
      targetExists ? `/.rxdb-storage-journal-${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
    const backupJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
    const copyJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
    const removedTargetMetas: StorageFileMeta[] = [];
    const attemptedMoves: typeof moves = [];

    if (backupPath) {
      try {
        await this.copyDirectory(targetPath, backupPath, backupJournal);
      } catch (error) {
        return this.throwAfterRollback(
          error,
          () => this.rollbackDirectoryCopy(backupJournal),
          () => this.removeDirectoryPath(backupPath)
        );
      }
    }

    try {
      for (const targetMeta of targetMetas) {
        await this.removeMeta(targetMeta);
        removedTargetMetas.push(targetMeta);
      }
      if (targetExists) await this.removeDirectoryPath(targetPath);
      await this.copyDirectory(sourcePath, targetPath, copyJournal);
      for (const move of moves) {
        attemptedMoves.push(move);
        await this.updateMeta(move.meta, { ...move.original, opfsPath: move.targetOpfsPath });
      }
      await this.removeDirectoryPath(sourcePath);
    } catch (error) {
      return this.throwAfterRollback(
        error,
        () => this.rollbackMetaMoves(attemptedMoves),
        () => this.rollbackDirectoryCopy(copyJournal),
        () => this.removeDirectoryPath(targetPath),
        () => this.restoreDirectoryBackup(backupPath, targetPath),
        () => this.restoreRemovedMetas(removedTargetMetas),
        () => (backupPath ? this.removeDirectoryPath(backupPath) : Promise.resolve())
      );
    }

    await this.discardDirectoryJournal(copyJournal);
    await this.discardDirectoryJournal(backupJournal);
    if (backupPath) await this.removeDirectoryPath(backupPath);
    return targetPath;
  }

  private async renameDirectoryWithMove(
    sourceHandle: MovableFileSystemHandle,
    targetHandle: MovableFileSystemHandle | null,
    sourcePath: string,
    targetPath: string,
    moves: ReadonlyArray<{
      meta: StorageFileMeta;
      original: StorageMetaPatch;
      targetOpfsPath: string;
    }>,
    targetMetas: readonly StorageFileMeta[]
  ): Promise<string> {
    const sourceName = getFileNameFromOpfsPath(sourcePath.slice(1));
    const targetName = getFileNameFromOpfsPath(targetPath.slice(1));
    const parentPath = getDirectoryPathFromOpfsPath(targetPath.slice(1));
    const backupName = this.createTemporaryFilePath('directory');
    const backupPath = joinDirectoryPath(parentPath, backupName);
    const removedTargetMetas: StorageFileMeta[] = [];
    const attemptedMoves: Array<(typeof moves)[number]> = [];
    let targetMoved = false;
    let sourceMoved = false;

    try {
      if (targetHandle) {
        await targetHandle.move(backupName);
        targetMoved = true;
      }
      for (const targetMeta of targetMetas) {
        await this.removeMeta(targetMeta);
        removedTargetMetas.push(targetMeta);
      }
      await sourceHandle.move(targetName);
      sourceMoved = true;
      for (const move of moves) {
        attemptedMoves.push(move);
        await this.updateMeta(move.meta, { ...move.original, opfsPath: move.targetOpfsPath });
      }
    } catch (error) {
      return this.throwAfterRollback(
        error,
        () => this.rollbackMetaMoves(attemptedMoves),
        async () => {
          if (!sourceMoved) return;
          const movedSource = await this.getDirectoryHandleByPath(targetPath);
          if (!isMovableFileSystemHandle(movedSource)) {
            throw new Error('Moved OPFS directory no longer supports move()');
          }
          await movedSource.move(sourceName);
        },
        async () => {
          if (!targetMoved) return;
          const movedTarget = await this.getDirectoryHandleByPath(backupPath);
          if (!isMovableFileSystemHandle(movedTarget)) {
            throw new Error('Moved OPFS directory backup no longer supports move()');
          }
          await movedTarget.move(targetName);
        },
        () => this.restoreRemovedMetas(removedTargetMetas)
      );
    }

    if (targetMoved) await this.removeDirectoryPath(backupPath);
    return targetPath;
  }

  private async restoreDirectoryBackup(backupPath: string | null, targetPath: string): Promise<void> {
    if (!backupPath || !(await this.hasDirectory(backupPath))) return;
    const restoreJournal: DirectoryCopyJournal = { files: [], createdDirectories: [] };
    await this.copyDirectory(backupPath, targetPath, restoreJournal);
    await this.discardDirectoryJournal(restoreJournal);
  }

  private async restoreRemovedMetas(metas: readonly StorageFileMeta[]): Promise<void> {
    const errors: unknown[] = [];
    for (const meta of metas) {
      try {
        await this.createMeta(meta);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to restore overwritten storage metadata');
  }

  private async clearLocked(path?: string): Promise<void> {
    const metas = await this.getAllMetas();
    const shouldRemoveAll = !path || normalizeDirectoryPath(path) === '/';
    const metasToRemove =
      shouldRemoveAll ? metas : metas.filter(meta => isOpfsPathInsideDirectory(meta.opfsPath, path));

    for (const meta of metasToRemove) {
      await this.deleteMetaAndFile(meta);
    }

    if (shouldRemoveAll) {
      const rootHandle = await this.getStorageRootHandle();

      // 先把条目物化成数组再删：边异步迭代 `entries()` 边 `removeEntry` 会打乱迭代器
      // （底层多为按索引推进的游标），删掉当前项后下一项被跳过，导致静默漏删。
      const entries: Array<[string, { kind: string }]> = [];
      for await (const entry of getDirectoryEntries(rootHandle)) {
        entries.push(entry as [string, { kind: string }]);
      }

      for (const [name, handle] of entries) {
        await rootHandle.removeEntry(name, handle.kind === 'directory' ? { recursive: true } : undefined);
      }

      return;
    }

    if (!shouldRemoveAll) {
      await this.removeDirectoryPath(normalizeDirectoryPath(path));
    }
  }

  private async fetchToOpfs(normalizedPath: string, options: FetchRemoteOptions): Promise<Blob> {
    await this.ensureLocalReady();

    const existingMeta = await this.findMetaByOpfsPath(normalizedPath);

    if (existingMeta && (await this.hasFile(normalizedPath))) {
      const fileHandle = await this.getFileHandleByOpfsPath(normalizedPath);
      const cached = await fileHandle.getFile();
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
    const temporaryPath = this.createTemporaryFilePath('fetch');

    try {
      const size = await this.streamResponseToFile(response, temporaryPath, options.signal);
      options.signal?.throwIfAborted();

      // STOR-002：只对**提交阶段**加锁，不把网络下载圈进临界区 ——
      // 否则同路径的 upload 会被一次慢下载阻塞整程。提交阶段与 upload / rename 的
      // 「写文件 → 写 metadata → 补偿」是同一类临界区，必须串行。
      await this.withPathLock([normalizedPath], () =>
        this.commitFetchedFile(normalizedPath, temporaryPath, size, fileName, mimeType)
      );

      const committed = await (await this.getFileHandleByOpfsPath(normalizedPath)).getFile();
      return committed.slice(0, committed.size, mimeType);
    } finally {
      await this.removeFile(temporaryPath);
    }
  }

  private async commitFetchedFile(
    normalizedPath: string,
    temporaryPath: string,
    size: number,
    fileName: string,
    mimeType: string
  ): Promise<void> {
    // 锁内重读：排队期间同路径可能已被 upload / rename 改写
    const existingMeta = await this.findMetaByOpfsPath(normalizedPath);
    const previousFile = await this.readFileIfExists(normalizedPath);
    const temporaryFile = await (await this.getFileHandleByOpfsPath(temporaryPath)).getFile();
    try {
      await this.writeBlobToFileHandle(normalizedPath, temporaryFile);
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(normalizedPath, previousFile));
    }

    try {
      if (existingMeta) {
        await this.updateMeta(existingMeta, {
          name: fileName,
          mimeType,
          size,
          opfsPath: normalizedPath,
          contentVersion: (existingMeta.contentVersion || 0) + 1
        });
      } else {
        await this.createMeta(
          this.instantiateMeta({
            name: fileName,
            mimeType,
            size,
            opfsPath: normalizedPath,
            contentVersion: 1
          })
        );
      }
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(normalizedPath, previousFile));
    }
    await this.discardFileState(previousFile);
  }

  private createTemporaryFilePath(purpose: string): string {
    this.#temporaryFileSequence += 1;
    return `.rxdb-storage-${purpose}-${Date.now()}-${this.#temporaryFileSequence}`;
  }

  private async streamResponseToFile(response: Response, opfsPath: string, signal?: AbortSignal): Promise<number> {
    return this.streamReadableToFile(response.body, opfsPath, signal);
  }

  private async streamReadableToFile(
    stream: ReadableStream<Uint8Array> | null,
    opfsPath: string,
    signal?: AbortSignal
  ): Promise<number> {
    const fileHandle = await this.getFileHandleByOpfsPath(opfsPath, true);
    const writable = await fileHandle.createWritable();
    const reader = stream?.getReader();
    let size = 0;

    try {
      if (!reader) {
        await writable.write(new Blob([]));
        await writable.close();
        return 0;
      }

      while (true) {
        signal?.throwIfAborted();
        const chunk = await readStreamChunk(reader, signal);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        const writableChunk = new Uint8Array(chunk.value.byteLength);
        writableChunk.set(chunk.value);
        await writable.write(writableChunk);
      }
      signal?.throwIfAborted();
      await writable.close();
      return size;
    } catch (error) {
      await reader?.cancel(error).catch(() => undefined);
      await this.cleanupFailedWritable(writable, error);
      throw error;
    }
  }

  private async ensureLocalReady(): Promise<void> {
    this.assertActive();
    const localAdapter = this.rxdb.config.sync?.local;
    if (!localAdapter) {
      throw new StorageUnavailableError('RxDB local adapter is required for storage plugin');
    }

    const adapterName = localAdapter.adapter as LocalAdapterName;
    await this.rxdb.connect(adapterName);
    this.assertActive();
    await this.init();
  }

  private async getLocalRepository(): Promise<IRepository<StorageMetaEntityType>> {
    const localAdapter = this.rxdb.config.sync?.local;

    if (!localAdapter) {
      throw new StorageUnavailableError('RxDB local adapter is required for storage plugin');
    }

    const adapterName = localAdapter.adapter as LocalAdapterName;
    const adapter = await this.rxdb.connect(adapterName);
    return adapter.getRepository(this.entityType) as IRepository<StorageMetaEntityType>;
  }

  private instantiateMeta(initData: Partial<StorageFileMeta>): StorageFileMeta {
    const entityManager = this.rxdb.entityManager;
    if (entityManager) {
      return entityManager.instantiate(this.entityType, initData);
    }
    return new this.entityType(initData);
  }

  private async createMeta(meta: StorageFileMeta): Promise<StorageFileMeta> {
    const repository = await this.getLocalRepository();
    const createdMeta = (await repository.create(meta as InstanceType<StorageMetaEntityType>)) as StorageFileMeta;
    this.#changes$.next();
    return createdMeta;
  }

  private async updateMeta(meta: StorageFileMeta, patch: StorageMetaPatch): Promise<StorageFileMeta> {
    const repository = await this.getLocalRepository();
    const updatedMeta = (await repository.update(
      meta as InstanceType<StorageMetaEntityType>,
      patch as Partial<InstanceType<StorageMetaEntityType>>
    )) as StorageFileMeta;
    this.#changes$.next();
    return updatedMeta;
  }

  private async removeMeta(meta: StorageFileMeta): Promise<void> {
    const repository = await this.getLocalRepository();
    await repository.remove(meta as InstanceType<StorageMetaEntityType>);
    this.#changes$.next();
  }

  private getMetaPatch(meta: StorageFileMeta): StorageMetaPatch {
    return {
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size,
      opfsPath: meta.opfsPath,
      contentVersion: meta.contentVersion
    };
  }

  private async deleteMetaAndFile(meta: StorageFileMeta): Promise<void> {
    await this.removeMeta(meta);

    try {
      await this.removeFile(meta.opfsPath);
    } catch (error) {
      return this.throwAfterRollback(error, () => this.createMeta(meta).then(() => undefined));
    }
  }

  private async getRequiredMeta(fileId: string): Promise<StorageFileMeta> {
    const meta = await this.findMetaById(fileId);

    if (!meta) {
      throw new Error(`Storage file meta not found: ${fileId}`);
    }

    return meta;
  }

  private async findMetaById(fileId: string): Promise<StorageFileMeta | null> {
    const repository = await this.getLocalRepository();
    const options: StorageFindOptions = { where: this.buildIdWhere(fileId), limit: 1, offset: 0 };
    const metas = await repository.find(options);
    return (metas[0] ?? null) as StorageFileMeta | null;
  }

  private async findMetaByOpfsPath(opfsPath: string): Promise<StorageFileMeta | null> {
    const repository = await this.getLocalRepository();
    const where: StorageFindWhere = {
      combinator: 'and',
      rules: [
        {
          field: 'opfsPath',
          operator: '=',
          value: normalizeRelativeOpfsPath(opfsPath)
        }
      ]
    };
    const options: StorageFindOptions = { where, limit: 1, offset: 0 };
    const metas = await repository.find(options);

    return (metas[0] ?? null) as StorageFileMeta | null;
  }

  private async getAllMetas(): Promise<StorageFileMeta[]> {
    const repository = await this.getLocalRepository();
    const options: StorageFindOptions = { where: EMPTY_WHERE };
    const metas = (await repository.find(options)) as StorageFileMeta[];

    return metas.sort((left, right) => left.opfsPath.localeCompare(right.opfsPath));
  }

  private buildIdWhere(fileId: string): StorageFindWhere {
    return {
      combinator: 'and',
      rules: [
        {
          field: 'id',
          operator: '=',
          value: fileId
        }
      ]
    };
  }

  private async getStorageRootHandle(): Promise<FileSystemDirectoryHandle> {
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
    const rootDirSegments = this.rootDir.split('/').filter(Boolean);

    for (const segment of rootDirSegments) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
    }

    this.#rootHandle = currentHandle;
    return currentHandle;
  }

  private async getDirectoryHandleByPath(directoryPath: string, create = false): Promise<FileSystemDirectoryHandle> {
    let currentHandle = await this.getStorageRootHandle();

    for (const segment of normalizeDirectoryPath(directoryPath).split('/').filter(Boolean)) {
      currentHandle =
        create ?
          await currentHandle.getDirectoryHandle(segment, { create: true })
        : await currentHandle.getDirectoryHandle(segment);
    }

    return currentHandle;
  }

  private async getFileHandleByOpfsPath(opfsPath: string, create = false): Promise<FileSystemFileHandle> {
    const normalizedPath = normalizeRelativeOpfsPath(opfsPath);
    const directoryPath = getDirectoryPathFromOpfsPath(normalizedPath);
    const fileName = getFileNameFromOpfsPath(normalizedPath);
    const directoryHandle = await this.getDirectoryHandleByPath(directoryPath, create);

    return create ? directoryHandle.getFileHandle(fileName, { create: true }) : directoryHandle.getFileHandle(fileName);
  }

  private async writeBlobToFileHandle(opfsPath: string, blob: Blob): Promise<void> {
    const previous = await this.readFileIfExists(opfsPath);
    try {
      await this.writeBlobWithoutRollback(opfsPath, blob);
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(opfsPath, previous));
    }
    await this.discardFileState(previous);
  }

  private async writeBlobWithoutRollback(opfsPath: string, blob: Blob): Promise<void> {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      const fileHandle = await this.getFileHandleByOpfsPath(opfsPath, true);
      writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      if (writable) {
        await this.cleanupFailedWritable(writable, error);
      }
      throw error;
    }
  }

  private async cleanupFailedWritable(
    writable: Pick<FileSystemWritableFileStream, 'close'> & {
      abort?: (reason?: unknown) => Promise<void>;
    },
    error: unknown
  ): Promise<void> {
    if (typeof writable.abort === 'function') {
      try {
        await writable.abort(error);
      } catch {
        return;
      }
      return;
    }

    try {
      await writable.close();
    } catch {
      return;
    }
  }

  /**
   * `upload` 的临界区：检查 → 写文件 → 提交 meta 必须整段串行。
   *
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
  private async uploadLocked(file: File, options: UploadOptions, opfsPath: string): Promise<StorageFileMeta> {
    const existingMeta = await this.findMetaByOpfsPath(opfsPath);
    const previousFile = await this.readFileIfExists(opfsPath);

    if ((existingMeta || previousFile) && options.overwrite !== true) {
      await this.discardFileState(previousFile);
      throw new StorageConflictError(opfsPath);
    }

    try {
      await this.writeBlobToFileHandle(opfsPath, file);
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(opfsPath, previousFile));
    }

    let result: StorageFileMeta;
    try {
      if (existingMeta) {
        result = await this.updateMeta(existingMeta, {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          opfsPath,
          contentVersion: (existingMeta.contentVersion || 0) + 1
        });
      } else {
        result = await this.createMeta(
          this.instantiateMeta({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            opfsPath,
            contentVersion: 1
          })
        );
      }
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(opfsPath, previousFile));
    }
    await this.discardFileState(previousFile);
    return result;
  }

  /**
   * 把 `fn` 排到这些路径的串行队列尾部执行，保证同一路径的写操作互不交错。
   *
   * @param opfsPaths - 本次操作会读写的全部 OPFS 路径
   * @param fn - 需要串行执行的临界区
   * @returns `fn` 的返回值
   *
   * @remarks
   * 见 {@link PathLockManager}：一次性登记全部路径并按字典序排序，因此
   * `rename` 这类同时涉及 source/target 的操作不会与别人互相等待成环。
   */
  private withPathLock<T>(opfsPaths: ReadonlyArray<string>, fn: () => Promise<T>): Promise<T> {
    return this.locks.withPaths(opfsPaths, fn);
  }

  /**
   * 独占执行 `fn`，与**所有**路径级写操作互斥。
   *
   * @remarks
   * 目录改名与清库影响的路径集合无法在开始前枚举完整（期间还可能有新文件落进来），
   * 因此用独占模式而不是逐路径加锁 —— 这是 STOR-002 所说「目录操作锁定前缀」的
   * 保守实现：范围更大，但不会漏。
   */
  private withExclusiveLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.locks.withExclusive(fn);
  }

  /**
   * 把当前内容流式复制到临时 OPFS 文件，作为可回滚快照。
   *
   * @param opfsPath - OPFS 相对路径
   * @returns 临时备份路径；文件不存在时返回 `null`
   *
   * @remarks
   * 不能保留 `getFile()` 返回的 snapshot 后再覆写源文件，也不能用 `arrayBuffer()` 把大文件
   * 整体复制进 JS 堆。临时文件与源文件状态脱钩，复制过程的内存上限由流 chunk 大小决定。
   */
  private async readFileIfExists(opfsPath: string): Promise<StorageFileState> {
    let backupPath: string | null = null;
    try {
      const fileHandle = await this.getFileHandleByOpfsPath(opfsPath);
      const file = await fileHandle.getFile();
      backupPath = this.createTemporaryFilePath('rollback');
      await this.streamReadableToFile(file.stream(), backupPath);
      return { backupPath };
    } catch (error) {
      if (backupPath) await this.removeFile(backupPath);
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async restoreFileState(opfsPath: string, previous: StorageFileState): Promise<void> {
    if (previous) {
      const backup = await (await this.getFileHandleByOpfsPath(previous.backupPath)).getFile();
      await this.streamReadableToFile(backup.stream(), opfsPath);
      await this.removeFile(previous.backupPath);
      return;
    }

    await this.removeFile(opfsPath);
  }

  private async discardFileState(previous: StorageFileState): Promise<void> {
    if (previous) await this.removeFile(previous.backupPath);
  }

  private async throwAfterRollback(error: unknown, ...rollbacks: Array<() => Promise<void>>): Promise<never> {
    const rollbackErrors: unknown[] = [];
    for (const rollback of rollbacks) {
      try {
        await rollback();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (rollbackErrors.length > 0) {
      const message = error instanceof Error ? error.message : 'Storage operation failed';
      throw new AggregateError([error, ...rollbackErrors], message);
    }

    throw error;
  }

  private async rollbackMetaMoves(moves: Array<{ meta: StorageFileMeta; original: StorageMetaPatch }>): Promise<void> {
    const rollbackErrors: unknown[] = [];
    for (const move of [...moves].reverse()) {
      try {
        await this.updateMeta(move.meta, move.original);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(rollbackErrors, 'Failed to roll back storage metadata');
    }
  }

  private async rollbackDirectoryCopy(journal: DirectoryCopyJournal): Promise<void> {
    const rollbackErrors: unknown[] = [];
    for (const file of [...journal.files].reverse()) {
      try {
        await this.restoreFileState(file.opfsPath, file.previous);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    for (const directoryPath of [...journal.createdDirectories].reverse()) {
      try {
        await this.removeEmptyDirectoryPath(directoryPath);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(rollbackErrors, 'Failed to roll back copied storage directory');
    }
  }

  private async discardDirectoryJournal(journal: DirectoryCopyJournal): Promise<void> {
    const errors: unknown[] = [];
    for (const file of journal.files) {
      try {
        await this.discardFileState(file.previous);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to clean storage rollback journal');
  }

  private async removeEmptyDirectoryPath(directoryPath: string): Promise<void> {
    try {
      const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
      const relativePath = normalizedDirectoryPath.slice(1);
      const parentDirectoryPath = getDirectoryPathFromOpfsPath(relativePath);
      const directoryName = getFileNameFromOpfsPath(relativePath);
      const parentHandle = await this.getDirectoryHandleByPath(parentDirectoryPath);
      await parentHandle.removeEntry(directoryName, { recursive: true });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async hasFile(opfsPath: string): Promise<boolean> {
    try {
      await this.getFileHandleByOpfsPath(opfsPath);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  private async hasDirectory(directoryPath: string): Promise<boolean> {
    try {
      await this.getDirectoryHandleByPath(directoryPath);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  private async copyDirectory(sourcePath: string, targetPath: string, journal: DirectoryCopyJournal): Promise<void> {
    const sourceHandle = await this.getDirectoryHandleByPath(sourcePath);
    const targetExists = await this.hasDirectory(targetPath);
    await this.getDirectoryHandleByPath(targetPath, true);
    if (!targetExists) {
      journal.createdDirectories.push(targetPath);
    }

    for await (const [name, handle] of getDirectoryEntries(sourceHandle)) {
      if (handle.kind === 'directory') {
        await this.copyDirectory(joinDirectoryPath(sourcePath, name), joinDirectoryPath(targetPath, name), journal);
        continue;
      }

      const targetOpfsPath = joinDirectoryAndFileName(targetPath, name);
      const previous = await this.readFileIfExists(targetOpfsPath);
      const file = await (handle as FileSystemFileHandle).getFile();
      try {
        await this.writeBlobToFileHandle(targetOpfsPath, file);
      } catch (error) {
        return this.throwAfterRollback(error, () => this.restoreFileState(targetOpfsPath, previous));
      }
      journal.files.push({ opfsPath: targetOpfsPath, previous });
    }
  }

  private async removeFile(opfsPath: string): Promise<void> {
    try {
      const directoryPath = getDirectoryPathFromOpfsPath(opfsPath);
      const fileName = getFileNameFromOpfsPath(opfsPath);
      const directoryHandle = await this.getDirectoryHandleByPath(directoryPath);
      await directoryHandle.removeEntry(fileName);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async removeDirectoryPath(directoryPath: string): Promise<void> {
    if (directoryPath === '/') {
      return;
    }

    try {
      const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
      const parentDirectoryPath = getDirectoryPathFromOpfsPath(normalizedDirectoryPath.slice(1));
      const directoryName = getFileNameFromOpfsPath(normalizedDirectoryPath.slice(1));
      const parentHandle = await this.getDirectoryHandleByPath(parentDirectoryPath);
      await parentHandle.removeEntry(directoryName, { recursive: true });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }
}
