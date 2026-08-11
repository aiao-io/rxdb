import { describe, expect, it } from 'vitest';

import {
  expectEncryptedError,
  expectEncryptedRejection,
  expectEncryptedThrow
} from '../../encrypted/error-contract.js';

class FakeEncryptedDecryptError extends Error {
  readonly code = 'auth_failure';
  constructor(message = 'AES-GCM authentication failed') {
    super(message);
    Object.defineProperty(this, 'name', { value: 'EncryptedDecryptError', configurable: true });
  }
}

/**
 * 这些用例锁的是 RXT-027 想堵的三个漏洞本身。
 * 只跑一遍「合法错误能通过」是不够的 —— 那条在改造前也绿。
 */
describe('expectEncryptedError', () => {
  it('accepts a well-formed encrypted error', () => {
    expect(() => expectEncryptedError(new FakeEncryptedDecryptError(), 'auth_failure')).not.toThrow();
  });

  it('rejects a plain object that merely carries the right code', () => {
    expect(() =>
      expectEncryptedError({ code: 'auth_failure', name: 'EncryptedDecryptError' }, 'auth_failure')
    ).toThrow();
  });

  it('rejects error-class drift (right code, wrong class name)', () => {
    const drifted = new FakeEncryptedDecryptError();
    Object.defineProperty(drifted, 'name', { value: 'Error', configurable: true });
    expect(() => expectEncryptedError(drifted, 'auth_failure')).toThrow();
  });

  it('rejects an empty message', () => {
    expect(() => expectEncryptedError(new FakeEncryptedDecryptError(''), 'auth_failure')).toThrow();
  });

  it('rejects a code that is not registered in the class map', () => {
    expect(() => expectEncryptedError(new FakeEncryptedDecryptError(), 'not_a_real_code')).toThrow();
  });
});

describe('expectEncryptedRejection / expectEncryptedThrow', () => {
  it('fails when the call resolves instead of rejecting', async () => {
    await expect(expectEncryptedRejection(async () => 'resolved', 'locked')).rejects.toThrow();
  });

  it('passes when the call rejects with the expected error', async () => {
    await expect(
      expectEncryptedRejection(() => Promise.reject(new FakeEncryptedDecryptError()), 'auth_failure')
    ).resolves.toBeUndefined();
  });

  it('fails when the synchronous call returns instead of throwing', () => {
    expect(() => expectEncryptedThrow(() => 'returned', 'locked')).toThrow();
  });

  it('passes when the synchronous call throws the expected error', () => {
    expect(() =>
      expectEncryptedThrow(() => {
        throw new FakeEncryptedDecryptError();
      }, 'auth_failure')
    ).not.toThrow();
  });
});
