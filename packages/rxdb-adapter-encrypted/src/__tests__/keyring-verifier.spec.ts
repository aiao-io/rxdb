/**
 * @fileoverview T060a —— 首次解锁 verifier 来源（FR-009）。
 *
 * 断言内容：
 *  - 空 keyring 的第一次解锁恰好调用一次 writeSingleton，持久化
 *    `{ id: 'singleton', kid (8-byte b64url), salt (16 bytes), kdf, verifier }`。
 *  - 使用相同口令的第二次解锁复用已持久化的行（不会再次调用 writeSingleton）。
 *  - 被篡改的持久化 verifier 会以 `EncryptedUnlockError('verifier_mismatch')` 拒绝。
 *  - `salt` 和 `kid` 由 `crypto.getRandomValues` 生成（非零缓冲区）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EncryptedConfigurationError, EncryptedUnlockError } from '../errors.js';
import type { KeyringRow, KeyringStorageBinding } from '../keyring-storage.js';
import { createKeyring } from '../keyring.js';

const NS = 'verifier-spec';
const PASSPHRASE = 'correct horse battery staple';

class SpyStorage implements KeyringStorageBinding {
  row: KeyringRow | null = null;
  readSpy = vi.fn(async (): Promise<KeyringRow | null> => this.row);
  writeSpy = vi.fn(async (row: KeyringRow): Promise<void> => {
    if (this.row != null) {
      throw new EncryptedConfigurationError({
        code: 'keyring_singleton_conflict',
        message: 'singleton already exists'
      });
    }
    this.row = row;
  });
  async readSingleton(): Promise<KeyringRow | null> {
    return this.readSpy();
  }
  async writeSingleton(row: KeyringRow): Promise<void> {
    return this.writeSpy(row);
  }
}

function decodeB64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const bin = atob(pad === 0 ? padded : padded + '='.repeat(4 - pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe('Keyring verifier provenance (FR-009)', () => {
  let storage: SpyStorage;
  beforeEach(() => {
    storage = new SpyStorage();
  });

  it('first unlock writes singleton exactly once with correct shape', async () => {
    const ring = createKeyring({ namespace: NS, storage });
    await ring.unlock({ passphrase: PASSPHRASE });

    expect(storage.writeSpy).toHaveBeenCalledTimes(1);
    const row = storage.row!;
    expect(row.id).toBe('singleton');
    expect(row.kdf).toBe('pbkdf2-sha256-600000');
    expect(row.verifier).toMatch(/^2\|AGCM256\|/);
    expect(row.kid).toBe(ring.kid);

    const saltBytes = decodeB64Url(row.salt);
    expect(saltBytes.byteLength).toBe(16);
    expect(saltBytes.some(b => b !== 0)).toBe(true);

    const kidBytes = decodeB64Url(row.kid);
    expect(kidBytes.byteLength).toBe(8);
    expect(kidBytes.some(b => b !== 0)).toBe(true);
  });

  it('second unlock with same passphrase reuses persisted row (no rewrite)', async () => {
    const ring1 = createKeyring({ namespace: NS, storage });
    await ring1.unlock({ passphrase: PASSPHRASE });
    expect(storage.writeSpy).toHaveBeenCalledTimes(1);
    const persistedKid = storage.row!.kid;
    const persistedSalt = storage.row!.salt;
    const persistedVerifier = storage.row!.verifier;

    ring1.lock();
    const ring2 = createKeyring({ namespace: NS, storage });
    await ring2.unlock({ passphrase: PASSPHRASE });

    expect(storage.writeSpy).toHaveBeenCalledTimes(1); // 保持不变
    expect(ring2.kid).toBe(persistedKid);
    expect(storage.row!.salt).toBe(persistedSalt);
    expect(storage.row!.verifier).toBe(persistedVerifier);
  });

  it('concurrent first unlocks converge on the persisted keyring', async () => {
    const first = createKeyring({ namespace: NS, storage });
    const second = createKeyring({ namespace: NS, storage });

    await Promise.all([
      first.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 0 }),
      second.unlock({ passphrase: PASSPHRASE, idleTimeoutMs: 0 })
    ]);

    expect(storage.writeSpy).toHaveBeenCalledTimes(2);
    expect(first.kid).toBe(storage.row?.kid);
    expect(second.kid).toBe(storage.row?.kid);
    const envelope = await first.encrypt({
      plaintext: new TextEncoder().encode('shared secret'),
      entityNamespace: 'public',
      tableName: 'items',
      columnName: 'secret',
      primaryKey: 'item-1'
    });
    const decrypted = await second.decrypt({
      envelope,
      entityNamespace: 'public',
      tableName: 'items',
      columnName: 'secret',
      primaryKey: 'item-1'
    });
    expect(new TextDecoder().decode(decrypted)).toBe('shared secret');
  });

  it('tampered persisted verifier rejects with verifier_mismatch and stays locked', async () => {
    const seed = createKeyring({ namespace: NS, storage });
    await seed.unlock({ passphrase: PASSPHRASE });
    seed.lock();

    // 翻转 ciphertext 段的第一个字符（索引 4）。
    const parts = storage.row!.verifier.split('|');
    parts[4] = parts[4].startsWith('A') ? `B${parts[4].slice(1)}` : `A${parts[4].slice(1)}`;
    storage.row = { ...storage.row!, verifier: parts.join('|') };

    const ring = createKeyring({ namespace: NS, storage });
    await expect(ring.unlock({ passphrase: PASSPHRASE })).rejects.toBeInstanceOf(EncryptedUnlockError);
    expect(ring.isLocked).toBe(true);
    expect(ring.kid).toBeNull();
  });
});
