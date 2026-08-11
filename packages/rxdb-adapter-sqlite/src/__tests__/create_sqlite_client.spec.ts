import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  opfsAvailable: false,
  opfsCtorArgs: [] as unknown[][],
  memoryCtorArgs: [] as unknown[][]
}));

vi.mock('@sqlite.org/sqlite-wasm', () => {
  class MockDB {
    constructor(...args: unknown[]) {
      mockState.memoryCtorArgs.push(args);
    }

    prepare(sql: string) {
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

    exec() {
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
    default: vi.fn().mockImplementation(async () => ({
      oo1: {
        DB: MockDB,
        OpfsDb: MockOpfsDb
      },
      capi: {
        sqlite3_update_hook: vi.fn(() => 0)
      },
      version: {
        libVersion: '3.51.2',
        libVersionNumber: 3051002,
        sourceId: 'mock',
        downloadVersion: 1
      }
    }))
  };
});

describe('createSqliteClient opfsFallback', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.opfsAvailable = false;
    mockState.opfsCtorArgs.length = 0;
    mockState.memoryCtorArgs.length = 0;

    const { resetSqliteLoadCache } = await import('../sqlite-official-load.utils.js');
    resetSqliteLoadCache();
  });

  it("opfsFallback: 'throw' 时 OPFS 打开失败应该 reject", async () => {
    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('throw-db', { opfs: true, opfsFallback: 'throw' })).rejects.toThrow(
      'OPFS unavailable'
    );
  });

  it('默认时 OPFS 打开失败应该 reject', async () => {
    const { createSqliteClient } = await import('../create_sqlite_client.js');

    await expect(createSqliteClient('default-db', { opfs: true })).rejects.toThrow('OPFS unavailable');
  });

  it("显式 opfsFallback: 'memory' 时应该回退内存库", async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createSqliteClient } = await import('../create_sqlite_client.js');

    const client = await createSqliteClient('memory-db', { opfs: true, opfsFallback: 'memory' });
    expect(mockState.memoryCtorArgs).toContainEqual([':memory:']);

    await client.disconnect();
    warnSpy.mockRestore();
  });
});
