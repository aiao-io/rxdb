/**
 * @fileoverview 由 adapter 提供的 `rxdb_db_keyring` 单例行存储绑定。
 * 纯接口，不含运行时逻辑。
 */

/** 持久化在 `rxdb_db_keyring` 表中的那一行。 */
export interface KeyringRow {
  id: 'singleton';
  /** 行创建时的 Unix 毫秒时间戳。 */
  createdAt: number;
  /** 密钥派生函数标识，当前固定不变。 */
  kdf: 'pbkdf2-sha256-600000';
  /** Base64url 编码的 16 字节随机数。 */
  salt: string;
  /** Base64url 编码的 8 字节随机数。 */
  kid: string;
  /** 信封形态的加密 verifier —— unlock 时用来检测密钥错误。 */
  verifier: string;
}

/**
 * 由各 adapter（sqlite-core、pglite …）实现，用于读写 keyring 单例行。
 */
export interface KeyringStorageBinding {
  /** 返回单例行；keyring 表为空时返回 `null`。 */
  readSingleton(): Promise<KeyringRow | null>;

  /**
   * 插入单例行。如果行已存在，实现必须抛
   * `EncryptedConfigurationError(code: 'keyring_singleton_conflict')`
   * （使用 `INSERT OR FAIL` / `INSERT … ON CONFLICT DO NOTHING` + 校验）。
   */
  writeSingleton(row: KeyringRow): Promise<void>;
}
