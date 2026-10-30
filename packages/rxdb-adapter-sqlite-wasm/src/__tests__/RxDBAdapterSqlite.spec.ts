import type { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';

const createSqliteClientMock = vi.hoisted(() => vi.fn());

vi.mock('../create_sqlite_client.js', () => ({
  createSqliteClient: createSqliteClientMock
}));

import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';
import type { SqliteOptions } from '../sqlite.interface.js';

class TestRxDBAdapterSqlite extends RxDBAdapterSqlite {
  exposeCreateClient() {
    return this.createClient();
  }

  exposeSharedClientLockName() {
    return this.sharedClientLockName();
  }
}

const SHARED_CLIENT_LOCK = 'rxdb-sqlite-shared-client:sqlite-wasm:adapter-db';

describe('RxDBAdapterSqlite', () => {
  it('保留适配器名称、数据库名与 options，并原样创建客户端', async () => {
    const rxdb = { config: { dbName: 'adapter-db' } } as unknown as RxDB;
    const options = {
      vfs: 'memory',
      batchTimeout: 0,
      cacheSizeKb: 1024,
      wasmUrl: 'data:application/wasm;base64,AA=='
    } satisfies SqliteOptions;
    const client = { id: 'remote-client' };
    createSqliteClientMock.mockResolvedValueOnce(client);

    const adapter = new TestRxDBAdapterSqlite(rxdb, options);

    expect(adapter.name).toBe('sqlite-wasm');
    expect(adapter.options).toBe(options);
    await expect(adapter.exposeCreateClient()).resolves.toBe(client);
    // 第三个参数是本适配器的持有者键：SharedWorker 上共用一个客户端时断开凭它只交还自己那一份（US-314 B2.3b）
    expect(createSqliteClientMock).toHaveBeenCalledWith('adapter-db', options, expect.any(String));
  });

  // 锁名同时决定两件事：事务在跨标签页的锁里排队，断开时交还持有者而不是关掉共用的连接
  describe('共用连接的判据与连接时实际走的 transport 一致', () => {
    const rxdb = { config: { dbName: 'adapter-db' } } as unknown as RxDB;
    const sharedWorkerInstance = {} as SharedWorker;

    it.each([
      ['flag + 实例', { sharedWorker: true, sharedWorkerInstance }],
      ['只有实例', { sharedWorkerInstance }]
    ] satisfies Array<[string, Partial<SqliteOptions>]>)('%s：给出按库名区分的跨标签页锁名', (_name, transport) => {
      const adapter = new TestRxDBAdapterSqlite(rxdb, { vfs: 'idb', ...transport });

      expect(adapter.exposeSharedClientLockName()).toBe(SHARED_CLIENT_LOCK);
    });

    it.each([
      ['主线程', {}],
      ['Worker 实例', { workerInstance: {} as Worker }]
    ] satisfies Array<[string, Partial<SqliteOptions>]>)('%s：不共用连接，不给锁名', (_name, transport) => {
      const adapter = new TestRxDBAdapterSqlite(rxdb, { vfs: 'idb', ...transport });

      expect(adapter.exposeSharedClientLockName()).toBeUndefined();
    });
  });
});
