import { afterEach, describe, expect, it, vi } from 'vitest';

const sqliteLoadMock = vi.hoisted(() => vi.fn());

vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, sqliteLoad: sqliteLoadMock };
});

import { SqliteClient } from '../SqliteClient.js';

describe('SqliteClient 初始化失败清理', () => {
  afterEach(() => {
    sqliteLoadMock.mockReset();
  });

  it('打开连接后初始化失败必须关闭连接', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    sqliteLoadMock.mockResolvedValue({
      pointer: 42,
      sqlite: {
        close,
        create_function: vi.fn(() => {
          throw new Error('create_function failed');
        })
      }
    });

    const client = new SqliteClient();
    await expect(client.init('db', { vfs: 'memory' })).rejects.toThrow('create_function failed');
    expect(close).toHaveBeenCalledWith(42);
  });

  it('关闭连接失败时同时暴露初始化错误与清理错误', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close failed'));
    sqliteLoadMock.mockResolvedValue({
      pointer: 7,
      sqlite: {
        close,
        create_function: vi.fn(() => {
          throw new Error('init failed');
        })
      }
    });

    const client = new SqliteClient();
    await expect(client.init('db', { vfs: 'memory' })).rejects.toThrow(
      'sqlite-wasm initialization failed and connection cleanup failed'
    );
    expect(close).toHaveBeenCalledWith(7);
  });

  it('失败后第二次 init 是干净重试', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    sqliteLoadMock.mockResolvedValueOnce({
      pointer: 1,
      sqlite: {
        close,
        create_function: vi.fn(() => {
          throw new Error('boom');
        })
      }
    });

    const client = new SqliteClient();
    await expect(client.init('db', { vfs: 'memory' })).rejects.toThrow('boom');
    expect(close).toHaveBeenCalledTimes(1);

    // 第二次 init 重新走 sqliteLoad，而不是复用半初始化状态
    const statements = vi.fn(async function* () {
      // PRAGMA 初始化 SQL：无结果集
    });
    sqliteLoadMock.mockResolvedValueOnce({
      pointer: 2,
      sqlite: {
        close: vi.fn(),
        create_function: vi.fn(),
        update_hook: vi.fn(),
        statements,
        reset: vi.fn(),
        bind_collection: vi.fn(),
        step: vi.fn(),
        row: vi.fn(),
        column_names: vi.fn().mockReturnValue([]),
        changes: vi.fn().mockReturnValue(0),
        set_authorizer: vi.fn().mockReturnValue(0)
      }
    });

    await client.init('db', { vfs: 'memory' });
    expect(sqliteLoadMock).toHaveBeenCalledTimes(2);
  });
});
