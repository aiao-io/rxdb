import type { RxDB } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqliteOfficial.js';
import type { SqliteOptions } from '../sqlite-official.interface.js';

const createSqliteClientMock = vi.hoisted(() => vi.fn());

vi.mock('../create_sqlite_client.js', () => ({
  createSqliteClient: createSqliteClientMock
}));

class TestSqliteAdapter extends RxDBAdapterSqlite {
  createTestClient() {
    return this.createClient();
  }
}

describe('RxDBAdapterSqlite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该保留 options，并用 RxDB dbName 创建 client', async () => {
    const client = { id: 'client' };
    createSqliteClientMock.mockResolvedValue(client);
    const rxdb = { config: { dbName: 'adapter-db' } } as RxDB;
    const options: SqliteOptions = { batchTimeout: 4 };

    const adapter = new TestSqliteAdapter(rxdb, options);
    const result = await adapter.createTestClient();

    expect(adapter.name).toBe('sqlite');
    expect(adapter.options).toBe(options);
    expect(createSqliteClientMock).toHaveBeenCalledWith('adapter-db', options);
    expect(result).toBe(client);
  });
});
