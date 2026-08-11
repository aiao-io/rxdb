import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import { find_sql } from '../../query/find_sql.js';

@Entity({
  name: 'SqliteEncryptedProfile',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true }]
})
class SqliteEncryptedProfile extends EntityBase {}

@Entity({
  name: 'SqliteEncryptedOwner',
  relations: [
    {
      name: 'profile',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SqliteEncryptedProfile',
      mappedProperty: 'owners'
    }
  ]
})
class SqliteEncryptedOwner extends EntityBase {}

class QueryValidationAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-query-validation';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('query validation must run without creating a client');
  }
}

describe('SQLite encrypted relation query validation', () => {
  it('rejects a related encrypted field before SQL generation', () => {
    const rxdb = new RxDB({
      context: {},
      dbName: 'sqlite-encrypted-query-validation',
      entities: [SqliteEncryptedOwner, SqliteEncryptedProfile],
      sync: { local: { adapter: 'sqlite-query-validation' }, type: SyncType.None }
    });
    rxdb.schemaManager.init();
    const adapter = new QueryValidationAdapter(rxdb);

    expect(() =>
      find_sql(adapter, getEntityMetadata(SqliteEncryptedOwner), {
        where: {
          combinator: 'and',
          rules: [{ field: 'profile.secret', operator: '=', value: 'plaintext' }]
        }
      })
    ).toThrow(expect.objectContaining({ code: 'where_on_encrypted' }));
  });
});
