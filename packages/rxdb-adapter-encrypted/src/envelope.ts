/**
 * @fileoverview AES-GCM 密文的信封编解码器。
 *
 * 磁盘上的文本形态：`v|alg|kid|iv|ct|tag` —— 六个 base64url 段，
 * 用 ASCII 管道符（`|`）分隔。
 *
 * - `v`   : 十进制整数（当前写入 `2`，解码器保留 `1` 供显式迁移）
 * - `alg` : 算法标签（当前只有 `'AGCM256'`）
 * - `kid` : base64url 编码的 8 字节密钥 ID
 * - `iv`  : base64url 编码的 12 字节 AES-GCM IV
 * - `ct`  : base64url 编码的密文（任意长度）
 * - `tag` : base64url 编码的 16 字节认证标签
 */

import type { RxDBEntityId } from '@aiao/rxdb';

import { fromBase64Url, toBase64Url } from './base64url.js';
import { EncryptedDecryptError } from './errors.js';

/** 可被解析的信封版本；新写入固定使用 v2，v1 仅供显式迁移读取。 */
export type EnvelopeVersion = 1 | 2;

/** 解码后的 AES-GCM 信封字段。二进制字段均为独立的 `Uint8Array`。 */
export interface CryptoEnvelope {
  v: EnvelopeVersion;
  alg: 'AGCM256';
  kid: string;
  iv: Uint8Array;
  ct: Uint8Array;
  tag: Uint8Array;
}

/** 冻结的当前信封版本。 */
export const ENVELOPE_VERSION: EnvelopeVersion = 2;

/** 冻结的当前算法标签。 */
export const ENVELOPE_ALG = 'AGCM256' as const;

const IV_LEN = 12;
const TAG_LEN = 16;
const KID_LEN = 8;
const SEPARATOR = '|';
const BASE64URL_REGEX = /^[A-Za-z0-9_-]*$/;
const ENVELOPE_REGEX = /^[12]\|AGCM256\|[A-Za-z0-9_-]{11}\|[A-Za-z0-9_-]{16}\|[A-Za-z0-9_-]*\|[A-Za-z0-9_-]{22}$/;
const AAD_SEPARATOR = 0x1f;
const NON_STRING_ID_MARKER = 0xff;
const NUMBER_ID_TAG = 0x6e;
const BIGINT_ID_TAG = 0x62;
const STRING_ID_TAG = 0x73;
const AAD_V2_PREFIX = new TextEncoder().encode('aiao.aad.v2');

function concatBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeLegacyPrimaryKeyForAAD(primaryKey: RxDBEntityId): Uint8Array {
  const encoder = new TextEncoder();
  if (typeof primaryKey === 'string') return encoder.encode(primaryKey);
  if (typeof primaryKey === 'bigint') {
    return concatBytes(new Uint8Array([NON_STRING_ID_MARKER, BIGINT_ID_TAG]), encoder.encode(primaryKey.toString(10)));
  }
  if (!Number.isFinite(primaryKey) || !Number.isInteger(primaryKey)) {
    throw new TypeError('AAD numeric primary key must be a finite integer');
  }
  return concatBytes(new Uint8Array([NON_STRING_ID_MARKER, NUMBER_ID_TAG]), encoder.encode(String(primaryKey)));
}

function encodePrimaryKeyForAAD(primaryKey: RxDBEntityId): Uint8Array {
  const encoder = new TextEncoder();
  if (typeof primaryKey === 'string') {
    return concatBytes(new Uint8Array([STRING_ID_TAG]), encoder.encode(primaryKey));
  }
  if (typeof primaryKey === 'bigint') {
    return concatBytes(new Uint8Array([BIGINT_ID_TAG]), encoder.encode(primaryKey.toString(10)));
  }
  if (!Number.isFinite(primaryKey) || !Number.isInteger(primaryKey)) {
    throw new TypeError('AAD numeric primary key must be a finite integer');
  }
  return concatBytes(new Uint8Array([NUMBER_ID_TAG]), encoder.encode(String(primaryKey)));
}

function encodeLengthPrefixed(value: Uint8Array): Uint8Array {
  if (value.length > 0xffffffff) throw new RangeError('AAD field exceeds uint32 length');
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, value.length, false);
  return concatBytes(length, value);
}

function decodeBase64UrlSegment(segment: string, name: string): Uint8Array {
  if (!BASE64URL_REGEX.test(segment)) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `${name} is not unpadded base64url`
    });
  }
  const decoded = fromBase64Url(segment);
  if (toBase64Url(decoded) !== segment) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `${name} is not canonical base64url`
    });
  }
  return decoded;
}

/** 把信封序列化成磁盘文本形态。 */
export function encodeEnvelope(env: CryptoEnvelope): string {
  return [String(env.v), env.alg, env.kid, toBase64Url(env.iv), toBase64Url(env.ct), toBase64Url(env.tag)].join(
    SEPARATOR
  );
}

/**
 * 从磁盘文本形态解析。
 *
 * @throws 任何输入格式错误都会抛 EncryptedDecryptError。
 */
export function decodeEnvelope(text: string): CryptoEnvelope {
  if (typeof text !== 'string' || text.length === 0) {
    throw new EncryptedDecryptError({ code: 'malformed_envelope', message: 'empty envelope' });
  }
  const parts = text.split(SEPARATOR);
  if (parts.length !== 6) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `expected 6 segments, got ${parts.length}`
    });
  }
  const [vStr, alg, kid, ivB64, ctB64, tagB64] = parts;
  if (!/^[0-9]+$/.test(vStr)) {
    throw new EncryptedDecryptError({ code: 'malformed_envelope', message: 'version not numeric' });
  }
  const v = Number(vStr);
  if (v !== 1 && v !== ENVELOPE_VERSION) {
    throw new EncryptedDecryptError({
      code: 'unsupported_version',
      message: `unsupported envelope version ${v}`
    });
  }
  if (alg !== ENVELOPE_ALG) {
    throw new EncryptedDecryptError({
      code: 'unsupported_algorithm',
      message: `unsupported algorithm ${alg}`
    });
  }
  const kidBytes = decodeBase64UrlSegment(kid, 'kid');
  const iv = decodeBase64UrlSegment(ivB64, 'iv');
  const ct = decodeBase64UrlSegment(ctB64, 'ct');
  const tag = decodeBase64UrlSegment(tagB64, 'tag');
  if (kidBytes.length !== KID_LEN) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `kid length must be ${KID_LEN}, got ${kidBytes.length}`
    });
  }
  if (iv.length !== IV_LEN) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `iv length must be ${IV_LEN}, got ${iv.length}`
    });
  }
  if (tag.length !== TAG_LEN) {
    throw new EncryptedDecryptError({
      code: 'malformed_envelope',
      message: `tag length must be ${TAG_LEN}, got ${tag.length}`
    });
  }
  return { v: v as EnvelopeVersion, alg: alg as 'AGCM256', kid, iv, ct, tag };
}

/** 轻量判断：该字符串是否「看起来」像个信封，但不去解码？ */
export function isEnvelope(text: unknown): text is string {
  return typeof text === 'string' && ENVELOPE_REGEX.test(text);
}

/**
 * v2 确定性 AAD 构造器。
 *
 * 每个字段使用 uint32 大端长度前缀，主键另带类型标签。数据库认证域、实体 namespace、
 * 表、列、记录和 kid 都参与认证，任意字符串内容都不能移动 tuple 边界。
 */
export function buildAAD(parts: {
  databaseNamespace: string;
  entityNamespace: string;
  tableName: string;
  columnName: string;
  primaryKey: RxDBEntityId;
  kid: string;
}): Uint8Array {
  const encoder = new TextEncoder();
  return concatBytes(
    AAD_V2_PREFIX,
    encodeLengthPrefixed(encoder.encode(parts.databaseNamespace)),
    encodeLengthPrefixed(encoder.encode(parts.entityNamespace)),
    encodeLengthPrefixed(encoder.encode(parts.tableName)),
    encodeLengthPrefixed(encoder.encode(parts.columnName)),
    encodeLengthPrefixed(encodePrimaryKeyForAAD(parts.primaryKey)),
    encodeLengthPrefixed(encoder.encode(parts.kid))
  );
}

/** 仅用于显式 v1 迁移和旧 verifier 校验。 */
export function buildLegacyAAD(parts: {
  namespace: string;
  tableName: string;
  columnName: string;
  primaryKey: RxDBEntityId;
  kid: string;
}): Uint8Array {
  const encoder = new TextEncoder();
  const separator = new Uint8Array([AAD_SEPARATOR]);
  return concatBytes(
    encoder.encode(parts.namespace),
    separator,
    encoder.encode(parts.tableName),
    separator,
    encoder.encode(parts.columnName),
    separator,
    encodeLegacyPrimaryKeyForAAD(parts.primaryKey),
    separator,
    encoder.encode(parts.kid)
  );
}

// 仅供单元测试导出 —— 不属于公开 API。
export const __internals = { IV_LEN, TAG_LEN, KID_LEN };
