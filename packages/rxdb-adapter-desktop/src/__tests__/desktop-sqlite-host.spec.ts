import { SQLiteChangeType, type SqliteResult } from '@aiao/rxdb-adapter-sqlite-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_HOST_PROTOCOL_VERSION, type DesktopHostChangeEventMessage } from '../desktop-host-protocol.js';
import { createDesktopSqliteHost, type DesktopSqliteHost } from '../desktop-sqlite-host.js';

let workspace: string;
let host: DesktopSqliteHost;
let changes: DesktopHostChangeEventMessage[];

const sqliteStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' } as const;

// 变更事件是防抖派发的；`batchTimeout: 0` 把窗口压到「下一个宏任务」，用例才不用等真实毫秒。
const openSessionOn = async (target: DesktopSqliteHost, databaseName = 'app.sqlite3'): Promise<string> => {
  const response = await target.handle({
    kind: 'open',
    storage: { engine: 'sqlite', databaseName },
    batchTimeout: 0
  });
  if (response.kind !== 'open') throw new Error(`expected an open response, got ${response.kind}`);
  return response.result.sessionId;
};

const openSession = (databaseName = 'app.sqlite3'): Promise<string> => openSessionOn(host, databaseName);

const execute = async (sessionId: string, sql: string, bindings: unknown[] = []): Promise<SqliteResult> => {
  const response = await host.handle({ kind: 'execute', sessionId, sql, bindings });
  if (response.kind !== 'execute') throw new Error(`expected an execute response, got ${response.kind}`);
  return response.result;
};

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-host-'));
  changes = [];
  host = createDesktopSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => changes.push(message)
  });
});

afterEach(() => {
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
});

describe('open', () => {
  it('answers with a session and the transaction SQL of the backend', async () => {
    const response = await host.handle({ kind: 'open', storage: sqliteStorage });
    expect(response).toMatchObject({
      kind: 'open',
      result: {
        protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        beginTransactionSql: 'BEGIN IMMEDIATE;',
        beginSystemMigrationTransactionSql: 'BEGIN EXCLUSIVE;'
      }
    });
  });

  // AC#3：renderer 拿到物理根目录等于白拿一份文件系统情报，而它并不需要这份情报
  it('reports a logical location that leaks no filesystem path', async () => {
    const response = await host.handle({ kind: 'open', storage: sqliteStorage });
    if (response.kind !== 'open') throw new Error('expected an open response');
    expect(response.result.resolvedLocation).not.toContain(workspace);
    expect(response.result.resolvedLocation).toContain('app.sqlite3');
  });

  it('issues a distinct session per open', async () => {
    expect(await openSession()).not.toBe(await openSession());
  });

  // 两个窗口各自持有连接：共用一条连接会让它们的 BEGIN 块互相穿插
  it('gives concurrent sessions on one file independent connections', async () => {
    const writer = await openSession();
    const reader = await openSession();
    await execute(writer, 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await execute(writer, 'INSERT INTO t (name) VALUES (?)', ['shared']);
    expect((await execute(reader, 'SELECT name FROM t')).results[0]?.rows).toEqual([['shared']]);
  });

  it('reports open_failed when the application cannot resolve a path', async () => {
    const failing = createDesktopSqliteHost({
      resolveDatabasePath: () => {
        throw new Error('no app data directory yet');
      },
      postChange: () => undefined
    });
    const response = await failing.handle({ kind: 'open', storage: sqliteStorage });
    expect(response).toMatchObject({ kind: 'error', code: 'open_failed' });
  });
});

describe('request validation', () => {
  // AC#4：错误码要跨 IPC 活着到达 renderer，所以失败走返回值而不是 reject
  it.each([
    ['a malformed request', { kind: 'drop' }, 'protocol_violation'],
    [
      'a database name escaping the app scope',
      { kind: 'open', storage: { engine: 'sqlite', databaseName: '../escape' } },
      'invalid_database_name'
    ],
    [
      'an unsupported engine',
      { kind: 'open', storage: { engine: 'pglite', dataDirectoryName: 'pg' } },
      'unsupported_runtime_engine'
    ]
  ])('answers with a discriminable error code for %s', async (_label, request, code) => {
    expect(await host.handle(request)).toMatchObject({ kind: 'error', code });
  });

  it('never rejects, so the IPC layer cannot flatten the error code into a string', async () => {
    await expect(host.handle(null)).resolves.toMatchObject({ kind: 'error' });
  });

  it('rejects an unknown session', async () => {
    const response = await host.handle({
      kind: 'execute',
      sessionId: '7f1d2c3b-4a59-4e6f-8b0d-1e2f3a4b5c6d',
      sql: 'SELECT 1'
    });
    expect(response).toMatchObject({ kind: 'error', code: 'session_closed' });
  });

  // 一个窗口不得拿别的窗口的 sessionId 去操作它的连接以外的东西
  it('keeps each session bound to the database it was opened for', async () => {
    const first = await openSession('first.sqlite3');
    const second = await openSession('second.sqlite3');
    await execute(first, 'CREATE TABLE only_in_first (id INTEGER)');
    const response = await host.handle({ kind: 'execute', sessionId: second, sql: 'SELECT * FROM only_in_first' });
    expect(response).toMatchObject({ kind: 'error', code: 'statement_failed' });
  });
});

describe('execute', () => {
  it('returns the sqlite core result shape', async () => {
    const sessionId = await openSession();
    expect(await execute(sessionId, 'SELECT 1 AS one')).toMatchObject({
      sql: 'SELECT 1 AS one',
      rowsAffected: 0,
      results: [{ columns: ['one'], rows: [[1]] }]
    });
  });

  it('carries bigint and blob bindings through untouched', async () => {
    const sessionId = await openSession();
    await execute(sessionId, 'CREATE TABLE t (big INTEGER, blob BLOB)');
    await execute(sessionId, 'INSERT INTO t VALUES (?, ?)', [9007199254740993n, new Uint8Array([7, 8])]);
    const [row] = (await execute(sessionId, 'SELECT big, blob FROM t')).results[0]?.rows ?? [];
    expect(row?.[0]).toBe(9007199254740993n);
    expect(Array.from(row?.[1] as Uint8Array)).toEqual([7, 8]);
  });
});

// 两个窗口 = 同一个文件上的两条连接，撞锁是常态。等待必须发生在异步层：
// 所有连接共享 Electron 主进程的那一条线程，同步等锁会把持锁方的 COMMIT 一起卡死。
describe('busy retry', () => {
  it('waits for the holder to commit instead of failing the transaction start', async () => {
    const holder = await openSession();
    const waiter = await openSession();
    await execute(holder, 'CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await execute(holder, 'BEGIN IMMEDIATE;');
    await execute(holder, 'INSERT INTO t (id) VALUES (1)');

    const started = execute(waiter, 'BEGIN IMMEDIATE;\nPRAGMA defer_foreign_keys = ON;');
    // 只有让出事件循环，持锁方的 COMMIT 才轮得到——这正是同步等锁做不到的那一步。
    await execute(holder, 'COMMIT;');
    await started;

    await execute(waiter, 'INSERT INTO t (id) VALUES (2)');
    await execute(waiter, 'COMMIT;');
    expect((await execute(holder, 'SELECT id FROM t ORDER BY id')).results[0]?.rows).toEqual([[1], [2]]);
  });

  it('reports database_busy once the retry budget runs out', async () => {
    const impatient = createDesktopSqliteHost({
      resolveDatabasePath: databaseName => join(workspace, databaseName),
      postChange: message => changes.push(message),
      busyRetryBudgetMs: 20
    });
    try {
      const holder = await openSessionOn(impatient);
      const waiter = await openSessionOn(impatient);
      await impatient.handle({ kind: 'execute', sessionId: holder, sql: 'BEGIN IMMEDIATE;', bindings: [] });
      await impatient.handle({ kind: 'execute', sessionId: holder, sql: 'CREATE TABLE t (id INTEGER)', bindings: [] });

      // 持锁方一直不提交：等到预算耗尽必须报 `database_busy` 而不是 `statement_failed`，
      // 调用方要凭这个码分辨「稍后重试」和「这条 SQL 本身是错的」。
      expect(
        await impatient.handle({ kind: 'execute', sessionId: waiter, sql: 'BEGIN IMMEDIATE;', bindings: [] })
      ).toMatchObject({ kind: 'error', code: 'database_busy' });
    } finally {
      impatient.closeAll();
    }
  });

  it('does not retry statements inside an open transaction', async () => {
    const holder = await openSession();
    const waiter = await openSession();
    await execute(holder, 'CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await execute(waiter, 'BEGIN;');
    await execute(holder, 'BEGIN IMMEDIATE;');
    await execute(holder, 'INSERT INTO t (id) VALUES (1)');

    // 事务中途撞锁不该被 host 悄悄重发：此刻快照已经作废，重来与否只有调用方知道。
    const start = performance.now();
    expect(
      await host.handle({ kind: 'execute', sessionId: waiter, sql: 'INSERT INTO t (id) VALUES (2)' })
    ).toMatchObject({ kind: 'error', code: 'database_busy' });
    expect(performance.now() - start).toBeLessThan(1_000);
  });
});

describe('version', () => {
  it('reports the engine version of a session', async () => {
    const response = await host.handle({ kind: 'version', sessionId: await openSession() });
    expect(response).toMatchObject({ kind: 'version' });
    if (response.kind !== 'version') throw new Error('expected a version response');
    expect(response.result).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('change notification', () => {
  it('tags each change with the session it belongs to', async () => {
    const sessionId = await openSession();
    await execute(sessionId, 'CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');
    await execute(sessionId, 'INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await vi.waitFor(() => {
      expect(changes).toHaveLength(1);
    });
    expect(changes[0]).toMatchObject({
      kind: 'change',
      sessionId,
      event: { type: SQLiteChangeType.SQLITE_INSERT, tableName: 'rxdb$rxdb_change', rowIds: [1n] }
    });
  });

  // 一个窗口关掉不该让另一个窗口的订阅跟着停
  it('keeps delivering to the sessions that are still open', async () => {
    const first = await openSession();
    const second = await openSession();
    await execute(first, 'CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');
    await host.handle({ kind: 'close', sessionId: first });
    changes.length = 0;
    await execute(second, 'INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await vi.waitFor(() => {
      expect(changes).toHaveLength(1);
    });
    expect(changes.map(change => change.sessionId)).toEqual([second]);
  });

  // 窗口在写入途中被销毁是常规竞态：写已经落库，此时报写失败会让调用方重试出重复数据
  it('does not fail a write when delivery to the renderer throws', async () => {
    const onDeliveryError = vi.fn();
    const failing = createDesktopSqliteHost({
      resolveDatabasePath: databaseName => join(workspace, databaseName),
      postChange: () => {
        throw new Error('renderer window was destroyed');
      },
      onDeliveryError
    });
    const sessionId = await openSessionOn(failing);
    await failing.handle({
      kind: 'execute',
      sessionId,
      sql: 'CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)'
    });
    const write = await failing.handle({
      kind: 'execute',
      sessionId,
      sql: `INSERT INTO "rxdb$rxdb_change" (payload) VALUES ('x')`
    });
    expect(write.kind).toBe('execute');
    await vi.waitFor(() => {
      expect(onDeliveryError).toHaveBeenCalledOnce();
    });
    failing.closeAll();
  });

  // 上报回调自己再抛错时，异常是从定时器回调里冒出来的：不隔离就是主进程的未捕获异常，
  // 一个订阅者的缺陷会把整个 Electron 应用带走，而此刻写入其实早已落库。
  it('survives an error reporter that is itself broken', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = createDesktopSqliteHost({
      resolveDatabasePath: databaseName => join(workspace, databaseName),
      postChange: () => {
        throw new Error('renderer window was destroyed');
      },
      onDeliveryError: () => {
        throw new Error('the application error reporter is itself broken');
      }
    });
    const sessionId = await openSessionOn(failing);
    await failing.handle({
      kind: 'execute',
      sessionId,
      sql: 'CREATE TABLE "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)'
    });
    const write = await failing.handle({
      kind: 'execute',
      sessionId,
      sql: `INSERT INTO "rxdb$rxdb_change" (payload) VALUES ('x')`
    });
    expect(write.kind).toBe('execute');
    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalledOnce();
    });
    // 会话没被这次异常打坏，后续请求照常受理
    const next = await failing.handle({
      kind: 'execute',
      sessionId,
      sql: `SELECT count(*) FROM "rxdb$rxdb_change"`
    });
    expect(next).toMatchObject({ kind: 'execute', result: { results: [{ rows: [[1]] }] } });
    failing.closeAll();
    logged.mockRestore();
  });
});

describe('close', () => {
  it('releases the session so later requests are rejected', async () => {
    const sessionId = await openSession();
    expect(await host.handle({ kind: 'close', sessionId })).toEqual({ kind: 'close' });
    expect(await host.handle({ kind: 'version', sessionId })).toMatchObject({
      kind: 'error',
      code: 'session_closed'
    });
  });

  // AC#1：断开后重连同一路径必须读回同一份数据
  it('allows reconnecting to the same file in the same process', async () => {
    const first = await openSession();
    await execute(first, 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await execute(first, 'INSERT INTO t (name) VALUES (?)', ['kept']);
    await host.handle({ kind: 'close', sessionId: first });

    const second = await openSession();
    expect((await execute(second, 'SELECT name FROM t')).results[0]?.rows).toEqual([['kept']]);
  });

  it('closes every open session', async () => {
    const first = await openSession('first.sqlite3');
    const second = await openSession('second.sqlite3');
    host.closeAll();
    expect(await host.handle({ kind: 'version', sessionId: first })).toMatchObject({ code: 'session_closed' });
    expect(await host.handle({ kind: 'version', sessionId: second })).toMatchObject({ code: 'session_closed' });
  });

  // AC#6：Aiao 只动自己的系统对象，用户原有的业务表必须原样留着
  it('preserves unknown business tables that already live in the file', async () => {
    const seed = await openSession();
    await execute(seed, 'CREATE TABLE legacy_invoices (id INTEGER PRIMARY KEY, total REAL)');
    await execute(seed, 'INSERT INTO legacy_invoices (total) VALUES (?)', [12.5]);
    await host.handle({ kind: 'close', sessionId: seed });

    const reopened = await openSession();
    expect((await execute(reopened, 'SELECT total FROM legacy_invoices')).results[0]?.rows).toEqual([[12.5]]);
  });
});

describe('host_internal_error', () => {
  // host 自己的缺陷不该被贴上 statement_failed 之类似是而非的码：那会把排查方向从一开始就带偏，
  // 让人去查一条完全正常的 SQL。归不了类就如实说归不了类。
  it('surfaces an unclassifiable host failure as a bug instead of mislabelling it', async () => {
    const hostile = {
      get kind(): string {
        throw new Error('the payload is not what it claims to be');
      }
    };
    expect(await host.handle(hostile)).toEqual({
      kind: 'error',
      code: 'host_internal_error',
      message: 'the payload is not what it claims to be'
    });
  });
});
