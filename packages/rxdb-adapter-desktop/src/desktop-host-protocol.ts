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
  | DesktopHostOpenRequest
  | DesktopHostExecuteRequest
  | DesktopHostVersionRequest
  | DesktopHostCloseRequest;

/** `open` 请求的响应。 */
export interface DesktopHostOpenResult {
  readonly sessionId: string;
  /**
   * 已解析的**逻辑**位置，仅供诊断与日志（AC#5）。
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
 * AC#6 承诺的「稳定、可判别的错误码」才能真的跨过进程边界活着到达调用方。
 */
export type DesktopHostResponse =
  | { readonly kind: 'open'; readonly result: DesktopHostOpenResult }
  | { readonly kind: 'execute'; readonly result: SqliteResult }
  | { readonly kind: 'version'; readonly result: string }
  | { readonly kind: 'close' }
  | { readonly kind: 'error'; readonly code: RxDBAdapterDesktopErrorCode; readonly message: string };

const REQUEST_KINDS: readonly DesktopHostRequest['kind'][] = ['open', 'execute', 'version', 'close'];
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

const readSessionId = (record: Record<string, unknown>): string => {
  const sessionId = record['sessionId'];
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    throw violation('sessionId must be a UUID string issued by the host');
  }
  return sessionId;
};

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
