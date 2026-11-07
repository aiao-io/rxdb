// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fallbackSource } from './fallback-source';

const HASH = 'a'.repeat(64);
const ENC = 'e'.repeat(64);
const ORIGIN = 'https://pool.test';

describe('credentialed fallback addresses', () => {
  it.each([`/api/files/${HASH}`, `${ORIGIN}/api/files/${HASH}`])(
    'accepts a current-origin plaintext copy %s',
    source => {
      expect(fallbackSource(source, HASH, ORIGIN)).toEqual({ path: `/api/files/${HASH}`, encHash: null });
    }
  );

  it('accepts the encrypted copy route with its own identity', () => {
    expect(fallbackSource(`${ORIGIN}/api/files/enc/${ENC}`, HASH, ORIGIN)).toEqual({
      path: `/api/files/enc/${ENC}`,
      encHash: ENC
    });
  });

  it.each([
    `https://attacker.test/api/files/${HASH}`,
    `//attacker.test/api/files/${HASH}`,
    `https://pool.test.attacker.test/api/files/${HASH}`,
    `http://pool.test/api/files/${HASH}`,
    `${ORIGIN}/api/files/${ENC}`,
    `${ORIGIN}/api/admin/files/${HASH}`,
    `${ORIGIN}/api/files/${HASH}?redirect=elsewhere`,
    `${ORIGIN}/api/files/${HASH}#fragment`,
    `https://user:password@pool.test/api/files/${HASH}`,
    'javascript:alert(1)',
    'http://['
  ])('rejects an unsupported address %s', source => {
    expect(fallbackSource(source, HASH, ORIGIN)).toBeNull();
  });
});
