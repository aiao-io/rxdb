import { SQLiteChangeType, type SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import { NodeSqliteEngine } from '../node-sqlite-engine.js';

let workspace: string;
let engines: NodeSqliteEngine[];
let events: SqliteChangeEvent[];

const openEngine = (fileName = 'app.sqlite3'): NodeSqliteEngine => {
  const engine = NodeSqliteEngine.open({
    filePath: join(workspace, fileName),
    dbName: fileName,
    onChange: event => events.push(event)
  });
  engines.push(engine);
  return engine;
};

/** 建出与核心系统表同名的表，好让通知触发器有落点。 */
const createChangeTable = (engine: NodeSqliteEngine): void => {
  engine.execute('CREATE TABLE IF NOT EXISTS "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');
};

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-'));
  engines = [];
  events = [];
});

afterEach(() => {
  for (const engine of engines) {
    try {
      engine.close();
    } catch {
      // 用例可能已主动关闭；清理阶段不掩盖用例本身的断言失败
    }
  }
  rmSync(workspace, { recursive: true, force: true });
});

describe('NodeSqliteEngine.open', () => {
  it('creates the database file on disk', () => {
    openEngine();
    expect(existsSync(join(workspace, 'app.sqlite3'))).toBe(true);
  });

  it('enables WAL journaling for a durable single file database', () => {
    const engine = openEngine();
    const result = engine.execute('PRAGMA journal_mode');
    expect(result.results[0]?.rows[0]?.[0]).toBe('wal');
  });

  it('enables foreign key enforcement', () => {
    const engine = openEngine();
    expect(engine.execute('PRAGMA foreign_keys').results[0]?.rows[0]?.[0]).toBe(1);
  });

  // AC#6：打不开就报错，绝不静默降级到内存库让用户以为数据落了盘
  it('reports open_failed without leaving an empty database behind', () => {
    const filePath = join(workspace, 'missing-dir', 'app.sqlite3');
    expect(() => NodeSqliteEngine.open({ filePath, dbName: 'app.sqlite3', onChange: () => undefined })).toThrowError(
      RxDBAdapterDesktopError
    );
    expect(existsSync(filePath)).toBe(false);
  });

  it('reports database_corrupted for a file that is not a SQLite database', () => {
    const filePath = join(workspace, 'not-a-db.sqlite3');
    writeFileSync(filePath, Buffer.alloc(4096, 0x41));
    try {
      NodeSqliteEngine.open({ filePath, dbName: 'not-a-db.sqlite3', onChange: () => undefined });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('database_corrupted');
    }
  });
});

describe('NodeSqliteEngine.execute', () => {
  it('returns the SqliteResult shape used by the sqlite core', () => {
    const engine = openEngine();
    const result = engine.execute('SELECT 1 AS one, 2 AS two');
    expect(result.sql).toBe('SELECT 1 AS one, 2 AS two');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({ columns: ['one', 'two'], rows: [[1, 2]] });
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
  });

  // 与 executeOo1Helper 对齐：只读语句的 rowsAffected 恒为 0，不泄漏上一条写语句的计数
  it('reports rowsAffected 0 for read only statements', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    engine.execute('INSERT INTO t (name) VALUES (?)', ['a']);
    expect(engine.execute('SELECT * FROM t').rowsAffected).toBe(0);
  });

  it('reports rowsAffected for writes', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    expect(engine.execute('INSERT INTO t (name) VALUES (?), (?)', ['a', 'b']).rowsAffected).toBe(2);
    expect(engine.execute('UPDATE t SET name = ?', ['c']).rowsAffected).toBe(2);
    expect(engine.execute('DELETE FROM t').rowsAffected).toBe(2);
  });

  it('omits the result set entirely when a statement returns no columns', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    expect(engine.execute('INSERT INTO t (id) VALUES (1)').results).toEqual([]);
  });

  it('returns rows for a RETURNING clause and still counts them as writes', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const result = engine.execute('INSERT INTO t (name) VALUES (?) RETURNING id, name', ['a']);
    expect(result.results[0]).toEqual({ columns: ['id', 'name'], rows: [[1, 'a']] });
    expect(result.rowsAffected).toBe(1);
  });

  it.each([
    ['number', 42, 42],
    ['string', 'hello', 'hello'],
    ['null', null, null]
  ])('round trips a %s binding', (_label, input, expected) => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (v)');
    engine.execute('INSERT INTO t (v) VALUES (?)', [input]);
    expect(engine.execute('SELECT v FROM t').results[0]?.rows[0]?.[0]).toBe(expected);
  });

  // bigint 精度是本适配器不可退让的点：JSON 化会悄悄丢位，必须原样往返
  it('round trips an integer beyond Number.MAX_SAFE_INTEGER as bigint', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (v INTEGER)');
    engine.execute('INSERT INTO t (v) VALUES (?)', [9007199254740993n]);
    expect(engine.execute('SELECT v FROM t').results[0]?.rows[0]?.[0]).toBe(9007199254740993n);
  });

  // 安全整数降为 number，与 sqlite-wasm 的默认行为保持一致，避免上层到处判类型
  it('narrows safe integers back to number', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (v INTEGER)');
    engine.execute('INSERT INTO t (v) VALUES (?)', [7n]);
    expect(engine.execute('SELECT v FROM t').results[0]?.rows[0]?.[0]).toBe(7);
  });

  it('round trips a blob binding', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (v BLOB)');
    engine.execute('INSERT INTO t (v) VALUES (?)', [new Uint8Array([1, 2, 3])]);
    const value = engine.execute('SELECT v FROM t').results[0]?.rows[0]?.[0];
    expect(value).toBeInstanceOf(Uint8Array);
    expect(Array.from(value as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('accepts a number array as a blob binding', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (v BLOB)');
    engine.execute('INSERT INTO t (v) VALUES (?)', [[1, 2, 3]]);
    const value = engine.execute('SELECT v FROM t').results[0]?.rows[0]?.[0];
    expect(Array.from(value as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('executes a multi statement script', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER);');
    const names = engine.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    expect(names.results[0]?.rows).toEqual([['a'], ['b']]);
  });

  // node:sqlite 的 exec() 不接受绑定参数，静默只绑第一条语句会写错数据，因此直接拒绝
  it('rejects a multi statement script that carries bindings', () => {
    const engine = openEngine();
    expect(() => engine.execute('CREATE TABLE a (id); CREATE TABLE b (id);', [1])).toThrowError(/protocol_violation/);
  });

  it('wraps SQL errors with the offending statement and keeps the cause', () => {
    const engine = openEngine();
    try {
      engine.execute('SELECT * FROM nope');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SELECT * FROM nope');
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });

  it('refuses to run after close', () => {
    const engine = openEngine();
    engine.close();
    expect(() => engine.execute('SELECT 1')).toThrowError(/session_closed/);
  });
});

describe('NodeSqliteEngine change notification', () => {
  it('emits an insert event for a watched system table', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(events).toEqual([
      {
        type: SQLiteChangeType.SQLITE_INSERT,
        dbName: 'main',
        tableName: 'rxdb$rxdb_change',
        rowIds: [1n],
        recordAt: expect.any(Date)
      }
    ]);
  });

  it('groups the row ids written by a single statement into one event', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?), (?)', ['x', 'y']);
    expect(events).toHaveLength(1);
    expect(events[0]?.rowIds).toEqual([1n, 2n]);
  });

  it.each([
    ['update', 'UPDATE "rxdb$rxdb_change" SET payload = \'y\'', SQLiteChangeType.SQLITE_UPDATE],
    ['delete', 'DELETE FROM "rxdb$rxdb_change"', SQLiteChangeType.SQLITE_DELETE]
  ])('emits a %s event', (_label, sql, type) => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    events.length = 0;
    engine.execute(sql);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(type);
    expect(events[0]?.rowIds).toEqual([1n]);
  });

  it('splits one statement touching two watched tables into one event per table', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('CREATE TABLE "rxdb$rxdb_branch" (id INTEGER PRIMARY KEY)');
    engine.execute(
      'INSERT INTO "rxdb$rxdb_change" (payload) VALUES (\'x\'); INSERT INTO "rxdb$rxdb_branch" (id) VALUES (1);'
    );
    expect(events.map(event => event.tableName).sort()).toEqual(['rxdb$rxdb_branch', 'rxdb$rxdb_change']);
  });

  // 业务表的写入通过核心生成的触发器间接落到 rxdb$rxdb_change，不该在这里再抛一次
  it('ignores writes to tables outside the watch set', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('CREATE TABLE "rxdb$user" (id INTEGER PRIMARY KEY)');
    engine.execute('INSERT INTO "rxdb$user" (id) VALUES (1)');
    expect(events).toEqual([]);
  });

  it('starts watching a system table that is created after the session opened', () => {
    const engine = openEngine();
    engine.execute('SELECT 1');
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(events).toHaveLength(1);
  });

  // AC#8：通知机制不得污染用户的库文件
  it('keeps its notify triggers out of the persisted schema', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    engine.close();

    const inspector = new DatabaseSync(join(workspace, 'app.sqlite3'));
    const triggers = inspector.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all();
    inspector.close();
    expect(triggers).toEqual([]);
  });

  it('stops emitting once the engine is closed', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.close();
    events.length = 0;
    const other = openEngine();
    other.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(events).toHaveLength(1);
  });
});

describe('NodeSqliteEngine.version', () => {
  it('reports the underlying SQLite version', () => {
    expect(openEngine().version()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('NodeSqliteEngine.close', () => {
  // AC#1：重启后数据必须还在，这是「桌面本地数据库」的全部意义
  it('persists committed data across a reopen', () => {
    const first = openEngine();
    first.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    first.execute('INSERT INTO t (name) VALUES (?)', ['kept']);
    first.close();

    const second = openEngine();
    expect(second.execute('SELECT name FROM t').results[0]?.rows).toEqual([['kept']]);
  });

  // AC#9：句柄释放后文件必须可以被重命名，说明没有残留的 WAL/SHM 占用
  it('releases the file handle so the database can be renamed', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    engine.close();
    expect(existsSync(join(workspace, 'app.sqlite3-wal'))).toBe(false);
  });

  // AC#9：未提交的事务在断开时回滚，不能留下半截状态给下次启动
  it('rolls back an open transaction instead of committing it', () => {
    const first = openEngine();
    first.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    first.execute('INSERT INTO t (name) VALUES (?)', ['committed']);
    first.execute('BEGIN');
    first.execute('INSERT INTO t (name) VALUES (?)', ['dangling']);
    first.close();

    const second = openEngine();
    expect(second.execute('SELECT name FROM t').results[0]?.rows).toEqual([['committed']]);
  });

  it('is idempotent', () => {
    const engine = openEngine();
    engine.close();
    expect(() => engine.close()).not.toThrow();
  });
});
