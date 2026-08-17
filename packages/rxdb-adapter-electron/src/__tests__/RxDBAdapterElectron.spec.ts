import type { RxDB } from '@aiao/rxdb';
import {
  DESKTOP_HOST_TRANSPORT_KEY,
  RxDBAdapterDesktopError,
  type DesktopHostTransport,
  type DesktopOptions,
  type DesktopSqliteClient
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElectronSqliteHost, type ElectronSqliteHost } from '../electron-sqlite-host.js';
import { RxDBAdapterElectron } from '../RxDBAdapterElectron.js';

/** `createClient` 是 protected：测试子类只把它开出来，不改任何行为。 */
class TestElectronAdapter extends RxDBAdapterElectron {
  createTestClient(): Promise<DesktopSqliteClient> {
    return this.createClient();
  }
}

let workspace: string;
let host: ElectronSqliteHost;
let transport: DesktopHostTransport;

const rxdbWith = (dbName: string): RxDB => ({ config: { dbName } }) as RxDB;

const createAdapter = (dbName: string, options: DesktopOptions = {}): TestElectronAdapter =>
  new TestElectronAdapter(rxdbWith(dbName), { transport, ...options });

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-adapter-'));
  host = createElectronSqliteHost({
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

describe('RxDBAdapterElectron', () => {
  // 名字带上引擎与运行时两段：同一个运行时上还会有别的引擎（US-208 的 `pglite-electron`），
  // 只叫 `electron` 就没有第二个位置可放。
  it('registers itself under the electron sqlite adapter name', () => {
    expect(createAdapter('notes').name).toBe('sqlite-electron');
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
    expect(client.beginTransactionSql()).toBe('BEGIN IMMEDIATE;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });
});

describe('transport resolution', () => {
  it('falls back to the transport the preload script exposed', async () => {
    (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY] = transport;
    const adapter = new TestElectronAdapter(rxdbWith('notes'));
    expect((await adapter.createTestClient()).resolvedLocation).toContain('notes.sqlite3');
  });

  // 桌面路径没有 renderer 侧的降级后端可用：宁可报 host 缺失，也不能悄悄换个存储
  it('reports host_unavailable when nothing exposed a transport', async () => {
    const adapter = new TestElectronAdapter(rxdbWith('notes'));
    await expect(adapter.createTestClient()).rejects.toThrowError(/host_unavailable/);
  });

  it('names the global the preload script has to expose', async () => {
    const adapter = new TestElectronAdapter(rxdbWith('notes'));
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
    const adapter = new TestElectronAdapter(rxdbWith('notes'));
    await expect(adapter.createTestClient()).rejects.toThrowError(/host_unavailable/);
  });
});
