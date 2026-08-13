/**
 * 桌面 SQLite host：把 renderer 送来的协议请求派发到本地 `node:sqlite` 连接。
 *
 * @remarks
 * 本模块运行在**特权侧**（Electron 主进程或它拥有的 worker），是唯一接触文件系统的地方。
 * 所有入参先过 {@link parseDesktopHostRequest} 的信任边界，再落到引擎。
 *
 * @module desktop-sqlite-host
 */

import type { SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import { randomUUID } from 'node:crypto';
import { RxDBAdapterDesktopError } from './desktop-error.js';
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  parseDesktopHostRequest,
  type DesktopHostChangeEventMessage,
  type DesktopHostRequest,
  type DesktopHostResponse
} from './desktop-host-protocol.js';
import { NodeSqliteEngine } from './node-sqlite-engine.js';

/**
 * 逻辑位置的 scheme。
 *
 * @remarks
 * `open` 回给 renderer 的 `resolvedLocation` 用它拼装，只表达「应用作用域内的某个库」，
 * 不含物理根目录（AC#5）。
 */
const LOGICAL_LOCATION_SCHEME = 'desktop-sqlite://app-scope';

/** 普通事务的起始 SQL，与 `Oo1ClientBase` 保持一致。 */
const BEGIN_TRANSACTION_SQL = 'BEGIN;';

/** 系统 schema 迁移使用的最强锁，与 `Oo1ClientBase` 保持一致。 */
const BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL = 'BEGIN EXCLUSIVE;';

/** {@link createDesktopSqliteHost} 的入参。 */
export interface DesktopSqliteHostOptions {
  /**
   * 把逻辑数据库名解析成物理绝对路径。
   *
   * @remarks
   * 由宿主应用提供，因为只有它知道自己的数据目录（Electron 下通常是
   * `app.getPath('userData')`）。传进来的名字已经过白名单校验，不含任何路径分隔符，
   * 因此 `join(root, databaseName)` 不可能越出 `root`。
   */
  readonly resolveDatabasePath: (databaseName: string) => string;
  /** 把变更事件送达对应会话的 renderer，例如 `webContents.send`。 */
  readonly postChange: (message: DesktopHostChangeEventMessage) => void;
  /**
   * 变更事件送达失败时的上报口。
   *
   * @remarks
   * 窗口在写入途中被销毁是常规竞态，此时写入已经落库；若把送达失败当成写失败回给调用方，
   * 它会重试一次已经成功的写入，产生重复数据。所以送达是 best-effort，失败只上报不影响写结果。
   * 不传则丢弃——但那意味着这类竞态在日志里完全无痕，建议显式接上。
   */
  readonly onDeliveryError?: (error: unknown) => void;
  /** SQLite page cache 大小（KB）。 */
  readonly cacheSizeKb?: number;
}

/** 桌面 SQLite host 实例。 */
export interface DesktopSqliteHost {
  /**
   * 处理一条来自 renderer 的请求。
   *
   * @remarks
   * **永不 reject**：失败以 `kind: 'error'` 的应答返回。Electron 的 `ipcRenderer.invoke`
   * 在 reject 时会把错误压平成字符串，自定义错误码随之丢失。
   *
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(request: unknown): Promise<DesktopHostResponse>;
  /** 当前打开的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /** 关闭全部会话，通常在应用退出前调用。 */
  closeAll(): void;
}

const toErrorResponse = (error: unknown): DesktopHostResponse => {
  if (error instanceof RxDBAdapterDesktopError) {
    return { kind: 'error', code: error.code, message: error.detail };
  }
  return {
    kind: 'error',
    code: 'host_internal_error',
    message: error instanceof Error ? error.message : String(error)
  };
};

/**
 * 创建一个桌面 SQLite host。
 *
 * @remarks
 * 每个 `open` 请求得到**独立的** `DatabaseSync` 连接，而不是共享一条：
 * 多个窗口共用连接时它们的 `BEGIN` 块会互相穿插，事务隔离直接失效。
 * 各持连接后，跨窗口并发交由 SQLite 自己的文件锁与
 * [US-304](../../../requirements/stories/collaboration/US-304-writer-lease-migration-fencing.md)
 * 的 writer lease 处理（AC#7）。
 *
 * @param options - host 配置
 * @returns host 实例
 */
export function createDesktopSqliteHost(options: DesktopSqliteHostOptions): DesktopSqliteHost {
  const sessions = new Map<string, NodeSqliteEngine>();

  const deliver = (sessionId: string, event: SqliteChangeEvent): void => {
    try {
      options.postChange({ kind: 'change', sessionId, event });
    } catch (error) {
      options.onDeliveryError?.(error);
    }
  };

  const requireSession = (sessionId: string): NodeSqliteEngine => {
    const engine = sessions.get(sessionId);
    if (!engine) {
      throw new RxDBAdapterDesktopError('session_closed', `session ${sessionId} is not open on this host`);
    }
    return engine;
  };

  const resolvePath = (databaseName: string): string => {
    try {
      return options.resolveDatabasePath(databaseName);
    } catch (error) {
      throw new RxDBAdapterDesktopError(
        'open_failed',
        `the application could not resolve a path for ${databaseName}`,
        { cause: error }
      );
    }
  };

  const open = (request: Extract<DesktopHostRequest, { kind: 'open' }>): DesktopHostResponse => {
    const { databaseName } = request.storage;
    const sessionId = randomUUID();
    const engine = NodeSqliteEngine.open({
      filePath: resolvePath(databaseName),
      dbName: databaseName,
      onChange: event => deliver(sessionId, event),
      cacheSizeKb: options.cacheSizeKb
    });
    sessions.set(sessionId, engine);
    return {
      kind: 'open',
      result: {
        sessionId,
        resolvedLocation: `${LOGICAL_LOCATION_SCHEME}/${databaseName}`,
        protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        beginTransactionSql: BEGIN_TRANSACTION_SQL,
        beginSystemMigrationTransactionSql: BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL
      }
    };
  };

  const close = (sessionId: string): DesktopHostResponse => {
    const engine = requireSession(sessionId);
    sessions.delete(sessionId);
    engine.close();
    return { kind: 'close' };
  };

  const dispatch = (request: DesktopHostRequest): DesktopHostResponse => {
    if (request.kind === 'open') return open(request);
    if (request.kind === 'close') return close(request.sessionId);
    if (request.kind === 'version') return { kind: 'version', result: requireSession(request.sessionId).version() };
    return { kind: 'execute', result: requireSession(request.sessionId).execute(request.sql, request.bindings) };
  };

  return {
    handle: (request: unknown): Promise<DesktopHostResponse> => {
      try {
        return Promise.resolve(dispatch(parseDesktopHostRequest(request)));
      } catch (error) {
        return Promise.resolve(toErrorResponse(error));
      }
    },
    get openSessionCount(): number {
      return sessions.size;
    },
    closeAll: (): void => {
      for (const engine of sessions.values()) engine.close();
      sessions.clear();
    }
  };
}
