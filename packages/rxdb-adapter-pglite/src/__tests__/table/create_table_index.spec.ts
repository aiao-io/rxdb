import { Entity, EntityBase, PropertyType, RxDB, SyncType, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../index.js';
import generate_table_create_sql from '../../table/create_table_sql.js';

describe('create_table_sql - 单列索引 (PGlite)', () => {
  it('应该为单列索引生成正确的 SQL', async () => {
    @Entity({
      name: 'SingleIdx',
      properties: [
        { name: 'name', type: PropertyType.string },
        { name: 'age', type: PropertyType.number }
      ],
      indexes: [
        {
          name: 'name_idx',
          properties: ['name']
        }
      ]
    })
    class SingleIdx extends EntityBase {
      name!: string;
      age!: number;
    }

    const rxdb = new RxDB({
      dbName: `test-single-idx-${Date.now()}`,
      context: { userId: 'test' },
      entities: [SingleIdx],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb
      .adapter('pglite', async db => {
        return new RxDBAdapterPGlite(db, { store: 'memory' });
      })
      .init();

    const adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');

    const metadata = getEntityMetadata(SingleIdx);
    const sql = generate_table_create_sql(adapter as RxDBAdapterPGlite, metadata);

    expect(sql).toContain('CREATE INDEX "idx_SingleIdx_name_idx"');
    expect(sql).toContain('"name"');
  });
});
