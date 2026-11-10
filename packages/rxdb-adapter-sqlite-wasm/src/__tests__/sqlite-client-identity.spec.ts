import type { SqliteResult } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteAPI } from '../sqlite-api.type.js';

const mocks = vi.hoisted(() => ({
  executeHelper: vi.fn(),
  sqliteLoad: vi.fn()
}));

vi.mock('../execute_helper.js', () => ({ executeHelper: mocks.executeHelper }));
vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, sqliteLoad: mocks.sqliteLoad };
});

import { SqliteClient } from '../SqliteClient.js';

const createCore = (pointer: number) => ({
  pointer,
  sqlite: {
    close: vi.fn().mockResolvedValue(undefined),
    create_function: vi.fn(),
    update_hook: vi.fn()
  } as unknown as SQLiteAPI,
  vfs: { close: vi.fn().mockResolvedValue(undefined) }
});

/**
 * SharedWorker 上所有标签页共用一个 SqliteClient：每个标签页的适配器各调一次 `init`。
 * 只有等价配置能共享这条连接；换了库名还「成功」等于让第二个逻辑库读写第一个库。
 */
describe('SqliteClient 共用时按身份校验 init', () => {
  beforeEach(() => {
    const result: SqliteResult = { elapsed: 0, results: [], rowsAffected: 0, sql: '' };
    mocks.executeHelper.mockResolvedValue(result);
  });

  afterEach(() => {
    mocks.executeHelper.mockReset();
    mocks.sqliteLoad.mockReset();
  });

  it('已初始化的客户端拒绝另一个库名，不登记持有者', async () => {
    mocks.sqliteLoad.mockResolvedValueOnce(createCore(1));
    const client = new SqliteClient();
    await client.init('logical-a', { vfs: 'memory' }, 'owner-a');

    await expect(client.init('logical-b', { vfs: 'memory' }, 'owner-b')).rejects.toThrow(
      /conflicting initialization: dbName/
    );

    expect(mocks.sqliteLoad).toHaveBeenCalledOnce();
    // owner-b 没登记上：owner-a 交还后就断开
    await client.release('owner-a');
    await expect(client.execute('SELECT 1')).rejects.toThrow('has been disconnected');
  });

  it('初始化进行中换库名同样拒绝', async () => {
    let resolveLoad!: (core: ReturnType<typeof createCore>) => void;
    mocks.sqliteLoad.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new SqliteClient();

    const first = client.init('logical-a', { vfs: 'memory' }, 'owner-a');
    const second = client.init('logical-b', { vfs: 'memory' }, 'owner-b');
    resolveLoad(createCore(2));

    await expect(first).resolves.toBeUndefined();
    await expect(second).rejects.toThrow(/conflicting initialization: dbName/);
    expect(mocks.sqliteLoad).toHaveBeenCalledOnce();
  });

  it('VFS、只读与资源配置不同也拒绝', async () => {
    mocks.sqliteLoad.mockResolvedValueOnce(createCore(3));
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory' });

    await expect(client.init('db', { vfs: 'idb' })).rejects.toThrow(/conflicting initialization: vfs/);
    await expect(client.init('db', { vfs: 'memory', readonly: true })).rejects.toThrow(/readonly/);
    await expect(client.init('db', { vfs: 'memory', cacheSizeKb: 1024 })).rejects.toThrow(/cacheSizeKb/);
  });

  it('等价配置共享同一条连接，各自登记持有者', async () => {
    mocks.sqliteLoad.mockResolvedValueOnce(createCore(4));
    const client = new SqliteClient();

    await client.init('db', { vfs: 'memory' }, 'owner-a');
    await client.init('db', { vfs: 'memory', readonly: false }, 'owner-b');
    await client.release('owner-a');

    await expect(client.execute('SELECT 1')).resolves.toBeDefined();
    expect(mocks.sqliteLoad).toHaveBeenCalledOnce();
  });

  it('断开之后可以初始化另一个库；初始化失败后可以换配置重试', async () => {
    mocks.sqliteLoad
      .mockResolvedValueOnce(createCore(5))
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(createCore(6));
    const client = new SqliteClient();

    await client.init('first', { vfs: 'memory' });
    await client.disconnect();
    await expect(client.init('second', { vfs: 'memory' })).rejects.toThrow('load failed');
    await expect(client.init('third', { vfs: 'memory' })).resolves.toBeUndefined();
  });
});
