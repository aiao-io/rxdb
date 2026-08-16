import { describe, expect, it } from 'vitest';

import { decodeCanonicalBase64, encodeCanonicalBase64 } from '../../v2/base64.js';

const bytes = (...values: readonly number[]): Uint8Array => Uint8Array.from(values);

describe('encodeCanonicalBase64', () => {
  it('MUST use the RFC 4648 standard alphabet with canonical padding', () => {
    expect(encodeCanonicalBase64(bytes(72, 105))).toBe('SGk=');
    expect(encodeCanonicalBase64(bytes(72))).toBe('SA==');
    expect(encodeCanonicalBase64(bytes(72, 105, 33))).toBe('SGkh');
  });

  it('MUST emit `+` and `/` rather than the URL-safe alphabet', () => {
    // 0xFB 0xFF 输出 `-` `_` 的 URL-safe 变体，标准字母表必须是 `+` `/`。
    expect(encodeCanonicalBase64(bytes(0xfb, 0xff, 0xbf))).toBe('+/+/');
  });

  it('MUST encode an empty byte array as an empty string', () => {
    expect(encodeCanonicalBase64(bytes())).toBe('');
  });

  it('MUST round-trip every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, index) => index);

    expect(decodeCanonicalBase64(encodeCanonicalBase64(all))).toEqual(all);
  });
});

describe('decodeCanonicalBase64', () => {
  it('MUST decode canonical input to the exact byte sequence', () => {
    expect(decodeCanonicalBase64('SGk=')).toEqual(bytes(72, 105));
    expect(decodeCanonicalBase64('SA==')).toEqual(bytes(72));
    expect(decodeCanonicalBase64('SGkh')).toEqual(bytes(72, 105, 33));
    expect(decodeCanonicalBase64('')).toEqual(bytes());
  });

  it('MUST reject unpadded input that the platform `atob` happily accepts', () => {
    // 平台 atob("SGk") 返回 "Hi"，不抛异常。只有「重新编码必须逐字节等于原串」这一步
    // 才能把它挡下来（重编码得 "SGk="，不等）。这条用例是那一步的看门人。
    expect(globalThis.atob('SGk')).toBe('Hi');
    expect(decodeCanonicalBase64('SGk')).toBeUndefined();
  });

  it('MUST reject embedded whitespace that the platform `atob` happily accepts', () => {
    expect(globalThis.atob('SG k=')).toBe('Hi');
    expect(decodeCanonicalBase64('SG k=')).toBeUndefined();
    expect(decodeCanonicalBase64('SGk=\n')).toBeUndefined();
  });

  it('MUST reject over-padded input', () => {
    expect(decodeCanonicalBase64('SGk==')).toBeUndefined();
    expect(decodeCanonicalBase64('SA===')).toBeUndefined();
  });

  it('MUST reject the URL-safe alphabet', () => {
    expect(decodeCanonicalBase64('-_8=')).toBeUndefined();
    expect(decodeCanonicalBase64('+/+/')).toEqual(bytes(0xfb, 0xff, 0xbf));
  });

  it('MUST reject illegal characters and lengths', () => {
    expect(decodeCanonicalBase64('SG$=')).toBeUndefined();
    expect(decodeCanonicalBase64('S')).toBeUndefined();
    expect(decodeCanonicalBase64('=SGk')).toBeUndefined();
  });

  it('MUST reject padding that is not at the end', () => {
    expect(decodeCanonicalBase64('SG=k')).toBeUndefined();
  });

  it('MUST reject non-zero trailing bits, which decode-then-re-encode normalises away', () => {
    // "SGl=" 与 "SGk=" 解码到同一对字节，但只有后者是该字节序列的规范编码。
    // 接受前者等于给同一份内容留了两个合法 wire 表示。
    expect(globalThis.atob('SGl=')).toBe('Hi');
    expect(decodeCanonicalBase64('SGl=')).toBeUndefined();
  });

  it('MUST reject non-string input without throwing', () => {
    expect(decodeCanonicalBase64(undefined)).toBeUndefined();
    expect(decodeCanonicalBase64(null)).toBeUndefined();
    expect(decodeCanonicalBase64(42)).toBeUndefined();
    expect(decodeCanonicalBase64(bytes(72, 105))).toBeUndefined();
  });
});
