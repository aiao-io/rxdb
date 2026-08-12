import { EncryptedConfigurationError, type KeyringRow, type KeyringStorageBinding } from '@aiao/rxdb-adapter-encrypted';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';

/**
 * `rxdb_db_keyring` 单例表，首次写入时创建。
 *
 * - `id` 固定为 `'singleton'` 并设为主键，保证只有一行。
 * - 其余列均为 `TEXT NOT NULL`（kdf、salt、kid、verifier），
 *   唯有 `createdAt` 是 `INTEGER NOT NULL`（unix 毫秒）。
 */
/**
 * 判定是否为主键/唯一约束冲突。
 *
 * @remarks
 * SQLite 各绑定（wa-sqlite / sqlite-wasm / sqliteai / node）抛出的错误对象结构不一，
 * 但消息里都带 SQLite 原生的 `UNIQUE constraint failed` / `PRIMARY KEY must be unique` 文本。
 * 只匹配这两类，其余错误原样上抛（SQLC-029）。
 */
const isUniqueConstraintViolation = (cause: unknown): boolean => {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /UNIQUE constraint failed|PRIMARY KEY must be unique|constraint failed: rxdb_db_keyring/i.test(message);
};

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rxdb_db_keyring (
    id TEXT PRIMARY KEY,
    createdAt INTEGER NOT NULL,
    kdf TEXT NOT NULL,
    salt TEXT NOT NULL,
    kid TEXT NOT NULL,
    verifier TEXT NOT NULL
  )
`;

const SELECT_SQL = `SELECT id, createdAt, kdf, salt, kid, verifier FROM rxdb_db_keyring WHERE id = 'singleton'`;

const INSERT_SQL = `INSERT OR FAIL INTO rxdb_db_keyring (id, createdAt, kdf, salt, kid, verifier) VALUES (?, ?, ?, ?, ?, ?)`;

/**
 * 把密钥环单例行持久化到适配器自带的 SQLite 数据库。
 * wa-sqlite 与 sqliteai 两个继承类都会用到。
 */
export class SqliteCoreKeyringStorage implements KeyringStorageBinding {
  #ensured = false;

  constructor(private readonly adapter: RxDBAdapterSqliteBase) {}

  async readSingleton(): Promise<KeyringRow | null> {
    await this.#ensureTable();
    const result = await this.adapter.internalQuery(SELECT_SQL);
    const rows = result.results[0]?.rows ?? [];
    if (rows.length === 0) return null;
    const row = rows[0];
    // SELECT 列：0=id, 1=createdAt, 2=kdf, 3=salt, 4=kid, 5=verifier
    return {
      id: 'singleton',
      createdAt: Number(row[1]),
      kdf: String(row[2]) as KeyringRow['kdf'],
      salt: String(row[3]),
      kid: String(row[4]),
      verifier: String(row[5])
    };
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    await this.#ensureTable();
    try {
      await this.adapter.writeQuery(INSERT_SQL, [row.id, row.createdAt, row.kdf, row.salt, row.kid, row.verifier]);
    } catch (cause) {
      // 只有真正的唯一约束冲突才是单例冲突。把磁盘满、表不存在、权限错误、
      // 连接已断开一律报成「已存在单例行」会让调用方按错误的方向排查，
      // 也会让重试逻辑对一个根本不会自愈的故障反复重试（SQLC-029）
      if (!isUniqueConstraintViolation(cause)) throw cause;
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
