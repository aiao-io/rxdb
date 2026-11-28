/**
 * RLS 自检查哪些表：只查经远端同步的表
 *
 * 同步插件等贡献的系统表（rxdb_migration、rxdb_sync、rxdb_sync_bucket_progress……）是纯本地簿记，
 * 远端根本没有；只存本地的业务实体也一样。把它们拿去远端查，默认模式下每次连接都误报，
 * `failureMode: 'throw'` 时连接直接失败（US-036 AC#4 暴露）。
 */
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { PublicCatalogItem, Todo } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { resolveRlsCheckTables } from '../supabase.rls.js';

@Entity({
  name: 'LocalDraft',
  tableName: 'local_draft',
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } },
  properties: [{ name: 'title', type: PropertyType.string }]
})
class LocalDraft extends EntityBase {
  declare title: string;
}

function createDatabase(): RxDB {
  const rxdb = new RxDB({
    dbName: `rls-check-tables-${crypto.randomUUID()}`,
    entities: [Todo, LocalDraft, PublicCatalogItem],
    sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } },
    syncOverrides: [
      {
        entity: PublicCatalogItem,
        sync: { type: SyncType.QueryCache, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
      }
    ]
  });
  rxdb.use(rxDBPluginSync);
  return rxdb;
}

describe('resolveRlsCheckTables', () => {
  it('默认清单：日志表、分支表与经远端同步的业务表；不含系统表与只存本地的实体', () => {
    const rxdb = createDatabase();
    const entities = [...rxdb.systemEntities, Todo, LocalDraft, PublicCatalogItem];

    expect(resolveRlsCheckTables([], entities, rxdb.entitySync)).toEqual([
      { schema: 'public', table: 'rxdb_change' },
      { schema: 'public', table: 'rxdb_branch' },
      { schema: 'public', table: 'todos' },
      { schema: 'public', table: 'catalog_items_public' }
    ]);
  });

  it('显式给出的表原样检查（去重、补默认 schema），不看实体', () => {
    const rxdb = createDatabase();

    expect(
      resolveRlsCheckTables([{ table: 'todo' }, { schema: 'public', table: 'todo' }], [LocalDraft], rxdb.entitySync)
    ).toEqual([{ schema: 'public', table: 'todo' }]);
  });
});
