import {
  MAX_BATCH_WAIT_MS,
  SQLiteChangeType,
  WATCH_TABLES,
  type SqliteChangeEvent
} from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterDesktopError } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeSqliteEngine } from '../node-sqlite-engine.js';

let workspace: string;
/** 应用作用域之外的目录，用来验证 SQL 打不穿宿主根。 */
let outside: string;
let engines: NodeSqliteEngine[];
let events: SqliteChangeEvent[];

/** SQL 字面量里统一用正斜杠，Windows 路径直接内嵌会被当成转义序列。 */
const sqlPath = (value: string): string => value.replace(/\\/g, '/');

/** 引擎只为这几张核心系统表装通知触发器；用真集合而非硬编码，核心加表时用例跟着走。 */
const WATCHED_TABLES = [...WATCH_TABLES];

const openEngine = (fileName = 'app.sqlite3', batchTimeout?: number): NodeSqliteEngine => {
  const engine = NodeSqliteEngine.open({
    filePath: join(workspace, fileName),
    dbName: fileName,
    onChange: event => events.push(event),
    batchTimeout
  });
  engines.push(engine);
  return engine;
};

/** 变更事件是防抖派发的，断言前必须先把定时器等出来。 */
const flushed = (count = 1): Promise<void> =>
  vi.waitFor(() => {
    expect(events.length).toBeGreaterThanOrEqual(count);
  });

/** 建出与核心系统表同名的表，好让通知触发器有落点。 */
const createChangeTable = (engine: NodeSqliteEngine): void => {
  engine.execute('CREATE TABLE IF NOT EXISTS "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');
};

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-'));
  outside = mkdtempSync(join(tmpdir(), 'rxdb-outside-'));
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
  rmSync(outside, { recursive: true, force: true });
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

  // AC#4：打不开就报错，绝不静默降级到内存库让用户以为数据落了盘
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

describe('NodeSqliteEngine file scope', () => {
  /** 越界语句必须以稳定错误码被拒，而不是靠“SQL 里没有 ATTACH 字样”这类文本判断。 */
  const expectDenied = (engine: NodeSqliteEngine, sql: string): void => {
    try {
      engine.execute(sql);
      expect.unreachable(`should have denied: ${sql}`);
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
      expect((error as RxDBAdapterDesktopError).code).toBe('permission_denied');
    }
  };

  // RV-002：renderer 可控的 SQL 不能在宿主根之外新建文件
  it('denies ATTACH DATABASE and creates no file outside the app scope', () => {
    const engine = openEngine();
    const escaped = join(outside, 'escaped.sqlite');

    expectDenied(engine, `ATTACH DATABASE '${sqlPath(escaped)}' AS escaped`);

    expect(existsSync(escaped)).toBe(false);
    // 附加库真被拒了，命名空间就不该存在；否则后续语句仍能写出去
    expect(() => engine.execute('CREATE TABLE escaped.proof (value TEXT)')).toThrowError(RxDBAdapterDesktopError);
    expect(existsSync(escaped)).toBe(false);
  });

  // RV-002：已存在的外部 SQLite 文件既不能读也不能改
  it('denies ATTACH of an existing external database and leaves its bytes untouched', () => {
    const victimPath = join(outside, 'victim.sqlite');
    const victim = new DatabaseSync(victimPath);
    victim.exec('CREATE TABLE secret (value TEXT)');
    victim.exec("INSERT INTO secret (value) VALUES ('classified')");
    victim.close();
    const before = readFileSync(victimPath);

    const engine = openEngine();
    expectDenied(engine, `ATTACH DATABASE '${sqlPath(victimPath)}' AS victim`);
    expect(() => engine.execute('SELECT value FROM victim.secret')).toThrowError(RxDBAdapterDesktopError);

    expect(readFileSync(victimPath).equals(before)).toBe(true);
  });

  // RV-002：VACUUM INTO 不写 ATTACH 关键字，但同样由 SQLite 打开外部文件
  it('denies VACUUM INTO an external path', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const copy = join(outside, 'copy.sqlite');

    expectDenied(engine, `VACUUM INTO '${sqlPath(copy)}'`);

    expect(existsSync(copy)).toBe(false);
  });

  /**
   * `temp_store_directory` 把 SQLite 的临时文件引到宿主根之外，`data_store_directory` 对
   * 相对路径的库文件同理——两条都绕开了宿主那次路径解析，正是 ATTACH 被拦的同一个理由。
   *
   * 更糟的是它们改的是 `sqlite3_temp_directory` / `sqlite3_data_directory` 这两个**进程级全局**：
   * 一个会话设了，同进程里其余会话（别的窗口、别的库）全都跟着改，而且 SQLite 官方标注
   * 二者都已废弃且非线程安全。所以另开一条连接验证全局没被动过——只断言语句被拒，
   * 挡漏了也照样绿。
   *
   * 大小写与引号变体一并覆盖：SQLite 的 pragma 名不区分大小写，但交给授权器的是
   * **用户写的那个拼法**（`PRAGMA TEMP_STORE_DIRECTORY` 传过去就是全大写）。
   * 按原样全等匹配的话，renderer 改一下大小写就绕过去了。
   */
  it('denies the pragmas that repoint SQLite process wide directories', () => {
    const engine = openEngine();
    for (const pragma of ['temp_store_directory', 'data_store_directory']) {
      for (const spelling of [pragma, pragma.toUpperCase(), `"${pragma.toUpperCase()}"`]) {
        expectDenied(engine, `PRAGMA ${spelling} = '${sqlPath(outside)}'`);
        // 读也拒：回给 renderer 的是一个宿主绝对路径
        expectDenied(engine, `PRAGMA ${spelling}`);
      }
    }

    const probe = new DatabaseSync(join(workspace, 'probe.sqlite3'));
    const temporary = probe.prepare('PRAGMA temp_store_directory').all();
    probe.close();
    expect(temporary).toEqual([]);
  });

  // 授权器不能误伤库内能力：rawQuery() 的正常用途必须原样可用
  it('still allows in-database DDL, DML, transactions and PRAGMA', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    engine.execute('BEGIN IMMEDIATE');
    engine.execute('INSERT INTO t (name) VALUES (?)', ['kept']);
    engine.execute('COMMIT');
    engine.execute('CREATE INDEX idx_t_name ON t (name)');

    expect(engine.execute('SELECT name FROM t').results[0]?.rows).toEqual([['kept']]);
    expect(engine.execute('PRAGMA journal_mode').results[0]?.rows[0]?.[0]).toBe('wal');
  });

  // 通知触发器建在 temp 库上，授权器不能把变更事件一起封死
  it('still delivers change events through the temp notify triggers', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);

    await flushed();
    expect(events[0]?.type).toBe(SQLiteChangeType.SQLITE_INSERT);
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

  // 与 execute_helper.ts 的 `rowsAffected += sqlite3.changes(db)` 对齐：
  // changes() 只反映最后一条语句，拿它当整个脚本的答案会漏掉前面几条。
  it('sums rowsAffected across the statements of a script', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (id INTEGER PRIMARY KEY);');
    engine.execute('INSERT INTO a (id) VALUES (1), (2), (3); INSERT INTO b (id) VALUES (1);');
    expect(engine.execute('DELETE FROM a; DELETE FROM b;').rowsAffected).toBe(4);
  });

  // SQLC-030 的脚本版：changes() 不被 DDL 重置，一条纯 DDL 脚本会报出上一条写语句的计数。
  it('does not inherit a stale changes() count for a script that touches no rows', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    expect(engine.execute('INSERT INTO t (id) VALUES (1), (2)').rowsAffected).toBe(2);
    expect(engine.execute('CREATE TABLE u (id INTEGER PRIMARY KEY);').rowsAffected).toBe(0);
    expect(engine.execute('CREATE INDEX ix ON t (id); CREATE INDEX iu ON u (id);').rowsAffected).toBe(0);
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

  // 分支切换发出的就是这个形状：先重建触发器，最后一条 UPDATE ... RETURNING。node:sqlite 的 exec()
  // 会把 RETURNING 的行整个吞掉，上层于是收到空结果集，误以为没有任何行被切换（AC#2）。
  it('returns the result set of a row producing statement inside a script', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, activated INTEGER)');
    engine.execute('INSERT INTO t (id, activated) VALUES (1, 0)');
    const result = engine.execute(
      'CREATE TEMP TRIGGER tr AFTER UPDATE ON t BEGIN SELECT 1; END;' +
        ' UPDATE t SET activated = 1 RETURNING id, activated;'
    );
    expect(result.results).toEqual([{ columns: ['id', 'activated'], rows: [[1, 1]] }]);
    expect(result.rowsAffected).toBe(1);
  });

  it('runs every statement in a script even after one produced rows', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    engine.execute('INSERT INTO t (id) VALUES (1) RETURNING id; INSERT INTO t (id) VALUES (2);');
    expect(engine.execute('SELECT id FROM t ORDER BY id').results[0]?.rows).toEqual([[1], [2]]);
  });

  // oo1 与 wa-sqlite 对「没有语句」的脚本都是静默无操作，桌面后端不能独自抛错
  it('treats a script without any statement as a no-op', () => {
    const engine = openEngine();
    expect(engine.execute('-- nothing to do\n').results).toEqual([]);
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
  // 事件必须在语句返回之后的任务里派发：同步派发会让订阅者在事务还开着、行还没提交时就去读库，
  // 而 wasm 后端从来是防抖派发的，跟着它才谈得上「桌面路径行为一致」（AC#2）
  it('does not dispatch inside the execute call that produced the change', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(events).toEqual([]);
  });

  it('emits an insert event for a watched system table', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
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

  it('groups the row ids written by a single statement into one event', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?), (?)', ['x', 'y']);
    await flushed();
    expect(events).toHaveLength(1);
    expect(events[0]?.rowIds).toEqual([1n, 2n]);
  });

  it('merges the writes of consecutive statements into one event', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['y']);
    await flushed();
    expect(events).toHaveLength(1);
    expect(events[0]?.rowIds).toEqual([1n, 2n]);
  });

  it.each([
    ['update', 'UPDATE "rxdb$rxdb_change" SET payload = \'y\'', SQLiteChangeType.SQLITE_UPDATE],
    ['delete', 'DELETE FROM "rxdb$rxdb_change"', SQLiteChangeType.SQLITE_DELETE]
  ])('emits a %s event', async (_label, sql, type) => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
    events.length = 0;
    engine.execute(sql);
    await flushed();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(type);
    expect(events[0]?.rowIds).toEqual([1n]);
  });

  it('splits one statement touching two watched tables into one event per table', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('CREATE TABLE "rxdb$rxdb_branch" (id INTEGER PRIMARY KEY)');
    engine.execute(
      'INSERT INTO "rxdb$rxdb_change" (payload) VALUES (\'x\'); INSERT INTO "rxdb$rxdb_branch" (id) VALUES (1);'
    );
    await flushed(2);
    expect(events.map(event => event.tableName).sort()).toEqual(['rxdb$rxdb_branch', 'rxdb$rxdb_change']);
  });

  // 业务表的写入通过核心生成的触发器间接落到 rxdb$rxdb_change，不该在这里再抛一次
  it('ignores writes to tables outside the watch set', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('CREATE TABLE "rxdb$user" (id INTEGER PRIMARY KEY)');
    engine.execute('INSERT INTO "rxdb$user" (id) VALUES (1)');
    await new Promise(resolve => setTimeout(resolve, MAX_BATCH_WAIT_MS * 2));
    expect(events).toEqual([]);
  });

  it('starts watching a system table that is created after the session opened', async () => {
    const engine = openEngine();
    engine.execute('SELECT 1');
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
    expect(events).toHaveLength(1);
  });

  /**
   * TEMP 触发器与主库共用同一个事务：装它的事务一回滚，它就跟着消失。
   * 引擎若把「已装」记成了永久事实，惰性安装此后会一直跳过这张表，该表的变更事件静默丢失——
   * 而适配器的建表脚本正是跑在 `BEGIN IMMEDIATE` / `COMMIT` 之间，COMMIT 失败后同一会话会重试。
   */
  it('reinstalls the notify triggers when the transaction that created the table rolls back', async () => {
    const engine = openEngine();
    engine.execute('BEGIN IMMEDIATE');
    createChangeTable(engine);
    engine.execute('ROLLBACK');

    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
    expect(events).toHaveLength(1);
  });

  // 三张表全建在同一个事务里时，「已装」的记录会撑满 WATCH_TABLES 触发提前返回，
  // 回滚之后连 sqlite_master 都不再查——比单表漏装更彻底，必须单独钉住
  it('reinstalls the triggers of every watched table after the transaction that created them all rolls back', async () => {
    const engine = openEngine();
    const createAll = (): void => {
      for (const table of WATCHED_TABLES) {
        engine.execute(`CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY, payload TEXT)`);
      }
    };
    engine.execute('BEGIN IMMEDIATE');
    createAll();
    engine.execute('ROLLBACK');

    createAll();
    for (const table of WATCHED_TABLES) {
      engine.execute(`INSERT INTO "${table}" (payload) VALUES (?)`, ['x']);
    }
    await flushed(WATCHED_TABLES.length);
    expect(events.map(event => event.tableName).sort()).toEqual([...WATCHED_TABLES].sort());
  });

  /**
   * 回滚不只来自调用方发的 `ROLLBACK`：`ON CONFLICT ROLLBACK` 在语句内部就把事务掀了，
   * 谁也没发过那条语句。Rust 侧为此专门挂了 SQLite 的 rollback hook；`node:sqlite` 不暴露它，
   * 所以这里改成不认「回滚发生了没有」，只认「触发器是不是装在事务里的」——两条路径一并覆盖。
   */
  it('reinstalls the notify triggers after an ON CONFLICT ROLLBACK tore down the transaction', async () => {
    const engine = openEngine();
    engine.execute('BEGIN IMMEDIATE');
    engine.execute(
      'CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT UNIQUE ON CONFLICT ROLLBACK)'
    );
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['dup']);
    expect(() => engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['dup'])).toThrow();
    // 先把回滚前那次写入攒下的事件放出来再清账：不排空的话，它稍后落进 events 会被
    // 后面的断言错认成「触发器还在工作」，用例就变成了永远绿
    await new Promise(resolve => setTimeout(resolve, MAX_BATCH_WAIT_MS * 2));
    events.length = 0;

    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
    expect(events).toHaveLength(1);
  });

  // 事务内的写入本身也要能被观察到：修法不能退化成「事务里干脆不装触发器」
  it('emits for a write made inside the same transaction that created the table', async () => {
    const engine = openEngine();
    engine.execute('BEGIN IMMEDIATE');
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    engine.execute('COMMIT');
    await flushed();
    expect(events).toHaveLength(1);
  });

  /**
   * 纯防抖会被持续写入饿死：每次写入都重置定时器，事件积到写完才发。
   * 硬上限保证一批从第一个待发事件起最多 {@link MAX_BATCH_WAIT_MS} 就必定发一次。
   */
  it('force flushes within the hard cap while writes keep coming', async () => {
    const engine = openEngine('app.sqlite3', MAX_BATCH_WAIT_MS * 10);
    createChangeTable(engine);

    for (let i = 0; i < 30 && events.length === 0; i++) {
      engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', [`v${i}`]);
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    expect(events.length).toBeGreaterThan(0);
  });

  // AC#6：通知机制不得污染用户的库文件
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

  // 关闭时同步发掉攒着的事件，否则最后一批写入的通知会随定时器一起被丢掉
  it('flushes the pending batch synchronously on close', () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(events).toEqual([]);
    engine.close();
    expect(events).toHaveLength(1);
  });

  it('stops emitting once the engine is closed', async () => {
    const engine = openEngine();
    createChangeTable(engine);
    engine.close();
    events.length = 0;
    const other = openEngine();
    other.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await flushed();
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

  // AC#7：句柄释放后文件必须可以被重命名，说明没有残留的 WAL/SHM 占用
  it('releases the file handle so the database can be renamed', () => {
    const engine = openEngine();
    engine.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    engine.execute('INSERT INTO t (name) VALUES (?)', ['kept']);
    engine.close();

    // 先查 sidecar 再改名：POSIX 上句柄还开着 rename 也照样成功，光靠改名在 macOS/Linux 上
    // 验不出占用；残留的 -wal/-shm 才是「没收干净」的直接证据。改名本身是 Windows 那一半断言。
    expect(existsSync(join(workspace, 'app.sqlite3-wal'))).toBe(false);
    expect(existsSync(join(workspace, 'app.sqlite3-shm'))).toBe(false);

    renameSync(join(workspace, 'app.sqlite3'), join(workspace, 'renamed.sqlite3'));

    // 改完还能打开并读回数据，说明搬走的是一份自洽的库；否则就是已提交数据还压在
    // 没 checkpoint 的 WAL 里，单独搬主文件等于丢数据。
    expect(openEngine('renamed.sqlite3').execute('SELECT name FROM t').results[0]?.rows).toEqual([['kept']]);
  });

  // AC#7：未提交的事务在断开时回滚，不能留下半截状态给下次启动
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
