import { PropertyType, transitionMetadata, type EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { randomBytes } from '../crypto.js';
import { envelopePlaintextPatches, unenvelopePlaintextPatches } from '../encrypt-patch.js';
import { EncryptedDecryptError, EncryptedLockedError } from '../errors.js';
import type { KeyringRow, KeyringStorageBinding } from '../keyring-storage.js';
import { createKeyring, type Keyring } from '../keyring.js';

class MemoryStorage implements KeyringStorageBinding {
  row: KeyringRow | null = null;

  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }

  async writeSingleton(row: KeyringRow): Promise<void> {
    this.row = row;
  }
}

const createEntity = (tableName = 'secret_entity', columnName = 'secret_ciphertext'): EntityMetadata =>
  transitionMetadata({
    name: 'SecretEntity',
    tableName,
    properties: [
      { name: 'id', type: PropertyType.string, primary: true },
      { name: 'plain', type: PropertyType.string },
      { name: 'secret', columnName, type: PropertyType.json, encrypted: true }
    ]
  });

const createPlainEntity = (): EntityMetadata =>
  transitionMetadata({
    name: 'PlainEntity',
    properties: [
      { name: 'id', type: PropertyType.string, primary: true },
      { name: 'plain', type: PropertyType.string }
    ]
  });

const createBigIntEntity = (): EntityMetadata =>
  transitionMetadata({
    name: 'BigIntSecretEntity',
    tableName: 'bigint_secret_entity',
    properties: [
      { name: 'id', type: PropertyType.bigint, primary: true },
      { name: 'secretBigInt', type: PropertyType.bigint, encrypted: true },
      { name: 'secretBinary', type: PropertyType.binary, encrypted: true }
    ]
  });

const unlockedKeyring = async (): Promise<Keyring> => {
  const keyring = createKeyring({ namespace: 'patch-test', storage: new MemoryStorage() });
  await keyring.unlock({ keyBytes: randomBytes(32), idleTimeoutMs: 0 });
  return keyring;
};

describe('encrypted patch walker', () => {
  it('returns the original patch when the entity has no encrypted properties', async () => {
    const patch = { plain: 'visible' };
    const result = await envelopePlaintextPatches({
      entity: createPlainEntity(),
      primaryKeyString: '1',
      patch,
      keyring: await unlockedKeyring()
    });
    expect(result).toBe(patch);
  });

  it('passes through null and non-encrypted fields', async () => {
    const patch = { plain: 'visible', secret: null };
    const result = await envelopePlaintextPatches({
      entity: createEntity(),
      primaryKeyString: '1',
      patch,
      keyring: await unlockedKeyring()
    });
    expect(result).toEqual(patch);
  });

  it('encrypts and decrypts encrypted fields without changing JSON-looking strings', async () => {
    const entity = createEntity();
    const keyring = await unlockedKeyring();
    const encrypted = await envelopePlaintextPatches({
      entity,
      primaryKeyString: '1',
      patch: { plain: 'visible', secret: 'true' },
      keyring
    });

    expect(encrypted.plain).toBe('visible');
    expect(encrypted.secret).toMatch(/^2\|AGCM256\|/);
    await expect(
      unenvelopePlaintextPatches({ entity, primaryKeyString: '1', patch: encrypted, keyring })
    ).resolves.toEqual({ plain: 'visible', secret: 'true' });
  });

  it('fails without partial plaintext output when the keyring is locked', async () => {
    const keyring = await unlockedKeyring();
    keyring.lock();
    await expect(
      envelopePlaintextPatches({
        entity: createEntity(),
        primaryKeyString: '1',
        patch: { plain: 'visible', secret: { value: 1 } },
        keyring
      })
    ).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  it.each([
    ['primary key', createEntity(), createEntity(), '1', '2'],
    ['table name', createEntity('one'), createEntity('two'), '1', '1'],
    ['column name', createEntity('same', 'one'), createEntity('same', 'two'), '1', '1']
  ])('binds envelopes to the %s AAD component', async (_, writeEntity, readEntity, writeId, readId) => {
    const keyring = await unlockedKeyring();
    const encrypted = await envelopePlaintextPatches({
      entity: writeEntity,
      primaryKeyString: writeId,
      patch: { secret: { value: 1 } },
      keyring
    });

    await expect(
      unenvelopePlaintextPatches({ entity: readEntity, primaryKeyString: readId, patch: encrypted, keyring })
    ).rejects.toBeInstanceOf(EncryptedDecryptError);
  });

  it('round-trips bigint and binary patches with a bigint primary AAD', async () => {
    const entity = createBigIntEntity();
    const keyring = await unlockedKeyring();
    const backing = new Uint8Array([7, 0, 0xff, 8]);
    const secretBinary = backing.subarray(1, 3);
    const encrypted = await envelopePlaintextPatches({
      entity,
      primaryKeyString: 1n,
      patch: { secretBigInt: -(1n << 63n), secretBinary },
      keyring
    });

    backing[1] = 9;
    const restored = await unenvelopePlaintextPatches({
      entity,
      primaryKeyString: 1n,
      patch: encrypted,
      keyring
    });

    expect(restored.secretBigInt).toBe(-(1n << 63n));
    expect(restored.secretBinary).toEqual(new Uint8Array([0, 0xff]));
    expect(restored.secretBinary).toBeInstanceOf(Uint8Array);
  });

  it('authenticates the primary ID type in AAD', async () => {
    const entity = createBigIntEntity();
    const keyring = await unlockedKeyring();
    const encrypted = await envelopePlaintextPatches({
      entity,
      primaryKeyString: 1n,
      patch: { secretBigInt: 1n },
      keyring
    });

    await expect(
      unenvelopePlaintextPatches({ entity, primaryKeyString: '1', patch: encrypted, keyring })
    ).rejects.toBeInstanceOf(EncryptedDecryptError);
    await expect(
      unenvelopePlaintextPatches({ entity, primaryKeyString: 1, patch: encrypted, keyring })
    ).rejects.toBeInstanceOf(EncryptedDecryptError);
  });
});
