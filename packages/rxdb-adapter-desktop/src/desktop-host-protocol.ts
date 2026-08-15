/**
 * renderer 与桌面 host 之间的线协议。
 *
 * @remarks
 * 协议刻意只使用**结构化克隆**能原样搬运的类型（`string` / `number` / `bigint` /
 * `Uint8Array` / `Date` / 纯数组与纯对象），因此 Electron `ipcRenderer.invoke`、
 * `MessagePort` 与 `worker_threads` 都能直接传输，不需要再套一层 JSON 编解码。
 * 这一点对 `bigint` rowId 与 `Uint8Array` blob 尤其重要：转成 JSON 会悄悄丢精度或变形。
 *
 * @module desktop-host-protocol
 */

import {
  SQLiteChangeType,
  type SqliteChangeEvent,
  type SQLiteCompatibleType,
  type SqliteResult
} from '@aiao/rxdb-adapter-sqlite-core';
import {
  isRxDBAdapterDesktopErrorCode,
  RxDBAdapterDesktopError,
  type RxDBAdapterDesktopErrorCode
} from './desktop-error.js';
import { assertSupportedDesktopStorage, type DesktopSqliteFileStorage } from './desktop-storage.js';

/**
 * 线协议版本。
 *
 * @remarks
 * renderer 在 `open` 响应里核对该值。host 与 renderer 来自同一次打包时它恒等，
 * 不等只可能发生在混装了不同版本的 `@aiao/rxdb-adapter-desktop` —— 那种情况下
 * 继续跑会产生难以定位的形状错误，因此直接拒绝连接。
 */
export const DESKTOP_HOST_PROTOCOL_VERSION = 1;

/** 单条 SQL 文本的长度上限。 */
export const DESKTOP_HOST_MAX_SQL_LENGTH = 1_000_000;

/** 单条请求允许的绑定参数个数上限。 */
export const DESKTOP_HOST_MAX_BINDINGS = 100_000;

/** 单个 blob 绑定参数的字节上限。 */
export const DESKTOP_HOST_MAX_BLOB_BYTES = 64 * 1024 * 1024;

/**
 * 单帧文件读写的字节上限。
 *
 * @remarks
 * 刻意远小于 {@link DESKTOP_HOST_MAX_BLOB_BYTES}：文件内容按帧搬运，一帧就是一次
 * 结构化克隆的峰值内存。取 4 MiB 让 GB 级文件也只在 renderer 堆上留下一帧的驻留，
 * 完整内容落在 Blob backing store 里（US-504 AC#5）。
 */
export const DESKTOP_HOST_MAX_FILE_CHUNK_BYTES = 4 * 1024 * 1024;

/** 相对存储根的路径整体长度上限（字符）。 */
export const DESKTOP_HOST_MAX_PATH_LENGTH = 1024;

/**
 * 单个路径分段的 UTF-8 字节上限。
 *
 * @remarks
 * 255 是 ext4 / APFS / NTFS 的共同下限，按字节而非字符计 —— 一个中文字符占 3 字节，
 * 按字符判定会在中文名上放过超限的分段。renderer 侧编码时用的是同一个数值，
 * 这里再判一次是因为 renderer 不可信。
 */
export const DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES = 255;

/** 打开一个数据库会话。 */
export interface DesktopHostOpenRequest {
  readonly kind: 'open';
  readonly storage: DesktopSqliteFileStorage;
  /**
   * 变更事件的防抖窗口（毫秒），省略时用 host 的默认值。
   *
   * @remarks
   * 与 wasm 客户端的同名选项同义。批处理落在 host 侧而不是 renderer 侧：
   * 合并发生在事件跨进程之前，省下的正是本来要一条条搬过 IPC 的那些消息。
   */
  readonly batchTimeout?: number;
}

/** 在已打开的会话上执行 SQL。 */
export interface DesktopHostExecuteRequest {
  readonly kind: 'execute';
  readonly sessionId: string;
  readonly sql: string;
  readonly bindings: readonly SQLiteCompatibleType[];
}

/** 查询会话所连数据库的引擎版本。 */
export interface DesktopHostVersionRequest {
  readonly kind: 'version';
  readonly sessionId: string;
}

/** 关闭会话并释放数据库句柄。 */
export interface DesktopHostCloseRequest {
  readonly kind: 'close';
  readonly sessionId: string;
}

/** renderer 可以发给 host 的全部请求。 */
export type DesktopHostRequest =
  DesktopHostOpenRequest | DesktopHostExecuteRequest | DesktopHostVersionRequest | DesktopHostCloseRequest;

/** `open` 请求的响应。 */
export interface DesktopHostOpenResult {
  readonly sessionId: string;
  /**
   * 已解析的**逻辑**位置，仅供诊断与日志（AC#3）。
   *
   * @remarks
   * 刻意不是物理绝对路径：renderer 拿到物理根目录等于拿到了额外的文件系统情报，
   * 而它并不需要这份情报就能工作。
   */
  readonly resolvedLocation: string;
  readonly protocolVersion: number;
  /** host 后端开启普通事务使用的 SQL。 */
  readonly beginTransactionSql: string;
  /** host 后端做系统 schema 迁移时使用的最强锁 SQL。 */
  readonly beginSystemMigrationTransactionSql: string;
}

/** host 主动推送给 renderer 的变更事件。 */
export interface DesktopHostChangeEventMessage {
  readonly kind: 'change';
  readonly sessionId: string;
  readonly event: SqliteChangeEvent;
}

/**
 * host 对一次请求的应答。
 *
 * @remarks
 * 失败也走**正常返回值**而不是 reject：Electron 的 `ipcRenderer.invoke` 在 reject 时只把
 * 错误序列化成字符串，自定义 `Error` 子类与它的 `code` 字段全部丢失。把错误码放进返回值里，
 * AC#4 承诺的「稳定、可判别的错误码」才能真的跨过进程边界活着到达调用方。
 */
export type DesktopHostResponse =
  | { readonly kind: 'open'; readonly result: DesktopHostOpenResult }
  | { readonly kind: 'execute'; readonly result: SqliteResult }
  | { readonly kind: 'version'; readonly result: string }
  | { readonly kind: 'close' }
  | { readonly kind: 'error'; readonly code: RxDBAdapterDesktopErrorCode; readonly message: string };

/**
 * 打开一个文件会话。
 *
 * @remarks
 * 会话是**资源归属的单位**：未提交的写入与已持有的锁都挂在它上面，窗口销毁时
 * host 按会话一次性回收。没有这层归属，一个崩掉的 renderer 会在磁盘上留下临时文件、
 * 在 host 里留下永不释放的锁，后续窗口随即死等（US-504 AC#5 / AC#7）。
 *
 * 存储根由 host 自行解析，请求里不带路径 —— renderer 拿到物理根等于拿到额外的
 * 文件系统情报，而它并不需要这份情报就能工作（AC#3）。
 */
export interface DesktopHostFileOpenRequest {
  readonly kind: 'file.open';
}

/** 关闭文件会话，连带回收其全部写入与锁。 */
export interface DesktopHostFileCloseRequest {
  readonly kind: 'file.close';
  readonly sessionId: string;
}

/** 单个路径上的只读元信息或结构操作。 */
export interface DesktopHostFilePathRequest {
  readonly kind: 'file.stat' | 'file.list' | 'file.mkdir' | 'file.rmdir' | 'file.remove';
  readonly sessionId: string;
  /** 相对存储根的物理路径；空串表示存储根自身。 */
  readonly path: string;
}

/** 原生 rename；文件与目录共用。 */
export interface DesktopHostFileMoveRequest {
  readonly kind: 'file.move';
  readonly sessionId: string;
  readonly fromPath: string;
  readonly toPath: string;
}

/** 按 `offset` + `length` 分帧拉取文件内容。 */
export interface DesktopHostFileReadRequest {
  readonly kind: 'file.read';
  readonly sessionId: string;
  readonly path: string;
  readonly offset: number;
  readonly length: number;
}

/** 开启一次写入：host 分配临时文件并返回写入令牌。 */
export interface DesktopHostFileWriteBeginRequest {
  readonly kind: 'file.writeBegin';
  readonly sessionId: string;
  readonly path: string;
}

/** 向未提交的写入追加一帧。 */
export interface DesktopHostFileWriteChunkRequest {
  readonly kind: 'file.writeChunk';
  readonly sessionId: string;
  readonly writeId: string;
  readonly chunk: Uint8Array;
}

/** 提交（rename 覆盖目标）或丢弃（删临时文件）一次写入。 */
export interface DesktopHostFileWriteFinishRequest {
  readonly kind: 'file.writeCommit' | 'file.writeAbort';
  readonly sessionId: string;
  readonly writeId: string;
}

/** 申请一把 host 仲裁的命名锁。 */
export interface DesktopHostFileLockAcquireRequest {
  readonly kind: 'file.lockAcquire';
  readonly sessionId: string;
  readonly name: string;
  readonly mode: DesktopHostFileLockMode;
}

/** 释放一把已持有的锁。 */
export interface DesktopHostFileLockReleaseRequest {
  readonly kind: 'file.lockRelease';
  readonly sessionId: string;
  readonly lockId: string;
}

/** 锁模式，与 Web Locks 的同名取值一致。 */
export type DesktopHostFileLockMode = 'shared' | 'exclusive';

/** renderer 可以发给文件 host 的全部请求。 */
export type DesktopHostFileRequest =
  | DesktopHostFileOpenRequest
  | DesktopHostFileCloseRequest
  | DesktopHostFilePathRequest
  | DesktopHostFileMoveRequest
  | DesktopHostFileReadRequest
  | DesktopHostFileWriteBeginRequest
  | DesktopHostFileWriteChunkRequest
  | DesktopHostFileWriteFinishRequest
  | DesktopHostFileLockAcquireRequest
  | DesktopHostFileLockReleaseRequest;

/** 目录条目：只有名称与类型，不泄漏物理路径。 */
export interface DesktopHostFileEntry {
  readonly name: string;
  readonly kind: 'directory' | 'file';
}

/** 单个路径的元信息；目标不存在时以 `null` 表达，而不是错误。 */
export interface DesktopHostFileStat {
  readonly kind: 'directory' | 'file';
  /** 文件字节数；目录恒为 0。 */
  readonly size: number;
  /** 最后修改时间（epoch 毫秒）。 */
  readonly lastModified: number;
}

/** `file.read` 的一帧结果。 */
export interface DesktopHostFileReadResult {
  /** 本帧内容；`length` 覆盖到文件尾时可能短于请求长度。 */
  readonly chunk: Uint8Array;
  /** 本帧读到文件尾时为 `true`。 */
  readonly eof: boolean;
}

/** host 对一次文件请求的应答，失败同样走正常返回值。 */
export type DesktopHostFileResponse =
  | { readonly kind: 'file.open'; readonly result: { readonly sessionId: string; readonly protocolVersion: number } }
  | { readonly kind: 'file.close' }
  | { readonly kind: 'file.stat'; readonly result: DesktopHostFileStat | null }
  | { readonly kind: 'file.list'; readonly result: readonly DesktopHostFileEntry[] }
  | { readonly kind: 'file.mkdir' }
  | { readonly kind: 'file.rmdir' }
  | { readonly kind: 'file.remove' }
  | { readonly kind: 'file.move' }
  | { readonly kind: 'file.read'; readonly result: DesktopHostFileReadResult }
  | { readonly kind: 'file.writeBegin'; readonly result: { readonly writeId: string } }
  | { readonly kind: 'file.writeChunk' }
  | { readonly kind: 'file.writeCommit' }
  | { readonly kind: 'file.writeAbort' }
  | { readonly kind: 'file.lockAcquire'; readonly result: { readonly lockId: string } }
  | { readonly kind: 'file.lockRelease' }
  | { readonly kind: 'error'; readonly code: RxDBAdapterDesktopErrorCode; readonly message: string };

const REQUEST_KINDS: readonly DesktopHostRequest['kind'][] = ['open', 'execute', 'version', 'close'];

const FILE_REQUEST_KINDS: readonly DesktopHostFileRequest['kind'][] = [
  'file.open',
  'file.close',
  'file.stat',
  'file.list',
  'file.mkdir',
  'file.rmdir',
  'file.remove',
  'file.move',
  'file.read',
  'file.writeBegin',
  'file.writeChunk',
  'file.writeCommit',
  'file.writeAbort',
  'file.lockAcquire',
  'file.lockRelease'
];

/** 允许以存储根（空路径）为目标的操作；其余必须指向一个具体条目。 */
const ROOT_ADDRESSABLE_KINDS: ReadonlySet<string> = new Set(['file.stat', 'file.list', 'file.mkdir']);

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANGE_TYPES: readonly SQLiteChangeType[] = [
  SQLiteChangeType.SQLITE_DELETE,
  SQLiteChangeType.SQLITE_INSERT,
  SQLiteChangeType.SQLITE_UPDATE
];

const violation = (message: string): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError('protocol_violation', message);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw violation('request must be a plain object');
  }
  return value as Record<string, unknown>;
};

const readUuid = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value)) {
    throw violation(`${key} must be a UUID string issued by the host`);
  }
  return value;
};

const readSessionId = (record: Record<string, unknown>): string => readUuid(record, 'sessionId');

const readSql = (record: Record<string, unknown>): string => {
  const sql = record['sql'];
  if (typeof sql !== 'string') throw violation('sql must be a string');
  if (sql.length > DESKTOP_HOST_MAX_SQL_LENGTH) {
    throw violation(`sql exceeds ${DESKTOP_HOST_MAX_SQL_LENGTH} characters`);
  }
  return sql;
};

const isNumberArray = (value: readonly unknown[]): boolean => value.every(item => typeof item === 'number');

const isBindingValue = (value: unknown): value is SQLiteCompatibleType => {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'number' || type === 'string' || type === 'bigint') return true;
  if (value instanceof Uint8Array) return value.byteLength <= DESKTOP_HOST_MAX_BLOB_BYTES;
  if (Array.isArray(value)) return value.length <= DESKTOP_HOST_MAX_BLOB_BYTES && isNumberArray(value);
  return false;
};

/**
 * `undefined` 归一成 SQL NULL。
 *
 * @remarks
 * 「undefined 即 NULL」是既有后端的既成契约：wa-sqlite 的 `bind_collection` 直接跳过 undefined 的位，
 * 而未绑定的参数在 SQLite 里读作 NULL；oo1 的 `bindOne` 则把 undefined 与 null 并到同一分支显式绑 NULL。
 * 可空外键（例如根节点的 `parentId`）因此会以 undefined 的形态一路走到这里，而 `node:sqlite` 不认它。
 * 归一化放在信任边界上，host 内部就只会见到已收敛的值。
 */
const normalizeBinding = (value: unknown): unknown => (value === undefined ? null : value);

const readBindings = (record: Record<string, unknown>): readonly SQLiteCompatibleType[] => {
  const bindings = record['bindings'];
  if (bindings === undefined) return [];
  if (!Array.isArray(bindings)) throw violation('bindings must be an array');
  if (bindings.length > DESKTOP_HOST_MAX_BINDINGS) {
    throw violation(`bindings exceed ${DESKTOP_HOST_MAX_BINDINGS} entries`);
  }
  return bindings.map((binding, index) => {
    const value = normalizeBinding(binding);
    if (!isBindingValue(value)) {
      throw violation(`binding at index ${index} is not a SQLite compatible value within size limits`);
    }
    return value;
  });
};

/** `batchTimeout` 只接受非负整数；0 表示「下一个宏任务立即派发」，是合法档位。 */
const readBatchTimeout = (record: Record<string, unknown>): number | undefined => {
  const batchTimeout = record['batchTimeout'];
  if (batchTimeout === undefined) return undefined;
  if (!Number.isInteger(batchTimeout) || (batchTimeout as number) < 0) {
    throw violation(`batchTimeout must be an integer >= 0, got ${String(batchTimeout)}`);
  }
  return batchTimeout as number;
};

const parseOpenRequest = (record: Record<string, unknown>): DesktopHostOpenRequest => {
  const storage = record['storage'];
  if (typeof storage !== 'object' || storage === null) throw violation('storage must be an object');
  // 这里传 'electron' 只是为了复用同一份矩阵校验；host 侧真实 runtime 由 createDesktopSqliteHost 再断言一次。
  assertSupportedDesktopStorage('electron', storage as DesktopSqliteFileStorage);
  const { engine, databaseName } = storage as DesktopSqliteFileStorage;
  return { kind: 'open', storage: { engine, databaseName }, batchTimeout: readBatchTimeout(record) };
};

/**
 * 校验并归一化一条来自 renderer 的请求。
 *
 * @remarks
 * 这是 host 的**信任边界**：入参来自渲染进程，即便开了 `contextIsolation` 也不可信。
 * 返回值是重新构造的对象而非原对象，因此契约之外的字段不会顺着流进 host —— 既避免
 * 意外把 renderer 塞进来的东西当配置读，也让后续代码只面对已知形状。
 *
 * @param value - 未经校验的 IPC 入参
 * @returns 归一化后的请求
 * @throws 形状非法时抛 `protocol_violation`；数据库名或引擎非法时抛对应的存储错误码
 */
export function parseDesktopHostRequest(value: unknown): DesktopHostRequest {
  const record = asRecord(value);
  const kind = record['kind'];
  if (typeof kind !== 'string' || !REQUEST_KINDS.includes(kind as DesktopHostRequest['kind'])) {
    throw violation(`unknown request kind ${String(kind)}`);
  }
  if (kind === 'open') return parseOpenRequest(record);
  if (kind === 'execute') {
    return { kind, sessionId: readSessionId(record), sql: readSql(record), bindings: readBindings(record) };
  }
  return { kind: kind as 'version' | 'close', sessionId: readSessionId(record) };
}

const UTF8_ENCODER = new TextEncoder();

/**
 * 分段里绝不允许出现的字符。
 *
 * @remarks
 * 与 renderer 侧物理名编码器转义的集合一致：编码器的输出永远不含这些字符，
 * 出现即说明请求不是那个编码器产出的。控制字符与 NUL 一并拒掉 ——
 * 部分平台会在 NUL 处截断路径，让校验通过的前缀和实际落盘的路径分家。
 */
const FORBIDDEN_SEGMENT_CHARACTERS: ReadonlySet<string> = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

/**
 * 判断分段里是否含有被禁字符。
 *
 * @remarks
 * 用集合而不是正则字符类：控制字符写进正则要么触发 `no-control-regex`，要么以裸字节形式
 * 躺在源码里（改一次就再也看不见）。`character < ' '` 覆盖 U+0000–U+001F —— 代理对的首单元
 * 从 U+D800 起，恒大于空格，不会被误判。
 */
const hasForbiddenCharacter = (segment: string): boolean =>
  [...segment].some(character => FORBIDDEN_SEGMENT_CHARACTERS.has(character) || character < ' ');

/** Windows 保留设备名（不含扩展名部分），比对时统一转大写。 */
const RESERVED_SEGMENT_BASE_NAMES: ReadonlySet<string> = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)
]);

/**
 * 逐段校验一个路径分段。
 *
 * @remarks
 * 这是 AC#4 的第一道闸：renderer 不可信，`..` / 绝对路径 / 盘符 / NUL / 保留名
 * 必须在信任边界上就被挡下，而不是等 host 拼完路径再靠 `resolve()` 前缀比对兜底
 * —— 那道兜底仍然保留，但它是最后一道，不是唯一一道。
 */
const assertPathSegment = (segment: string, path: string): void => {
  if (segment === '' || segment === '.' || segment === '..') {
    throw violation(`path segment ${JSON.stringify(segment)} does not address an entry: ${path}`);
  }
  if (hasForbiddenCharacter(segment)) {
    throw violation(`path contains a character the host filesystem rejects: ${path}`);
  }
  if (segment.endsWith('.') || segment.endsWith(' ')) {
    throw violation(`path segment ends with a dot or space, which Windows silently strips: ${path}`);
  }
  if (RESERVED_SEGMENT_BASE_NAMES.has(segment.split('.')[0].toUpperCase())) {
    throw violation(`path segment is a reserved device name: ${path}`);
  }
  if (UTF8_ENCODER.encode(segment).byteLength > DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES) {
    throw violation(`path segment exceeds ${DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES} bytes: ${path}`);
  }
};

/** 读取一个相对存储根的路径；`allowRoot` 决定空串（存储根自身）是否合法。 */
const readPath = (record: Record<string, unknown>, key: string, allowRoot: boolean): string => {
  const path = record[key];
  if (typeof path !== 'string') throw violation(`${key} must be a string`);
  if (path.length > DESKTOP_HOST_MAX_PATH_LENGTH) {
    throw violation(`${key} exceeds ${DESKTOP_HOST_MAX_PATH_LENGTH} characters`);
  }
  if (path === '') {
    if (!allowRoot) throw violation(`${key} must address a concrete entry, not the storage root`);
    return '';
  }
  for (const segment of path.split('/')) assertPathSegment(segment, path);
  return path;
};

const readChunk = (record: Record<string, unknown>): Uint8Array => {
  const chunk = record['chunk'];
  if (!(chunk instanceof Uint8Array)) throw violation('chunk must be a Uint8Array');
  if (chunk.byteLength > DESKTOP_HOST_MAX_FILE_CHUNK_BYTES) {
    throw violation(`chunk exceeds ${DESKTOP_HOST_MAX_FILE_CHUNK_BYTES} bytes`);
  }
  return chunk;
};

/** `length` 下界是 1：零长度的读没有语义，只会让调用方误以为读到了文件尾。 */
const readReadRange = (record: Record<string, unknown>): { readonly offset: number; readonly length: number } => {
  const offset = record['offset'];
  const length = record['length'];
  if (!Number.isInteger(offset) || (offset as number) < 0) {
    throw violation(`offset must be an integer >= 0, got ${String(offset)}`);
  }
  if (!Number.isInteger(length) || (length as number) < 1 || (length as number) > DESKTOP_HOST_MAX_FILE_CHUNK_BYTES) {
    throw violation(`length must be an integer within 1..${DESKTOP_HOST_MAX_FILE_CHUNK_BYTES}, got ${String(length)}`);
  }
  return { offset: offset as number, length: length as number };
};

const readLockName = (record: Record<string, unknown>): string => {
  const name = record['name'];
  if (typeof name !== 'string' || name === '') throw violation('name must be a non-empty string');
  if (name.length > DESKTOP_HOST_MAX_PATH_LENGTH) {
    throw violation(`name exceeds ${DESKTOP_HOST_MAX_PATH_LENGTH} characters`);
  }
  return name;
};

const readLockMode = (record: Record<string, unknown>): DesktopHostFileLockMode => {
  const mode = record['mode'];
  if (mode !== 'shared' && mode !== 'exclusive') {
    throw violation(`mode must be shared or exclusive, got ${String(mode)}`);
  }
  return mode;
};

type FileWriteRequestKind = 'file.writeBegin' | 'file.writeChunk' | 'file.writeCommit' | 'file.writeAbort';
type FileLockRequestKind = 'file.lockAcquire' | 'file.lockRelease';
type FilePathRequestKind = DesktopHostFilePathRequest['kind'];

const PATH_REQUEST_KINDS: readonly FilePathRequestKind[] = [
  'file.stat',
  'file.list',
  'file.mkdir',
  'file.rmdir',
  'file.remove'
];

const WRITE_REQUEST_KINDS: readonly FileWriteRequestKind[] = [
  'file.writeBegin',
  'file.writeChunk',
  'file.writeCommit',
  'file.writeAbort'
];

const isPathRequestKind = (kind: DesktopHostFileRequest['kind']): kind is FilePathRequestKind =>
  PATH_REQUEST_KINDS.includes(kind as FilePathRequestKind);

const isWriteRequestKind = (kind: DesktopHostFileRequest['kind']): kind is FileWriteRequestKind =>
  WRITE_REQUEST_KINDS.includes(kind as FileWriteRequestKind);

const parseFileWriteRequest = (
  kind: FileWriteRequestKind,
  sessionId: string,
  record: Record<string, unknown>
): DesktopHostFileRequest => {
  if (kind === 'file.writeBegin') return { kind, sessionId, path: readPath(record, 'path', false) };
  if (kind === 'file.writeChunk') {
    return { kind, sessionId, writeId: readUuid(record, 'writeId'), chunk: readChunk(record) };
  }
  return { kind, sessionId, writeId: readUuid(record, 'writeId') };
};

const parseFileLockRequest = (
  kind: FileLockRequestKind,
  sessionId: string,
  record: Record<string, unknown>
): DesktopHostFileRequest => {
  if (kind === 'file.lockAcquire') {
    return { kind, sessionId, name: readLockName(record), mode: readLockMode(record) };
  }
  return { kind, sessionId, lockId: readUuid(record, 'lockId') };
};

/**
 * 判断一个 `kind` 是否属于文件协议。
 *
 * @remarks
 * 路由器据此分派，因此它只看形状、不看内容 —— 真正的校验留给
 * {@link parseDesktopHostFileRequest} 与 {@link parseDesktopHostRequest}。
 *
 * @param value - 未经校验的 `kind` 字段
 * @returns 是文件请求类型时为 `true`
 */
export function isDesktopHostFileRequestKind(value: unknown): value is DesktopHostFileRequest['kind'] {
  return typeof value === 'string' && FILE_REQUEST_KINDS.includes(value as DesktopHostFileRequest['kind']);
}

/**
 * 校验并归一化一条来自 renderer 的文件请求。
 *
 * @remarks
 * 与 {@link parseDesktopHostRequest} 分成两个函数而不是合并成一个大 union：
 * SQLite host 的 dispatch 把「不是 open/close/version」的请求一律当 `execute` 处理，
 * 一旦 `file.*` 能通过那个解析器，一条文件请求就会被当成 SQL 执行。
 * 两个解析器互不接受对方的 `kind`，这条路径在类型和运行时上都不存在。
 *
 * @param value - 未经校验的 IPC 入参
 * @returns 归一化后的文件请求
 * @throws {@link RxDBAdapterDesktopError} 形状或路径非法时抛 `protocol_violation`
 */
export function parseDesktopHostFileRequest(value: unknown): DesktopHostFileRequest {
  const record = asRecord(value);
  const kind = record['kind'];
  if (!isDesktopHostFileRequestKind(kind)) {
    throw violation(`unknown file request kind ${String(kind)}`);
  }
  if (kind === 'file.open') return { kind };

  const sessionId = readSessionId(record);
  if (kind === 'file.close') return { kind, sessionId };
  // 这里逐类收窄而不是靠 `kind.startsWith('file.write')`：前缀判断在类型层面不收窄字面量联合，
  // 剩余分支的 `kind` 仍是全集，返回对象就对不上 `DesktopHostFileRequest`。
  if (isPathRequestKind(kind)) {
    return { kind, sessionId, path: readPath(record, 'path', ROOT_ADDRESSABLE_KINDS.has(kind)) };
  }
  if (isWriteRequestKind(kind)) return parseFileWriteRequest(kind, sessionId, record);
  if (kind === 'file.move') {
    return {
      kind,
      sessionId,
      fromPath: readPath(record, 'fromPath', false),
      toPath: readPath(record, 'toPath', false)
    };
  }
  if (kind === 'file.read') {
    return { kind, sessionId, path: readPath(record, 'path', false), ...readReadRange(record) };
  }
  return parseFileLockRequest(kind, sessionId, record);
}

/**
 * 校验 host 推送过来的变更事件。
 *
 * @remarks
 * 方向与 {@link parseDesktopHostRequest} 相反，但同样不能假设对端守规矩：
 * renderer 收到形状不对的事件时宁可抛错，也不能把半个事件派发进 RxDB 变更管线，
 * 那会让本地缓存与库里的真实状态悄悄分叉。
 *
 * @param value - 未经校验的事件负载
 * @returns 校验通过的变更事件
 * @throws 形状非法时抛 `protocol_violation`
 */
export function parseDesktopHostChangeEvent(value: unknown): SqliteChangeEvent {
  const record = asRecord(value);
  const type = record['type'];
  if (typeof type !== 'number' || !CHANGE_TYPES.includes(type)) {
    throw violation(`unknown SQLite change type ${String(type)}`);
  }
  const dbName = record['dbName'];
  const tableName = record['tableName'];
  if (typeof dbName !== 'string' || typeof tableName !== 'string') {
    throw violation('dbName and tableName must be strings');
  }
  const rowIds = record['rowIds'];
  if (!Array.isArray(rowIds) || rowIds.some(rowId => typeof rowId !== 'bigint')) {
    throw violation('rowIds must be an array of bigint');
  }
  const recordAt = record['recordAt'];
  if (!(recordAt instanceof Date)) throw violation('recordAt must be a Date');
  return { type, dbName, tableName, rowIds: rowIds as bigint[], recordAt };
}

/**
 * 校验一条 host 应答，并把错误应答还原成本地异常。
 *
 * @remarks
 * 这是与 {@link DesktopHostResponse} 配套的解包点：错误应答在这里重新变回
 * {@link RxDBAdapterDesktopError} 抛出，因此调用方写的仍是普通的 `try/catch`，
 * 感觉不到中间隔着一条 IPC。错误码先经 {@link isRxDBAdapterDesktopErrorCode} 过一遍，
 * 不在契约内的字符串一律按协议违规处理。
 *
 * @param expected - 期望的应答类型
 * @param value - host 返回的未校验负载
 * @returns 与 `expected` 对应的应答
 * @throws {@link RxDBAdapterDesktopError} host 报错时按其原始错误码抛出；应答形状不符时抛 `protocol_violation`
 */
export function assertDesktopHostResponse<TKind extends Exclude<DesktopHostResponse['kind'], 'error'>>(
  expected: TKind,
  value: unknown
): Extract<DesktopHostResponse, { kind: TKind }> {
  const record = asRecord(value);
  const kind = record['kind'];
  if (kind === 'error') {
    const code = record['code'];
    const message = record['message'];
    if (!isRxDBAdapterDesktopErrorCode(code) || typeof message !== 'string') {
      throw violation(`host reported an error with an unknown code ${String(code)}`);
    }
    throw new RxDBAdapterDesktopError(code, message);
  }
  if (kind !== expected) {
    throw violation(`expected a ${expected} response but the host answered ${String(kind)}`);
  }
  return record as unknown as Extract<DesktopHostResponse, { kind: TKind }>;
}

/**
 * 校验 `open` 响应。
 *
 * @param value - host 返回的未校验负载
 * @returns 校验通过的打开结果
 * @throws 形状非法或协议版本不匹配时抛 `protocol_violation`
 */
export function parseDesktopHostOpenResult(value: unknown): DesktopHostOpenResult {
  const record = asRecord(value);
  const sessionId = readSessionId(record);
  const protocolVersion = record['protocolVersion'];
  if (protocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION) {
    throw violation(
      `host speaks protocol ${String(protocolVersion)} but this client speaks ${DESKTOP_HOST_PROTOCOL_VERSION}`
    );
  }
  const resolvedLocation = record['resolvedLocation'];
  const beginTransactionSql = record['beginTransactionSql'];
  const beginSystemMigrationTransactionSql = record['beginSystemMigrationTransactionSql'];
  if (
    typeof resolvedLocation !== 'string' ||
    typeof beginTransactionSql !== 'string' ||
    typeof beginSystemMigrationTransactionSql !== 'string'
  ) {
    throw violation('open result is missing string fields');
  }
  return {
    sessionId,
    resolvedLocation,
    protocolVersion,
    beginTransactionSql,
    beginSystemMigrationTransactionSql
  };
}
