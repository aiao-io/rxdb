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
import { createOpfsStorageFilesystem } from './filesystem/opfs-filesystem.js';
import type {
  StorageFilesystem,
  StorageFilesystemEntry,
  StorageFilesystemFactory,
  StorageFileWriter
} from './filesystem/storage-filesystem.js';
import { isStorageNotFoundError } from './filesystem/storage-filesystem.js';
import { ObjectUrlRegistry, StoragePreviewResult } from './object-url.js';
import { PathLockManager } from './path-lock.js';
import {
  getDirectoryPathFromOpfsPath,
  getFileNameFromOpfsPath,
  isOpfsPathInDirectory,
  isOpfsPathInsideDirectory,
  joinDirectoryAndFileName,
  joinDirectoryPath,
  normalizeDirectoryPath,
  normalizeRelativeOpfsPath,
  toAbsoluteStoragePath,
  validateStorageName
} from './paths.js';

// 再导出路径工具：让后端实现能复用同一套校验，而不反向依赖服务实现。
export {
  getDirectoryPathFromOpfsPath,
  getFileNameFromOpfsPath,
  isOpfsPathInDirectory,
  isOpfsPathInsideDirectory,
  joinDirectoryAndFileName,
  joinDirectoryPath,
  normalizeDirectoryPath,
  normalizeRelativeOpfsPath,
  toAbsoluteStoragePath
} from './paths.js';

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
type StorageMetaPatch = Pick<StorageFileMeta, 'name' | 'mimeType' | 'size' | 'opfsPath' | 'contentVersion'>;
type StorageFileState = { readonly backupPath: string } | null;
type DirectoryCopyJournal = {
  files: Array<{ opfsPath: string; previous: StorageFileState }>;
  createdDirectories: string[];
};
const EMPTY_WHERE: StorageFindWhere = { combinator: 'and', rules: [] };

/** Storage 插件安装选项。 */
export interface RxDBStoragePluginOptions {
  /** 存储根目录名；默认值为 `files`。 */
  rootDir?: string;
  /** 允许创建预览 URL 的最大字节数；默认值为 50 MiB。 */
  previewLimitBytes?: number;
  /**
   * 文件内容落盘用的后端工厂；缺省即浏览器 OPFS。
   *
   * @remarks
   * 桌面宿主用它把内容写进应用数据目录（US-504），使 metadata 与文件同属一个备份域。
   */
  filesystem?: StorageFilesystemFactory;
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

/**
 * 生成临时文件名里的随机段。
 *
 * @remarks
 * 用 `crypto.getRandomValues` 而不是 `crypto.randomUUID`：后者只在安全上下文里有定义，
 * 而本插件在 `http://` 的本地调试页上也要能跑。`Math.random()` 同样不行 ——
 * 它在多个上下文之间没有任何不相撞的保证，而这正是这段随机数存在的全部理由。
 */
const randomToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
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
 * 「按 fileId 锁住它当前所在路径」的最大尝试次数。
 *
 * @remarks
 * 每次尝试都要重读一次 metadata，因此上限不能太大；而路径被连续改名到用光配额，
 * 只可能是调用方在打转。宁可报冲突让上层重试，也不在锁上无界地兜圈子。
 */
const MAX_PATH_RELOCK_ATTEMPTS = 8;

/** 排队期间路径被改：这把锁保护的已经不是要动的那条路径。 */
const RELOCK = Symbol('relock');

const metaNotFoundError = (fileId: string): Error => new Error(`Storage file meta not found: ${fileId}`);

/**
 * 用 {@link StorageFilesystem} 保存文件、用 RxDB 保存 metadata 的文件存储服务。
 *
 * @remarks
 * 默认后端是浏览器 OPFS；桌面宿主可经 {@link RxDBStoragePluginOptions.filesystem} 换成原生文件。
 * 同一路径写入在当前实例内串行执行。{@link destroy} 会先拒绝新任务、等待已开始的写任务，
 * 再释放对象 URL 和后端句柄；销毁后的实例不能重新初始化。
 */
export class RxdbFileStorage {
  /** 已创建的后端实例；`destroy()` 后置空。 */
  #filesystem: StorageFilesystem | null = null;
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

  /**
   * 惰性创建的文件后端；根目录在首次访问时确定。
   *
   * @remarks
   * 判 `destroyed` 排在 `??=` 之前：`read` / `list` / `watch` 不计入 `#activeWrites`，
   * {@link destroy} 只等写操作，因此一次读取完全可能在 metadata 查询的 await 间隙里
   * 被整程销毁「跨过去」。此时若照常惰性创建，一个已销毁的实例会**重新**建出后端句柄 ——
   * 那个句柄不属于任何生命周期，再没有人会去关它。
   *
   * 只挡终态而不挡 `destroying`：destroy 正等着的那些在途写入还要继续访问后端，
   * 在 `destroying` 上就抛会把它自己等待的对象打断。
   *
   * @throws {@link StorageDestroyedError} 实例已销毁时抛出。
   */
  private get filesystem(): StorageFilesystem {
    return (this.#filesystem ??= (this.options.filesystem ?? createOpfsStorageFilesystem)(this.rootDir, {
      localAdapterName: this.rxdb.config.sync.local?.adapter
    }));
  }

  /**
   * 路径锁。
   *
   * @remarks
   * 后端提供 `lockBackend` 时用它仲裁跨上下文临界区（桌面多窗口共用一个 host），
   * 否则交给 {@link PathLockManager} 自行探测 Web Locks。
   */
  private get locks(): PathLockManager {
    if (this.#locks) {
      return this.#locks;
    }

    const scope = `rxdb-storage:${this.rootDir}`;
    const lockBackend = this.filesystem.lockBackend;
    this.#locks = lockBackend ? new PathLockManager(scope, lockBackend) : new PathLockManager(scope);
    return this.#locks;
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
   * 初始化存储根目录。
   *
   * @throws {@link StorageUnavailableError} 当前环境不支持所选后端时抛出。
   * @throws {@link StorageDestroyedError} 服务已开始销毁时抛出。
   */
  async init(): Promise<void> {
    this.assertActive();
    await this.filesystem.ensureRoot();
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
   * 读取 metadata 对应的文件快照。
   *
   * @returns 内容 Blob，`type` 恒为 metadata 记录的 MIME。
   * @throws 文件 ID 不存在、后端文件缺失或服务已销毁时抛出。
   */
  async read(fileId: string): Promise<Blob> {
    await this.ensureLocalReady();

    const meta = await this.getRequiredMeta(fileId);
    const blob = await this.filesystem.readBlob(meta.opfsPath);
    // MIME 的权威来源是 metadata，不是后端：OPFS 由浏览器按扩展名推断，桌面原生文件压根没有
    // MIME 概念（一律 application/octet-stream）。不在这里统一，`preview()` 拿到的 type
    // 就会随后端漂移 —— 同一个文件在浏览器里是 image/png、在桌面上是 octet-stream。
    return blob.type === meta.mimeType ? blob : blob.slice(0, blob.size, meta.mimeType);
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
      // click() 只是把下载**排进队列**，浏览器要到之后才去读这个 blob。
      // 同步 revoke 在部分浏览器上会赶在读取之前把 URL 拆掉，产出一个空文件 ——
      // 这种失败不抛错，只是悄悄给出坏文件。让出一个宏任务把读取排到回收之前。
      await new Promise(resolve => setTimeout(resolve, 0));
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
   * 孤立文件不会暴露给调用方，结果按目录优先、名称升序排列。
   */
  async listEntries(options: ListOptions = {}): Promise<StorageBrowserEntry[]> {
    await this.ensureLocalReady();

    const directoryPath = normalizeDirectoryPath(options.path);
    const directFiles = await this.list({ path: directoryPath });
    const fileMap = new Map(directFiles.map(meta => [meta.opfsPath, meta]));
    const entries: StorageBrowserEntry[] = [];

    for await (const { name, kind } of this.filesystem.list(directoryPath)) {
      if (kind === 'directory') {
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
      // STOR-002：建目录也要过锁。它与 renameDirectory / clear 争的是同一批目录句柄 ——
      // 后两者取独占锁，而 `withPaths` 与 `withExclusive` 互斥，因此挂上任意一条路径锁
      // 就够把「建到一半的目录被同时改名的父目录带走」挡在外面。
      await this.filesystem.ensureDirectory(directoryPath);
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

      // 目标路径由**源路径所在目录**推出，因此源路径变了目标也跟着变：只能在锁内定，
      // 不能拿锁外读到的那份算完就当数。
      const targetOf = (opfsPath: string): string =>
        normalizeRelativeOpfsPath(joinDirectoryAndFileName(getDirectoryPathFromOpfsPath(opfsPath), newName));

      // STOR-002：source 与 target 必须一次性一起锁住 —— 只锁其一时，另一路径上的
      // 并发 upload 会在预检之后、覆写之前提交，随后被本次的补偿回滚删掉。
      return await this.withCurrentPathLock(
        fileId,
        opfsPath => [opfsPath, targetOf(opfsPath)],
        async current => {
          if (current === null) throw metaNotFoundError(fileId);

          const targetOpfsPath = targetOf(current.opfsPath);
          if (targetOpfsPath === current.opfsPath) return current;

          return this.renameLocked(fileId, newName, targetOpfsPath, options);
        }
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

      // STOR-002：删除同样是「写 metadata → 删 OPFS → 失败则补偿」，必须与同路径的
      // upload / rename 串行，否则补偿会把并发写入的新内容一并删掉。
      const meta0 = await this.getRequiredMeta(fileId);
      await this.withPathLock([meta0.opfsPath], async () => {
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
      this.#filesystem?.dispose();
      this.#filesystem = null;
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
    if (await this.filesystem.supportsFileMove(originalMeta.opfsPath)) {
      return this.renameFileWithMove(
        meta,
        targetMeta,
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
      await this.writeBlobToPath(targetOpfsPath, blob);
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
      await this.filesystem.moveFile(originalMeta.opfsPath, targetOpfsPath);
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
          await this.filesystem.moveFile(targetOpfsPath, originalMeta.opfsPath);
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

    const canMoveSource = await this.filesystem.supportsDirectoryMove(sourcePath);
    const canMoveTarget = targetExists ? await this.filesystem.supportsDirectoryMove(targetPath) : true;
    if (canMoveSource && canMoveTarget) {
      return this.renameDirectoryWithMove(targetExists, sourcePath, targetPath, moves, targetMetas);
    }

    const backupPath = targetExists ? `/.rxdb-storage-journal-${Date.now()}-${randomToken()}` : null;
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
    targetExists: boolean,
    sourcePath: string,
    targetPath: string,
    moves: ReadonlyArray<{
      meta: StorageFileMeta;
      original: StorageMetaPatch;
      targetOpfsPath: string;
    }>,
    targetMetas: readonly StorageFileMeta[]
  ): Promise<string> {
    const parentPath = getDirectoryPathFromOpfsPath(targetPath.slice(1));
    const backupName = this.createTemporaryFilePath('directory');
    const backupPath = joinDirectoryPath(parentPath, backupName);
    const removedTargetMetas: StorageFileMeta[] = [];
    const attemptedMoves: Array<(typeof moves)[number]> = [];
    let targetMoved = false;
    let sourceMoved = false;

    try {
      if (targetExists) {
        await this.filesystem.moveDirectory(targetPath, backupPath);
        targetMoved = true;
      }
      for (const targetMeta of targetMetas) {
        await this.removeMeta(targetMeta);
        removedTargetMetas.push(targetMeta);
      }
      await this.filesystem.moveDirectory(sourcePath, targetPath);
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
          await this.filesystem.moveDirectory(targetPath, sourcePath);
        },
        async () => {
          if (!targetMoved) return;
          await this.filesystem.moveDirectory(backupPath, targetPath);
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
      // 先把条目物化成数组再删：边异步迭代目录边删除会打乱迭代器
      // （底层多为按索引推进的游标），删掉当前项后下一项被跳过，导致静默漏删。
      const entries: StorageFilesystemEntry[] = [];
      for await (const entry of this.filesystem.list('/')) {
        entries.push(entry);
      }

      for (const entry of entries) {
        if (entry.kind === 'directory') {
          await this.filesystem.removeDirectory(joinDirectoryPath('/', entry.name));
          continue;
        }
        await this.filesystem.removeFile(entry.name);
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
      const cached = await this.filesystem.readBlob(normalizedPath);
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
      //
      // 读回也在锁内：提交完就放锁，下一个持锁者（同路径的 upload / rename / delete）
      // 会在读到之前把文件换掉甚至删掉 —— 于是 `fetch()` 要么返回别人的内容，要么直接
      // 撞上「文件不存在」，而调用方拿到的是一次自称成功的下载。
      const committed = await this.withPathLock([normalizedPath], async () => {
        await this.commitFetchedFile(normalizedPath, temporaryPath, size, fileName, mimeType);
        return this.filesystem.readBlob(normalizedPath);
      });

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
    const temporaryFile = await this.filesystem.readBlob(temporaryPath);
    try {
      await this.writeBlobToPath(normalizedPath, temporaryFile);
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

  /**
   * 造一个不会与其他上下文相撞的临时文件名。
   *
   * @remarks
   * 序号只在**本实例内**递增，时间戳只有毫秒精度：同一毫秒里启动的两个标签页会
   * 生成一模一样的名字，于是各自的回滚快照互相覆盖 —— 回滚时还原出的是另一个页面的内容。
   * 随机段是这里唯一真正提供跨上下文唯一性的部分，时间戳与序号只留作可读的排序线索。
   */
  private createTemporaryFilePath(purpose: string): string {
    this.#temporaryFileSequence += 1;
    return `.rxdb-storage-${purpose}-${Date.now()}-${this.#temporaryFileSequence}-${randomToken()}`;
  }

  private async streamResponseToFile(response: Response, opfsPath: string, signal?: AbortSignal): Promise<number> {
    return this.streamReadableToFile(response.body, opfsPath, signal);
  }

  private async streamReadableToFile(
    stream: ReadableStream<Uint8Array> | null,
    opfsPath: string,
    signal?: AbortSignal
  ): Promise<number> {
    const writer = await this.filesystem.openWrite(opfsPath);
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
      throw metaNotFoundError(fileId);
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

  /** 带快照补偿的整块写入：失败时把目标恢复成写之前的样子。 */
  private async writeBlobToPath(opfsPath: string, blob: Blob): Promise<void> {
    const previous = await this.readFileIfExists(opfsPath);
    try {
      await this.writeBlobWithoutRollback(opfsPath, blob);
    } catch (error) {
      return this.throwAfterRollback(error, () => this.restoreFileState(opfsPath, previous));
    }
    await this.discardFileState(previous);
  }

  private async writeBlobWithoutRollback(opfsPath: string, blob: Blob): Promise<void> {
    let writer: StorageFileWriter | undefined;
    try {
      writer = await this.filesystem.openWrite(opfsPath);
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
   * 清理 `showSaveFilePicker` 拿到的可写流。
   *
   * @remarks
   * 这条路径上的句柄来自用户选择的**存储根之外**的位置，不经 {@link StorageFilesystem}，
   * 因此这里保留独立的收尾逻辑。语义与后端写入句柄的 `abort()` 一致：优先 `abort()`，
   * 没有则 `close()`，两者的异常都吞掉 —— 再抛一次会盖住真正的失败原因。
   */
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
      await this.writeBlobToPath(opfsPath, file);
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
   * 锁住 `fileId` **当前**所在的那条路径并执行 `fn`；排队期间路径若被改掉就重新加锁。
   *
   * @param fileId - 目标文件的 metadata ID
   * @param paths - 由当前 `opfsPath` 推出本次要锁的全部路径（rename 还要带上目标路径）
   * @param fn - 临界区；收到锁内重读的 meta，`null` 表示文件在排队期间已被删除
   * @returns `fn` 的返回值
   * @throws {@link StorageConflictError} 连续 {@link MAX_PATH_RELOCK_ATTEMPTS} 次都没锁住同一条路径时抛出。
   *
   * @remarks
   * 路径锁保护的是**路径**，而 `rename` / `delete` 要保护的是**文件**，两者只在「meta 没变」
   * 时才重合。按锁外读到的 `opfsPath` 加锁，再在锁内重读 meta，仍会撞上这条交错：读到
   * `/a.txt` → 排队期间另一个 rename 把它改成 `/b.txt` → 本次拿到的是 `/a.txt` 的锁，
   * 动的却是 `/b.txt`。此时 `/b.txt` 上的并发 upload 完全不受阻，删除的补偿逻辑照样会把
   * 它刚提交的文件删掉 —— 正是 STOR-002 要根除的那类「删掉别人已提交的文件」。
   *
   * 所以锁内重读之后还要**比对路径**：不一致就退出临界区、按新路径重来，而不是带着一把
   * 错的锁继续。`current === null` 不算不一致 —— 文件已经没了，这把锁保护的东西也没了。
   *
   * 次数有上限：每轮重试都要多读一次 metadata，而路径能被连续改到用光配额，只可能是调用方
   * 在打转。宁可报冲突让上层决定，也不在锁上无界地兜圈子。
   */
  private async withCurrentPathLock<T>(
    fileId: string,
    paths: (opfsPath: string) => ReadonlyArray<string>,
    fn: (current: StorageFileMeta | null) => Promise<T>
  ): Promise<T> {
    let lockedPath = '';
    for (let attempt = 0; attempt < MAX_PATH_RELOCK_ATTEMPTS; attempt += 1) {
      lockedPath = (await this.getRequiredMeta(fileId)).opfsPath;
      const outcome = await this.withPathLock(paths(lockedPath), async () => {
        const current = await this.findMetaById(fileId);
        if (current !== null && current.opfsPath !== lockedPath) return RELOCK;
        return fn(current);
      });

      if (outcome !== RELOCK) return outcome;
    }

    throw new StorageConflictError(lockedPath);
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
   * 把当前内容流式复制到临时文件，作为可回滚快照。
   *
   * @param opfsPath - 存储根下的相对路径
   * @returns 临时备份路径；文件不存在时返回 `null`
   *
   * @remarks
   * 不能保留 {@link StorageFilesystem.readBlob} 返回的 snapshot 后再覆写源文件，也不能用
   * `arrayBuffer()` 把大文件整体复制进 JS 堆。临时文件与源文件状态脱钩，
   * 复制过程的内存上限由流 chunk 大小决定。
   */
  private async readFileIfExists(opfsPath: string): Promise<StorageFileState> {
    let backupPath: string | null = null;
    try {
      const source = await this.filesystem.openRead(opfsPath);
      backupPath = this.createTemporaryFilePath('rollback');
      await this.streamReadableToFile(source, backupPath);
      return { backupPath };
    } catch (error) {
      if (backupPath) await this.removeFile(backupPath);
      if (isStorageNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async restoreFileState(opfsPath: string, previous: StorageFileState): Promise<void> {
    if (previous) {
      const backup = await this.filesystem.openRead(previous.backupPath);
      await this.streamReadableToFile(backup, opfsPath);
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
        await this.removeDirectoryPath(directoryPath);
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

  private hasFile(opfsPath: string): Promise<boolean> {
    return this.filesystem.fileExists(opfsPath);
  }

  private hasDirectory(directoryPath: string): Promise<boolean> {
    return this.filesystem.directoryExists(directoryPath);
  }

  private async copyDirectory(sourcePath: string, targetPath: string, journal: DirectoryCopyJournal): Promise<void> {
    const targetExists = await this.hasDirectory(targetPath);
    await this.filesystem.ensureDirectory(targetPath);
    if (!targetExists) {
      journal.createdDirectories.push(targetPath);
    }

    for await (const { name, kind } of this.filesystem.list(sourcePath)) {
      if (kind === 'directory') {
        await this.copyDirectory(joinDirectoryPath(sourcePath, name), joinDirectoryPath(targetPath, name), journal);
        continue;
      }

      const targetOpfsPath = joinDirectoryAndFileName(targetPath, name);
      // 这里已经自己持有快照并登记进 journal，因此写入走不带回滚的那条：
      // 换成 writeBlobToPath 会让它再取一份同样的快照，等于把每个已有目标整份抄两遍。
      const previous = await this.readFileIfExists(targetOpfsPath);
      const file = await this.filesystem.readBlob(joinDirectoryAndFileName(sourcePath, name));
      try {
        await this.writeBlobWithoutRollback(targetOpfsPath, file);
      } catch (error) {
        return this.throwAfterRollback(error, () => this.restoreFileState(targetOpfsPath, previous));
      }
      journal.files.push({ opfsPath: targetOpfsPath, previous });
    }
  }

  private removeFile(opfsPath: string): Promise<void> {
    return this.filesystem.removeFile(opfsPath);
  }

  private removeDirectoryPath(directoryPath: string): Promise<void> {
    // 根目录本身不参与删除：`clear()` 只清空其内容，删掉根会让后续操作全部落空。
    if (directoryPath === '/') {
      return Promise.resolve();
    }

    return this.filesystem.removeDirectory(directoryPath);
  }
}
