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

function createSqliteHarness() {
  const close = vi.fn().mockResolvedValue(undefined);
  const updateHook = vi.fn(() => undefined);
  const sqlite = {
    close,
    create_function: vi.fn(),
    update_hook: updateHook
  } as unknown as SQLiteAPI;

  return { close, sqlite, updateHook };
}

describe('SqliteClient 生命周期守卫', () => {
  beforeEach(() => {
    const result: SqliteResult = { elapsed: 0, results: [], rowsAffected: 0, sql: '' };
    mocks.executeHelper.mockResolvedValue(result);
  });

  afterEach(() => {
    mocks.executeHelper.mockReset();
    mocks.sqliteLoad.mockReset();
  });

  it('公开 Worker 可调用的默认事务 SQL', () => {
    const client = new SqliteClient();

    expect(client.beginTransactionSql()).toBe('BEGIN;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });

  it('未初始化时 execute 给出明确错误', async () => {
    const client = new SqliteClient();

    await expect(client.execute('SELECT 1')).rejects.toThrow('SqliteClient is not initialized');
  });

  it('未初始化时 disconnect 安全，且之后仍可 init', async () => {
    const harness = createSqliteHarness();
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 13, sqlite: harness.sqlite });
    const client = new SqliteClient();

    await expect(client.disconnect()).resolves.toBeUndefined();
    await expect(client.init('db', { vfs: 'memory' })).resolves.toBeUndefined();
    await client.disconnect();

    expect(mocks.sqliteLoad).toHaveBeenCalledOnce();
    expect(harness.close).toHaveBeenCalledWith(13);
  });

  it('完整断开后可初始化另一数据库，旧连接只关闭一次', async () => {
    const first = createSqliteHarness();
    const second = createSqliteHarness();
    mocks.sqliteLoad
      .mockResolvedValueOnce({ pointer: 21, sqlite: first.sqlite })
      .mockResolvedValueOnce({ pointer: 22, sqlite: second.sqlite });
    const client = new SqliteClient();

    await client.init('first', { vfs: 'memory' });
    await client.disconnect();
    await client.init('second', { vfs: 'memory' });
    await client.disconnect();

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('重复 disconnect 只关闭一次连接', async () => {
    const harness = createSqliteHarness();
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 21, sqlite: harness.sqlite });
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory' });

    await client.disconnect();
    await client.disconnect();

    expect(harness.close).toHaveBeenCalledTimes(1);
    expect(harness.close).toHaveBeenCalledWith(21);
  });

  it('init 失败时 disconnect 不被其错误污染，且无连接可关', async () => {
    const loadFailure = new Error('sqliteLoad exploded');
    let rejectLoad!: (error: unknown) => void;
    mocks.sqliteLoad.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      })
    );
    const client = new SqliteClient();

    const initPromise = client.init('db', { vfs: 'memory' });
    const disconnectPromise = client.disconnect();
    rejectLoad(loadFailure);

    // init 的失败归调用 init 的一方；disconnect 只负责收口，不得连带 reject
    await expect(initPromise).rejects.toThrow('sqliteLoad exploded');
    await expect(disconnectPromise).resolves.toBeUndefined();
  });

  it('init 进行中调用 disconnect 仍会关闭已打开的连接', async () => {
    const harness = createSqliteHarness();
    let resolveLoad!: (core: { pointer: number; sqlite: SQLiteAPI }) => void;
    mocks.sqliteLoad.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new SqliteClient();

    const initPromise = client.init('db', { vfs: 'memory' });
    const disconnectPromise = client.disconnect();
    resolveLoad({ pointer: 33, sqlite: harness.sqlite });

    await initPromise;
    await disconnectPromise;

    expect(harness.close).toHaveBeenCalledWith(33);
  });

  it('关闭失败后退出 disconnecting 状态，但保持 fail-closed', async () => {
    const harness = createSqliteHarness();
    harness.close.mockRejectedValueOnce(new Error('close failed'));
    mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 44, sqlite: harness.sqlite });
    const client = new SqliteClient();
    await client.init('db', { vfs: 'memory' });

    await expect(client.disconnect()).rejects.toThrow('close failed');
    await expect(client.init('retry', { vfs: 'memory' })).rejects.toThrow('previous disconnect failed');
    await expect(client.execute('SELECT 1')).rejects.toThrow('has been disconnected');
  });
});
