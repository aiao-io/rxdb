import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generate_find_sql } from '../../query/query_sql.js';

@Entity({
  name: 'PGliteEncryptedProfile',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true }]
})
class PGliteEncryptedProfile extends EntityBase {}

@Entity({
  name: 'PGliteEncryptedOwner',
  relations: [
    {
      name: 'profile',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PGliteEncryptedProfile',
      mappedProperty: 'owners'
    }
  ]
})
class PGliteEncryptedOwner extends EntityBase {}

describe('PGlite encrypted relation query validation', () => {
  it('rejects a related encrypted field before SQL generation', () => {
    const rxdb = new RxDB({
      context: {},
      dbName: 'pglite-encrypted-query-validation',
      entities: [PGliteEncryptedOwner, PGliteEncryptedProfile],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });

    expect(() =>
      generate_find_sql(adapter, getEntityMetadata(PGliteEncryptedOwner), {
        where: {
          combinator: 'and',
          rules: [{ field: 'profile.secret', operator: '=', value: 'plaintext' }]
        }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });
});
