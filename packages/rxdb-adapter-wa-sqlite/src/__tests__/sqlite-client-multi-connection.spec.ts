import { afterEach, describe, expect, it } from 'vitest';
import { WaSqliteClient } from '../SqliteClient.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

/**
 * 覆盖 S4 全链路：`IDBBatchAtomicVFS` 的 `shared+hint` 锁策略下，两个真实独立连接
 * 并发写事务——write_hint + BEGIN IMMEDIATE + SQLITE_BUSY 有限重试 + 有限 lockTimeout
 * 缺一都会导致挂起或静默丢写，Mock 测试无法覆盖真实 Web Locks 竞争。
 */
describe('WaSqliteClient 多连接并发写入（IDBBatchAtomicVFS）', () => {
  const clients: WaSqliteClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.disconnect()));
  });

  async function openClient(dbName: string): Promise<WaSqliteClient> {
    const client = new WaSqliteClient();
    await client.init(dbName, {
      vfs: 'IDBBatchAtomicVFS',
      async: true,
      wasmPath: asyncWasmPath
    });
    clients.push(client);
    return client;
  }

  async function writeRows(client: WaSqliteClient, source: string, count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
      await client.execute(client.beginTransactionSql());
      await client.execute('INSERT INTO concurrent_rows (source) VALUES (?)', [`${source}-${index}`]);
      await client.execute('COMMIT;');
    }
  }

  it('两个连接共享同一持久化数据库时都会选用 write_hint + BEGIN IMMEDIATE', async () => {
    const dbName = `multi-conn-hint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientA = await openClient(dbName);
    const clientB = await openClient(dbName);

    expect(clientA.beginTransactionSql()).toBe('PRAGMA write_hint;\nBEGIN IMMEDIATE;');
    expect(clientB.beginTransactionSql()).toBe('PRAGMA write_hint;\nBEGIN IMMEDIATE;');
  });

  it('两个连接并发写事务都不会丢数据，也不会无限期挂起', async () => {
    const dbName = `multi-conn-write-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clientA = await openClient(dbName);
    await clientA.execute('CREATE TABLE concurrent_rows (id INTEGER PRIMARY KEY, source TEXT NOT NULL)');
    const clientB = await openClient(dbName);

    await Promise.all([writeRows(clientA, 'a', 5), writeRows(clientB, 'b', 5)]);

    const result = await clientA.execute('SELECT COUNT(*) AS total FROM concurrent_rows');
    expect(result.results[0]?.rows[0]?.[0]).toBe(10);
  });
});
