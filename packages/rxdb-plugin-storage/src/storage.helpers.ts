import type { RxDB } from '@aiao/rxdb';
import { StorageFileMeta } from './file-meta.entity.js';
import type { StorageFilesystemFactory } from './filesystem/storage-filesystem.js';

export const DEFAULT_PREVIEW_LIMIT_BYTES = 50 * 1024 * 1024;
export type StorageMetaEntityType = typeof StorageFileMeta;
export type StorageFindWhere = {
  combinator: 'and';
  rules: Array<{
    field: 'id' | 'opfsPath';
    operator: '=';
    value: string;
  }>;
};
export type StorageFindOptions = {
  where: StorageFindWhere;
  limit?: number;
  offset?: number;
};
export type LocalAdapterName = Parameters<RxDB['connect']>[0];
export type StorageMetaPatch = Pick<StorageFileMeta, 'name' | 'mimeType' | 'size' | 'opfsPath' | 'contentVersion'>;
export type StorageFileState = { readonly backupPath: string } | null;
export type DirectoryCopyJournal = {
  files: Array<{ opfsPath: string; previous: StorageFileState }>;
  createdDirectories: string[];
};
export const EMPTY_WHERE: StorageFindWhere = { combinator: 'and', rules: [] };

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
export const stripMimeParameters = (value: string): string => {
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
export const randomToken = (): string => {
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
export const raceAbortSignal = <T>(task: Promise<T>, signal?: AbortSignal): Promise<T> => {
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

export const readStreamChunk = async (
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
export const MAX_PATH_RELOCK_ATTEMPTS = 8;

/** 排队期间路径被改：这把锁保护的已经不是要动的那条路径。 */
export const RELOCK = Symbol('relock');

export const metaNotFoundError = (fileId: string): Error => new Error(`Storage file meta not found: ${fileId}`);

export async function throwAfterRollback(error: unknown, ...rollbacks: Array<() => Promise<void>>): Promise<never> {
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

/**
 * 清理 `showSaveFilePicker` 拿到的可写流。
 *
 * @remarks
 * 这条路径上的句柄来自用户选择的**存储根之外**的位置，不经 {@link StorageFilesystem}，
 * 因此这里保留独立的收尾逻辑。语义与后端写入句柄的 `abort()` 一致：优先 `abort()`，
 * 没有则 `close()`，两者的异常都吞掉 —— 再抛一次会盖住真正的失败原因。
 */
export async function cleanupFailedWritable(
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
