import type { RxDB } from '@aiao/rxdb';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import {
  DESKTOP_HOST_TRANSPORT_KEY,
  type DesktopHostTransport,
  type DesktopSqliteClient
} from '../desktop-sqlite-client.js';
import { createDesktopSqliteHost, type DesktopSqliteHost } from '../desktop-sqlite-host.js';
import { RxDBAdapterDesktop } from '../RxDBAdapterDesktop.js';
import type { DesktopOptions } from '../desktop-adapter.interface.js';

/** `createClient` 是 protected：测试子类只把它开出来，不改任何行为。 */
class TestDesktopAdapter extends RxDBAdapterDesktop {
  createTestClient(): Promise<DesktopSqliteClient> {
    return this.createClient();
  }
}

let workspace: string;
let host: DesktopSqliteHost;
let transport: DesktopHostTransport;

const rxdbWith = (dbName: string): RxDB => ({ config: { dbName } }) as RxDB;

const createAdapter = (dbName: string, options: DesktopOptions = {}): TestDesktopAdapter =>
  new TestDesktopAdapter(rxdbWith(dbName), { transport, ...options });

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-adapter-'));
  host = createDesktopSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: () => undefined
  });
  transport = {
    request: payload => host.handle(payload),
    subscribe: () => () => undefined
  };
});

afterEach(() => {
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
  delete (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];
});

describe('RxDBAdapterDesktop', () => {
  it('registers itself under the desktop adapter name', () => {
    expect(createAdapter('notes').name).toBe('desktop');
  });

  it('derives the database file name from the RxDB database name', async () => {
    const adapter = createAdapter('notes');
    expect(adapter.databaseName).toBe('notes.sqlite3');
    expect((await adapter.createTestClient()).resolvedLocation).toContain('notes.sqlite3');
  });

  it('lets an explicit databaseName win over the derived one', async () => {
    const adapter = createAdapter('notes', { databaseName: 'legacy.db' });
    expect(adapter.databaseName).toBe('legacy.db');
    const client = await adapter.createTestClient();
    expect(client.resolvedLocation).toContain('legacy.db');
    expect(client.resolvedLocation).not.toContain('notes');
  });

  // 名字非法就没有能打开的库，等到发出 IPC 才发现只会让报错离原因更远
  it('rejects an out-of-scope database name at construction time', () => {
    expect(() => createAdapter('../escape')).toThrowError(/invalid_database_name/);
  });

  it('builds a client that actually reaches the host', async () => {
    const client = await createAdapter('notes').createTestClient();
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await client.execute('INSERT INTO t (name) VALUES (?)', ['wired']);
    expect((await client.execute('SELECT name FROM t')).results[0]?.rows).toEqual([['wired']]);
  });

  it('takes the transaction SQL from the host it connected to', async () => {
    const client = await createAdapter('notes').createTestClient();
    expect(client.beginTransactionSql()).toBe('BEGIN;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });
});

describe('transport resolution', () => {
  it('falls back to the transport the preload script exposed', async () => {
    (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY] = transport;
    const adapter = new TestDesktopAdapter(rxdbWith('notes'));
    expect((await adapter.createTestClient()).resolvedLocation).toContain('notes.sqlite3');
  });

  // 桌面路径没有 renderer 侧的降级后端可用：宁可报 host 缺失，也不能悄悄换个存储
  it('reports host_unavailable when nothing exposed a transport', async () => {
    const adapter = new TestDesktopAdapter(rxdbWith('notes'));
    await expect(adapter.createTestClient()).rejects.toThrowError(/host_unavailable/);
  });

  it('names the global the preload script has to expose', async () => {
    const adapter = new TestDesktopAdapter(rxdbWith('notes'));
    try {
      await adapter.createTestClient();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('host_unavailable');
      expect((error as Error).message).toContain(DESKTOP_HOST_TRANSPORT_KEY);
    }
  });

  // 半成品桥接（只暴露了 request）比完全没暴露更难查，得在连接前就拦下来
  it('refuses a transport that does not implement the full bridge', async () => {
    (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY] = { request: () => Promise.resolve(null) };
    const adapter = new TestDesktopAdapter(rxdbWith('notes'));
    await expect(adapter.createTestClient()).rejects.toThrowError(/host_unavailable/);
  });
});
