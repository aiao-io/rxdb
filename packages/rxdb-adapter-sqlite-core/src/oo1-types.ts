/**
 * `oo1` API 的结构化类型别名，被 `@sqlite.org/sqlite-wasm`
 * 与 `@sqliteai/sqlite-wasm` 共用。
 *
 * ## 命名来源
 *
 * `oo1` **不是** aiao 自创缩写，而是上游官方 SQLite WASM 的 API 命名：
 * - `oo` = **Object Oriented**（面向对象封装）
 * - `1` = **第 1 代** OO API
 *
 * 初始化后运行时形状是 `sqlite3.oo1.DB` / `sqlite3.oo1.OpfsDb`，
 * 以及底层的 `sqlite3.capi`。本仓库的 `Oo1*` 类型/基类/助手都跟着这层面走，
 * 与 wa-sqlite 那种 C 风格指针 API（`db: number`）是两套完全不同的路径。
 *
 * 两个上游包都有自己的 `.d.ts`。这里刻意把接口做到最小，
 * 让共享基类/助手代码既不依赖 `any`，也不耦合任何一边的类型树。
 */

export interface Oo1PreparedStatement {
  bind(binding: unknown[]): this;
  get(target: unknown[]): unknown[];
  getColumnNames(target?: string[]): string[];
  step(): boolean;
  finalize(): number | undefined;
}

export interface Oo1Database {
  pointer?: number;
  prepare?(sql: string): Oo1PreparedStatement;
  exec(opts: {
    sql: string;
    bind?: unknown[];
    resultRows?: unknown[][];
    columnNames?: string[];
    rowMode?: string;
  }): this;
  close(): void;
  changes(total?: boolean, sixtyFour?: boolean): number;
  createFunction(name: string, func: (...args: unknown[]) => unknown): this;
}

export interface Oo1Capi {
  sqlite3_update_hook(
    db: Oo1Database | number,
    xUpdate: (userCtx: number, op: number, dbName: string, tableName: string, newRowId: bigint) => void,
    userCtx: number
  ): number;
}

export interface Oo1Static {
  capi: Oo1Capi;
  config?: {
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  opfs?: unknown;
  oo1: {
    DB: new (filename?: string, flags?: string, vfs?: string) => Oo1Database;
    OpfsDb?: new (filename?: string, flags?: string) => Oo1Database;
  };
  version: {
    libVersion: string;
    libVersionNumber: number;
    sourceId: string;
    downloadVersion: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasOptionalFunction = (value: Record<string, unknown>, key: string): boolean =>
  value[key] === undefined || typeof value[key] === 'function';

/**
 * 断言第三方 sqlite-wasm 初始化结果满足共享 oo1 客户端的最小运行时契约。
 *
 * @param value - sqlite-wasm 初始化函数返回的未知值
 * @throws 返回值缺少数据库构造器、更新钩子或版本信息时抛出 `TypeError`
 */
export function assertOo1Static(value: unknown): asserts value is Oo1Static {
  const valid =
    isRecord(value) &&
    isRecord(value['capi']) &&
    typeof value['capi']['sqlite3_update_hook'] === 'function' &&
    isRecord(value['oo1']) &&
    typeof value['oo1']['DB'] === 'function' &&
    hasOptionalFunction(value['oo1'], 'OpfsDb') &&
    isRecord(value['version']) &&
    typeof value['version']['libVersion'] === 'string' &&
    typeof value['version']['libVersionNumber'] === 'number' &&
    typeof value['version']['sourceId'] === 'string' &&
    typeof value['version']['downloadVersion'] === 'number' &&
    (value['config'] === undefined ||
      (isRecord(value['config']) &&
        hasOptionalFunction(value['config'], 'warn') &&
        hasOptionalFunction(value['config'], 'error')));

  if (!valid) {
    throw new TypeError('invalid oo1 module: sqlite-wasm returned an incompatible runtime shape');
  }
}
