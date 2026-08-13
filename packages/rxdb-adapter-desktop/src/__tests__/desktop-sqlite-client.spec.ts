import { SQLiteChangeType, type SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import { DesktopSqliteClient, type DesktopHostTransport } from '../desktop-sqlite-client.js';
import { createDesktopSqliteHost, type DesktopSqliteHost } from '../desktop-sqlite-host.js';

const sqliteStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' } as const;

let workspace: string;
let host: DesktopSqliteHost;
let transport: DesktopHostTransport;
let listeners: Set<(message: unknown) => void>;

/** 把 client 直接接到真实 host 上，中间不放 mock：跑的是完整的请求/应答与事件通路。 */
const createInProcessTransport = (): DesktopHostTransport => ({
  request: payload => host.handle(payload),
  subscribe: listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
});

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-client-'));
  listeners = new Set();
  host = createDesktopSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    }
  });
  transport = createInProcessTransport();
});

afterEach(() => {
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
});

describe('DesktopSqliteClient.connect', () => {
  it('reports the logical location the host resolved', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(client.resolvedLocation).toContain('app.sqlite3');
    expect(client.resolvedLocation).not.toContain(workspace);
  });

  it('takes the transaction SQL from the host rather than hard coding it', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(client.beginTransactionSql()).toBe('BEGIN;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });

  it('reports host_unavailable when no transport was injected', async () => {
    await expect(
      DesktopSqliteClient.connect(undefined as unknown as DesktopHostTransport, sqliteStorage)
    ).rejects.toThrowError(/host_unavailable/);
  });

  // 混装了不同版本的包时继续跑只会产生难以定位的形状错误
  it('refuses a host that speaks a different protocol version', async () => {
    const skewed: DesktopHostTransport = {
      request: async payload => {
        const response = await host.handle(payload);
        if (response.kind !== 'open') return response;
        return { ...response, result: { ...response.result, protocolVersion: 99 } };
      },
      subscribe: transport.subscribe
    };
    await expect(DesktopSqliteClient.connect(skewed, sqliteStorage)).rejects.toThrowError(/protocol_violation/);
  });

  // AC#6：错误码要跨传输层活着到达调用方，而不是被压平成一句字符串
  it('rebuilds the host error code on this side of the transport', async () => {
    const failing = createDesktopSqliteHost({
      resolveDatabasePath: () => {
        throw new Error('no app data directory yet');
      },
      postChange: () => undefined
    });
    const failingTransport: DesktopHostTransport = {
      request: payload => failing.handle(payload),
      subscribe: () => () => undefined
    };
    try {
      await DesktopSqliteClient.connect(failingTransport, sqliteStorage);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
      expect((error as RxDBAdapterDesktopError).code).toBe('open_failed');
      // 前缀只加一次，不因为跨了一趟传输就变成 [open_failed] [open_failed]
      expect((error as Error).message).toBe('[open_failed] the application could not resolve a path for app.sqlite3');
    }
  });
});

describe('DesktopSqliteClient.execute', () => {
  it('round trips a write and a read through the host', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await client.execute('INSERT INTO t (name) VALUES (?)', ['a']);
    const result = await client.execute('SELECT name FROM t');
    expect(result.results[0]?.rows).toEqual([['a']]);
    expect(result.rowsAffected).toBe(0);
  });

  it('reports a failing statement with its stable error code', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    try {
      await client.execute('SELECT * FROM nope');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('statement_failed');
    }
  });

  it('reports the SQLite version of the host engine', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(await client.version()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('DesktopSqliteClient change events', () => {
  const createChangeTable = (client: DesktopSqliteClient): Promise<unknown> =>
    client.execute('CREATE TABLE IF NOT EXISTS "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');

  it('delivers host changes to the registered handler', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const received: SqliteChangeEvent[] = [];
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => received.push(event));
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ tableName: 'rxdb$rxdb_change', rowIds: [1n] });
  });

  it('only delivers the change type each handler asked for', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const onDelete = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_DELETE, onDelete);
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(onDelete).not.toHaveBeenCalled();
    await client.execute('DELETE FROM "rxdb$rxdb_change"');
    expect(onDelete).toHaveBeenCalledOnce();
  });

  // 每个窗口只该看到自己那条连接的变更，否则跨窗口事件会被当成本地写入回灌
  it('ignores changes addressed to another session', async () => {
    const first = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const second = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const onFirst = vi.fn();
    await first.addEventListener(SQLiteChangeType.SQLITE_INSERT, onFirst);
    await createChangeTable(second);
    await second.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(onFirst).not.toHaveBeenCalled();
  });

  it('supports several handlers on one change type', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const first = vi.fn();
    const second = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, first);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, second);
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  // 半个事件流进 RxDB 变更管线会让本地缓存与库里的真实状态悄悄分叉，宁可炸出来
  it('refuses a malformed change message instead of dispatching half of it', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => undefined);
    const deliver = (): void => {
      for (const listener of listeners) {
        listener({ kind: 'change', sessionId: client.sessionId, event: { type: 99 } });
      }
    };
    expect(deliver).toThrowError(/protocol_violation/);
  });

  it('ignores messages that are not change notifications', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => undefined);
    expect(() => {
      for (const listener of listeners) listener({ kind: 'heartbeat' });
    }).not.toThrow();
  });
});

describe('DesktopSqliteClient.disconnect', () => {
  it('stops accepting new work', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    await expect(client.execute('SELECT 1')).rejects.toThrowError(/session_closed/);
  });

  // AC#9：在途查询必须先跑完，句柄才能释放
  it('waits for in flight work before releasing the handle', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const inFlight = client.execute('INSERT INTO t (name) VALUES (?)', ['racing']);
    await client.disconnect();
    await expect(inFlight).resolves.toMatchObject({ rowsAffected: 1 });

    const reopened = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect((await reopened.execute('SELECT name FROM t')).results[0]?.rows).toEqual([['racing']]);
  });

  it('releases the host session', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    expect(host.openSessionCount).toBe(0);
  });

  it('stops delivering change events', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const onInsert = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, onInsert);
    await client.disconnect();
    for (const listener of listeners) {
      listener({
        kind: 'change',
        sessionId: client.sessionId,
        event: {
          type: SQLiteChangeType.SQLITE_INSERT,
          dbName: 'main',
          tableName: 'rxdb$rxdb_change',
          rowIds: [1n],
          recordAt: new Date()
        }
      });
    }
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('is idempotent', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    await expect(client.disconnect()).resolves.toBeUndefined();
  });
});
