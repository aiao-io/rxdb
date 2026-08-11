import { Entity, EntityBase, PropertyType, RxDB, SyncType, getEntityMetadata, transitionMetadata } from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { PGliteClient } from '../../PGliteClient.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import create_table_sql from '../../table/create_table_sql.js';

const adapterStub = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterPGlite;

const clients = new Set<PGliteClient>();
const databases = new Set<RxDB>();

const createClient = async (): Promise<PGliteClient> => {
  const client = new PGliteClient();
  await client.init(`pgl-ddl-regression-${Date.now()}-${clients.size}`, { store: 'memory' });
  clients.add(client);
  return client;
};

afterEach(async () => {
  const databaseCleanup = Array.from(databases);
  databases.clear();
  const pending = Array.from(clients);
  clients.clear();
  await Promise.all([
    ...databaseCleanup.map(database => database.disconnectAll()),
    ...pending.map(client => client.disconnect())
  ]);
});

describe('PGL-003 字面量默认值', () => {
  it('按列类型生成可执行默认值并由 PGlite 实际应用', async () => {
    const metadata = transitionMetadata({
      name: 'PglLiteralDefaults',
      properties: [
        { name: 'id', type: PropertyType.integer, primary: true },
        { name: 'document', type: PropertyType.json, default: { enabled: true, label: "it's" } },
        {
          name: 'settings',
          type: PropertyType.keyValue,
          properties: [{ name: 'mode', type: PropertyType.string }],
          default: { mode: 'strict' }
        },
        { name: 'tags', type: PropertyType.stringArray, default: ['alpha', "it's"] },
        { name: 'emptyTags', type: PropertyType.stringArray, default: [] },
        { name: 'scores', type: PropertyType.numberArray, default: [1, 2.5] }
      ]
    });
    const client = await createClient();

    await client.exec(create_table_sql(adapterStub, metadata));
    await client.query('INSERT INTO "public"."PglLiteralDefaults" ("id") VALUES (1)');
    const result = await client.query<{
      document: Record<string, unknown>;
      settings: Record<string, unknown>;
      tags: string[];
      emptyTags: string[];
      scores: number[];
    }>('SELECT "document", "settings", "tags", "emptyTags", "scores" FROM "public"."PglLiteralDefaults"');

    expect(result.rows).toEqual([
      {
        document: { enabled: true, label: "it's" },
        settings: { mode: 'strict' },
        tags: ['alpha', "it's"],
        emptyTags: [],
        scores: [1, 2.5]
      }
    ]);
  });
});

@Entity({
  name: 'PglInheritedIndexBase',
  abstract: true,
  properties: [{ name: 'displayName', columnName: 'display_name', type: PropertyType.string }],
  indexes: [{ name: 'by_display_name', properties: ['displayName'] }]
})
abstract class PglInheritedIndexBase extends EntityBase {}

@Entity({
  name: 'PglInheritedIndexRecord',
  log: false,
  properties: []
})
class PglInheritedIndexRecord extends PglInheritedIndexBase {}

describe('PGL-004 索引 DDL', () => {
  it('真实创建继承索引、使用物理列名且不重复索引主键', async () => {
    const metadata = getEntityMetadata(PglInheritedIndexRecord);
    const client = await createClient();

    expect(metadata.indexes).toEqual([]);
    expect(metadata.indexMap.has('by_display_name')).toBe(true);
    await client.exec(create_table_sql(adapterStub, metadata));
    const result = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'PglInheritedIndexRecord'
       ORDER BY indexname`
    );
    const indexes = new Map(result.rows.map(row => [row.indexname, row.indexdef]));

    expect(indexes.get('idx_PglInheritedIndexRecord_by_display_name')).toContain('(display_name)');
    expect(indexes.has('idx_public_PglInheritedIndexRecord_id')).toBe(false);
    expect(Array.from(indexes.keys()).filter(name => name.endsWith('_pkey'))).toHaveLength(1);
  });

  it('对已有表幂等补建缺失的继承索引', async () => {
    const database = new RxDB({
      dbName: `pgl-index-reconcile-${Date.now()}`,
      entities: [PglInheritedIndexRecord],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    databases.add(database);
    let adapter!: RxDBAdapterPGlite;
    database.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await database.connect('pglite');
    const indexName = 'idx_PglInheritedIndexRecord_by_display_name';

    await adapter.internalQuery(`DROP INDEX "public"."${indexName}"`);
    await expect(
      adapter.internalQuery<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'PglInheritedIndexRecord' AND indexname = $1`,
        [indexName]
      )
    ).resolves.toMatchObject({ rows: [] });

    await adapter.reconcileEntityIndexes([PglInheritedIndexRecord]);
    await adapter.reconcileEntityIndexes([PglInheritedIndexRecord]);
    const restored = await adapter.internalQuery<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'PglInheritedIndexRecord' AND indexname = $1`,
      [indexName]
    );

    expect(restored.rows).toEqual([{ indexname: indexName }]);
  });
});
