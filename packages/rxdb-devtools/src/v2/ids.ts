/**
 * @fileoverview session / request / transfer 标识符的生成与校验。
 *
 * @module @aiao/rxdb-devtools/v2/ids
 */

import { DEVTOOLS_MAX_IDENTIFIER_LENGTH } from './constants.js';

/** canonical UUID v4 的小写正则；版本位固定 `4`，variant 位固定 `8|9|a|b`。 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** `requestId` / `transferId` 允许的字符集。 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/u;

/** UUID 的字节长度。 */
const UUID_BYTE_LENGTH = 16;

/** 十六进制查表，避免每字节都走 `toString(16).padStart(2, '0')`。 */
const HEX_BYTES: readonly string[] = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/**
 * 生成 canonical UUID v4 作为 `sessionId`。
 *
 * @remarks
 * **刻意不使用 `crypto.randomUUID()`。** connector 运行在被检查页面里，而 DevTools 扩展显式
 * 接受 `http:` 页面；在 `http://192.168.1.10:4200` 这类局域网 dev server 上，页面不是安全上下文，
 * `crypto.randomUUID` 是 `undefined`，session 会在真实使用场景里直接建不起来。
 *
 * 同样**不回落 `Math.random()`**：`sessionId` 参与「旧 session 消息一律拒绝」的判定，
 * 可预测的值会让轮换失去意义。`getRandomValues` 不可用时宁可抛错，也不静默降级。
 *
 * @returns 形如 `xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx` 的小写 UUID。
 * @throws TypeError 当宿主未提供 `crypto.getRandomValues` 时。
 */
export function createSessionId(): string {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues !== 'function') {
    throw new TypeError('rxdb-devtools: crypto.getRandomValues is required to mint a session id');
  }

  const bytes = source.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH));
  // version = 4（高 4 位置为 0b0100），variant = RFC 4122（高 2 位置为 0b10）。
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => HEX_BYTES[byte]).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 判断值是否为 canonical（小写、带连字符）UUID v4。
 *
 * @remarks
 * 只接受小写形式。大小写混用会让「同一个 session 的两种写法」在字符串比较下变成两个
 * 不同的 session，而这类分叉在测试里通常表现为偶发的 `session_invalid`。
 *
 * @param value - 待检查值。
 * @returns 合规时为 `true`。
 */
export function isCanonicalUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

/**
 * 判断值是否为合法的 `requestId` / `transferId`。
 *
 * @remarks
 * 限定 1～128 个 `[A-Za-z0-9._:-]` ASCII 字符。收窄字符集是为了让标识符能被安全地拼进
 * 日志、文件名与内部 map key，而不需要每处各自转义。
 *
 * @param value - 待检查值。
 * @returns 合规时为 `true`。
 */
export function isDevToolsIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= DEVTOOLS_MAX_IDENTIFIER_LENGTH &&
    IDENTIFIER_PATTERN.test(value)
  );
}
