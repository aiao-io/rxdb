/**
 * @fileoverview 底层 WebCrypto 封装 —— PBKDF2 派生、原始密钥导入、AES-GCM 加解密。
 *
 * 无模块级副作用：首次 WebCrypto 访问发生在某个被导出的 async 函数内部。
 */

import { EncryptedConfigurationError } from './errors.js';

/** OWASP 2023 对 PBKDF2-HMAC-SHA-256 的最低要求。 */
export const PBKDF2_ITERATIONS = 600_000;

/** AES 密钥长度（字节）。 */
export const AES_KEY_LEN = 32;

/** AES-GCM IV 长度（字节，NIST SP 800-38D 推荐值）。 */
export const AES_IV_LEN = 12;

/** AES-GCM 认证标签长度（比特）。 */
export const AES_TAG_BITS = 128;

const KDF_ALG: Pbkdf2Params['name'] = 'PBKDF2';
const HASH: Pbkdf2Params['hash'] = 'SHA-256';
const DERIVED_ALG: AesKeyAlgorithm = { name: 'AES-GCM', length: 256 };
const USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

function getSubtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new EncryptedConfigurationError({
      code: 'invalid_key',
      message: 'WebCrypto (crypto.subtle) is not available in this runtime'
    });
  }
  return crypto.subtle;
}

/**
 * 用 PBKDF2-SHA-256 从 passphrase 派生 256 位 AES-GCM 密钥，
 * 迭代次数 {@link PBKDF2_ITERATIONS}。
 */
export async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new EncryptedConfigurationError({
      code: 'invalid_key',
      message: 'passphrase must be a non-empty string'
    });
  }
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    { name: KDF_ALG },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    { name: KDF_ALG, salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: HASH },
    baseKey,
    DERIVED_ALG,
    false,
    USAGES
  );
}

/**
 * 导入 32 字节原始 AES-GCM 密钥。
 *
 * @throws 字节长度不是 {@link AES_KEY_LEN} 时抛 EncryptedConfigurationError（code `invalid_key_bytes`）。
 */
export async function importKeyFromBytes(bytes: Uint8Array): Promise<CryptoKey> {
  if (!(bytes instanceof Uint8Array) || bytes.length !== AES_KEY_LEN) {
    throw new EncryptedConfigurationError({
      code: 'invalid_key_bytes',
      message: `key bytes must be a Uint8Array of length ${AES_KEY_LEN}, got ${
        bytes instanceof Uint8Array ? bytes.length : typeof bytes
      }`
    });
  }
  const subtle = getSubtle();
  return subtle.importKey('raw', bytes as BufferSource, DERIVED_ALG, false, USAGES);
}

/** 生成加密学随机 IV（12 字节）。 */
export function generateIV(): Uint8Array {
  const iv = new Uint8Array(AES_IV_LEN);
  crypto.getRandomValues(iv);
  return iv;
}

/** 生成加密学随机字节。 */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/**
 * AES-GCM 加密。返回拆分后的密文 + 认证标签（最后 16 字节）。
 */
export async function aesGcmEncrypt(args: {
  key: CryptoKey;
  iv: Uint8Array;
  plaintext: Uint8Array;
  aad: Uint8Array;
}): Promise<{ ct: Uint8Array; tag: Uint8Array }> {
  const subtle = getSubtle();
  const combined = new Uint8Array(
    await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: args.iv as BufferSource,
        additionalData: args.aad as BufferSource,
        tagLength: AES_TAG_BITS
      },
      args.key,
      args.plaintext as BufferSource
    )
  );
  const tagBytes = AES_TAG_BITS / 8;
  const ct = combined.subarray(0, combined.length - tagBytes);
  const tag = combined.subarray(combined.length - tagBytes);
  return { ct: new Uint8Array(ct), tag: new Uint8Array(tag) };
}

/**
 * AES-GCM 解密。调用方已校验信封结构。
 * 鉴权失败时 WebCrypto 会抛错，由上层捕获并转换。
 */
export async function aesGcmDecrypt(args: {
  key: CryptoKey;
  iv: Uint8Array;
  ct: Uint8Array;
  tag: Uint8Array;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  const subtle = getSubtle();
  const combined = new Uint8Array(args.ct.length + args.tag.length);
  combined.set(args.ct, 0);
  combined.set(args.tag, args.ct.length);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: args.iv as BufferSource, additionalData: args.aad as BufferSource, tagLength: AES_TAG_BITS },
    args.key,
    combined as BufferSource
  );
  return new Uint8Array(plain);
}
