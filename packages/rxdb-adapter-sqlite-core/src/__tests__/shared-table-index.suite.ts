import { Entity, EntityBase, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../index.js';
import { create_table_sql } from '../index.js';
import type { AdapterFactory } from './adapter-factory.js';

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

@Entity({
  name: 'CompositeIdx',
  properties: [
    { name: 'parentId', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'parent_sort',
      properties: ['parentId', 'sortOrder']
    }
  ]
})
class CompositeIdx extends EntityBase {
  parentId!: string;
  sortOrder!: string;
}

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

/** create_table_sql 索引测试：建表 SQL 中的索引生成。 */
export function tableIndexSuite(factory: AdapterFactory) {
  describe(`create_table_sql - 索引 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
        entities: [SingleIdx, CompositeIdx, MultiIdx, UniqueIdx, NormalizedIdx]
      });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('单列索引', () => {
      it('应该为单列索引生成正确的 SQL', () => {
        const metadata = getEntityMetadata(SingleIdx);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('CREATE INDEX "idx_public$SingleIdx_name_idx"');
        expect(sql).toContain('ON "public$SingleIdx"("name")');
      });
    });

    describe('组合索引', () => {
      it('应该为组合索引生成正确的 SQL', () => {
        const metadata = getEntityMetadata(CompositeIdx);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('CREATE INDEX "idx_public$CompositeIdx_parent_sort"');
        expect(sql).toContain('ON "public$CompositeIdx"("parentId", "sortOrder")');
      });
    });

    describe('多个索引', () => {
      it('应该为多个索引生成正确的 SQL', () => {
        const metadata = getEntityMetadata(MultiIdx);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('CREATE INDEX "idx_public$MultiIdx_parent_sort"');
        expect(sql).toContain('ON "public$MultiIdx"("parentId", "sortOrder")');
        expect(sql).toContain('CREATE UNIQUE INDEX "idx_public$MultiIdx_parent_name"');
        expect(sql).toContain('ON "public$MultiIdx"("parentId", "name")');
      });
    });

    describe('唯一索引', () => {
      it('应该为唯一索引生成正确的 SQL', () => {
        const metadata = getEntityMetadata(UniqueIdx);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('CREATE UNIQUE INDEX "idx_public$UniqueIdx_parent_name"');
        expect(sql).toContain('ON "public$UniqueIdx"("parentId", "name")');
      });
    });

    // RXT-010 / RXT-016：普通 UNIQUE 遇到 NULL 就整条失效（SQL 规定每个 NULL 互不相等），
    // 树形实体的根节点 `parentId IS NULL` 正好命中。`normalized` 把每一列包成
    // `lower(COALESCE(CAST(列 AS TEXT), ''))`，NULL 折成 '' 后元组才重新可比。
    describe('归一化唯一索引', () => {
      it("每一列都包成 lower(COALESCE(CAST(… AS TEXT), ''))", () => {
        const metadata = getEntityMetadata(NormalizedIdx);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('CREATE UNIQUE INDEX "idx_public$NormalizedIdx_parent_fullname"');
        expect(sql).toContain(
          `ON "public$NormalizedIdx"(lower(COALESCE(CAST("parentId" AS TEXT), '')), ` +
            `lower(COALESCE(CAST("name" AS TEXT), '')), lower(COALESCE(CAST("extension" AS TEXT), '')))`
        );
      });

      it('未声明 normalized 的索引保持裸列，不被顺带改写', () => {
        const sql = create_table_sql(adapter, getEntityMetadata(UniqueIdx));

        expect(sql).not.toContain('COALESCE');
      });
    });
  });
}
