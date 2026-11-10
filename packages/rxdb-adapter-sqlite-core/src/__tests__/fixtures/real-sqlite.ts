import { assertOo1Static, type Oo1Static } from '../../oo1-types.js';

/**
 * 测试用的真实 SQLite 内存库：浏览器模式跑官方 sqlite-wasm，Node 模式跑 `node:sqlite`。
 *
 * @remarks
 * 生成器单测只比 SQL 文本时，「文本看着对、引擎结论错」的缺陷（字面量被改写、别名关联错层）
 * 照样全绿；这里让断言落在引擎实际返回的行上。
 */
export interface RealSqliteDatabase {
  /** 执行一条或多条不带参数的语句 */
  exec(sql: string): void;
  /** 执行一条语句，按列顺序返回每一行；`params` 绑定到语句里的 `?` */
  all(sql: string, params?: readonly unknown[]): unknown[][];
  close(): void;
}

let wasmModule: Promise<Oo1Static> | undefined;

const loadWasm = (): Promise<Oo1Static> =>
  (wasmModule ??= (async () => {
    const { default: init } = await import('@sqlite.org/sqlite-wasm');
    const module: unknown = await init({ print: () => undefined, printErr: () => undefined });
    assertOo1Static(module);
    return module;
  })());

const openNodeDatabase = async (): Promise<RealSqliteDatabase> => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    exec: sql => db.exec(sql),
    all: (sql, params = []) =>
      db
        .prepare(sql)
        .all(...(params as Parameters<ReturnType<typeof db.prepare>['all']>))
        .map(row => Object.values(row)),
    close: () => db.close()
  };
};

/**
 * 打开一个空的真实 SQLite 内存库。
 *
 * @returns 用完必须 `close()`
 */
export const createRealSqliteDatabase = async (): Promise<RealSqliteDatabase> => {
  if (typeof window === 'undefined') return openNodeDatabase();
  const module = await loadWasm();
  const db = new module.oo1.DB(':memory:');
  return {
    exec: sql => {
      db.exec({ sql });
    },
    all: (sql, params = []) => {
      const resultRows: unknown[][] = [];
      db.exec({ sql, bind: [...params], rowMode: 'array', resultRows });
      return resultRows;
    },
    close: () => db.close()
  };
};
