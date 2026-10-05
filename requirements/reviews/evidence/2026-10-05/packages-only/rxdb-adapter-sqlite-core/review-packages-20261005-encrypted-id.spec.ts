import type { Keyring } from '@aiao/rxdb-adapter-encrypted';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { transformEntityValueToSql } from '../../../../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.js';
const consumerRequire = createRequire('/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/package.json');
const { Entity, EntityBase, getEntityMetadata, PropertyType } = consumerRequire('@aiao/rxdb') as typeof import('@aiao/rxdb');
const { validateEncryptedPropertyMetadata } = consumerRequire('@aiao/rxdb-adapter-encrypted') as typeof import('@aiao/rxdb-adapter-encrypted');
class ReviewEncryptedId extends EntityBase {}
Entity({
  name: 'ReviewEncryptedId',
  properties: [
    { name: 'nationalId', type: PropertyType.string, encrypted: true },
    { name: 'secret', type: PropertyType.string, encrypted: true }
  ]
})(ReviewEncryptedId);
const metadata = getEntityMetadata(ReviewEncryptedId);
validateEncryptedPropertyMetadata(metadata);

describe('review-packages-20261005 encrypted Id suffix', () => {
  it('encrypted *Id invokes encryption just like the non-Id control and never supplies cleartext to SQLite', async () => {
    const encrypt = vi.fn(async () => 'probe-ciphertext');
    const keyring = { isLocked: false, encrypt } as unknown as Keyring;
    const converted = await transformEntityValueToSql(metadata, {
      id: 'probe-id', nationalId: 'review-sensitive-national-id', secret: 'control-secret'
    }, { keyring, namespace: 'review-probe' });
    const nationalId = converted['nationalId'];
    if (typeof nationalId !== 'string') throw new TypeError('probe expected TEXT binding');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE at_rest (nationalId TEXT)');
    db.prepare('INSERT INTO at_rest VALUES (?)').run(nationalId);
    const persisted = db.prepare('SELECT nationalId FROM at_rest').get();
    db.close();
    console.log('ENCRYPTED_ID_OBSERVATION', JSON.stringify({
      foreignKeyNames: metadata.foreignKeyNames,
      encryptedFields: [...metadata.encryptedPropertyMap.keys()],
      converted,
      encryptCalls: encrypt.mock.calls.length,
      persisted
    }));
    expect(converted['secret']).toBe('probe-ciphertext');
    expect(converted['nationalId']).toBe('probe-ciphertext');
    expect(encrypt).toHaveBeenCalledTimes(2);
    expect(persisted?.['nationalId']).not.toBe('review-sensitive-national-id');
  });
  it('locked encrypted *Id rejects rather than bypassing the keyring guard', async () => {
    const write = transformEntityValueToSql(metadata, {
      id: 'probe-id', nationalId: 'review-sensitive-national-id'
    }, { keyring: null, namespace: 'review-probe' });
    const observed = await write.then(value => ({ accepted: true, value }), error => ({ accepted: false, errorName: error instanceof Error ? error.name : typeof error }));
    console.log('LOCKED_ENCRYPTED_ID_OBSERVATION', JSON.stringify(observed));
    expect(observed.accepted).toBe(false);
  });
});
