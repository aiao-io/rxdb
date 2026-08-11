import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  updateHookCallback: undefined as ((...args: unknown[]) => void) | undefined,
  opfsAvailable: false,
  initFailuresRemaining: 0,
  dbCtorArgs: [] as unknown[][],
  opfsCtorArgs: [] as unknown[][],
  executedSql: [] as string[]
}));

vi.mock('@sqlite.org/sqlite-wasm', () => {
  class MockDB {
    constructor(...args: unknown[]) {
      mockState.dbCtorArgs.push(args);
    }

    prepare(sql: string) {
      mockState.executedSql.push(sql);
      let stepped = false;
      const row = sql.includes('sqlite_version()') ? ['3.51.2'] : [1];
      const column = sql.includes('sqlite_version()') ? 'sqlite_version()' : '1';

      return {
        bind: vi.fn(),
        getColumnNames: vi.fn(() => [column]),
        step: vi.fn(() => {
          if (stepped) {
            return false;
          }
          stepped = true;
          return true;
        }),
        get: vi.fn(() => row),
        finalize: vi.fn()
      };
    }

    exec(opts: { sql?: string; resultRows?: unknown[][]; columnNames?: string[] }) {
      if (opts.sql) {
        mockState.executedSql.push(opts.sql);
      }
      if (opts.resultRows) {
        opts.resultRows.push(['3.51.2']);
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
          libVersion: '3.51.2',
          libVersionNumber: 3051002,
          sourceId: 'mock',
          downloadVersion: 1
        }
      };
    })
  };
});

describe('SqliteOfficialClient', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.updateHookCallback = undefined;
    mockState.opfsAvailable = false;
    mockState.initFailuresRemaining = 0;
    mockState.dbCtorArgs.length = 0;
    mockState.opfsCtorArgs.length = 0;
    mockState.executedSql.length = 0;

    const { resetSqliteLoadCache: resetSqliteOfficialLoadCache } = await import('../sqlite-official-load.utils.js');
    resetSqliteOfficialLoadCache();
  });

  it('应该初始化并执行 SQL', async () => {
    const { SqliteClient } = await import('../SqliteOfficialClient.js');
    const client = new SqliteClient();
    await client.init('test-db');

    const result = await client.execute('SELECT 1');
    expect(result).toBeDefined();
    expect(result.sql).toBe('SELECT 1');
  });

  it('初始化失败后应该允许重试', async () => {
    mockState.initFailuresRemaining = 1;

    const { SqliteClient } = await import('../SqliteOfficialClient.js');
    const client = new SqliteClient();

    await expect(client.init('retry-db')).rejects.toThrow('sqlite init failed');
    await expect(client.init('retry-db')).resolves.toBeUndefined();

    const version = await client.version();
    expect(version).toBe('3.51.2');
  });
});
