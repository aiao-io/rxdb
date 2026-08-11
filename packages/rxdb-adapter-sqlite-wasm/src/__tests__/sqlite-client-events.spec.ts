import {
  SQLiteChangeType,
  type SqliteChangeEvent,
  type SqliteResult,
  type UpdateHookCallback
} from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteAPI } from '../sqlite-api.type.js';
import type { LoadModuleOptions } from '../sqlite.interface.js';

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

interface ClientHarness {
  readonly client: SqliteClient;
  readonly close: ReturnType<typeof vi.fn>;
  readonly updateHook: ReturnType<typeof vi.fn>;
  readonly updateHookCallbacks: UpdateHookCallback[];
}

function createSqliteHarness() {
  const updateHookCallbacks: UpdateHookCallback[] = [];
  const close = vi.fn().mockResolvedValue(undefined);
  const updateHook = vi.fn((_db: number, callback: UpdateHookCallback) => {
    updateHookCallbacks.push(callback);
  });
  const sqlite = {
    close,
    create_function: vi.fn(),
    update_hook: updateHook
  } as unknown as SQLiteAPI;

  return { close, sqlite, updateHook, updateHookCallbacks };
}

async function createClient(options: LoadModuleOptions = { vfs: 'memory', batchTimeout: 10 }): Promise<ClientHarness> {
  const harness = createSqliteHarness();
  mocks.sqliteLoad.mockResolvedValueOnce({ pointer: 17, sqlite: harness.sqlite });

  const client = new SqliteClient();
  await client.init('events-db', options);

  return { client, ...harness };
}

describe('SqliteClient 初始化与变更事件', () => {
  beforeEach(() => {
    const result: SqliteResult = {
      elapsed: 0,
      results: [],
      rowsAffected: 0,
      sql: ''
    };
    mocks.executeHelper.mockResolvedValue(result);
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.executeHelper.mockReset();
    mocks.sqliteLoad.mockReset();
  });

  it('初始化成功后重复 init 不会再次打开连接', async () => {
    const { client } = await createClient();

    await client.init('ignored-db', { vfs: 'opfs', worker: true });

    expect(mocks.sqliteLoad).toHaveBeenCalledTimes(1);
  });

  it('并发 init 复用同一次打开过程', async () => {
    const harness = createSqliteHarness();
    let resolveLoad!: (core: { pointer: number; sqlite: SQLiteAPI }) => void;
    mocks.sqliteLoad.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new SqliteClient();

    const first = client.init('concurrent-db', { vfs: 'memory' });
    const second = client.init('concurrent-db', { vfs: 'memory' });
    resolveLoad({ pointer: 18, sqlite: harness.sqlite });

    await Promise.all([first, second]);
    expect(mocks.sqliteLoad).toHaveBeenCalledTimes(1);
  });

  it('忽略无效 hook，并按类型、数据库和表防抖合并有效事件', async () => {
    vi.useFakeTimers();
    const { client, updateHookCallbacks } = await createClient({ vfs: 'memory', batchTimeout: 10 });
    const onInsert = vi.fn<(event: SqliteChangeEvent) => void>();
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, onInsert);
    const hook = updateHookCallbacks[0];
    if (!hook) throw new Error('update hook was not registered');

    hook(SQLiteChangeType.SQLITE_INSERT, '', 'rxdb$rxdb_change', 1n);
    hook(SQLiteChangeType.SQLITE_INSERT, 'main', '', 2n);
    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'users', 3n);
    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 4n);
    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 5n);

    await vi.advanceTimersByTimeAsync(9);
    expect(onInsert).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onInsert).toHaveBeenCalledTimes(1);
    const event = onInsert.mock.calls[0]?.[0];
    if (!event) throw new Error('insert event was not dispatched');
    expect(event.recordAt).toBeInstanceOf(Date);
    expect(event).toEqual({
      dbName: 'main',
      recordAt: event.recordAt,
      rowIds: [4n, 5n],
      tableName: 'rxdb$rxdb_change',
      type: SQLiteChangeType.SQLITE_INSERT
    });
  });

  it('监听器抛错时不重放同一批事件，也不阻断其他分组', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client, updateHookCallbacks } = await createClient({ vfs: 'memory', batchTimeout: 10 });
    const insertBatches: bigint[][] = [];
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, (event: SqliteChangeEvent) => {
      insertBatches.push(event.rowIds);
      throw new Error('listener boom');
    });
    const onUpdate = vi.fn<(event: SqliteChangeEvent) => void>();
    client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, onUpdate);
    const hook = updateHookCallbacks[0];
    if (!hook) throw new Error('update hook was not registered');

    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 1n);
    hook(SQLiteChangeType.SQLITE_UPDATE, 'main', 'rxdb$rxdb_change', 2n);
    await vi.advanceTimersByTimeAsync(10);

    hook(SQLiteChangeType.SQLITE_INSERT, 'main', 'rxdb$rxdb_change', 3n);
    await vi.advanceTimersByTimeAsync(10);

    expect(insertBatches).toEqual([[1n], [3n]]);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('disconnect 刷新待发送事件、卸载 hook，并拒绝后续 execute', async () => {
    vi.useFakeTimers();
    const { client, close, updateHook, updateHookCallbacks } = await createClient({
      vfs: 'memory',
      batchTimeout: 10
    });
    const onUpdate = vi.fn();
    client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, onUpdate);
    const hook = updateHookCallbacks[0];
    if (!hook) throw new Error('update hook was not registered');
    hook(SQLiteChangeType.SQLITE_UPDATE, 'main', 'rxdb$rxdb_branch', 6n);

    await client.disconnect();
    await vi.runAllTimersAsync();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]?.[0].rowIds).toEqual([6n]);
    expect(updateHook).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledWith(17);
    const detachedHook = updateHookCallbacks[1];
    if (!detachedHook) throw new Error('update hook was not detached');
    expect(detachedHook(SQLiteChangeType.SQLITE_UPDATE, 'main', 'rxdb$rxdb_branch', 7n)).toBeUndefined();
    await expect(client.execute('SELECT 1')).rejects.toThrow('SqliteClient has been disconnected');
  });
});
