import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  updateHookCallback: undefined as ((...args: unknown[]) => void) | undefined,
  opfsAvailable: false,
  initFailuresRemaining: 0,
  dbCtorArgs: [] as unknown[][],
  opfsCtorArgs: [] as unknown[][],
  executedSql: [] as string[]
}));

vi.mock('@sqliteai/sqlite-wasm', () => {
  class MockDB {
    constructor(...args: unknown[]) {
      mockState.dbCtorArgs.push(args);
    }

    exec(opts: { sql?: string; resultRows?: unknown[][]; columnNames?: string[] }) {
      if (opts.sql) {
        mockState.executedSql.push(opts.sql);
      }
      if (opts.resultRows) {
        opts.resultRows.push(['3.50.4']);
      }
      if (opts.columnNames) {
        opts.columnNames.push('sqlite_version()');
      }
      return this;
    }
    close() {
      // 模拟。
    }
    changes() {
      return 0;
    }
    createFunction() {
      return this;
    }
  }

  class MockOpfsDb extends MockDB {
    constructor(...args: unknown[]) {
      if (!mockState.opfsAvailable) {
        throw new Error('OPFS unavailable');
      }
      super(...args);
      mockState.opfsCtorArgs.push(args);
    }
  }

  return {
    default: vi.fn().mockImplementation(async () => {
      if (mockState.initFailuresRemaining > 0) {
        mockState.initFailuresRemaining -= 1;
        throw new Error('sqlite init failed');
      }

      return {
        ...(mockState.opfsAvailable ? { opfs: {} } : {}),
        oo1: {
          DB: MockDB,
          OpfsDb: MockOpfsDb
        },
        capi: {
          sqlite3_update_hook: vi.fn((_db, cb) => {
            mockState.updateHookCallback = cb;
            return 0;
          }),
          get __updateHookCallback() {
            return mockState.updateHookCallback;
          }
        },
        version: {
          libVersion: '3.50.4',
          libVersionNumber: 3050004,
          sourceId: 'mock',
          downloadVersion: 1
        }
      };
    })
  };
});

describe('SqliteaiClient', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.updateHookCallback = undefined;
    mockState.opfsAvailable = false;
    mockState.initFailuresRemaining = 0;
    mockState.dbCtorArgs.length = 0;
    mockState.opfsCtorArgs.length = 0;
    mockState.executedSql.length = 0;

    const { resetSqliteaiLoadCache } = await import('../sqliteai-load.utils.js');
    resetSqliteaiLoadCache();
  });

  it('BATCH_TIMEOUT 常量应正确定义', async () => {
    const { BATCH_TIMEOUT } = await import('../SqliteaiClient.js');

    expect(BATCH_TIMEOUT.IMMEDIATE).toBe(0);
    expect(BATCH_TIMEOUT.FAST).toBe(4);
    expect(BATCH_TIMEOUT.BALANCED).toBe(16);
    expect(BATCH_TIMEOUT.POWER_SAVE).toBe(50);
  });

  it('应该初始化并执行 SQL', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();
    await client.init('test-db');

    const result = await client.execute('SELECT 1');
    expect(result).toBeDefined();
    expect(result.sql).toBe('SELECT 1');
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('应该返回版本号', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();
    await client.init('test-db');

    const version = await client.version();
    expect(version).toBe('3.50.4');
  });

  it('应该阻止在断开后执行', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();
    await client.init('test-db');
    await client.disconnect();

    await expect(client.execute('SELECT 1')).rejects.toThrow('disconnected');
  });

  it('不应重复初始化', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();
    await client.init('test-db');
    await client.init('test-db-2'); // 应为空操作。

    const result = await client.execute('SELECT 1');
    expect(result).toBeDefined();
  });

  it('请求 opfs 且可用时应该打开持久化数据库文件', async () => {
    mockState.opfsAvailable = true;

    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    await client.init('persist-db', { opfs: true });

    expect(mockState.opfsCtorArgs).toEqual([['/persist-db.sqlite3']]);
  });

  it('opfs 模式应该启用更快的持久化 pragma', async () => {
    mockState.opfsAvailable = true;

    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    await client.init('persist-db', { opfs: true });

    const initSql = mockState.executedSql[0] ?? '';
    expect(initSql).toContain('PRAGMA journal_mode = WAL;');
    expect(initSql).toContain('PRAGMA synchronous = NORMAL;');
    expect(initSql).toContain('PRAGMA wal_autocheckpoint = 1000;');
  });

  it("createSqliteClient 应该透传 opfsFallback: 'throw'", async () => {
    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(
      createSqliteClient('persist-db', {
        opfs: true,
        opfsFallback: 'throw'
      })
    ).rejects.toThrow('OPFS unavailable');

    expect(mockState.dbCtorArgs).toEqual([]);
  });

  it('请求 opfs 但不可用时默认应该 reject', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    await expect(client.init('persist-db', { opfs: true })).rejects.toThrow('OPFS unavailable');
  });

  it("显式 opfsFallback: 'memory' 时应该回退到内存数据库", async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    try {
      await client.init('persist-db', { opfs: true, opfsFallback: 'memory' });

      expect(mockState.opfsCtorArgs).toEqual([]);
      expect(mockState.dbCtorArgs[0]).toEqual([':memory:']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0] ?? '')).toContain(
        '[sqliteai] OPFS database creation failed, falling back to in-memory database:'
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('内存模式应该启用轻量事务 pragma', async () => {
    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    await client.init('memory-db', { opfs: false });

    const initSql = mockState.executedSql[0] ?? '';
    expect(initSql).toContain('PRAGMA journal_mode = MEMORY;');
    expect(initSql).toContain('PRAGMA synchronous = OFF;');
  });

  it('初始化失败后应该允许重试', async () => {
    mockState.initFailuresRemaining = 1;

    const { SqliteaiClient } = await import('../SqliteaiClient.js');
    const client = new SqliteaiClient();

    await expect(client.init('retry-db')).rejects.toThrow('sqlite init failed');
    await expect(client.init('retry-db')).resolves.toBeUndefined();

    const result = await client.execute('SELECT 1');
    expect(result.sql).toBe('SELECT 1');
  });
});
