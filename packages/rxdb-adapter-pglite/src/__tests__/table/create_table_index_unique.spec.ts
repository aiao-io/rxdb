import { Entity, EntityBase, PropertyType, RxDB, SyncType, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../index.js';
import generate_table_create_sql from '../../table/create_table_sql.js';

describe('create_table_sql - 唯一索引 (PGlite)', () => {
  it('应该为唯一索引生成正确的 SQL', async () => {
    @Entity({
      name: 'UniqueIdx',
      properties: [
        { name: 'parentId', type: PropertyType.string },
        { name: 'name', type: PropertyType.string }
      ],
      indexes: [
        {
          name: 'parent_name',
          properties: ['parentId', 'name'],
          unique: true
        }
      ]
    })
    class UniqueIdx extends EntityBase {
      parentId!: string;
      name!: string;
    }

    const rxdb = new RxDB({
      dbName: `test-unique-idx-${Date.now()}`,
      context: { userId: 'test' },
      entities: [UniqueIdx],
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

    const metadata = getEntityMetadata(UniqueIdx);
    const sql = generate_table_create_sql(adapter as RxDBAdapterPGlite, metadata);

    expect(sql).toContain('CREATE UNIQUE INDEX "idx_UniqueIdx_parent_name"');
    expect(sql).toContain('"parentId"');
    expect(sql).toContain('"name"');
    // 没声明 normalized 的索引必须保持裸列
    expect(sql).not.toContain('COALESCE');
  });

  // RXT-010 / RXT-016：普通 UNIQUE 遇到 NULL 就整条失效（SQL 规定每个 NULL 互不相等），
  // 树形实体的根节点 `parentId IS NULL` 正好命中。`normalized` 把每一列包成
  // `lower(COALESCE(CAST(列 AS TEXT), ''))`，与 sqlite-core 侧同一口径。
  it('应该为 normalized 唯一索引把每一列包成归一化表达式', async () => {
    @Entity({
      name: 'NormalizedIdx',
      properties: [
        { name: 'parentId', type: PropertyType.string, nullable: true },
        { name: 'name', type: PropertyType.string },
        { name: 'extension', type: PropertyType.string, nullable: true }
      ],
      indexes: [
        {
          name: 'parent_fullname',
          properties: ['parentId', 'name', 'extension'],
          unique: true,
          normalized: true
        }
      ]
    })
    class NormalizedIdx extends EntityBase {
      parentId!: string | null;
      name!: string;
      extension!: string | null;
    }

    const rxdb = new RxDB({
      dbName: `test-normalized-idx-${Date.now()}`,
      context: { userId: 'test' },
      entities: [NormalizedIdx],
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

    const sql = generate_table_create_sql(adapter as RxDBAdapterPGlite, getEntityMetadata(NormalizedIdx));

    expect(sql).toContain('CREATE UNIQUE INDEX "idx_NormalizedIdx_parent_fullname"');
    expect(sql).toContain(
      `(lower(COALESCE(CAST("parentId" AS TEXT), '')), lower(COALESCE(CAST("name" AS TEXT), '')), ` +
        `lower(COALESCE(CAST("extension" AS TEXT), '')));`
    );
  });
});
