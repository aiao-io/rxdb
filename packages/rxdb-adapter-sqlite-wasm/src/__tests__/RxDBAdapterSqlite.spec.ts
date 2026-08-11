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
}

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
    expect(createSqliteClientMock).toHaveBeenCalledWith('adapter-db', options);
  });
});
