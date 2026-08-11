import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityMetadata,
  type EntityType,
  type OrderBy,
  type RuleGroup
} from '@aiao/rxdb';
import { MenuLarge, MenuSimple, TypeDemo } from '@aiao/rxdb-test/entities';
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
import { describe, expect, it } from 'vitest';
import { build_order_by, build_rule_group_join, buildRuleGroup, generate_sql } from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

/** 关系上带 keyValue 属性的实体（用于关系 flatmap 分支） */
@Entity({
  name: 'QsDoc',
  tableName: 'qs_doc',
  properties: [
    { name: 'title', type: PropertyType.string, nullable: true },
    {
      name: 'meta',
      columnName: 'meta_col',
      type: PropertyType.keyValue,
      nullable: true,
      properties: [{ name: 'value', type: PropertyType.string, nullable: true }]
    }
  ],
  relations: [{ name: 'posts', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'QsPost', mappedProperty: 'doc' }]
})
class QsDoc extends EntityBase {}

@Entity({
  name: 'QsPost',
  tableName: 'qs_post',
  properties: [{ name: 'name', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'doc', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QsDoc', mappedProperty: 'posts', nullable: true }
  ]
})
class QsPost extends EntityBase {}

class QuerySqlTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-query-sql-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('QuerySqlTestAdapter.createClient must not be called');
  }
}

const createAdapter = (entities: EntityType[]): QuerySqlTestAdapter => {
  const rxdb = new RxDB({
    dbName: 'sqlite-core-query-sql',
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new QuerySqlTestAdapter(rxdb);
};

const adapter = createAdapter([
  Order,
  OrderItem,
  SKU,
  SKUAttributes,
  Product,
  Attribute,
  AttributeValue,
  Category,
  User,
  IdCard,
  QsDoc,
  QsPost
]);

describe('build_order_by', () => {
  const metadata = {
    propertyMap: new Map([['title', { name: 'title', type: PropertyType.string, columnName: 'title_col' }]])
  } as unknown as EntityMetadata;

  it('未提供排序时应返回 undefined', () => {
    expect(build_order_by()).toBeUndefined();
    expect(build_order_by([])).toBeUndefined();
  });

  it('应生成带主表别名并映射列名的排序子句', () => {
    const orderBy = [{ field: 'title', sort: 'ASC' }] as unknown as OrderBy[];
    expect(build_order_by(orderBy, metadata)).toBe('_."title_col" ASC');
  });

  it('多个排序字段应用逗号连接', () => {
    const orderBy = [
      { field: 'title', sort: 'ASC' },
      { field: 'other', sort: 'DESC' }
    ] as unknown as OrderBy[];
    expect(build_order_by(orderBy, metadata)).toBe('_."title_col" ASC, _."other" DESC');
  });
});

describe('buildRuleGroup', () => {
  it('空规则组应返回空字符串', () => {
    expect(buildRuleGroup(undefined as unknown as RuleGroup)).toBe('');
    expect(buildRuleGroup({ combinator: 'and' } as RuleGroup)).toBe('');
  });

  it('全部规则为空时应返回空字符串', () => {
    const ruleGroup: RuleGroup = {
      combinator: 'and',
      rules: [{ field: 'age', operator: 'between', value: [] }]
    };
    expect(buildRuleGroup(ruleGroup)).toBe('');
  });

  it('单条规则不应包裹括号', () => {
    const ruleGroup: RuleGroup = { combinator: 'and', rules: [{ field: 'age', operator: '=', value: 1 }] };
    expect(buildRuleGroup(ruleGroup)).toBe('_."age" = 1');
  });

  it('嵌套规则组应递归生成并用组合器连接', () => {
    const ruleGroup: RuleGroup = {
      combinator: 'and',
      rules: [
        { field: 'a', operator: '=', value: 1 },
        {
          combinator: 'or',
          rules: [
            { field: 'b', operator: '=', value: 2 },
            { field: 'c', operator: '=', value: 3 }
          ]
        }
      ]
    };
    expect(buildRuleGroup(ruleGroup)).toBe('(_."a" = 1 and (_."b" = 2 or _."c" = 3))');
  });
});

describe('generate_sql - 树形结构与 JOIN', () => {
  it('开启 hasChildren 的邻接表树实体应附加 hasChildren 子查询', () => {
    const metadata = getEntityMetadata(MenuLarge);
    const sql = generate_sql({ tableName: 'public$menu_large', metadata });

    expect(sql).toContain(
      `EXISTS(SELECT 1 FROM "public$menu_large" __sub WHERE __sub."parentId" = _."id") AS "hasChildren"`
    );
  });

  it('未开启 hasChildren 的树实体不应附加子查询', () => {
    const metadata = getEntityMetadata(MenuSimple);
    const sql = generate_sql({ tableName: 'public$menu_simple', metadata });

    expect(sql).not.toContain('hasChildren');
  });

  it('hasJoin 时应使用 SELECT DISTINCT 并拼接 JOIN 子句', () => {
    const sql = generate_sql({
      tableName: 'test$Item',
      metadata: {} as EntityMetadata,
      join: ' LEFT JOIN "test$Other" "other" ON "other"."id" = _."otherId"',
      hasJoin: true,
      where: `"other"."name" = 'x'`,
      orderBy: '_."id" ASC'
    });

    expect(sql).toContain('SELECT DISTINCT ');
    expect(sql).toContain(' LEFT JOIN "test$Other" "other" ON "other"."id" = _."otherId" WHERE ');
    expect(sql).toContain(` ORDER BY _."id" ASC;`);
  });
});

describe('build_rule_group_join', () => {
  it('无点号字段不应生成 JOIN', () => {
    const metadata = getEntityMetadata(Order);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'number', operator: '=', value: 'N1' }]
    });

    expect(result.joinSQL).toBe('');
    expect(result.fieldAliasMap.size).toBe(0);
  });

  it('外键 id 查询应改写字段为外键属性且不生成 JOIN', () => {
    const metadata = getEntityMetadata(Order);
    const ruleGroup: RuleGroup = { combinator: 'and', rules: [{ field: 'owner.id', operator: '=', value: 'u1' }] };
    const result = build_rule_group_join(adapter, metadata, ruleGroup);

    expect(result.joinSQL).toBe('');
    expect((ruleGroup.rules[0] as { field: string }).field).toBe('ownerId');
  });

  it('关系字段应生成 LEFT JOIN 并记录字段别名', () => {
    const metadata = getEntityMetadata(Order);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'owner.name', operator: '=', value: 'Tom' }]
    });

    expect(result.joinSQL).toBe(' LEFT JOIN "shop$user" "owner" ON "owner"."id" = _."ownerId"');
    expect(result.fieldAliasMap.get('owner.name')).toBe('"owner"."name"');
  });

  it('顶层 keyValue 字段应生成 json_extract 别名', () => {
    const metadata = getEntityMetadata(TypeDemo);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'keyValue.string', operator: '=', value: 'x' }]
    });

    expect(result.joinSQL).toBe('');
    expect(result.fieldAliasMap.get('keyValue.string')).toBe(`json_extract(_."key_value", '$.string')`);
  });

  it('顶层 keyValue 多级嵌套路径应生成完整 jsonPath', () => {
    const metadata = getEntityMetadata(TypeDemo);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'keyValue.nested.deep', operator: '=', value: 1 }]
    });

    expect(result.fieldAliasMap.get('keyValue.nested.deep')).toBe(`json_extract(_."key_value", '$.nested.deep')`);
  });

  it('关系上的 keyValue 字段应生成 JOIN 与 json_extract 别名', () => {
    const metadata = getEntityMetadata(QsPost);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'doc.meta.value', operator: '=', value: 'x' }]
    });

    expect(result.joinSQL).toBe(' LEFT JOIN "public$qs_doc" "doc" ON "doc"."id" = _."docId"');
    expect(result.fieldAliasMap.get('doc.meta.value')).toBe(`json_extract("doc"."meta_col", '$.value')`);
  });

  it('无法识别的点号字段应保持原样且不生成 JOIN', () => {
    const metadata = getEntityMetadata(Order);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'ghost.name', operator: '=', value: 'x' }]
    });

    expect(result.joinSQL).toBe('');
    expect(result.fieldAliasMap.size).toBe(0);
  });

  it('多层关系字段应生成多个 LEFT JOIN', () => {
    const metadata = getEntityMetadata(OrderItem);
    const result = build_rule_group_join(adapter, metadata, {
      combinator: 'and',
      rules: [{ field: 'order.owner.name', operator: '=', value: 'Tom' }]
    });

    expect(result.joinSQL).toContain('LEFT JOIN "shop$order"');
    expect(result.joinSQL).toContain('LEFT JOIN "shop$user"');
    expect(result.fieldAliasMap.get('order.owner.name')).toBe('"order.owner_owner"."name"');
  });
});

// SQLC-005：排序方向与组合器是直接拼进 SQL 的裸 token，TS 类型挡不住运行时值
// （网络负载 / URL 参数 / 已漂移的调用方），放行任意字符串等于多语句注入口子。
describe('SQLC-005 排序方向与组合器必须白名单校验', () => {
  it('非法 sort 方向必须抛错而不是拼进 SQL', () => {
    expect(() => build_order_by([{ field: 'title', sort: 'asc; DROP TABLE t--' } as never])).toThrow(/sort direction/i);
  });

  it('非法组合器必须抛错', () => {
    expect(() =>
      buildRuleGroup({
        combinator: 'or 1=1 --' as never,
        rules: [
          { field: 'title', operator: '=', value: 'a' },
          { field: 'title', operator: '=', value: 'b' }
        ]
      } as never)
    ).toThrow(/combinator/i);
  });
});
