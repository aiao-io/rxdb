import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop/desktop-error.js';
import {
  assertSupportedDesktopStorage,
  assertValidDesktopDatabaseName,
  isDesktopSqliteFileStorage
} from '../desktop/desktop-storage.js';

const sqliteStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' } as const;
const pgliteStorage = { engine: 'pglite', dataDirectoryName: 'app-pgdata' } as const;

describe('assertValidDesktopDatabaseName', () => {
  it.each(['app.sqlite3', 'a', 'my-db_2.sqlite3', 'A1'])('accepts app-scoped logical name %s', name => {
    expect(() => assertValidDesktopDatabaseName(name)).not.toThrow();
  });

  // RxDB 的本地库名恒为 `<dbName>@<RXDB_DB_NAME_SUFFIX>`，那个 `@` 被永久冻结（改它=静默清空用户数据），
  // 所以适配器推导出来的名字必然带 `@`；白名单排除它等于桌面适配器接不上任何真实 RxDB 实例。
  it('accepts the @-suffixed local database name RxDB always produces', () => {
    expect(() => assertValidDesktopDatabaseName('notes@0_1.sqlite3')).not.toThrow();
  });

  // AC#3/AC#4：名字来自 renderer，必须无法越出应用作用域，也不得被当成文件系统路径
  it.each([
    ['empty', ''],
    ['posix traversal', '../escape.sqlite3'],
    ['windows traversal', '..\\escape.sqlite3'],
    ['posix separator', 'nested/app.sqlite3'],
    ['windows separator', 'nested\\app.sqlite3'],
    ['posix absolute', '/etc/passwd'],
    ['windows absolute', 'C:\\app.sqlite3'],
    ['leading dot', '.hidden'],
    ['current dir', '.'],
    ['parent dir', '..'],
    ['null byte', 'app\u0000.sqlite3'],
    ['url scheme', 'file://app.sqlite3'],
    ['home expansion', '~/app.sqlite3'],
    ['whitespace only', '   ']
  ])('rejects %s', (_label, name) => {
    expect(() => assertValidDesktopDatabaseName(name)).toThrowError(RxDBAdapterDesktopError);
    expect(() => assertValidDesktopDatabaseName(name)).toThrowError(/invalid_database_name/);
  });

  // 这些名字过得了字符白名单，却在 Windows 上指向字符设备。三平台统一在校验期拒绝，
  // 免得同一个名字在 macOS 上建出文件、在 Windows 上连上串口。
  it.each(['CON', 'con', 'NUL', 'PRN', 'AUX', 'COM1', 'lpt9', 'CON.sqlite3', 'nul.db'])(
    'rejects the reserved Windows device name %s',
    name => {
      expect(() => assertValidDesktopDatabaseName(name)).toThrowError(/invalid_database_name/);
    }
  );

  // 黑名单只认设备名本身，不能顺手把以它开头的正常名字一起毙掉。
  it.each(['CONFIG.sqlite3', 'console', 'COM0', 'LPT0', 'COM10', 'nullable.db', 'auxiliary'])(
    'keeps accepting %s, which merely starts like a device name',
    name => {
      expect(() => assertValidDesktopDatabaseName(name)).not.toThrow();
    }
  );

  it('rejects a name longer than 128 characters', () => {
    expect(() => assertValidDesktopDatabaseName(`${'a'.repeat(129)}`)).toThrowError(/invalid_database_name/);
  });

  it('rejects non-string input arriving from an untrusted renderer', () => {
    expect(() => assertValidDesktopDatabaseName(42 as unknown as string)).toThrowError(/invalid_database_name/);
  });

  it('reports the offending code on the error instance', () => {
    try {
      assertValidDesktopDatabaseName('../x');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
      expect((error as RxDBAdapterDesktopError).code).toBe('invalid_database_name');
    }
  });
});

describe('assertSupportedDesktopStorage', () => {
  it('accepts electron + sqlite', () => {
    expect(() => assertSupportedDesktopStorage('electron', sqliteStorage)).not.toThrow();
  });

  it('accepts tauri + sqlite', () => {
    expect(() => assertSupportedDesktopStorage('tauri', sqliteStorage)).not.toThrow();
  });

  // 能力矩阵：Tauri 没有 Node 主进程，PGlite 的同步 filesystem 契约无法异步代理
  it('rejects tauri + pglite with a discriminable code', () => {
    try {
      assertSupportedDesktopStorage('tauri', pgliteStorage);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('unsupported_runtime_engine');
    }
  });

  // US-208 未落地前，Electron + PGlite 也必须显式报缺失能力，而不是悄悄当成 sqlite
  it('rejects electron + pglite until US-208 lands', () => {
    try {
      assertSupportedDesktopStorage('electron', pgliteStorage);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('unsupported_runtime_engine');
    }
  });

  it('rejects an unknown runtime', () => {
    expect(() => assertSupportedDesktopStorage('web' as unknown as 'electron', sqliteStorage)).toThrowError(
      /unsupported_runtime_engine/
    );
  });

  it('rejects an unknown engine', () => {
    expect(() =>
      assertSupportedDesktopStorage('electron', { engine: 'mysql' } as unknown as typeof sqliteStorage)
    ).toThrowError(/unsupported_runtime_engine/);
  });

  it('validates the database name of a sqlite storage', () => {
    expect(() =>
      assertSupportedDesktopStorage('electron', { engine: 'sqlite', databaseName: '../escape' })
    ).toThrowError(/invalid_database_name/);
  });
});

describe('isDesktopSqliteFileStorage', () => {
  it('narrows sqlite storage', () => {
    expect(isDesktopSqliteFileStorage(sqliteStorage)).toBe(true);
  });

  // PGlite data directory 是目录不是单文件，不能被当成 sqlite 单文件配置
  it('does not treat a pglite data directory as a single file database', () => {
    expect(isDesktopSqliteFileStorage(pgliteStorage)).toBe(false);
  });

  it.each([null, undefined, 'sqlite', 7, {}, { engine: 'sqlite' }])('rejects %s', value => {
    expect(isDesktopSqliteFileStorage(value)).toBe(false);
  });
});
