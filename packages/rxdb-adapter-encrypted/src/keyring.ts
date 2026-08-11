/**
 * @fileoverview `Keyring` —— 已解锁 AES-GCM-256 密钥的内存持有者、
 * 基于 verifier 的 unlock 校验、空闲自动锁定计时器，以及 adapter 集成层使用的高层
 * `encrypt` / `decrypt` API。
 */

import type { RxDBEntityId } from '@aiao/rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import { fromBase64Url, toBase64Url } from './base64url.js';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveKeyFromPassphrase,
  generateIV,
  importKeyFromBytes,
  randomBytes
} from './crypto.js';
import {
  buildAAD,
  buildLegacyAAD,
  decodeEnvelope,
  encodeEnvelope,
  ENVELOPE_ALG,
  ENVELOPE_VERSION
} from './envelope.js';
import {
  EncryptedConfigurationError,
  EncryptedDecryptError,
  EncryptedLockedError,
  EncryptedUnlockError
} from './errors.js';
import type { KeyringRow, KeyringStorageBinding } from './keyring-storage.js';

const SUPPORTED_KDF: KeyringRow['kdf'] = 'pbkdf2-sha256-600000';
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

/**
 * `idleTimeoutMs` 的上限（32 位有符号整数上界，约 24.8 天）。
 *
 * @remarks
 * RAE-007：`setTimeout` 的延时超过该值时，Node 与浏览器都会**钳成 1ms**
 * （Node 另发 `TimeoutOverflowWarning`）。传 `2_147_483_648` 本意是「很久之后再锁」，
 * 实测解锁 10ms 后就已自动锁定 —— 与调用方意图完全相反，且没有任何提示。
 * 需要更长空闲窗口时应改用分段调度，那属独立立项。
 */
const MAX_IDLE_TIMEOUT_MS = 2_147_483_647;
const KID_LEN = 8;
const SALT_LEN = 16;

/** keyring verifier 探测加密用的固定明文。 */
export const VERIFIER_SENTINEL = 'aiao.encrypted.v1.ok';

/** verifier 信封的 AAD 组成部分。 */
const VERIFIER_TABLE_NAME = '__keyring__';
const VERIFIER_COLUMN_NAME = 'verifier';
const VERIFIER_PRIMARY_KEY = '__verifier__';

interface UnlockLifecycleOptions {
  idleTimeoutMs?: number;
  legacyEnvelopePolicy?: LegacyEnvelopePolicy;
}

/** 通过 PBKDF2 passphrase 派生并校验持久化 keyring 的解锁参数。 */
export interface PassphraseUnlockOptions extends UnlockLifecycleOptions {
  passphrase: string;
}

/** 通过具备 encrypt/decrypt usage 的 AES-GCM-256 `CryptoKey` 解锁。 */
export interface CryptoKeyUnlockOptions extends UnlockLifecycleOptions {
  key: CryptoKey;
}

/** 通过恰好 32 字节的原始 AES-GCM-256 密钥解锁。 */
export interface KeyBytesUnlockOptions extends UnlockLifecycleOptions {
  keyBytes: Uint8Array;
}

/** 通过异步 provider 获取 `CryptoKey` 或 32 字节原始密钥。provider 失败会被结构化包装。 */
export interface KeyProviderUnlockOptions extends UnlockLifecycleOptions {
  keyProvider: () => Promise<CryptoKey | Uint8Array>;
}

/** v1 实体信封读取策略；所有新写入始终生成 v2。 */
export type LegacyEnvelopePolicy = 'reject' | 'migration';

/** 四种互斥密钥来源之一，可附带空闲锁定与旧信封迁移策略。 */
export type UnlockOptions =
  PassphraseUnlockOptions | CryptoKeyUnlockOptions | KeyBytesUnlockOptions | KeyProviderUnlockOptions;

/**
 * 单元格加密参数。除明文字节外，其余字段共同组成 v2 AAD 身份，解密时必须完全一致。
 */
export interface EncryptArgs {
  plaintext: Uint8Array;
  entityNamespace: string;
  tableName: string;
  columnName: string;
  primaryKey: RxDBEntityId;
}

/**
 * 单元格解密参数。实体 namespace、表、列和类型化主键必须与加密时的 AAD 身份一致。
 */
export interface DecryptArgs {
  envelope: string;
  entityNamespace: string;
  tableName: string;
  columnName: string;
  primaryKey: RxDBEntityId;
}

interface CreateKeyringOptions {
  namespace: string;
  storage: KeyringStorageBinding;
}

function isPassphraseOpts(o: UnlockOptions): o is PassphraseUnlockOptions {
  return typeof (o as PassphraseUnlockOptions).passphrase === 'string';
}
function isKeyBytesOpts(o: UnlockOptions): o is KeyBytesUnlockOptions {
  return (o as KeyBytesUnlockOptions).keyBytes instanceof Uint8Array;
}
function isCryptoKeyOpts(o: UnlockOptions): o is CryptoKeyUnlockOptions {
  return (
    (o as CryptoKeyUnlockOptions).key != null &&
    typeof (o as CryptoKeyUnlockOptions).key === 'object' &&
    'algorithm' in (o as CryptoKeyUnlockOptions).key
  );
}
function isKeyProviderOpts(o: UnlockOptions): o is KeyProviderUnlockOptions {
  return typeof (o as KeyProviderUnlockOptions).keyProvider === 'function';
}

/** 为非法 keyProvider 结果生成可读描述，不泄漏其内容。 */
function describeProvidedKey(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  return Object.prototype.toString.call(value);
}

function assertAesGcm256(key: CryptoKey): void {
  const alg = key.algorithm as AesKeyAlgorithm | undefined;
  if (!alg || alg.name !== 'AES-GCM' || alg.length !== 256) {
    throw new EncryptedConfigurationError({
      code: 'invalid_key',
      message: `CryptoKey must be AES-GCM-256, got ${alg?.name ?? 'unknown'}/${alg?.length ?? '?'}`
    });
  }
  const usages = key.usages ?? [];
  if (!usages.includes('encrypt') || !usages.includes('decrypt')) {
    throw new EncryptedConfigurationError({
      code: 'invalid_key',
      message: 'CryptoKey usages must include both encrypt and decrypt'
    });
  }
}

/**
 * 数据库级 AES-GCM-256 密钥生命周期与单元格信封加解密器。
 *
 * keyring 初始为锁定态；`unlock()` 会校验或初始化持久化 verifier。`lock()` 是完成屏障：
 * 它会取消更早启动但尚未完成的 unlock/encrypt/decrypt，解密出的临时明文会先清零再拒绝。
 * 新写入固定生成 v2 信封；v1 默认拒绝，仅可通过 `legacyEnvelopePolicy: 'migration'` 临时读取。
 */
export class Keyring {
  private readonly storage: KeyringStorageBinding;
  private key: CryptoKey | null = null;
  private kidValue: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS;
  private legacyEnvelopePolicy: LegacyEnvelopePolicy = 'reject';
  private readonly lockState$ = new BehaviorSubject<boolean>(true);
  private unlockQueue: Promise<void> = Promise.resolve();
  /**
   * 每次调用 `lock()`（即便发现 keyring 已经锁定也会递增）都会自增的计数器。
   * 飞行中的 `performUnlock` 会先捕获该计数，如果发现自增过则拒绝装入派生密钥，
   * 从而保证后续显式 `lock()` 不会被启动在它之前的 unlock 撤销。
   */
  private lockEpoch = 0;

  /** 参与所有 v2 AAD 的数据库认证域。 */
  readonly namespace: string;

  /** 当前是否没有可用内存密钥。 */
  get isLocked(): boolean {
    return this.key == null;
  }

  /** 当前已解锁密钥的持久化 ID；锁定时为 `null`。 */
  get kid(): string | null {
    return this.kidValue;
  }

  /** 锁定状态流；初始值为 `true`。 */
  get lockChange$(): Observable<boolean> {
    return this.lockState$.asObservable();
  }

  constructor(opts: CreateKeyringOptions) {
    this.namespace = opts.namespace;
    this.storage = opts.storage;
  }

  /** keyring 单例行是否已经初始化。此检查不会解锁或校验 verifier。 */
  async isInitialized(): Promise<boolean> {
    const row = await this.storage.readSingleton();
    return row != null;
  }

  /**
   * 串行执行解锁并校验持久化 verifier。
   *
   * @throws {@link EncryptedConfigurationError} 参数形态、密钥或持久化 KDF 不受支持
   * @throws {@link EncryptedUnlockError} verifier 不匹配、provider 失败或在途解锁被 `lock()` 取消
   */
  unlock(opts: UnlockOptions): Promise<void> {
    // 同步捕获：`performUnlock` 要在之后的 microtask 才会启动，
    // 若紧接其后调用 `lock()`，该调用对 unlock 不可见。从这里到 commit 之间的任何自增都会取消本次尝试。
    const epoch = this.lockEpoch;
    const attempt = this.unlockQueue.then(() => this.performUnlock(opts, epoch));
    this.unlockQueue = attempt.catch(() => undefined);
    return attempt;
  }

  /** 清除内存密钥、取消空闲计时器，并取消此前启动但尚未完成的敏感操作。 */
  lock(): void {
    // 在「已锁定」早返回之前自增：锁定仍处于 unlock 飞行中的 keyring 正是必须取消的场景。
    this.lockEpoch++;
    this.resetKeyState();
  }

  /**
   * 用随机 96 位 IV 和绑定数据库、实体、表、列、类型化主键及 kid 的 v2 AAD 加密。
   *
   * @throws {@link EncryptedLockedError} 调用时已锁定，或操作完成前发生 `lock()`
   */
  async encrypt(args: EncryptArgs): Promise<string> {
    const key = this.key;
    const kid = this.kidValue;
    if (key == null || kid == null) {
      throw new EncryptedLockedError({ message: 'keyring is locked' });
    }
    const iv = generateIV();
    const aad = buildAAD({
      databaseNamespace: this.namespace,
      entityNamespace: args.entityNamespace,
      tableName: args.tableName,
      columnName: args.columnName,
      primaryKey: args.primaryKey,
      kid
    });
    const epoch = this.lockEpoch;
    const { ct, tag } = await aesGcmEncrypt({ key, iv, plaintext: args.plaintext, aad });
    this.assertNotLockedSince(epoch);
    this.touch();
    return encodeEnvelope({ v: ENVELOPE_VERSION, alg: ENVELOPE_ALG, kid, iv, ct, tag });
  }

  /**
   * 校验信封、kid 与 AAD 后返回明文字节。
   *
   * @throws {@link EncryptedLockedError} 调用时已锁定，或操作完成前发生 `lock()`
   * @throws {@link EncryptedDecryptError} 信封损坏、kid/AAD 不匹配、鉴权失败或旧版读取未获授权
   */
  async decrypt(args: DecryptArgs): Promise<Uint8Array> {
    const key = this.key;
    const kid = this.kidValue;
    if (key == null || kid == null) {
      throw new EncryptedLockedError({ message: 'keyring is locked' });
    }
    const env = decodeEnvelope(args.envelope);
    if (env.kid !== kid) {
      throw new EncryptedDecryptError({
        code: 'unknown_kid',
        message: `envelope kid ${env.kid} does not match unlocked kid ${kid}`
      });
    }
    if (env.v === 1 && this.legacyEnvelopePolicy !== 'migration') {
      throw new EncryptedDecryptError({
        code: 'legacy_envelope_forbidden',
        message: 'v1 entity envelope requires an explicit migration unlock'
      });
    }
    const aad =
      env.v === 1 ?
        buildLegacyAAD({
          namespace: this.namespace,
          tableName: args.tableName,
          columnName: args.columnName,
          primaryKey: args.primaryKey,
          kid
        })
      : buildAAD({
          databaseNamespace: this.namespace,
          entityNamespace: args.entityNamespace,
          tableName: args.tableName,
          columnName: args.columnName,
          primaryKey: args.primaryKey,
          kid
        });
    const epoch = this.lockEpoch;
    let plain: Uint8Array;
    try {
      plain = await aesGcmDecrypt({
        key,
        iv: env.iv,
        ct: env.ct,
        tag: env.tag,
        aad
      });
    } catch (cause) {
      throw new EncryptedDecryptError({
        code: 'auth_failure',
        message: 'AES-GCM authentication failed',
        cause
      });
    }

    // RAE-003：明文已解出，但本次操作可能已被在途的 lock() 取消。
    // 先清零再拒绝 —— 被取消的解密不得把明文交给调用方。
    if (this.lockEpoch !== epoch) {
      plain.fill(0);
      this.assertNotLockedSince(epoch);
    }
    this.touch();
    return plain;
  }

  /**
   * 重新触发空闲自动锁定计时器。
   * 在每次成功的 encrypt/decrypt 内部调用。
   * 对外暴露供测试或高级调用方在不做加解密操作的前提下延长空闲窗口。
   */
  touch(): void {
    if (this.isLocked) return;
    this.armTimer();
  }

  /**
   * 复核本次操作开始后是否发生过 `lock()`（含空闲自动锁 —— 它内部也调 `lock()`）。
   *
   * @throws {@link EncryptedLockedError} epoch 已变，说明操作在途期间被取消
   *
   * @remarks
   * RAE-003：`encrypt` / `decrypt` 在 await 之前同步捕获 `CryptoKey`，WebCrypto 完成后
   * 早先不再复核 —— 调用 `decrypt()` 后同一 tick `lock()`，Promise 仍会成功返回**完整明文**，
   * 而此时 `isLocked === true`。`lock()` 必须是完成屏障，不能只影响「下一次」调用。
   */
  private assertNotLockedSince(epoch: number): void {
    if (this.lockEpoch === epoch) return;
    throw new EncryptedLockedError({
      message: 'keyring was locked while the operation was in flight'
    });
  }

  /** 清除内存中的密钥，不登记调用方 lock 意图。 */
  private resetKeyState(): void {
    this.disarmTimer();
    if (this.key == null && this.kidValue == null) return;
    this.key = null;
    this.kidValue = null;
    this.legacyEnvelopePolicy = 'reject';
    this.lockState$.next(true);
  }

  private async performUnlock(opts: UnlockOptions, epoch: number): Promise<void> {
    // 不能用 `lock()`：自身的重置不能被误当成调用方取消。
    this.resetKeyState();
    const shapes = [
      isPassphraseOpts(opts),
      isKeyBytesOpts(opts),
      isCryptoKeyOpts(opts),
      isKeyProviderOpts(opts)
    ].filter(Boolean).length;
    if (shapes > 1) {
      throw new EncryptedConfigurationError({
        code: 'invalid_key',
        message: 'unlock options must specify exactly one of: passphrase, key, keyBytes, keyProvider'
      });
    }

    const idleTimeoutMs = typeof opts.idleTimeoutMs === 'number' ? opts.idleTimeoutMs : DEFAULT_IDLE_TIMEOUT_MS;
    if (idleTimeoutMs < 0 || !Number.isFinite(idleTimeoutMs)) {
      throw new EncryptedConfigurationError({
        code: 'invalid_key',
        message: 'idleTimeoutMs must be a non-negative finite number (use 0 to disable auto-lock)'
      });
    }
    // RAE-007：超出 32 位有符号范围的延时会被运行时**钳成 1ms**（Node 还会发
    // TimeoutOverflowWarning）—— 调用方本意是「很久之后再锁」，实际是「立刻锁」，
    // 与意图完全相反且毫无提示。宁可拒绝，也不接受一个必然被曲解的配置。
    if (idleTimeoutMs > MAX_IDLE_TIMEOUT_MS) {
      throw new EncryptedConfigurationError({
        code: 'invalid_key',
        message: `idleTimeoutMs must not exceed ${MAX_IDLE_TIMEOUT_MS} (timer range limit); larger values are clamped to 1ms by the runtime`
      });
    }
    const legacyEnvelopePolicy = opts.legacyEnvelopePolicy ?? 'reject';
    if (legacyEnvelopePolicy !== 'reject' && legacyEnvelopePolicy !== 'migration') {
      throw new EncryptedConfigurationError({
        code: 'invalid_key',
        message: 'legacyEnvelopePolicy must be reject or migration'
      });
    }

    const existing = await this.storage.readSingleton();
    if (existing && existing.kdf !== SUPPORTED_KDF) {
      throw new EncryptedConfigurationError({
        code: 'unsupported_kdf',
        message: `keyring kdf ${String(existing.kdf)} is not supported`
      });
    }

    let candidate: CryptoKey;
    let salt: Uint8Array;
    if (existing) {
      salt = fromBase64Url(existing.salt);
    } else {
      salt = randomBytes(SALT_LEN);
    }

    if (isPassphraseOpts(opts)) {
      candidate = await deriveKeyFromPassphrase(opts.passphrase, salt);
    } else if (isKeyBytesOpts(opts)) {
      candidate = await importKeyFromBytes(opts.keyBytes);
    } else if (isCryptoKeyOpts(opts)) {
      assertAesGcm256(opts.key);
      candidate = opts.key;
    } else if (isKeyProviderOpts(opts)) {
      let provided: CryptoKey | Uint8Array;
      try {
        provided = await opts.keyProvider();
      } catch (cause) {
        throw new EncryptedUnlockError({
          code: 'key_provider_failed',
          message: 'keyProvider callback rejected',
          cause
        });
      }
      if (provided instanceof Uint8Array) {
        candidate = await importKeyFromBytes(provided);
      } else {
        // RAE-008：provider 是 JS 调用方提供的回调，其 resolved value 不受类型系统约束。
        // 早先 null 会直接进 assertAesGcm256 访问 `.algorithm`，抛出的是原生 TypeError ——
        // 没有稳定 code，违背本包入口宣称的 typed error 契约。
        if (typeof provided !== 'object' || provided === null || !('algorithm' in provided)) {
          throw new EncryptedConfigurationError({
            code: 'invalid_key',
            message: `keyProvider must resolve to a CryptoKey or Uint8Array, got ${describeProvidedKey(provided)}`
          });
        }
        assertAesGcm256(provided);
        candidate = provided;
      }
    } else {
      throw new EncryptedConfigurationError({
        code: 'invalid_key',
        message: 'unlock requires one of: passphrase, key, keyBytes, keyProvider'
      });
    }

    let kid: string;
    if (existing) {
      // 与已持久化的 verifier 信封比对。
      const env = decodeEnvelope(existing.verifier);
      const aad =
        env.v === 1 ?
          buildLegacyAAD({
            namespace: this.namespace,
            tableName: VERIFIER_TABLE_NAME,
            columnName: VERIFIER_COLUMN_NAME,
            primaryKey: VERIFIER_PRIMARY_KEY,
            kid: existing.kid
          })
        : buildAAD({
            databaseNamespace: this.namespace,
            entityNamespace: VERIFIER_TABLE_NAME,
            tableName: VERIFIER_TABLE_NAME,
            columnName: VERIFIER_COLUMN_NAME,
            primaryKey: VERIFIER_PRIMARY_KEY,
            kid: existing.kid
          });
      try {
        const plain = await aesGcmDecrypt({
          key: candidate,
          iv: env.iv,
          ct: env.ct,
          tag: env.tag,
          aad
        });
        const text = new TextDecoder().decode(plain);
        if (text !== VERIFIER_SENTINEL) {
          throw new EncryptedUnlockError({
            code: 'verifier_mismatch',
            message: 'verifier plaintext mismatch'
          });
        }
      } catch (cause) {
        if (cause instanceof EncryptedUnlockError) throw cause;
        throw new EncryptedUnlockError({
          code: 'verifier_mismatch',
          message: 'verifier decryption failed',
          cause
        });
      }
      kid = existing.kid;
    } else {
      // 首次 unlock：生成 kid 并持久化。
      kid = toBase64Url(randomBytes(KID_LEN));
      const iv = generateIV();
      const aad = buildAAD({
        databaseNamespace: this.namespace,
        entityNamespace: VERIFIER_TABLE_NAME,
        tableName: VERIFIER_TABLE_NAME,
        columnName: VERIFIER_COLUMN_NAME,
        primaryKey: VERIFIER_PRIMARY_KEY,
        kid
      });
      const { ct, tag } = await aesGcmEncrypt({
        key: candidate,
        iv,
        plaintext: new TextEncoder().encode(VERIFIER_SENTINEL),
        aad
      });
      const verifierEnvelope = encodeEnvelope({
        v: ENVELOPE_VERSION,
        alg: ENVELOPE_ALG,
        kid,
        iv,
        ct,
        tag
      });
      const row: KeyringRow = {
        id: 'singleton',
        createdAt: Date.now(),
        kdf: SUPPORTED_KDF,
        salt: toBase64Url(salt),
        kid,
        verifier: verifierEnvelope
      };
      try {
        await this.storage.writeSingleton(row);
      } catch (error) {
        if (!(error instanceof EncryptedConfigurationError) || error.code !== 'keyring_singleton_conflict') {
          throw error;
        }
        if (!(await this.storage.readSingleton())) throw error;
        // 同基线：失败尝试期间的 lock() 仍然能取消它。
        return this.performUnlock(opts, epoch);
      }
    }

    if (this.lockEpoch !== epoch) {
      throw new EncryptedUnlockError({
        code: 'unlock_aborted_by_lock',
        message: 'lock() was called while this unlock was in flight; the keyring stays locked',
        hint: 'Await the unlock() promise before calling lock(), or re-run unlock() afterwards.'
      });
    }
    this.key = candidate;
    this.kidValue = kid;
    this.idleTimeoutMs = idleTimeoutMs;
    this.legacyEnvelopePolicy = legacyEnvelopePolicy;
    this.armTimer();
    this.lockState$.next(false);
  }

  private armTimer(): void {
    this.disarmTimer();
    if (this.idleTimeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.lock();
      }, this.idleTimeoutMs);
      const timer: unknown = this.timer;
      if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') {
        timer.unref();
      }
    }
  }

  private disarmTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** 创建初始锁定、绑定指定数据库认证域与持久化存储的 {@link Keyring}。 */
export function createKeyring(opts: CreateKeyringOptions): Keyring {
  return new Keyring(opts);
}

// 便利导出：保证 import 路径稳定，即便下游在构造函数调用前就已引用。
// SALT_LEN 暴露给 adapter 测试，用于断言落盘形态。
export { SALT_LEN };
