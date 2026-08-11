import { Entity, EntityBase, PropertyType, RxDB, SyncType, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../index.js';
import generate_table_create_sql from '../../table/create_table_sql.js';

describe('create_table_sql - 多个索引 (PGlite)', () => {
  it('应该为多个索引生成正确的 SQL', async () => {
    @Entity({
      name: 'MultiIdx',
      properties: [
        { name: 'parentId', type: PropertyType.string },
        { name: 'name', type: PropertyType.string },
        { name: 'sortOrder', type: PropertyType.string }
      ],
      indexes: [
        {
          name: 'parent_sort',
          properties: ['parentId', 'sortOrder']
        },
        {
          name: 'parent_name',
          properties: ['parentId', 'name'],
          unique: true
        }
      ]
    })
    class MultiIdx extends EntityBase {
      parentId!: string;
      name!: string;
      sortOrder!: string;
    }

    const rxdb = new RxDB({
      dbName: `test-multi-idx-${Date.now()}`,
      context: { userId: 'test' },
      entities: [MultiIdx],
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

    const metadata = getEntityMetadata(MultiIdx);
    const sql = generate_table_create_sql(adapter as RxDBAdapterPGlite, metadata);

    expect(sql).toContain('CREATE INDEX "idx_MultiIdx_parent_sort"');
    expect(sql).toContain('"parentId"');
    expect(sql).toContain('"sortOrder"');
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_MultiIdx_parent_name"');
  });
});
