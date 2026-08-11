import { afterEach, describe, expect, it, vi } from 'vitest';
import { aesDecrypt } from '../../crypto/aesDecrypt.js';
import { aesEncrypt } from '../../crypto/aesEncrypt.js';
import { base64Decode } from '../../crypto/base64Decode.js';

describe('aes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('rejects clearly when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(aesEncrypt('value')).rejects.toThrow('Web Crypto API is required for AES encryption');
    await expect(aesDecrypt('cipher', 'key', 'iv')).rejects.toThrow('Web Crypto API is required for AES decryption');
  });

  it('1', async () => {
    const { key, iv, cipherText } = await aesEncrypt('aes 123');
    const result = await aesDecrypt(cipherText, key, iv);
    expect(result).toBe('aes 123');
    expect(base64Decode(iv)).toHaveLength(12);
  });
});
