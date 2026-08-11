import {
  Entity,
  EntityBase,
  EntityRelationManyToManyMetadata,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityType
} from '@aiao/rxdb';
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
import type { JoinContext, RelationPair } from '../../index.js';
import {
  get_or_create_relation_alias,
  get_table_name_by_metadata,
  MAIN_TABLE_ALIAS,
  process_relation_joins,
  try_process_relation_flatmap,
  try_resolve_relation_path
} from '../../index.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';

// --------------------------------------------------------------------------
// 测试实体
// --------------------------------------------------------------------------

/** 自引用树实体（不注册进 RxDB，用于覆盖 findMappedRelation 未命中时的自引用回退分支） */
@Entity({
  name: 'JsTree',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'JsTree', mappedProperty: 'parent' },
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'JsTree',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class JsTree extends EntityBase {}

/** 自引用一对一实体（不注册进 RxDB） */
@Entity({
  name: 'JsTwin',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'twin', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'JsTwin', mappedProperty: 'twin', nullable: true }
  ]
})
class JsTwin extends EntityBase {}

/** 映射实体不存在且非自引用的实体（不注册进 RxDB，用于覆盖 mappedRelation not found） */
@Entity({
  name: 'JsOrphan',
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }],
  relations: [{ name: 'items', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'JsGhost', mappedProperty: 'owner' }]
})
class JsOrphan extends EntityBase {}

/** 携带 keyValue 属性的关系目标实体 */
@Entity({
  name: 'JsDoc',
  tableName: 'js_doc',
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
  relations: [{ name: 'posts', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'JsPost', mappedProperty: 'doc' }]
})
class JsDoc extends EntityBase {}

@Entity({
  name: 'JsPost',
  tableName: 'js_post',
  properties: [{ name: 'name', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'doc', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'JsDoc', mappedProperty: 'posts', nullable: true }
  ]
})
class JsPost extends EntityBase {}

/** 已注册但没有反向 ONE_TO_MANY 关系的目标实体（覆盖 MANY_TO_ONE 目标已注册但缺反向关系的解析） */
@Entity({
  name: 'JsProfile',
  tableName: 'js_profile',
  properties: [{ name: 'bio', type: PropertyType.string, nullable: true }],
  relations: []
})
class JsProfile extends EntityBase {}

/** 指向 JsProfile 的 MANY_TO_ONE，但 JsProfile 未定义反向关系，findMappedRelation 无法命中 */
@Entity({
  name: 'JsAccount',
  tableName: 'js_account',
  properties: [{ name: 'name', type: PropertyType.string, nullable: true }],
  relations: [
    {
      name: 'profile',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'JsProfile',
      mappedProperty: 'account',
      nullable: true
    }
  ]
})
class JsAccount extends EntityBase {}

// --------------------------------------------------------------------------
// 测试辅助
// --------------------------------------------------------------------------

class JoinSqlTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-join-sql-test';

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('JoinSqlTestAdapter.createClient must not be called');
  }
}

const createAdapter = (entities: EntityType[]): JoinSqlTestAdapter => {
  const rxdb = new RxDB({
    dbName: 'sqlite-core-join-sql',
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new JoinSqlTestAdapter(rxdb);
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
  JsDoc,
  JsPost,
  JsProfile,
  JsAccount
]);

const createContext = (): JoinContext => ({
  baseAlias: MAIN_TABLE_ALIAS,
  joinMap: new Map(),
  usedAliases: new Set(),
  fieldAliasMap: new Map(),
  relationAliasMap: new Map()
});

interface FlatJoin {
  table: string;
  alias: string;
  on: string;
}

const flattenJoins = (context: JoinContext): FlatJoin[] => {
  const joins: FlatJoin[] = [];
  for (const [metadata, options] of context.joinMap.entries()) {
    for (const option of options) {
      joins.push({ table: get_table_name_by_metadata(metadata), alias: option.joinTableName, on: option.on });
    }
  }
  return joins;
};

describe('join_sql', () => {
  describe('get_or_create_relation_alias', () => {
    it('首次调用应创建并记录别名', () => {
      const context = createContext();
      expect(get_or_create_relation_alias(context, 'owner')).toBe('owner');
      expect(context.relationAliasMap.get('owner')).toBe('owner');
      expect(context.usedAliases.has('owner')).toBe(true);
    });

    it('重复调用应复用已有别名', () => {
      const context = createContext();
      const first = get_or_create_relation_alias(context, 'owner');
      const second = get_or_create_relation_alias(context, 'owner');
      expect(second).toBe(first);
      expect(context.usedAliases.size).toBe(1);
    });

    it('别名冲突时应生成带序号的唯一别名', () => {
      const context = createContext();
      context.usedAliases.add('owner');
      context.usedAliases.add('owner_1');
      expect(get_or_create_relation_alias(context, 'owner')).toBe('owner_2');
      expect(context.usedAliases.has('owner_2')).toBe(true);
    });
  });

  describe('try_resolve_relation_path', () => {
    it('应解析单层关系路径', () => {
      const metadata = getEntityMetadata(Order);
      const result = try_resolve_relation_path(adapter, metadata, ['owner', 'name'], 1);
      expect(result.relPairs).toHaveLength(1);
      expect(result.relPairs[0].relation.name).toBe('owner');
      expect(result.metaWalker?.name).toBe('User');
    });

    it('应解析多层关系路径', () => {
      const metadata = getEntityMetadata(OrderItem);
      const result = try_resolve_relation_path(adapter, metadata, ['order', 'owner', 'name'], 2);
      expect(result.relPairs).toHaveLength(2);
      expect(result.relPairs.map(pair => pair.relation.name)).toEqual(['order', 'owner']);
      expect(result.metaWalker?.name).toBe('User');
    });

    it('无效关系路径应返回空数组', () => {
      const metadata = getEntityMetadata(Order);
      const result = try_resolve_relation_path(adapter, metadata, ['ghost', 'name'], 1);
      expect(result.relPairs).toEqual([]);
      expect(result.metaWalker).toBeUndefined();
    });
  });

  describe('try_process_relation_flatmap', () => {
    it('关系上的 keyValue 嵌套字段应生成 json_extract 别名并添加 JOIN', () => {
      const metadata = getEntityMetadata(JsPost);
      const context = createContext();

      const result = try_process_relation_flatmap(adapter, context, metadata, 'doc.meta.value', [
        'doc',
        'meta',
        'value'
      ]);

      expect(result).toBe(true);
      expect(context.fieldAliasMap.get('doc.meta.value')).toBe(`json_extract("doc"."meta_col", '$.value')`);
      const joins = flattenJoins(context);
      expect(joins).toHaveLength(1);
      expect(joins[0]).toEqual({
        table: 'public$js_doc',
        alias: 'doc',
        on: '"doc"."id" = _."docId"'
      });
    });

    it('keyValue 字段本身（无嵌套路径）应使用根 jsonPath', () => {
      const metadata = getEntityMetadata(JsPost);
      const context = createContext();

      const result = try_process_relation_flatmap(adapter, context, metadata, 'doc.meta', ['doc', 'meta']);

      expect(result).toBe(true);
      expect(context.fieldAliasMap.get('doc.meta')).toBe(`json_extract("doc"."meta_col", '$')`);
    });

    it('关系目标属性不是 keyValue 时应返回 false', () => {
      const metadata = getEntityMetadata(JsPost);
      const context = createContext();

      expect(try_process_relation_flatmap(adapter, context, metadata, 'doc.title', ['doc', 'title'])).toBe(false);
      expect(context.fieldAliasMap.size).toBe(0);
    });

    it('关系路径无效时应返回 false', () => {
      const metadata = getEntityMetadata(JsPost);
      const context = createContext();

      expect(
        try_process_relation_flatmap(adapter, context, metadata, 'ghost.meta.value', ['ghost', 'meta', 'value'])
      ).toBe(false);
    });
  });

  describe('process_relation_joins - 基本关系', () => {
    const resolvePairs = (entity: EntityType, parts: string[], cut: number): RelationPair[] =>
      try_resolve_relation_path(adapter, getEntityMetadata(entity), parts, cut).relPairs;

    it('MANY_TO_ONE 应生成以本方外键关联的 JOIN', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(Order, ['owner', 'name'], 1), 'owner');

      expect(flattenJoins(context)).toEqual([{ table: 'shop$user', alias: 'owner', on: '"owner"."id" = _."ownerId"' }]);
    });

    it('ONE_TO_MANY 应生成以对方外键关联的 JOIN', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(User, ['orders', 'number'], 1), 'orders');

      expect(flattenJoins(context)).toEqual([
        { table: 'shop$order', alias: 'orders', on: '"orders"."ownerId" = _."id"' }
      ]);
    });

    it('ONE_TO_ONE 应生成以本方外键关联的 JOIN', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(User, ['idCard', 'code'], 1), 'idCard');

      expect(flattenJoins(context)).toEqual([
        { table: 'shop$id_card', alias: 'idCard', on: '"idCard"."id" = _."idCardId"' }
      ]);
    });

    it('MANY_TO_MANY 应生成中间表和目标表两个 JOIN', () => {
      const context = createContext();
      const metadata = getEntityMetadata(OrderItem);
      const relation = metadata.relationMap.get('categories') as EntityRelationManyToManyMetadata;
      const mappedRelation = adapter.rxdb.schemaManager.findMappedRelation(metadata, relation);

      process_relation_joins(adapter, context, resolvePairs(OrderItem, ['categories', 'name'], 1), 'categories');

      const joins = flattenJoins(context);
      expect(joins).toHaveLength(2);
      const junctionTable = get_table_name_by_metadata(getEntityMetadata(relation.junctionEntityType!));
      const mappedColumnName = (mappedRelation!.relation as EntityRelationManyToManyMetadata).columnName;
      expect(joins).toContainEqual({
        table: junctionTable,
        alias: 'categories_m_n',
        on: `"categories_m_n"."${mappedColumnName}" = _."id"`
      });
      expect(joins).toContainEqual({
        table: 'shop$category',
        alias: 'categories',
        on: `"categories"."id" = "categories_m_n"."${relation.columnName}"`
      });
    });

    it('多层关系应使用上一层别名作为 JOIN 前缀', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(OrderItem, ['order', 'owner', 'name'], 2), 'order.owner');

      const joins = flattenJoins(context);
      expect(joins).toContainEqual({
        table: 'shop$order',
        alias: 'order.owner_order',
        on: '"order.owner_order"."id" = _."orderId"'
      });
      expect(joins).toContainEqual({
        table: 'shop$user',
        alias: 'order.owner_owner',
        on: '"order.owner_owner"."id" = "order.owner_order"."ownerId"'
      });
    });
  });

  describe('process_relation_joins - JOIN 去重', () => {
    const resolvePairs = (entity: EntityType, parts: string[], cut: number): RelationPair[] =>
      try_resolve_relation_path(adapter, getEntityMetadata(entity), parts, cut).relPairs;

    it('重复的 MANY_TO_ONE JOIN 不应重复添加', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(Order, ['owner', 'name'], 1), 'owner');
      process_relation_joins(adapter, context, resolvePairs(Order, ['owner', 'age'], 1), 'owner');

      expect(flattenJoins(context)).toHaveLength(1);
    });

    it('重复的 ONE_TO_MANY JOIN 不应重复添加', () => {
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(User, ['orders', 'number'], 1), 'orders');
      process_relation_joins(adapter, context, resolvePairs(User, ['orders', 'amount'], 1), 'orders');

      expect(flattenJoins(context)).toHaveLength(1);
    });

    it('重复的 MANY_TO_MANY JOIN 不应重复添加', () => {
      // 中间表别名按 relationKey 缓存复用，重复查询同一 MANY_TO_MANY 关系应命中去重，
      // 不再累积 categories_m_n_1 之类的重复中间表别名。
      const context = createContext();
      process_relation_joins(adapter, context, resolvePairs(OrderItem, ['categories', 'name'], 1), 'categories');
      process_relation_joins(adapter, context, resolvePairs(OrderItem, ['categories', 'name'], 1), 'categories');

      const joins = flattenJoins(context);
      expect(joins).toHaveLength(2);
      const aliases = joins.map(join => join.alias);
      expect(aliases).toContain('categories_m_n');
      expect(aliases).not.toContain('categories_m_n_1');
      expect(aliases.filter(alias => alias === 'categories')).toHaveLength(1);
      expect(aliases.filter(alias => alias === 'categories_m_n')).toHaveLength(1);
    });
  });

  describe('process_relation_joins - 自引用回退', () => {
    it('自引用 ONE_TO_MANY 应回退使用本实体的反向关系', () => {
      const metadata = getEntityMetadata(JsTree);
      const context = createContext();
      const relPairs: RelationPair[] = [{ metadata, relation: metadata.relationMap.get('children')! }];

      process_relation_joins(adapter, context, relPairs, 'children');

      expect(flattenJoins(context)).toEqual([
        { table: 'public$JsTree', alias: 'children', on: '"children"."parentId" = _."id"' }
      ]);
    });

    it('自引用 MANY_TO_ONE 应回退使用相同关系', () => {
      const metadata = getEntityMetadata(JsTree);
      const context = createContext();
      const relPairs: RelationPair[] = [{ metadata, relation: metadata.relationMap.get('parent')! }];

      process_relation_joins(adapter, context, relPairs, 'parent');

      expect(flattenJoins(context)).toEqual([
        { table: 'public$JsTree', alias: 'parent', on: '"parent"."id" = _."parentId"' }
      ]);
    });

    it('自引用 ONE_TO_ONE 应回退使用相同关系', () => {
      const metadata = getEntityMetadata(JsTwin);
      const context = createContext();
      const relPairs: RelationPair[] = [{ metadata, relation: metadata.relationMap.get('twin')! }];

      process_relation_joins(adapter, context, relPairs, 'twin');

      expect(flattenJoins(context)).toEqual([
        { table: 'public$JsTwin', alias: 'twin', on: '"twin"."id" = _."twinId"' }
      ]);
    });

    it('映射关系无法解析时应抛错', () => {
      const metadata = getEntityMetadata(JsOrphan);
      const context = createContext();
      const relPairs: RelationPair[] = [{ metadata, relation: metadata.relationMap.get('items')! }];

      expect(() => process_relation_joins(adapter, context, relPairs, 'items')).toThrow(/mappedRelation not found/);
    });

    it('MANY_TO_ONE 目标已注册但缺反向关系时应 JOIN 到真实目标表而非本表', () => {
      // findMappedRelation 未命中（JsProfile 未定义反向 ONE_TO_MANY），但 JsProfile 已注册，
      // 应回退到 getEntityMetadata 解析出真实目标表 js_profile，而不是错误地把本表 js_account 当作目标。
      const metadata = getEntityMetadata(JsAccount);
      const context = createContext();
      const relPairs: RelationPair[] = [{ metadata, relation: metadata.relationMap.get('profile')! }];

      process_relation_joins(adapter, context, relPairs, 'profile');

      expect(flattenJoins(context)).toEqual([
        { table: 'public$js_profile', alias: 'profile', on: '"profile"."id" = _."profileId"' }
      ]);
    });
  });
});
