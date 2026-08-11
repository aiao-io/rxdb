import { describe, expect, it } from 'vitest';
import {
  AES_KEY_LEN,
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveKeyFromPassphrase,
  generateIV,
  importKeyFromBytes,
  randomBytes
} from '../crypto.js';
import { EncryptedConfigurationError } from '../errors.js';

const AAD = new TextEncoder().encode('aad-context');

describe('crypto.deriveKeyFromPassphrase', () => {
  it('returns an AES-GCM CryptoKey usable for encrypt+decrypt', async () => {
    const salt = randomBytes(16);
    const key = await deriveKeyFromPassphrase('correct horse battery staple', salt);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
  });

  it('is deterministic given identical passphrase + salt', async () => {
    const salt = new Uint8Array(16).map((_, i) => i);
    const k1 = await deriveKeyFromPassphrase('pw', salt);
    const k2 = await deriveKeyFromPassphrase('pw', salt);
    const iv = generateIV();
    const { ct, tag } = await aesGcmEncrypt({ key: k1, iv, plaintext: new TextEncoder().encode('x'), aad: AAD });
    const plain = await aesGcmDecrypt({ key: k2, iv, ct, tag, aad: AAD });
    expect(new TextDecoder().decode(plain)).toBe('x');
  });

  it('rejects empty passphrase', async () => {
    await expect(deriveKeyFromPassphrase('', randomBytes(16))).rejects.toBeInstanceOf(EncryptedConfigurationError);
  });
});

describe('crypto.importKeyFromBytes', () => {
  it('accepts exactly 32 bytes', async () => {
    const key = await importKeyFromBytes(randomBytes(AES_KEY_LEN));
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it.each([0, 1, 16, 31, 33, 64])('rejects %i-byte input with invalid_key_bytes', async len => {
    let err: unknown;
    try {
      await importKeyFromBytes(new Uint8Array(len));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EncryptedConfigurationError);
    expect((err as EncryptedConfigurationError).code).toBe('invalid_key_bytes');
  });
});

describe('crypto.aesGcmEncrypt / aesGcmDecrypt', () => {
  it('round-trips a plaintext through encrypt → decrypt', async () => {
    const key = await importKeyFromBytes(randomBytes(AES_KEY_LEN));
    const iv = generateIV();
    const plaintext = new TextEncoder().encode('hello world');
    const { ct, tag } = await aesGcmEncrypt({ key, iv, plaintext, aad: AAD });
    expect(tag.length).toBe(16);
    expect(ct.length).toBe(plaintext.length);
    const out = await aesGcmDecrypt({ key, iv, ct, tag, aad: AAD });
    expect(new TextDecoder().decode(out)).toBe('hello world');
  });

  it('rejects decryption when AAD is tampered', async () => {
    const key = await importKeyFromBytes(randomBytes(AES_KEY_LEN));
    const iv = generateIV();
    const { ct, tag } = await aesGcmEncrypt({
      key,
      iv,
      plaintext: new TextEncoder().encode('x'),
      aad: AAD
    });
    await expect(aesGcmDecrypt({ key, iv, ct, tag, aad: new TextEncoder().encode('different-aad') })).rejects.toThrow();
  });

  it('rejects decryption when ciphertext is tampered', async () => {
    const key = await importKeyFromBytes(randomBytes(AES_KEY_LEN));
    const iv = generateIV();
    const { ct, tag } = await aesGcmEncrypt({
      key,
      iv,
      plaintext: new TextEncoder().encode('hello'),
      aad: AAD
    });
    const tampered = new Uint8Array(ct);
    tampered[0] ^= 0xff;
    await expect(aesGcmDecrypt({ key, iv, ct: tampered, tag, aad: AAD })).rejects.toThrow();
  });
});

describe('crypto.generateIV / randomBytes', () => {
  it('generateIV returns 12 random bytes', () => {
    expect(generateIV().length).toBe(12);
  });
  it('randomBytes returns the requested length', () => {
    expect(randomBytes(7).length).toBe(7);
  });
});
