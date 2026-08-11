import type { EntityPropertyMetadata, KeyValuePropertyMetadata, PropertyType } from '@aiao/rxdb';

import { EncryptedDecryptError } from './errors.js';

type PropertyLike = EntityPropertyMetadata | KeyValuePropertyMetadata;

const SIGNED_64_MIN = -(1n << 63n);
const SIGNED_64_MAX = (1n << 63n) - 1n;
const CANONICAL_BIGINT = /^(?:0|-?[1-9][0-9]*)$/;

const isSigned64 = (value: bigint): boolean => value >= SIGNED_64_MIN && value <= SIGNED_64_MAX;

const decryptPayloadError = (type: PropertyType, cause?: unknown): EncryptedDecryptError =>
  new EncryptedDecryptError({
    code: 'auth_failure',
    message: `decrypted ${type} value is invalid - possible data corruption or wrong property metadata`,
    cause
  });

/**
 * 按属性类型把单个非空业务值编码为信封明文字节。
 *
 * `null` / `undefined` 的持久化由 adapter 旁路处理，不应调用本函数。`binary` 会复制当前
 * `Uint8Array` 视图；JSON、keyValue 和数组必须可由 `JSON.stringify` 表示；bigint 限定为
 * 有符号 64 位。落盘后改变同一列的 `PropertyType` 会破坏解码契约，必须先迁移数据。
 *
 * @throws TypeError 值与属性类型不匹配或无法序列化
 */
export const serializeForEnvelope = (value: unknown, property: PropertyLike): Uint8Array => {
  const enc = new TextEncoder();
  const type = property.type as PropertyType;
  if (type === 'binary') {
    if (!(value instanceof Uint8Array)) {
      throw new TypeError(`property ${property.name} must be a Uint8Array`);
    }
    return new Uint8Array(value);
  }
  if (value instanceof Uint8Array && type !== 'bigint') return value;
  switch (type) {
    case 'boolean':
      return new Uint8Array([value ? 1 : 0]);
    case 'date': {
      if (value instanceof Date) return enc.encode(String(value.valueOf()));
      if (typeof value === 'number') return enc.encode(String(value));
      const parsed = new Date(value as string);
      const ms = parsed.valueOf();
      return enc.encode(Number.isFinite(ms) ? String(ms) : String(value));
    }
    case 'number':
    case 'integer':
      return enc.encode(String(value));
    case 'bigint':
      if (typeof value !== 'bigint' || !isSigned64(value)) {
        throw new TypeError(`property ${property.name} must be a signed 64-bit bigint`);
      }
      return enc.encode(value.toString(10));
    case 'json':
    case 'keyValue':
    case 'stringArray':
    case 'numberArray': {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new TypeError(`property ${property.name} cannot be represented as JSON`);
      }
      return enc.encode(serialized);
    }
    default:
      return enc.encode(String(value ?? ''));
  }
};

/**
 * 校验结构化负载的形状是否与 `PropertyType` 相符。
 *
 * @remarks
 * RAE-004：`serializeForEnvelope()` 产生的结构化值必然是合法 JSON 且形状确定。
 * AES-GCM 认证已经通过、却解析不出预期形状，只可能是格式版本错误、调用方误用
 * 或数据损坏 —— 任何一种都不能被伪装成另一种业务类型交给上层。
 */
const assertStructuredShape = (parsed: unknown, type: PropertyType): void => {
  if (type === 'stringArray' || type === 'numberArray') {
    if (!Array.isArray(parsed)) throw decryptPayloadError(type);
    const elementType = type === 'stringArray' ? 'string' : 'number';
    if (parsed.some(item => typeof item !== elementType)) throw decryptPayloadError(type);
    return;
  }
  if (type === 'keyValue') {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw decryptPayloadError(type);
  }
};

/**
 * 按持久化时的属性类型把已认证明文字节还原为业务值。
 *
 * `null` 不会进入本函数；adapter 应直接返回数据库 NULL。结构化值、boolean、number、integer、
 * bigint 与 date 均严格校验，避免把损坏负载静默改写成合法业务值。`binary` 返回独立副本。
 *
 * @throws {@link EncryptedDecryptError} 负载无法按声明的持久化类型解码
 */
export const deserializeFromEnvelope = (bytes: Uint8Array, property: PropertyLike): unknown => {
  const dec = new TextDecoder();
  const type = property.type as PropertyType;
  switch (type) {
    case 'boolean':
      // 单字节 0/1 之外一律判为损坏：早先空字节与任意非 1 字节都静默变成 false，
      // 把「读不出来」伪装成一个合法业务值。
      if (bytes.length !== 1 || (bytes[0] !== 0 && bytes[0] !== 1)) throw decryptPayloadError(type);
      return bytes[0] === 1;
    case 'date': {
      const ms = Number(dec.decode(bytes));
      if (!Number.isFinite(ms)) {
        throw new EncryptedDecryptError({
          code: 'auth_failure',
          message: 'decrypted date value is not a finite number — possible data corruption or wrong key'
        });
      }
      return new Date(ms);
    }
    case 'number':
    case 'integer': {
      const text = dec.decode(bytes);
      // 空文本会被 `Number('')` 变成 0（且 0 是有限数），于是「什么都没解出来」
      // 被伪装成合法业务值 0。必须先拒绝空文本。
      if (text.trim() === '') throw decryptPayloadError(type);
      const n = Number(text);
      if (!Number.isFinite(n)) {
        throw new EncryptedDecryptError({
          code: 'auth_failure',
          message: 'decrypted numeric value is not finite — possible data corruption or wrong key'
        });
      }
      // integer 此前完全不校验整数性：1.5 与超出安全范围的值都会原样返回
      if (type === 'integer' && !Number.isSafeInteger(n)) throw decryptPayloadError(type);
      return n;
    }
    case 'bigint': {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (cause) {
        throw decryptPayloadError(type, cause);
      }
      if (!CANONICAL_BIGINT.test(text)) throw decryptPayloadError(type);
      const value = BigInt(text);
      if (!isSigned64(value)) throw decryptPayloadError(type);
      return value;
    }
    case 'binary':
      return new Uint8Array(bytes);
    case 'json':
    case 'keyValue':
    case 'stringArray':
    case 'numberArray': {
      const text = dec.decode(bytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (cause) {
        // 早先这里 `return text` —— 解析失败被静默改写成一个「合法」的字符串值，
        // 上层拿到的是错误类型而不是错误本身。
        throw decryptPayloadError(type, cause);
      }
      assertStructuredShape(parsed, type);
      return parsed;
    }
    default:
      return dec.decode(bytes);
  }
};
