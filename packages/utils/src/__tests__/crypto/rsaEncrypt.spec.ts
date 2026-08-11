import { afterEach, describe, expect, it, vi } from 'vitest';
import { rsaDecrypt } from '../../crypto/rsaDecrypt.js';
import { rsaEncrypt } from '../../crypto/rsaEncrypt.js';

import { rsaGenerateKey } from '../../crypto/rsaGenerateKey.js';
describe('rsa', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('1', async () => {
    const { publicKey, privateKey } = await rsaGenerateKey(1024);
    const cipherText = await rsaEncrypt('rsa 456', publicKey);
    const result = await rsaDecrypt(cipherText, privateKey);
    expect(result).toBe('rsa 456');
  });

  it('uses a 2048-bit SHA-256 key by default', async () => {
    const generateKey = vi.spyOn(globalThis.crypto.subtle, 'generateKey');
    const { publicKey, privateKey } = await rsaGenerateKey();
    expect(generateKey).toHaveBeenCalledWith(
      expect.objectContaining({ modulusLength: 2048, hash: { name: 'SHA-256' } }),
      true,
      ['encrypt', 'decrypt']
    );
    const cipherText = await rsaEncrypt('rsa 6789', publicKey);
    const result = await rsaDecrypt(cipherText, privateKey);
    expect(result).toBe('rsa 6789');
  });

  it('rejects clearly when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(rsaGenerateKey()).rejects.toThrow('Web Crypto API is required for RSA key generation');
    await expect(rsaEncrypt('value', 'key')).rejects.toThrow('Web Crypto API is required for RSA encryption');
    await expect(rsaDecrypt('value', 'key')).rejects.toThrow('Web Crypto API is required for RSA decryption');
  });

  it('should preserve unicode plaintext', async () => {
    const { publicKey, privateKey } = await rsaGenerateKey();
    const cipherText = await rsaEncrypt('你好, RSA 🔐', publicKey);
    const result = await rsaDecrypt(cipherText, privateKey);
    expect(result).toBe('你好, RSA 🔐');
  });
});
