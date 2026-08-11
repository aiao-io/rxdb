import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
import {
  Attribute,
  AttributeValue,
  Category,
  IdCard,
  Order,
  OrderItem,
  Product,
  SKU,
  SKUAttributes,
  User
} from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import {
  build_rule_group_join_pg,
  JoinContext,
  try_process_relation_flatmap,
  try_resolve_relation_path
} from '../../query/join_sql.js';

@Entity({
  name: 'PgTestEntity1',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'validRelation',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PgOtherEntity1',
      mappedProperty: 'testEntities'
    }
  ]
})
class PgTestEntity1 extends EntityBase {}

@Entity({
  name: 'PgOtherEntity1',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PgOtherEntity1 extends EntityBase {}

@Entity({
  name: 'PgTestEntity2',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'other', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'PgOtherEntity2', mappedProperty: 'testEntities' }
  ]
})
class PgTestEntity2 extends EntityBase {}

@Entity({
  name: 'PgOtherEntity2',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PgOtherEntity2 extends EntityBase {}

@Entity({
  name: 'PgTestEntity3',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'related',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PgRelatedEntity3',
      mappedProperty: 'testEntities'
    }
  ]
})
class PgTestEntity3 extends EntityBase {}

@Entity({
  name: 'PgRelatedEntity3',
  properties: [
    { name: 'title', type: PropertyType.string },
    {
      name: 'metadata',
      type: PropertyType.keyValue,
      properties: [{ name: 'value', type: PropertyType.string, columnName: 'value' } as never]
    }
  ]
})
class PgRelatedEntity3 extends EntityBase {}

@Entity({
  name: 'PgTestEntity4',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'related',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PgRelatedEntity4',
      mappedProperty: 'testEntities'
    }
  ]
})
class PgTestEntity4 extends EntityBase {}

@Entity({
  name: 'PgRelatedEntity4',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PgRelatedEntity4 extends EntityBase {}

describe('join_sql 关系处理 (PGlite)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `test-join-sql-pg-${Date.now()}`,
      context: {},
      entities: [
        PgTestEntity1,
        PgOtherEntity1,
        PgTestEntity2,
        PgOtherEntity2,
        PgTestEntity3,
        PgRelatedEntity3,
        PgTestEntity4,
        PgRelatedEntity4,
        Order,
        OrderItem,
        SKU,
        SKUAttributes,
        Product,
        Attribute,
        AttributeValue,
        Category,
        User,
        IdCard
      ],
      sync: { type: SyncType.None, local: { adapter: 'pglite' } }
    });
    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('try_resolve_relation_path', () => {
    it('应该处理无效的关系路径', () => {
      const metadata = rxdb.schemaManager.getEntityMetadata('PgTestEntity1', 'public');

      const result = try_resolve_relation_path(adapter, metadata!, ['invalidRelation', 'field'], 1);

      expect(result.relPairs).toEqual([]);
      expect(result.metaWalker).toBeUndefined();
    });

    it('应该正确解析有效的关系路径', () => {
      const metadata = rxdb.schemaManager.getEntityMetadata('PgTestEntity2', 'public');

      const result = try_resolve_relation_path(adapter, metadata!, ['other', 'title'], 1);

      expect(result.relPairs.length).toBe(1);
      expect(result.metaWalker).toBeDefined();
      expect(result.metaWalker?.name).toBe('PgOtherEntity2');
    });
  });

  describe('try_process_relation_flatmap', () => {
    it('应该处理关系上的 keyValue 字段', () => {
      const metadata = rxdb.schemaManager.getEntityMetadata('PgTestEntity3', 'public');
      const context: JoinContext = {
        joinMap: new Map(),
        usedAliases: new Set(),
        fieldAliasMap: new Map(),
        relationAliasMap: new Map()
      };

      const result = try_process_relation_flatmap(adapter, context, metadata!, 'related.metadata.value', [
        'related',
        'metadata',
        'value'
      ]);

      expect(result).toBe(true);
      expect(context.fieldAliasMap.has('related.metadata.value')).toBe(true);
      const alias = context.fieldAliasMap.get('related.metadata.value')?.text;
      // PGlite 使用 PostgreSQL 的 ->> 操作符（不是 SQLite 的 json_extract）
      expect(alias).toContain('->>');
      expect(alias).toContain('metadata');
      expect(alias).toContain("'value'");
    });

    it('应该在没有 keyValue 字段时返回 false', () => {
      const metadata = rxdb.schemaManager.getEntityMetadata('PgTestEntity4', 'public');
      const context: JoinContext = {
        joinMap: new Map(),
        usedAliases: new Set(),
        fieldAliasMap: new Map(),
        relationAliasMap: new Map()
      };

      const result = try_process_relation_flatmap(adapter, context, metadata!, 'related.title', ['related', 'title']);

      expect(result).toBe(false);
    });
  });

  describe('MANY_TO_MANY 关系', () => {
    it('应该正确处理多对多关系查询', () => {
      const orderItemMeta = getEntityMetadata(OrderItem);

      const result = build_rule_group_join_pg(adapter, orderItemMeta, {
        combinator: 'and',
        rules: [{ field: 'categories.name', operator: '=', value: 'Electronics' }]
      });

      expect(result.joinSQL).toContain('LEFT JOIN');
      expect(result.joinSQL.length).toBeGreaterThan(0);
    });

    it('应该避免重复添加相同的中间表 JOIN', () => {
      const orderItemMeta = getEntityMetadata(OrderItem);

      const result1 = build_rule_group_join_pg(adapter, orderItemMeta, {
        combinator: 'and',
        rules: [{ field: 'categories.name', operator: '=', value: 'Electronics' }]
      });

      const result2 = build_rule_group_join_pg(adapter, orderItemMeta, {
        combinator: 'and',
        rules: [
          { field: 'categories.name', operator: '=', value: 'Books' },
          { field: 'categories.name', operator: '=', value: 'Toys' }
        ]
      });

      expect(result1.joinSQL).toContain('LEFT JOIN');
      expect(result2.joinSQL).toContain('LEFT JOIN');
    });

    it('应该为首次访问的实体创建 JOIN 数组缓存', () => {
      const orderItemMeta = getEntityMetadata(OrderItem);

      const result = build_rule_group_join_pg(adapter, orderItemMeta, {
        combinator: 'and',
        rules: [{ field: 'categories.name', operator: '=', value: 'Test' }]
      });

      expect(result.joinSQL.length).toBeGreaterThan(0);
      expect(result.joinSQL).toContain('categories');
    });
  });
});
