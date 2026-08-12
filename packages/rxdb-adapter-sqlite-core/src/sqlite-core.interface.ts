/**
 * SQLite 适配器共享的核心类型。
 * 与后端无关的类型，wa-sqlite 与 sqliteai 适配器都会用到。
 *
 * @module sqlite-core.interface
 */

import type { SqliteData } from './sqlite-backend.interface.js';
import { SQLiteChangeType } from './sqlite-backend.interface.js';

/** SQLite 参数绑定所兼容的数据类型 */
export type SQLiteCompatibleType = number | string | Uint8Array | Array<number> | bigint | null;

/**
 * 带耗时信息的 SQLite 查询结果
 */
export interface SqliteSuccessResult {
  /** 已执行的 SQL */
  sql: string;
  rowsAffected: number;
  elapsed: number;
  results: SqliteData[];
}

/** SqliteSuccessResult 的别名 */
export type SqliteResult = SqliteSuccessResult;

/**
 * 把 SQLite 变更类型映射成 RxDB 变更事件字符串
 * @param eventType - SQLite 变更类型枚举值
 * @returns 变更事件字符串
 */
export const getRxDBChangeEventType = (eventType: SQLiteChangeType): 'INSERT' | 'DELETE' | 'UPDATE' => {
  switch (eventType) {
    case SQLiteChangeType.SQLITE_INSERT:
      return 'INSERT';
    case SQLiteChangeType.SQLITE_DELETE:
      return 'DELETE';
    case SQLiteChangeType.SQLITE_UPDATE:
      return 'UPDATE';
    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unknown SQLite change type: ${String(_exhaustive)}`);
    }
  }
};

/**
 * SQLite 变更事件接口
 */
export interface SqliteChangeEvent {
  type: SQLiteChangeType;
  dbName: string;
  tableName: string;
  rowIds: bigint[];
  recordAt: Date;
}

/**
 * 变更处理失败的阶段
 *
 * - `query`：回读变更行失败，这条变更的内容完全未知
 * - `process`：行已读到，转换或派发实体事件时失败
 */
export type SqliteChangeErrorPhase = 'query' | 'process';

/**
 * 变更处理失败事件
 *
 * @remarks
 * 变更处理是 SQLite `update_hook` 触发的**脱离调用栈**的异步路径，没有调用方可以接住异常
 * （SQLC-012）。收到本事件意味着 `rowIds` 这批行的实体事件**没有派发出去**：本地缓存与
 * 跨 Tab 状态可能已经和库里不一致，恢复策略（重查、失效、提示用户）由应用层决定。
 *
 * 没有任何监听器时降级为 `console.error`，与历史行为一致。
 */
export interface SqliteChangeErrorEvent {
  /** 失败原因，未经包装 */
  readonly error: unknown;
  /** 出错的物理表名（含 `<namespace>$` 前缀） */
  readonly tableName: string;
  /** 未能派发出去的行 */
  readonly rowIds: readonly RowId[];
  /** 失败发生的阶段 */
  readonly phase: SqliteChangeErrorPhase;
}

/**
 * {@link SqliteChangeErrorEvent} 的监听器
 */
export type SqliteChangeErrorListener = (event: SqliteChangeErrorEvent) => void;

/**
 * SQLite 数据类型名
 * @see https://www.sqlite.org/datatype3.html
 */
export type SqliteDataType = 'NULL' | 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB';

/**
 * RxDB adapter 数据变更接口
 */
export interface IRxDBAdapterDataChange {
  rowIds: RowId[];
  recordAt: Date;
}

/**
 * SQLite rowId 类型（bigint）
 */
export type RowId = bigint;
