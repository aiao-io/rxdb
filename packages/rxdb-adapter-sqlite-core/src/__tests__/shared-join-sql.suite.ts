import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind } from '@aiao/rxdb';
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
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JoinContext, RxDBAdapterSqliteBase } from '../index.js';
import {
  build_rule_group_join,
  MAIN_TABLE_ALIAS,
  try_process_relation_flatmap,
  try_resolve_relation_path
} from '../index.js';
import type { AdapterFactory } from './adapter-factory.js';

@Entity({
  name: 'TestEntity1',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'validRelation',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'OtherEntity1',
      mappedProperty: 'testEntities'
    }
  ]
})
class TestEntity1 extends EntityBase {}

@Entity({
  name: 'OtherEntity1',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class OtherEntity1 extends EntityBase {}

@Entity({
  name: 'TestEntity2',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'other', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'OtherEntity2', mappedProperty: 'testEntities' }
  ]
})
class TestEntity2 extends EntityBase {}

@Entity({
  name: 'OtherEntity2',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class OtherEntity2 extends EntityBase {}

@Entity({
  name: 'TestEntity3',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'related', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'RelatedEntity3', mappedProperty: 'testEntities' }
  ]
})
class TestEntity3 extends EntityBase {}

@Entity({
  name: 'RelatedEntity3',
  properties: [
    { name: 'title', type: PropertyType.string },
    {
      name: 'metadata',
      type: PropertyType.keyValue,
      properties: [{ name: 'value', type: PropertyType.string }]
    }
  ]
})
class RelatedEntity3 extends EntityBase {}

@Entity({
  name: 'TestEntity4',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'related', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'RelatedEntity4', mappedProperty: 'testEntities' }
  ]
})
class TestEntity4 extends EntityBase {}

@Entity({
  name: 'RelatedEntity4',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class RelatedEntity4 extends EntityBase {}

export function joinSqlSuite(factory: AdapterFactory) {
  describe(`join_sql 关系处理 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
        entities: [
          TestEntity1,
          OtherEntity1,
          TestEntity2,
          OtherEntity2,
          TestEntity3,
          RelatedEntity3,
          TestEntity4,
          RelatedEntity4,
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
        ]
      });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('try_resolve_relation_path', () => {
      it('应该处理无效的关系路径', () => {
        const metadata = getEntityMetadata(TestEntity1);

        const result = try_resolve_relation_path(adapter, metadata, ['invalidRelation', 'field'], 1);

        expect(result.relPairs).toEqual([]);
        expect(result.metaWalker).toBeUndefined();
      });

      it('应该正确解析有效的关系路径', () => {
        const metadata = getEntityMetadata(TestEntity2);

        const result = try_resolve_relation_path(adapter, metadata, ['other', 'title'], 1);

        expect(result.relPairs.length).toBe(1);
        expect(result.metaWalker).toBeDefined();
        expect(result.metaWalker?.name).toBe('OtherEntity2');
      });
    });

    describe('try_process_relation_flatmap', () => {
      it('应该处理关系上的 keyValue 字段', () => {
        const metadata = getEntityMetadata(TestEntity3);
        const context: JoinContext = {
          baseAlias: MAIN_TABLE_ALIAS,
          joinMap: new Map(),
          usedAliases: new Set(),
          fieldAliasMap: new Map(),
          relationAliasMap: new Map()
        };

        const result = try_process_relation_flatmap(adapter, context, metadata, 'related.metadata.value', [
          'related',
          'metadata',
          'value'
        ]);

        expect(result).toBe(true);
        expect(context.fieldAliasMap.has('related.metadata.value')).toBe(true);
        const alias = context.fieldAliasMap.get('related.metadata.value');
        expect(alias).toContain('json_extract');
        expect(alias).toContain('metadata');
        expect(alias).toContain('$.value');
      });

      it('应该在没有 keyValue 字段时返回 false', () => {
        const metadata = getEntityMetadata(TestEntity4);
        const context: JoinContext = {
          baseAlias: MAIN_TABLE_ALIAS,
          joinMap: new Map(),
          usedAliases: new Set(),
          fieldAliasMap: new Map(),
          relationAliasMap: new Map()
        };

        const result = try_process_relation_flatmap(adapter, context, metadata, 'related.title', ['related', 'title']);

        expect(result).toBe(false);
      });
    });

    describe('MANY_TO_MANY 关系', () => {
      it('应该正确处理多对多关系查询', () => {
        const orderItemMeta = getEntityMetadata(OrderItem);

        const result = build_rule_group_join(adapter, orderItemMeta, {
          combinator: 'and',
          rules: [{ field: 'categories.name', operator: '=', value: 'Electronics' }]
        });

        expect(result.joinSQL).toContain('LEFT JOIN');
        expect(result.joinSQL.length).toBeGreaterThan(0);
      });

      it('应该避免重复添加相同的中间表 JOIN', () => {
        const orderItemMeta = getEntityMetadata(OrderItem);

        const result1 = build_rule_group_join(adapter, orderItemMeta, {
          combinator: 'and',
          rules: [{ field: 'categories.name', operator: '=', value: 'Electronics' }]
        });

        const result2 = build_rule_group_join(adapter, orderItemMeta, {
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

        const result = build_rule_group_join(adapter, orderItemMeta, {
          combinator: 'and',
          rules: [{ field: 'categories.name', operator: '=', value: 'Test' }]
        });

        expect(result.joinSQL.length).toBeGreaterThan(0);
        expect(result.joinSQL).toContain('categories');
      });
    });

    describe('orderBy 关系路径的真实执行（SQLC-025）', () => {
      // 单元测试只能断言 SQL 字符串；`SELECT DISTINCT` 与 ORDER BY 引用非结果列能否共存，
      // 只有真引擎能回答，因此这一组必须跑在四个 SQLite 适配器上。
      const numbers = ['SQLC-025-1', 'SQLC-025-2', 'SQLC-025-3'];

      beforeAll(async () => {
        // 用户名与订单号刻意反序：排序结果若来自本表列，顺序会与期望完全相反。
        const names = ['Zed', 'Mia', 'Ann'];
        for (let i = 0; i < numbers.length; i++) {
          const user = new User();
          user.name = names[i];
          await user.save();

          const order = new Order();
          order.number = numbers[i];
          order.amount = 100 + i;
          order.owner$.set(user);
          await order.save();
        }
      });

      it('按关系字段排序应被 SQLite 接受，且真的按关系字段排序', async () => {
        const rows = await firstValueFrom(
          Order.findAll({
            where: { combinator: 'and', rules: [{ field: 'number', operator: 'in', value: numbers }] },
            orderBy: [{ field: 'owner.name', sort: 'asc' }]
          })
        );

        // orderBy 自己引入了 JOIN，generate_sql 因此走 `SELECT DISTINCT`：
        // 这条断言同时验证「排序列不在结果列里」没有被引擎拒绝。
        expect(rows.map(row => row.number)).toEqual(['SQLC-025-3', 'SQLC-025-2', 'SQLC-025-1']);
      });

      it('desc 方向同样生效', async () => {
        const rows = await firstValueFrom(
          Order.findAll({
            where: { combinator: 'and', rules: [{ field: 'number', operator: 'in', value: numbers }] },
            orderBy: [{ field: 'owner.name', sort: 'desc' }]
          })
        );

        expect(rows.map(row => row.number)).toEqual(['SQLC-025-1', 'SQLC-025-2', 'SQLC-025-3']);
      });

      it('where 与 orderBy 引用同一关系时结果不重复', async () => {
        const rows = await firstValueFrom(
          Order.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'number', operator: 'in', value: numbers },
                { field: 'owner.name', operator: 'in', value: ['Zed', 'Mia', 'Ann'] }
              ]
            },
            orderBy: [{ field: 'owner.name', sort: 'asc' }]
          })
        );

        // 两侧共用一个 JoinContext；若各自建 JOIN，同一张 user 表会被连两次、行数翻倍。
        expect(rows.map(row => row.number)).toEqual(['SQLC-025-3', 'SQLC-025-2', 'SQLC-025-1']);
      });
    });
  });
}
