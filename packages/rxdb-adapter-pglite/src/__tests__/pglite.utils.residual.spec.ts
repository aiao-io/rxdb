import {
  Entity,
  EntityBase,
  EntityMetadata,
  EntityPropertyMetadata,
  getEntityMetadata,
  PropertyType
} from '@aiao/rxdb';
import {
  createKeyring,
  EncryptedLockedError,
  type KeyringRow,
  type KeyringStorageBinding
} from '@aiao/rxdb-adapter-encrypted';
import { describe, expect, it } from 'vitest';
import { transformEntityValueToSql } from '../pglite.utils.js';

class MemoryKeyringStorage implements KeyringStorageBinding {
  private row: KeyringRow | null = null;
  async readSingleton(): Promise<KeyringRow | null> {
    return this.row;
  }
  async writeSingleton(row: KeyringRow): Promise<void> {
    this.row = row;
  }
}

@Entity({
  name: 'UtilsResidualEnc',
  namespace: 'test',
  tableName: 'utils_residual_enc',
  properties: [
    { name: 'secret', columnName: 'secret_col', type: PropertyType.string, encrypted: true },
    { name: 'note', columnName: 'note_col', type: PropertyType.string }
  ]
})
class UtilsResidualEnc extends EntityBase {}

describe('pglite.utils residual encryption/columnName paths', () => {
  it('encrypts by property name and accepts null encrypted values', async () => {
    const keyring = createKeyring({ namespace: 'utils-residual', storage: new MemoryKeyringStorage() });
    await keyring.unlock({ keyBytes: new Uint8Array(32).fill(3), idleTimeoutMs: 0 });
    const metadata = getEntityMetadata(UtilsResidualEnc);

    const encrypted = await transformEntityValueToSql(
      metadata,
      { id: 'pk-1', secret: 'top-secret', note: 'n' },
      { keyring, namespace: 'utils-residual', primaryKey: 'pk-1' }
    );
    expect(encrypted.secret_col).toEqual(expect.any(String));
    expect(encrypted.secret_col).not.toBe('top-secret');
    expect(encrypted.note_col).toBe('n');

    const nullSecret = await transformEntityValueToSql(
      metadata,
      { id: 'pk-2', secret: null, note: 'n2' },
      { keyring, namespace: 'utils-residual' }
    );
    expect(nullSecret.secret_col).toBeNull();

    const undefinedSecret = await transformEntityValueToSql(
      metadata,
      { id: 'pk-3', secret: undefined, note: 'n3' },
      { keyring, namespace: 'utils-residual' }
    );
    expect(undefinedSecret.secret_col).toBeUndefined();
  });

  it('encrypts when entity keys are column names and rejects locked keyring', async () => {
    const keyring = createKeyring({ namespace: 'utils-residual-col', storage: new MemoryKeyringStorage() });
    await keyring.unlock({ keyBytes: new Uint8Array(32).fill(9), idleTimeoutMs: 0 });
    const metadata = getEntityMetadata(UtilsResidualEnc);

    const byColumn = await transformEntityValueToSql(
      metadata,
      { id: 'pk-col', secret_col: 'col-secret', note_col: 'note' },
      { keyring, namespace: 'utils-residual-col', primaryKey: 'pk-col' }
    );
    expect(byColumn.secret_col).toEqual(expect.any(String));
    expect(byColumn.secret_col).not.toBe('col-secret');
    expect(byColumn.note_col).toBe('note');

    const lockedNull = await transformEntityValueToSql(
      metadata,
      { id: 'pk-col-2', secret_col: null },
      { keyring, namespace: 'utils-residual-col' }
    );
    expect(lockedNull.secret_col).toBeNull();

    await keyring.lock();
    await expect(
      transformEntityValueToSql(
        metadata,
        { id: 'pk-locked', secret_col: 'x' },
        { keyring, namespace: 'utils-residual-col' }
      )
    ).rejects.toBeInstanceOf(EncryptedLockedError);

    await expect(
      transformEntityValueToSql(
        metadata,
        { id: 'pk-locked-2', secret: 'y' },
        { keyring, namespace: 'utils-residual-col' }
      )
    ).rejects.toBeInstanceOf(EncryptedLockedError);
  });

  it('maps foreign key column names and property names', async () => {
    const metadata = {
      propertyMap: new Map([
        ['title', { name: 'title', columnName: 'title', type: PropertyType.string } as EntityPropertyMetadata]
      ]),
      foreignKeyNames: ['departmentId'],
      foreignKeyColumnNames: ['dept_id'],
      columnNameToPropertyName: new Map([['title', 'title']]),
      encryptedPropertyMap: new Map()
    } as unknown as EntityMetadata;

    const byProp = await transformEntityValueToSql(metadata, { departmentId: 'd1', title: 't' });
    expect(byProp.dept_id).toBe('d1');
    expect(byProp.title).toBe('t');

    const byCol = await transformEntityValueToSql(metadata, { dept_id: 'd2', title: 't2' });
    expect(byCol.dept_id).toBe('d2');
  });
});
