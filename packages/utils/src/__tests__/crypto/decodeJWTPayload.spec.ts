import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeJWTPayload } from '../../crypto/decodeJWTPayload.js';

describe('decodeJWTPayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('surfaces a clear error when atob is unavailable', () => {
    vi.stubGlobal('atob', undefined);
    expect(() => decodeJWTPayload('header.e30.signature')).toThrow(
      'JWT payload decode failed: Base64 decoding requires globalThis.atob'
    );
  });

  it('should decode a valid JWT payload', () => {
    const data = decodeJWTPayload(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    );
    expect(data).toEqual({
      sub: '1234567890',
      name: 'John Doe',
      iat: 1516239022
    });
  });

  it('should reject invalid JWT structures', () => {
    expect(() => {
      decodeJWTPayload(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c.12'
      );
    }).toThrow('JWT is not valid: not a JWT structure');
  });

  it('should decode payloads without base64 padding', () => {
    const data = decodeJWTPayload('eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhIjoxfQ.sig');
    expect(data).toEqual({ a: 1 });
  });

  it('should surface JSON parse errors with context', () => {
    expect(() => decodeJWTPayload('eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.bm90LWpzb24.sig')).toThrow(
      'JWT payload decode failed:'
    );
  });

  it('按 UTF-8 解码非 ASCII payload', () => {
    // atob 产出的是 binary string（每 char 一个字节），直接 JSON.parse 会把
    // 多字节 UTF-8 序列当成独立码位 → 中文变乱码。
    const token = `header.${base64UrlEncode({ name: '张三', city: '東京', emoji: '🚀' })}.sig`;

    expect(decodeJWTPayload(token)).toEqual({ name: '张三', city: '東京', emoji: '🚀' });
  });

  it('返回类型可由调用方指定，不再是 any', () => {
    interface Claims {
      readonly sub: string;
      readonly exp: number;
    }
    const token = `header.${base64UrlEncode({ sub: 'u-1', exp: 42 })}.sig`;

    const claims = decodeJWTPayload<Claims>(token);

    expect(claims.sub).toBe('u-1');
    expect(claims.exp).toBe(42);
  });
});

/** 把对象编码为 JWT 用的 base64url payload 段。 */
const base64UrlEncode = (payload: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
