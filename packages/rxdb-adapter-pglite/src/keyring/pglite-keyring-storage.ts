import { EncryptedConfigurationError, type KeyringRow, type KeyringStorageBinding } from '@aiao/rxdb-adapter-encrypted';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * PGlite（PostgreSQL 方言）的 `rxdb_db_keyring` 单例表。
 *
 * - `id` 固定为 `'singleton'` 主键，保证只存一行。
 * - `createdAt` 为 `BIGINT`（unix 毫秒）。
 * - PG 占位符为 `$1..$6`。
 */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rxdb_db_keyring (
    id TEXT PRIMARY KEY,
    "createdAt" BIGINT NOT NULL,
    kdf TEXT NOT NULL,
    salt TEXT NOT NULL,
    kid TEXT NOT NULL,
    verifier TEXT NOT NULL
  )
`;

const SELECT_SQL = `SELECT id, "createdAt", kdf, salt, kid, verifier FROM rxdb_db_keyring WHERE id = 'singleton'`;

const INSERT_SQL = `INSERT INTO rxdb_db_keyring (id, "createdAt", kdf, salt, kid, verifier) VALUES ($1, $2, $3, $4, $5, $6)`;

/**
 * 把 keyring 单例行持久化到 PGlite 数据库。
 * 与 `SqliteCoreKeyringStorage` 接口对齐，但使用 PostgreSQL 语法：
 * 编号占位符、BIGINT 存毫秒时间戳、驼峰标识符加双引号。
 */
export class PgliteKeyringStorage implements KeyringStorageBinding {
  #ensured = false;

  constructor(private readonly adapter: RxDBAdapterPGlite) {}

  async readSingleton(): Promise<KeyringRow | null> {
    await this.#ensureTable();
    const result = await this.adapter.internalQuery(SELECT_SQL);
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: 'singleton',
      createdAt: Number(row['createdAt']),
      kdf: String(row['kdf']) as KeyringRow['kdf'],
      salt: String(row['salt']),
      kid: String(row['kid']),
      verifier: String(row['verifier'])
    };
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    await this.#ensureTable();
    try {
      await this.adapter.writeQuery(INSERT_SQL, [row.id, row.createdAt, row.kdf, row.salt, row.kid, row.verifier]);
    } catch (cause) {
      if (Reflect.get(Object(cause), 'code') !== '23505') throw cause;
      throw new EncryptedConfigurationError({
        code: 'keyring_singleton_conflict',
        message: 'rxdb_db_keyring already contains a singleton row',
        cause
      });
    }
  }

  async #ensureTable(): Promise<void> {
    if (this.#ensured) return;
    await this.adapter.writeQuery(CREATE_TABLE_SQL);
    this.#ensured = true;
  }
}
