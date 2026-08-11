import { EncryptedConfigurationError, type KeyringRow } from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it } from 'vitest';
import { SqliteCoreKeyringStorage } from '../../keyring/sqlite-core-keyring-storage.js';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';

interface RecordedQuery {
  sql: string;
  params?: SQLiteCompatibleType[];
}

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

const okResult = (sql: string, rows: SQLiteCompatibleType[][] = []): SqliteSuccessResult => ({
  sql,
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns: [], rows }]
});

const createAdapter = (calls: RecordedQuery[], handler: QueryHandler): RxDBAdapterSqliteBase => {
  const query: QueryHandler = (sql, params) => {
    calls.push({ sql, params });
    return handler(sql, params);
  };
  return { internalQuery: query, writeQuery: query } as unknown as RxDBAdapterSqliteBase;
};

const singletonRow: KeyringRow = {
  id: 'singleton',
  createdAt: 1735689600000,
  kdf: 'pbkdf2-sha256-600000',
  salt: 'salt-b64',
  kid: 'kid-b64',
  verifier: 'verifier-envelope'
};

describe('SqliteCoreKeyringStorage', () => {
  it('readSingleton 首次访问先建表，空表返回 null', async () => {
    const calls: RecordedQuery[] = [];
    const storage = new SqliteCoreKeyringStorage(createAdapter(calls, async sql => okResult(sql)));

    const row = await storage.readSingleton();

    expect(row).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS rxdb_db_keyring');
    expect(calls[1].sql).toContain(`SELECT id, createdAt, kdf, salt, kid, verifier FROM rxdb_db_keyring`);
  });

  it('readSingleton 在结果集缺失时回退为空行并返回 null', async () => {
    const calls: RecordedQuery[] = [];
    const storage = new SqliteCoreKeyringStorage(
      createAdapter(calls, async sql => ({ sql, rowsAffected: 0, elapsed: 0, results: [] }))
    );

    await expect(storage.readSingleton()).resolves.toBeNull();
  });

  it('readSingleton 将行数据映射为 KeyringRow 并做类型规范化', async () => {
    const calls: RecordedQuery[] = [];
    const storage = new SqliteCoreKeyringStorage(
      createAdapter(calls, async sql => {
        if (sql.startsWith('SELECT')) {
          return okResult(sql, [
            ['singleton', '1735689600000', 'pbkdf2-sha256-600000', 'salt-b64', 'kid-b64', 'verifier-envelope']
          ]);
        }
        return okResult(sql);
      })
    );

    const row = await storage.readSingleton();

    expect(row).toEqual(singletonRow);
    expect(row?.createdAt).toBeTypeOf('number');
  });

  it('建表只执行一次，后续调用直接复用', async () => {
    const calls: RecordedQuery[] = [];
    const storage = new SqliteCoreKeyringStorage(createAdapter(calls, async sql => okResult(sql)));

    await storage.readSingleton();
    await storage.readSingleton();

    const createCalls = calls.filter(call => call.sql.includes('CREATE TABLE IF NOT EXISTS rxdb_db_keyring'));
    expect(createCalls).toHaveLength(1);
  });

  it('writeSingleton 以参数化 INSERT 落盘单例行', async () => {
    const calls: RecordedQuery[] = [];
    const storage = new SqliteCoreKeyringStorage(createAdapter(calls, async sql => okResult(sql)));

    await storage.writeSingleton(singletonRow);

    const insertCall = calls.find(call => call.sql.startsWith('INSERT OR FAIL INTO rxdb_db_keyring'));
    expect(insertCall).toBeDefined();
    expect(insertCall?.params).toEqual([
      'singleton',
      1735689600000,
      'pbkdf2-sha256-600000',
      'salt-b64',
      'kid-b64',
      'verifier-envelope'
    ]);
  });

  it('writeSingleton 冲突时包装为 keyring_singleton_conflict 错误并保留 cause', async () => {
    const calls: RecordedQuery[] = [];
    const conflict = new Error('UNIQUE constraint failed');
    const storage = new SqliteCoreKeyringStorage(
      createAdapter(calls, async sql => {
        if (sql.startsWith('INSERT OR FAIL')) throw conflict;
        return okResult(sql);
      })
    );

    const error = await storage.writeSingleton(singletonRow).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EncryptedConfigurationError);
    expect(error).toMatchObject({ code: 'keyring_singleton_conflict', cause: conflict });
  });
});
