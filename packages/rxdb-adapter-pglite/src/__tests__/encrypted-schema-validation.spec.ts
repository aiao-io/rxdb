import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

@Entity({
  name: 'InvalidPGliteEncryptedPrimary',
  properties: [{ name: 'secretId', type: PropertyType.string, primary: true, encrypted: true }]
})
class InvalidPGliteEncryptedPrimary extends EntityBase {}

describe('RxDBAdapterPGlite encrypted schema validation', () => {
  it('rejects an encrypted primary key during connect', async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: `db-invalid-encrypted-${Date.now()}`,
      entities: [InvalidPGliteEncryptedPrimary],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    const adapter = new RxDBAdapterPGlite(db, { store: 'memory' });

    try {
      await expect(adapter.connect()).rejects.toMatchObject({ code: 'encrypted_pk_forbidden' });
    } finally {
      await adapter.disconnect();
    }
  });
});
