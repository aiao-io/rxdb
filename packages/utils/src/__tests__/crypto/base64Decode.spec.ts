import { afterEach, describe, expect, it, vi } from 'vitest';
import { uint8ArrayToString } from '../../binary/uint8ArrayToString.js';
import { base64Decode } from '../../crypto/base64Decode.js';

describe('base64Decode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('throws a clear error when atob is unavailable', () => {
    vi.stubGlobal('atob', undefined);
    expect(() => base64Decode('YWFh')).toThrow('Base64 decoding requires globalThis.atob');
  });

  it('1', () => {
    const u8 = base64Decode('YWFh');
    expect(uint8ArrayToString(u8)).toBe('aaa');
  });
  it('2', () => {
    const u8 = base64Decode('YmJi');
    expect(uint8ArrayToString(u8)).toBe('bbb');
  });
});
