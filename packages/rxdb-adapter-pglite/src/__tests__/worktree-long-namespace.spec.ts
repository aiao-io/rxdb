import { Entity, EntityBase, getEntityMetadata, PropertyType, RxDB, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import { expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { getSchemaName, getTableNameByMetadata } from '../table-name-resolver.js';

@Entity({
  name: 'LongNamespaceNote',
  namespace: 'long_namespace_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstu',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class LongNamespaceNote extends EntityBase {
  declare title: string;
}

@Entity({
  name: 'OtherLongNamespaceNote',
  namespace: 'long_namespace_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstx',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class OtherLongNamespaceNote extends EntityBase {
  declare title: string;
}

@Entity({
  name: 'UnicodeNamespaceNote',
  namespace: '命名空间命名空间命名空间命名空间命名空间名',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class UnicodeNamespaceNote extends EntityBase {
  declare title: string;
}

it('63 字节命名空间：不同表集和相同长前缀的命名空间仍隔离，目录回收只删指定表集', async () => {
  const entities = [LongNamespaceNote, OtherLongNamespaceNote, UnicodeNamespaceNote];
  const sets = ['wt_abcdefghijk1', 'wt_abcdefghijk2'].map(suffix => WorktreeTableSet.of(suffix, entities));
  const rxdb = new RxDB({
    dbName: `long-namespace-${crypto.randomUUID()}`,
    entities,
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  const adapter = await rxdb.connect('pglite');
  try {
    for (const EntityType of entities) {
      const metadata = getEntityMetadata(EntityType);
      expect(new TextEncoder().encode(metadata.namespace).length).toBe(63);
      await adapter.internalQuery(
        `INSERT INTO ${getTableNameByMetadata(metadata, WorktreeTableSet.MAIN)} (id, "createdAt", "updatedAt", title)
         VALUES ($1::uuid, now(), now(), 'main')`,
        [crypto.randomUUID()]
      );
    }
    for (const set of sets) {
      await adapter.transaction(
        executor =>
          adapter.createWorktreeTableSet(executor, set, {
            branchId: 'held',
            actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
          }),
        false
      );
    }
    const schemas = sets.flatMap(set => entities.map(EntityType => getSchemaName(getEntityMetadata(EntityType), set)));
    expect(new Set(schemas).size).toBe(6);
    for (const schema of schemas) expect(new TextEncoder().encode(schema).length).toBeLessThanOrEqual(63);
    for (const set of sets) {
      for (const EntityType of entities) {
        const table = getTableNameByMetadata(getEntityMetadata(EntityType), set);
        expect((await adapter.internalQuery(`SELECT title FROM ${table}`)).rows).toEqual([{ title: 'main' }]);
      }
    }
    const listSuffixes = () => adapter.transaction(executor => adapter.listWorktreeTableSetSuffixes(executor), false);
    expect(await listSuffixes()).toEqual(sets.map(set => set.suffix));

    const orphanedSet = WorktreeTableSet.of(sets[0].suffix!, []);
    await adapter.transaction(executor => adapter.dropWorktreeTableSet(executor, orphanedSet), false);
    await adapter.transaction(executor => adapter.dropWorktreeTableSet(executor, orphanedSet), false);
    expect(await listSuffixes()).toEqual([sets[1].suffix]);

    const remaining = new Set(
      (await adapter.internalQuery<{ nspname: string }>('SELECT nspname FROM pg_namespace')).rows.map(
        row => row.nspname
      )
    );
    for (const EntityType of entities) {
      const metadata = getEntityMetadata(EntityType);
      expect(remaining.has(getSchemaName(metadata, sets[0]))).toBe(false);
      expect(remaining.has(getSchemaName(metadata, sets[1]))).toBe(true);
      expect(
        (await adapter.internalQuery(`SELECT title FROM ${getTableNameByMetadata(metadata, WorktreeTableSet.MAIN)}`))
          .rows
      ).toEqual([{ title: 'main' }]);
    }
  } finally {
    await rxdb.disconnectAll();
  }
});
