import { SQLiteChangeType, type SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SQLITE_OK } from 'wa-sqlite';
import type { SQLiteAPI, SQLiteVFS } from '../wa-sqlite.interface.js';

const loadState = vi.hoisted(() => ({
  load: vi.fn()
}));

vi.mock('../sqlite-load.utils.js', async importOriginal => {
  const original = await importOriginal<typeof import('../sqlite-load.utils.js')>();
  return { ...original, waSqliteLoad: loadState.load };
});

import { WA_SQLITE_MAX_DATABASE_NAME_BYTES, WaSqliteClient } from '../SqliteClient.js';

interface FakeSQLite extends SQLiteAPI {
  close: Mock<SQLiteAPI['close']>;
  create_function: Mock<SQLiteAPI['create_function']>;
  open_v2: Mock<SQLiteAPI['open_v2']>;
  update_hook: Mock<SQLiteAPI['update_hook']>;
}

interface FakeVFS extends SQLiteVFS {
  close: Mock<() => void | Promise<void>>;
}

function createFakeSQLite(): FakeSQLite {
  let authorizer: () => number = () => SQLITE_OK;
  return {
    bind_collection: vi.fn(),
    changes: vi.fn(() => 0),
    close: vi.fn<SQLiteAPI['close']>().mockResolvedValue(SQLITE_OK),
    column_names: vi.fn(() => []),
    create_function: vi.fn<SQLiteAPI['create_function']>(() => SQLITE_OK),
    open_v2: vi.fn<SQLiteAPI['open_v2']>().mockResolvedValue(42),
    reset: vi.fn().mockResolvedValue(SQLITE_OK),
    result: vi.fn(),
    row: vi.fn(() => []),
    set_authorizer: vi.fn((_db: number, callback: () => number) => {
      authorizer = callback;
      return authorizer();
    }),
    statements: vi.fn(async function* () {
      yield* [];
    }),
    step: vi.fn().mockResolvedValue(SQLITE_OK),
    update_hook: vi.fn<SQLiteAPI['update_hook']>(),
    value_text: vi.fn(() => ''),
    vfs_register: vi.fn(() => SQLITE_OK)
  } as unknown as FakeSQLite;
}

function createFakeVFS(): FakeVFS {
  return { close: vi.fn().mockResolvedValue(undefined) } as unknown as FakeVFS;
}

interface LoadedFake {
  sqlite3: FakeSQLite;
  vfs: FakeVFS;
  lockPolicy?: string;
  finalizeOpenStatements?: Mock<(database: number) => Promise<void>>;
}

function createLoaded(
  sqlite: FakeSQLite = createFakeSQLite(),
  vfs: FakeVFS = createFakeVFS(),
  lockPolicy?: string,
  finalizeOpenStatements?: Mock<(database: number) => Promise<void>>
): LoadedFake {
  return { sqlite3: sqlite, vfs, lockPolicy, finalizeOpenStatements };
}

const loadOptions = { vfs: 'MemoryAsyncVFS' as const, async: true };
const EXPECTED_MAX_DATABASE_NAME_BYTES = 49;

describe('WaSqliteClient lifecycle', () => {
  beforeEach(() => {
    loadState.load.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('返回 SQLite 版本号', async () => {
    const client = new WaSqliteClient();
    const execute = vi.spyOn(client, 'execute').mockResolvedValue({
      sql: 'SELECT sqlite_version()',
      rowsAffected: 0,
      elapsed: 0,
      results: [{ columns: ['sqlite_version()'], rows: [['3.46.1']] }]
    });

    await expect(client.version()).resolves.toBe('3.46.1');
    expect(execute).toHaveBeenCalledWith('SELECT sqlite_version()');
  });

  it('允许 UTF-8 编码后恰好达到公开数据库名上限', async () => {
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const dbName = 'a'.repeat(EXPECTED_MAX_DATABASE_NAME_BYTES);

    expect(WA_SQLITE_MAX_DATABASE_NAME_BYTES).toBe(EXPECTED_MAX_DATABASE_NAME_BYTES);

    const client = new WaSqliteClient();
    await expect(client.init(dbName, loadOptions)).resolves.toBeUndefined();

    expect(loaded.sqlite3.open_v2).toHaveBeenCalledWith(`${dbName}.sqlite`);
  });

  it('超出数据库名上限时在加载 VFS 前给出可诊断错误', async () => {
    const dbName = 'a'.repeat(EXPECTED_MAX_DATABASE_NAME_BYTES + 1);
    const client = new WaSqliteClient();

    await expect(client.init(dbName, loadOptions)).rejects.toThrow(
      new RegExp(`actual=${EXPECTED_MAX_DATABASE_NAME_BYTES + 1}.*maximum=${EXPECTED_MAX_DATABASE_NAME_BYTES}`)
    );
    await expect(client.init(dbName, loadOptions)).rejects.toThrow(dbName);
    expect(loadState.load).not.toHaveBeenCalled();
  });

  it('数据库名限制按 UTF-8 字节数而不是 JavaScript 字符数计算', async () => {
    const dbName = '库'.repeat(17);
    expect(dbName).toHaveLength(17);

    const client = new WaSqliteClient();
    await expect(client.init(dbName, loadOptions)).rejects.toThrow(
      `actual=51 bytes, maximum=${EXPECTED_MAX_DATABASE_NAME_BYTES} bytes`
    );
    expect(loadState.load).not.toHaveBeenCalled();
  });

  // SQLWA-003：#open_connection 原实现把 open_v2 放在 try 之外 —— 它抛错时 vfs 已加载却永不关闭；
  // 且 catch 里 `await sqlite.close(db)` 抛错会跳过其后的 `vfs.close()`。两处都泄漏 VFS 句柄。
  it('open_v2 失败时必须关闭已加载的 VFS', async () => {
    const sqlite = createFakeSQLite();
    const vfs = createFakeVFS();
    sqlite.open_v2.mockRejectedValue(new Error('open failed'));
    loadState.load.mockResolvedValue(createLoaded(sqlite, vfs));

    const client = new WaSqliteClient();
    await expect(client.init('leaky', loadOptions)).rejects.toThrow('open failed');

    expect(vfs.close).toHaveBeenCalledTimes(1);
  });

  it('清理过程中 sqlite.close 抛错不得阻断 vfs.close，且保留原始错误', async () => {
    const sqlite = createFakeSQLite();
    const vfs = createFakeVFS();
    // 连接已开，但后续的自定义函数注册失败 → 进入清理路径
    sqlite.create_function.mockImplementation(() => {
      throw new Error('pragma failed');
    });
    sqlite.close.mockRejectedValue(new Error('close also failed'));
    loadState.load.mockResolvedValue(createLoaded(sqlite, vfs));

    const client = new WaSqliteClient();
    // 抛出的必须是**原始**失败原因，而不是清理阶段的次生错误
    await expect(client.init('leaky2', loadOptions)).rejects.toThrow('pragma failed');

    expect(sqlite.close).toHaveBeenCalled();
    expect(vfs.close).toHaveBeenCalledTimes(1);
  });

  it('初始化加载失败后允许重试', async () => {
    const loaded = createLoaded();
    loadState.load.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce(loaded);
    const client = new WaSqliteClient();

    await expect(client.init('retry-db', loadOptions)).rejects.toThrow('load failed');
    await expect(client.init('retry-db', loadOptions)).resolves.toBeUndefined();

    expect(loadState.load).toHaveBeenCalledTimes(2);
    expect(loaded.sqlite3.open_v2).toHaveBeenCalledTimes(1);
  });

  it('并发 init 都等待同一次初始化完成', async () => {
    const loaded = createLoaded();
    let resolveLoad: ((loaded: LoadedFake) => void) | undefined;
    loadState.load.mockReturnValue(
      new Promise<LoadedFake>(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new WaSqliteClient();

    const first = client.init('concurrent-db', loadOptions);
    const second = client.init('concurrent-db', loadOptions);
    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    expect(loadState.load).toHaveBeenCalledTimes(1);

    resolveLoad?.(loaded);
    await Promise.all([first, second]);
    expect(loaded.sqlite3.open_v2).toHaveBeenCalledTimes(1);
  });

  it('ready 后仅允许等价配置幂等 init，拒绝切换数据库', async () => {
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('first-db', loadOptions);

    await expect(client.init('first-db', { ...loadOptions })).resolves.toBeUndefined();
    await expect(client.init('second-db', loadOptions)).rejects.toThrow('conflicting initialization: dbName');

    expect(loadState.load).toHaveBeenCalledTimes(1);
    expect(loaded.sqlite3.open_v2).toHaveBeenCalledTimes(1);
  });

  it('init 进行中立即拒绝不同配置，不把第二个调用路由到第一库', async () => {
    const loaded = createLoaded();
    let resolveLoad: ((loaded: LoadedFake) => void) | undefined;
    loadState.load.mockReturnValue(
      new Promise<LoadedFake>(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new WaSqliteClient();

    const first = client.init('first-db', loadOptions);
    await Promise.resolve();
    const conflicting = client.init('second-db', loadOptions);
    resolveLoad?.(loaded);

    await expect(conflicting).rejects.toThrow('conflicting initialization: dbName');
    await first;
    expect(loaded.sqlite3.open_v2).toHaveBeenCalledWith('first-db.sqlite');
  });

  it('数据库打开后初始化失败会关闭连接与 VFS', async () => {
    const loaded = createLoaded();
    loaded.sqlite3.create_function.mockImplementation(() => {
      throw new Error('registration failed');
    });
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();

    await expect(client.init('cleanup-db', loadOptions)).rejects.toThrow('registration failed');

    expect(loaded.sqlite3.close).toHaveBeenCalledTimes(1);
    expect(loaded.sqlite3.close).toHaveBeenCalledWith(42);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('初始化 SQL prepare 失败时先清理未 yield 的 statement 再关闭连接', async () => {
    const sqlite = createFakeSQLite();
    const finalizeOpenStatements = vi.fn(async () => undefined);
    sqlite.statements = vi.fn(async function* () {
      const statement = await Promise.reject<number>(new Error('prepare failed before yield'));
      yield statement;
    });
    sqlite.close.mockImplementation(async () => {
      if (finalizeOpenStatements.mock.calls.length === 0) throw new Error('unfinalized statements');
      return SQLITE_OK;
    });
    const loaded = createLoaded(sqlite, createFakeVFS(), undefined, finalizeOpenStatements);
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();

    await expect(client.init('prepare-cleanup-db', loadOptions)).rejects.toThrow('prepare failed before yield');

    expect(finalizeOpenStatements).toHaveBeenCalledWith(42);
    expect(sqlite.close).toHaveBeenCalledWith(42);
    expect(finalizeOpenStatements.mock.invocationCallOrder[0]).toBeLessThan(sqlite.close.mock.invocationCallOrder[0]);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('init 期间被 disconnect 打断后会关闭连接与 VFS', async () => {
    const loaded = createLoaded();
    let resolveLoad: ((loaded: LoadedFake) => void) | undefined;
    loadState.load.mockReturnValue(
      new Promise<LoadedFake>(resolve => {
        resolveLoad = resolve;
      })
    );
    const client = new WaSqliteClient();

    const init = client.init('aborted-db', loadOptions);
    await Promise.resolve();
    const disconnect = client.disconnect();
    resolveLoad?.(loaded);

    await expect(init).rejects.toThrow('disconnected');
    await disconnect;

    expect(loaded.sqlite3.close).toHaveBeenCalledWith(42);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('未初始化 disconnect 安全且之后拒绝 init', async () => {
    const client = new WaSqliteClient();

    await expect(client.disconnect()).resolves.toBeUndefined();
    await expect(client.init('disconnected-db', loadOptions)).rejects.toThrow('disconnected');
  });

  it('重复 disconnect 只关闭一次连接与 VFS', async () => {
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('disconnect-once-db', loadOptions);

    await Promise.all([client.disconnect(), client.disconnect()]);
    await client.disconnect();

    expect(loaded.sqlite3.close).toHaveBeenCalledTimes(1);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('断开时 statement 清理失败仍必须关闭 VFS', async () => {
    const sqlite = createFakeSQLite();
    const vfs = createFakeVFS();
    const failure = new Error('finalize failed during disconnect');
    const finalizeOpenStatements = vi.fn().mockRejectedValue(failure);
    const loaded = createLoaded(sqlite, vfs, undefined, finalizeOpenStatements);
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();

    await client.init('disconnect-cleanup-db', loadOptions);
    await expect(client.disconnect()).rejects.toBe(failure);

    expect(loaded.sqlite3.close).toHaveBeenCalledWith(42);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('监听器抛错时不重放旧批次，也不阻断其他分组', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('listener-error-db', { ...loadOptions, batchTimeout: 10 });

    const insertBatches: bigint[][] = [];
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, (event: SqliteChangeEvent) => {
      insertBatches.push(event.rowIds);
      throw new Error('listener boom');
    });
    const onUpdate = vi.fn<(event: SqliteChangeEvent) => void>();
    client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, onUpdate);
    const hook = loaded.sqlite3.update_hook.mock.calls[0]?.[1];
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
    await client.disconnect();
  });

  it('disconnect 在关闭连接前同步刷新已提交的待派发变更', async () => {
    vi.useFakeTimers();
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('disconnect-flush-db', { ...loadOptions, batchTimeout: 100 });

    const onUpdate = vi.fn<(event: SqliteChangeEvent) => void>();
    client.addEventListener(SQLiteChangeType.SQLITE_UPDATE, onUpdate);
    const hook = loaded.sqlite3.update_hook.mock.calls[0]?.[1];
    if (!hook) throw new Error('update hook was not registered');
    hook(SQLiteChangeType.SQLITE_UPDATE, 'main', 'rxdb$rxdb_branch', 6n);

    await client.disconnect();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]?.[0].rowIds).toEqual([6n]);
    expect(loaded.sqlite3.close).toHaveBeenCalledWith(42);
    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
  });

  it('disconnect 会释放 VFS 持有的 IndexedDB/OPFS 句柄', async () => {
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('vfs-release-db', loadOptions);

    await client.disconnect();

    expect(loaded.vfs.close).toHaveBeenCalledTimes(1);
    const closeOrder = loaded.sqlite3.close.mock.invocationCallOrder[0];
    const vfsCloseOrder = loaded.vfs.close.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(vfsCloseOrder);
  });

  it('未初始化时 beginTransactionSql 返回默认 BEGIN', () => {
    const client = new WaSqliteClient();

    expect(client.beginTransactionSql()).toBe('BEGIN;');
  });

  it('非 shared+hint 锁策略时 beginTransactionSql 返回默认 BEGIN', async () => {
    const loaded = createLoaded(createFakeSQLite(), createFakeVFS(), undefined);
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('no-hint-db', loadOptions);

    expect(client.beginTransactionSql()).toBe('BEGIN;');
  });

  it('shared+hint 锁策略时 beginTransactionSql 改用 write_hint + BEGIN IMMEDIATE', async () => {
    const loaded = createLoaded(createFakeSQLite(), createFakeVFS(), 'shared+hint');
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('hint-db', loadOptions);

    expect(client.beginTransactionSql()).toBe('PRAGMA write_hint;\nBEGIN IMMEDIATE;');
  });

  it('初始化前 execute 给出明确错误', async () => {
    const client = new WaSqliteClient();

    await expect(client.execute('SELECT 1')).rejects.toThrow('not initialized');
  });

  it('断开后 execute 给出明确错误', async () => {
    const loaded = createLoaded();
    loadState.load.mockResolvedValue(loaded);
    const client = new WaSqliteClient();
    await client.init('execute-after-disconnect-db', loadOptions);
    await client.disconnect();

    await expect(client.execute('SELECT 1')).rejects.toThrow('disconnected');
  });
});
