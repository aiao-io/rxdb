/**
 * SqliteBackend —— SQLite WASM 后端实现的抽象接口。
 *
 * 定义共享 adapter 逻辑（rxdb-adapter-sqlite-core）与具体 SQLite 后端实现
 * （wa-sqlite、@sqliteai/sqlite-wasm 等）之间的契约。
 *
 * @module sqlite-backend.interface
 */

import type { SQLiteCompatibleType } from './sqlite-core.interface.js';

/** 通过后端执行 SQL 的结果 */
export interface SqliteExecResult {
  /** 结果集数组 */
  results: SqliteData[];
  /** 受影响的行数 */
  rowsAffected: number;
}

/** 单个结果集，包含列名与行数据 */
export interface SqliteData {
  /** 列名 */
  columns: string[];
  /** 行数据数组 */
  rows: SQLiteCompatibleType[][];
}

/** 与 C API 一致的 SQLite 变更类型常量 */
export enum SQLiteChangeType {
  /** SQLITE_DELETE (9) */
  SQLITE_DELETE = 9,
  /** SQLITE_INSERT (18) */
  SQLITE_INSERT = 18,
  /** SQLITE_UPDATE (23) */
  SQLITE_UPDATE = 23
}

/** SQLite update_hook 通知回调 */
export type UpdateHookCallback = (type: SQLiteChangeType, dbName: string, tableName: string, rowId: bigint) => void;

/** 打开 SQLite 后端的选项 */
export interface SqliteBackendOptions {
  /** 虚拟文件系统名（与后端相关） */
  vfs?: string;
  /** 启用 OPFS 持久化（仅 Worker） */
  opfs?: boolean;
  /** 自定义 WASM 文件路径 */
  wasmPath?: string;
  /** WASM 文件路径解析器 */
  locateFile?: (name: string) => string;
  /** SQLite 页缓存大小（KB，默认 51200） */
  cacheSizeKb?: number;
}

/**
 * SQLite WASM 后端实现的抽象接口。
 *
 * 实现：
 * - WaSqliteBackend（packages/rxdb-adapter-wa-sqlite）
 * - SqliteaiBackend（packages/rxdb-adapter-sqliteai）
 */
export interface SqliteBackend {
  /**
   * 初始化并打开 SQLite 数据库。
   * @param filename - 数据库文件名（例如 ':memory:'、'/mydb.sqlite3'）
   * @param options - 与后端相关的初始化选项
   */
  open(filename: string, options?: SqliteBackendOptions): Promise<void>;

  /**
   * 关闭数据库连接并释放资源。
   * close() 之后调用其他方法必须抛错。
   */
  close(): Promise<void>;

  /**
   * 执行 SQL 语句并返回结果。
   * @param sql - 要执行的 SQL 语句
   * @param bindings - 可选的参数绑定
   * @returns 包含受影响行数的执行结果
   */
  exec(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteExecResult>;

  /**
   * 注册或注销数据变更通知回调。
   * 在 INSERT、UPDATE、DELETE 操作时调用。
   * @param callback - 钩子函数，传 null 注销
   */
  setUpdateHook(callback: UpdateHookCallback | null): void;

  /**
   * 注册自定义标量 SQL 函数。
   * @param name - SQL 中可用的函数名（例如 'regexp'）
   * @param fn - 实现函数
   */
  createFunction(name: string, fn: (...args: SQLiteCompatibleType[]) => SQLiteCompatibleType): void;

  /**
   * 返回 SQLite 版本字符串。
   */
  version(): Promise<string>;

  /**
   * 返回最近一次 INSERT/UPDATE/DELETE 影响的行数。
   */
  changes(): number;
}
