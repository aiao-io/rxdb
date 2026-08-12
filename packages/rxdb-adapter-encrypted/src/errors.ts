/**
 * @fileoverview `@aiao/rxdb-adapter-encrypted` 的类型化错误。
 *
 * 类名与 `code` 字面量属于稳定公开 API。
 */

/**
 * 所有具体子类 `code` 字面量的联合类型。
 */
export type EncryptedErrorCode =
  // 加密配置错误：EncryptedConfigurationError
  | 'encrypted_pk_forbidden'
  | 'encrypted_fk_forbidden'
  | 'encrypted_index_forbidden'
  | 'encrypted_unique_forbidden'
  | 'encrypted_sortable_forbidden'
  | 'encrypted_computed_forbidden'
  | 'encrypted_fts_forbidden'
  | 'unsupported_kdf'
  | 'invalid_key'
  | 'invalid_key_bytes'
  | 'no_encrypted_columns'
  | 'keyring_singleton_conflict'
  // 加密锁定错误：EncryptedLockedError
  | 'locked'
  // 加密解锁错误：EncryptedUnlockError
  | 'verifier_mismatch'
  | 'key_provider_failed'
  | 'unlock_aborted_by_lock'
  // 加密解密错误：EncryptedDecryptError
  | 'malformed_envelope'
  | 'unsupported_version'
  | 'unsupported_algorithm'
  | 'unknown_kid'
  | 'legacy_envelope_forbidden'
  | 'auth_failure'
  // 加密查询错误：EncryptedQueryError
  | 'where_on_encrypted'
  | 'order_on_encrypted'
  | 'group_on_encrypted'
  | 'projection_on_encrypted';

/** 所有加密错误共享的结构化上下文。字段均可安全用于错误分诊。 */
export interface EncryptedErrorInit {
  message?: string;
  entity?: string;
  property?: string;
  hint?: string;
  cause?: unknown;
}

/**
 * `@aiao/rxdb-adapter-encrypted` 抛出的所有错误的抽象基类。
 *
 * 携带可选的结构化字段（`entity`、`property`、`hint`、`cause`）
 * 以及由各具体子类定义的稳定 `code` 字面量。
 */
export abstract class EncryptedError extends Error {
  abstract readonly code: EncryptedErrorCode;
  readonly entity?: string;
  readonly property?: string;
  readonly hint?: string;
  override readonly cause?: unknown;

  /**
   * @param name - 该错误类的稳定公开标识，**必须**是字面量。
   *
   *   这里不能写 `new.target.name`：那读的是构造函数身份，minify 一过就退化成
   *   `"n"` / `"r"` 这种单字母。源码单测对此免疫（源码不会被 mangle），
   *   退化只在装进用户项目的产物里才现形——所以字面量是唯一的防线，改这里务必手工
   *   在打包产物上复核一次。
   * @param init - 结构化上下文
   */
  protected constructor(name: string, init: EncryptedErrorInit = {}) {
    super(init.message);
    Object.defineProperty(this, 'name', {
      value: name,
      configurable: true
    });
    if (init.entity !== undefined) this.entity = init.entity;
    if (init.property !== undefined) this.property = init.property;
    if (init.hint !== undefined) this.hint = init.hint;
    if (init.cause !== undefined) this.cause = init.cause;
  }
}

type ConfigurationCode = Extract<
  EncryptedErrorCode,
  | 'encrypted_pk_forbidden'
  | 'encrypted_fk_forbidden'
  | 'encrypted_index_forbidden'
  | 'encrypted_unique_forbidden'
  | 'encrypted_sortable_forbidden'
  | 'encrypted_computed_forbidden'
  | 'encrypted_fts_forbidden'
  | 'unsupported_kdf'
  | 'invalid_key'
  | 'invalid_key_bytes'
  | 'no_encrypted_columns'
  | 'keyring_singleton_conflict'
>;

/** Schema / 初始化 / 生命周期阶段的配置错误。 */
export class EncryptedConfigurationError extends EncryptedError {
  readonly code: ConfigurationCode;
  constructor(init: EncryptedErrorInit & { code: ConfigurationCode }) {
    super('EncryptedConfigurationError', init);
    this.code = init.code;
  }
}

/** 在 `Keyring.isLocked` 时进入 encrypt / decrypt 路径触发。 */
export class EncryptedLockedError extends EncryptedError {
  readonly code = 'locked' as const;
  constructor(init: EncryptedErrorInit & { code?: 'locked' } = {}) {
    super('EncryptedLockedError', init);
  }
}

type UnlockCode = Extract<EncryptedErrorCode, 'verifier_mismatch' | 'key_provider_failed' | 'unlock_aborted_by_lock'>;

/** `unlock()` 密钥校验或 provider 分发失败，或被 `lock()` 取消。 */
export class EncryptedUnlockError extends EncryptedError {
  readonly code: UnlockCode;
  constructor(init: EncryptedErrorInit & { code: UnlockCode }) {
    super('EncryptedUnlockError', init);
    this.code = init.code;
  }
}

type DecryptCode = Extract<
  EncryptedErrorCode,
  | 'malformed_envelope'
  | 'unsupported_version'
  | 'unsupported_algorithm'
  | 'unknown_kid'
  | 'legacy_envelope_forbidden'
  | 'auth_failure'
>;

/** 读取时信封层失败。 */
export class EncryptedDecryptError extends EncryptedError {
  readonly code: DecryptCode;
  constructor(init: EncryptedErrorInit & { code: DecryptCode }) {
    super('EncryptedDecryptError', init);
    this.code = init.code;
  }
}

type QueryCode = Extract<
  EncryptedErrorCode,
  'where_on_encrypted' | 'order_on_encrypted' | 'group_on_encrypted' | 'projection_on_encrypted'
>;

/** 查询引用了加密列。 */
export class EncryptedQueryError extends EncryptedError {
  readonly code: QueryCode;
  constructor(init: EncryptedErrorInit & { code: QueryCode }) {
    super('EncryptedQueryError', init);
    this.code = init.code;
  }
}
