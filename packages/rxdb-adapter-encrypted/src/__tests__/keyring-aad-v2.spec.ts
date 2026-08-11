import { describe, expect, it } from 'vitest';

import { aesGcmEncrypt, generateIV, importKeyFromBytes } from '../crypto.js';
import { encodeEnvelope } from '../envelope.js';
import { EncryptedConfigurationError } from '../errors.js';
import type { KeyringRow, KeyringStorageBinding } from '../keyring-storage.js';
import { createKeyring, type DecryptArgs, type EncryptArgs, type KeyBytesUnlockOptions } from '../keyring.js';

class MemoryKeyringStorage implements KeyringStorageBinding {
  row: KeyringRow | null = null;

  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    if (this.row) {
      throw new EncryptedConfigurationError({
        code: 'keyring_singleton_conflict',
        message: 'singleton already exists'
      });
    }
    this.row = row;
  }
}

const DATABASE_NAMESPACE = 'app-db';
const KEY_BYTES = new Uint8Array(32).fill(7);

const createLegacyEnvelope = async (kid: string): Promise<string> => {
  const key = await importKeyFromBytes(KEY_BYTES);
  const iv = generateIV();
  const aad = new TextEncoder().encode(`${DATABASE_NAMESPACE}\x1fitems\x1fsecret\x1f1\x1f${kid}`);
  const { ct, tag } = await aesGcmEncrypt({
    key,
    iv,
    plaintext: new TextEncoder().encode('legacy-secret'),
    aad
  });
  return encodeEnvelope({ v: 1, alg: 'AGCM256', kid, iv, ct, tag });
};

describe('Keyring versioned AAD', () => {
  it('binds new envelopes to the entity namespace', async () => {
    const ring = createKeyring({ namespace: DATABASE_NAMESPACE, storage: new MemoryKeyringStorage() });
    await ring.unlock({ keyBytes: KEY_BYTES });

    const encrypted: EncryptArgs = {
      plaintext: new TextEncoder().encode('tenant-a-secret'),
      entityNamespace: 'tenant_a',
      tableName: 'items',
      columnName: 'secret',
      primaryKey: '1'
    };
    const envelope = await ring.encrypt(encrypted);

    expect(envelope).toMatch(/^2\|AGCM256\|/);
    const swapped: DecryptArgs = {
      envelope,
      entityNamespace: 'tenant_b',
      tableName: 'items',
      columnName: 'secret',
      primaryKey: '1'
    };
    await expect(ring.decrypt(swapped)).rejects.toMatchObject({ code: 'auth_failure' });
  });

  it('rejects v1 entity envelopes unless unlock explicitly enables migration reads', async () => {
    const storage = new MemoryKeyringStorage();
    const ring = createKeyring({ namespace: DATABASE_NAMESPACE, storage });
    await ring.unlock({ keyBytes: KEY_BYTES });
    const envelope = await createLegacyEnvelope(ring.kid!);
    const decryptArgs: DecryptArgs = {
      envelope,
      entityNamespace: 'tenant_a',
      tableName: 'items',
      columnName: 'secret',
      primaryKey: '1'
    };

    await expect(ring.decrypt(decryptArgs)).rejects.toMatchObject({ code: 'legacy_envelope_forbidden' });

    ring.lock();
    const migrationUnlock: KeyBytesUnlockOptions = {
      keyBytes: KEY_BYTES,
      legacyEnvelopePolicy: 'migration'
    };
    await ring.unlock(migrationUnlock);
    const plaintext = await ring.decrypt(decryptArgs);
    expect(new TextDecoder().decode(plaintext)).toBe('legacy-secret');
    expect(await ring.encrypt({ ...decryptArgs, plaintext })).toMatch(/^2\|AGCM256\|/);
  });
});
