/**
 * @fileoverview `@aiao/rxdb-adapter-encrypted` —— RxDB 的本地字段级 AES-GCM-256 信封加密。
 * 接入 SQLite-core / PGlite adapter。
 *
 * import 时无副作用。第一次 `crypto.subtle` 访问发生在首次
 * `unlock()` / `aesGcm*` 调用内部。
 *
 * 能力映射：
 * - FR-001 schema 校验        → `validateEncryptedPropertyMetadata`, `validateFTSRegistrationAgainstEncryptedColumns`
 * - FR-002 信封文本形态       → `encodeEnvelope` / `decodeEnvelope` / `isEnvelope` / `ENVELOPE_*`
 * - FR-003 AES-GCM-256 + AAD  → `buildAAD`, `Keyring#encrypt` / `Keyring#decrypt`
 * - FR-004 unlock 形态        → `UnlockOptions` 以及四种 `*UnlockOptions` 接口
 * - FR-005 DDL TEXT 覆盖      → 由 SQLite-core / PGlite adapter 强制执行（本包不含）
 * - FR-006 落盘零明文         → `Keyring#encrypt`, `scanForPlaintext`（仅测试用校验器）
 * - FR-007 查询拦截           → `validateQueryAgainstEncryptedColumns`
 * - FR-008 锁定态隔离         → `EncryptedLockedError`, `Keyring#lock` / `Keyring#lockChange$`
 * - FR-009 unlock 时校验      → `VERIFIER_SENTINEL`, `Keyring#unlock`
 * - Errors 契约               → `EncryptedError` + 具体子类 + `EncryptedErrorCode`
 */

export {
  /** FR-002：冻结的算法标签（`'AGCM256'`）。 */
  ENVELOPE_ALG,
  /** FR-002：冻结的当前写入信封版本（`2`）。 */
  ENVELOPE_VERSION,
  /** FR-003：用长度前缀 tuple 构造绑定数据库和实体 namespace 的 AES-GCM AAD。 */
  buildAAD,
  /** FR-002：把磁盘上的信封文本解析成 `CryptoEnvelope`。 */
  decodeEnvelope,
  /** FR-002：把 `CryptoEnvelope` 序列化成磁盘文本形态。 */
  encodeEnvelope,
  /** FR-002：对信封字符串的轻量形状判断。 */
  isEnvelope
} from './envelope.js';
export type { CryptoEnvelope, EnvelopeVersion } from './envelope.js';

export {
  /** FR-001：若加密列同时是主键/外键/索引/唯一/可排序/计算列，抛 `EncryptedConfigurationError`。 */
  validateEncryptedPropertyMetadata,
  /** FR-001 + FR-007：拒绝在加密列上注册 FTS。 */
  validateFTSRegistrationAgainstEncryptedColumns,
  /** FR-007：对加密列的 where/order/group/projection 抛 `EncryptedQueryError`。 */
  validateQueryAgainstEncryptedColumns
} from './metadata-validation.js';
export type { EncryptedAwareEntity, EncryptedEntityResolver } from './metadata-validation.js';

export {
  /** FR-001 错误：加密属性元数据或 adapter 配置非法。 */
  EncryptedConfigurationError,
  /** FR-002 / FR-006 错误：信封格式错误、鉴权失败、版本不支持。 */
  EncryptedDecryptError,
  /** 抽象基类 —— 本包抛出的所有错误都匹配它。 */
  EncryptedError,
  /** FR-008 错误：keyring 锁定时尝试读取。 */
  EncryptedLockedError,
  /** FR-007 错误：查询引用了加密列。 */
  EncryptedQueryError,
  /** FR-009 错误：passphrase 校验不匹配或 keyProvider 异步失败。 */
  EncryptedUnlockError
} from './errors.js';
export type { EncryptedErrorCode, EncryptedErrorInit } from './errors.js';

export type { KeyringRow, KeyringStorageBinding } from './keyring-storage.js';

export {
  /**
   * FR-003 / FR-004 / FR-008 / FR-009：持有已解锁的 AES-GCM-256 密钥、
   * 基于 verifier 的 unlock 校验、空闲自动锁定计时器。
   */
  Keyring,
  /** FR-009：keyring verifier 探测加密用的固定明文。 */
  VERIFIER_SENTINEL,
  /** FR-003 / FR-004 / FR-008 / FR-009：把 `Keyring` 接到 storage 的工厂函数。 */
  createKeyring
} from './keyring.js';
export type {
  /** FR-004: `unlock({ key })`. */
  CryptoKeyUnlockOptions,
  DecryptArgs,
  EncryptArgs,
  /** FR-004: `unlock({ keyBytes })`. */
  KeyBytesUnlockOptions,
  /** FR-004: `unlock({ keyProvider })`. */
  KeyProviderUnlockOptions,
  /** v1 实体信封的显式迁移读取策略。 */
  LegacyEnvelopePolicy,
  /** FR-004：`unlock({ passphrase, idleTimeoutMs? })`。 */
  PassphraseUnlockOptions,
  /** FR-004：四种互斥 unlock 形态的联合类型。 */
  UnlockOptions
} from './keyring.js';

export { deserializeFromEnvelope, serializeForEnvelope } from './serialize.js';

export { envelopePlaintextPatches, unenvelopePlaintextPatches } from './encrypt-patch.js';
export type { PatchWalkArgs } from './encrypt-patch.js';

export { validateEncryptedQuery } from './validate-encrypted-query.js';
