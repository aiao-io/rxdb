import { describe, expect, it } from 'vitest';
import { executeOo1Helper } from '../execute_oo1_helper.js';
import type { Oo1Database, Oo1PreparedStatement } from '../oo1-types.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

interface FakeStatementOptions {
  columns?: string[];
  rows?: unknown[][];
  bindError?: Error;
  stepError?: Error;
}

class FakeStatement implements Oo1PreparedStatement {
  #cursor = 0;

  readonly bindCalls: unknown[][] = [];
  finalized = 0;

  constructor(private readonly options: FakeStatementOptions = {}) {}

  bind(binding: unknown[]): this {
    if (this.options.bindError) throw this.options.bindError;
    this.bindCalls.push(binding);
    return this;
  }

  get(): unknown[] {
    return (this.options.rows ?? [])[this.#cursor - 1];
  }

  getColumnNames(): string[] {
    return [...(this.options.columns ?? [])];
  }

  step(): boolean {
    if (this.options.stepError) throw this.options.stepError;
    this.#cursor += 1;
    return this.#cursor <= (this.options.rows ?? []).length;
  }

  finalize(): number | undefined {
    this.finalized += 1;
    return 0;
  }
}

interface FakeExecOpts {
  sql: string;
  bind?: unknown[];
  resultRows?: unknown[][];
  columnNames?: string[];
  rowMode?: string;
}

class FakeHelperDb implements Oo1Database {
  readonly execCalls: FakeExecOpts[] = [];
  prepare?: (sql: string) => Oo1PreparedStatement;
  execError?: unknown;
  execResult?: { columns: string[]; rows: unknown[][] };
  changesCount = 0;

  exec(opts: FakeExecOpts): this {
    if (this.execError !== undefined) throw this.execError;
    this.execCalls.push(opts);
    if (this.execResult) {
      opts.columnNames?.push(...this.execResult.columns);
      opts.resultRows?.push(...this.execResult.rows);
    }
    return this;
  }

  close(): void {
    // 无操作。
  }

  changes(): number {
    return this.changesCount;
  }

  createFunction(): this {
    return this;
  }
}

describe('executeOo1Helper', () => {
  describe('prepared statement 路径', () => {
    it('SELECT 单语句应该走 prepared statement 路径并返回结果集', () => {
      const statement = new FakeStatement({
        columns: ['id', 'name'],
        rows: [
          [1, 'a'],
          [2, 'b']
        ]
      });
      const db = new FakeHelperDb();
      db.prepare = () => statement;
      db.changesCount = 5;

      const result = executeOo1Helper('test', db, 'SELECT id, name FROM users');

      expect(result.sql).toBe('SELECT id, name FROM users');
      expect(result.results).toEqual([
        {
          columns: ['id', 'name'],
          rows: [
            [1, 'a'],
            [2, 'b']
          ]
        }
      ]);
      // SQLC-030：SELECT 不改行，db.changes() 的 5 是上一条写语句的遗留值，
      // 当成本次查询的 rowsAffected 返回会误导调用方
      expect(result.rowsAffected).toBe(0);
      expect(result.elapsed).toBeGreaterThanOrEqual(0);
      expect(statement.bindCalls).toHaveLength(0);
      expect(statement.finalized).toBe(1);
      expect(db.execCalls).toHaveLength(0);
    });

    it('传入 bindings 时应该绑定参数', () => {
      const statement = new FakeStatement({ columns: ['id'], rows: [[1]] });
      const db = new FakeHelperDb();
      db.prepare = () => statement;

      executeOo1Helper('test', db, 'SELECT id FROM users WHERE id = ?', [1]);

      expect(statement.bindCalls).toEqual([[1]]);
    });

    // 空数组与 undefined 等价：无参数查询（如 count）传 `[]` 时不得调用 bind，
    // 否则 OO1 对无绑定参数语句抛「This statement has no bindable parameters」。
    it('传入空数组 bindings 时应该跳过 bind', () => {
      const statement = new FakeStatement({ columns: ['count'], rows: [[0]] });
      const db = new FakeHelperDb();
      db.prepare = () => statement;

      const result = executeOo1Helper('test', db, 'SELECT count(*) AS count FROM t', []);

      expect(statement.bindCalls).toHaveLength(0);
      expect(result.results).toEqual([{ columns: ['count'], rows: [[0]] }]);
    });

    it('结果集无列时 results 应该为空数组', () => {
      const statement = new FakeStatement({ columns: [], rows: [] });
      const db = new FakeHelperDb();
      db.prepare = () => statement;

      const result = executeOo1Helper('test', db, 'SELECT 1 WHERE 0');

      expect(result.results).toEqual([]);
      expect(statement.finalized).toBe(1);
    });

    it('prepare 抛错时应该包装为 RxDBAdapterSqliteError', () => {
      const db = new FakeHelperDb();
      db.prepare = () => {
        throw new Error('prepare boom');
      };

      expect(() => executeOo1Helper('test', db, 'SELECT 1')).toThrow(RxDBAdapterSqliteError);
      expect(() => executeOo1Helper('test', db, 'SELECT 1')).toThrow(/prepare\(\) failed for SQL "SELECT 1"/);
    });

    it('prepare 返回空时应该报 prepare() is unavailable', () => {
      const db = new FakeHelperDb();
      db.prepare = () => undefined as unknown as Oo1PreparedStatement;

      expect(() => executeOo1Helper('test', db, 'SELECT 1')).toThrow(/prepare\(\) is unavailable/);
    });

    it('bind 抛错时应该包装为 bind 阶段错误且仍然 finalize', () => {
      const statement = new FakeStatement({ columns: ['id'], rows: [], bindError: new Error('bind boom') });
      const db = new FakeHelperDb();
      db.prepare = () => statement;

      expect(() => executeOo1Helper('test', db, 'SELECT id FROM t WHERE id = ?', [1])).toThrow(/bind\(\) failed/);
      expect(statement.finalized).toBe(1);
    });

    it('step 抛错时应该包装为 step 阶段错误且仍然 finalize', () => {
      const statement = new FakeStatement({ columns: ['id'], rows: [[1]], stepError: new Error('step boom') });
      const db = new FakeHelperDb();
      db.prepare = () => statement;

      expect(() => executeOo1Helper('test', db, 'SELECT id FROM t')).toThrow(/step\(\) failed/);
      expect(statement.finalized).toBe(1);
    });
  });

  describe('exec 路径', () => {
    it('非 SELECT 语句应该走 exec 路径且无结果集', () => {
      const db = new FakeHelperDb();
      db.changesCount = 3;

      const result = executeOo1Helper('test', db, 'INSERT INTO t VALUES (1)', [7]);

      expect(db.execCalls).toHaveLength(1);
      expect(db.execCalls[0].sql).toBe('INSERT INTO t VALUES (1)');
      expect(db.execCalls[0].bind).toEqual([7]);
      expect(result.results).toEqual([]);
      expect(result.rowsAffected).toBe(3);
    });

    it('多语句 SQL 应该走 exec 路径并收集结果集', () => {
      const db = new FakeHelperDb();
      db.execResult = { columns: ['a'], rows: [[1]] };

      const result = executeOo1Helper('test', db, 'SELECT 1; SELECT 2');

      expect(db.execCalls).toHaveLength(1);
      expect(result.results).toEqual([{ columns: ['a'], rows: [[1]] }]);
    });

    it('缺少 prepare 时 SELECT 也应该走 exec 路径', () => {
      const db = new FakeHelperDb();
      db.execResult = { columns: ['id'], rows: [[9]] };

      const result = executeOo1Helper('test', db, 'SELECT id FROM t');

      expect(db.execCalls).toHaveLength(1);
      expect(result.results).toEqual([{ columns: ['id'], rows: [[9]] }]);
    });

    it('exec 抛 Error 时应该包装并保留 cause', () => {
      const db = new FakeHelperDb();
      const cause = new Error('exec boom');
      db.execError = cause;

      let caught: unknown;
      try {
        executeOo1Helper('test', db, 'DELETE FROM t');
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(RxDBAdapterSqliteError);
      expect((caught as RxDBAdapterSqliteError).message).toBe(
        'test execute() failed for SQL "DELETE FROM t": exec boom'
      );
      expect((caught as RxDBAdapterSqliteError).cause).toBe(cause);
    });

    it('exec 抛非 Error 值时应该字符串化后包装', () => {
      const db = new FakeHelperDb();
      db.execError = 'plain-failure';

      expect(() => executeOo1Helper('test', db, 'DELETE FROM t')).toThrow(
        'test execute() failed for SQL "DELETE FROM t": plain-failure'
      );
    });
  });
});
