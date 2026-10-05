/**
 * @fileoverview US-028 阶段 A — 手动排序键在 PGlite 上按码点比较（AC#4 跨后端同序）。
 *
 * 分数索引键按码点比较才有序（`'Z' < 'a'`），核心与 SQLite 的 TEXT 默认 BINARY 都是码点；
 * PostgreSQL 的比较走库的 collation，非 `C` locale 下 `'a0' < 'Zz'` 会翻转。
 * 所以手动排序实体的 `sortOrder` 在 ORDER BY 与区间比较上一律显式 `COLLATE "C"`，
 * 不依赖 dataDir 建库时的 locale；其余字段与普通实体的同名字段保持原样。
 *
 * 阶段 D：分组字段打头参与默认排序，string / enum 分组字段（varchar 列）同样按码点，
 * 否则 `'Zone'` 组与 `'apple'` 组的先后在两端不一致；uuid / boolean / 外键列不是文本，不加。
 */

import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type OrderBy,
  type RuleGroup
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildRuleGroupPG, generate_find_sql } from '../../query/query_sql.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

@Entity({
  name: 'CollateCategory',
  manualOrder: true,
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class CollateCategory extends EntityBase {}

@Entity({
  name: 'CollatePlain',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string, nullable: true }
  ]
})
class CollatePlain extends EntityBase {}

@Entity({
  name: 'CollateShelf',
  manualOrder: { groupBy: ['shelf', 'status', 'done', 'ownerId', 'categoryId'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string },
    { name: 'shelf', type: PropertyType.string, nullable: true },
    { name: 'status', type: PropertyType.enum, enum: ['open', 'Closed'] },
    { name: 'done', type: PropertyType.boolean },
    { name: 'ownerId', type: PropertyType.uuid, nullable: true }
  ],
  relations: [
    {
      name: 'category',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CollateCategory',
      mappedProperty: 'shelves',
      nullable: true
    }
  ]
})
class CollateShelf extends EntityBase {}

@Entity({
  name: 'CollateNaturalOwner',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }]
})
class CollateNaturalOwner {
  id!: string;
}

@Entity({
  name: 'CollateCountedOwner',
  properties: [{ name: 'id', type: PropertyType.bigint, primary: true }]
})
class CollateCountedOwner {
  id!: bigint;
}

@Entity({
  name: 'CollateNaturalChild',
  manualOrder: { groupBy: ['ownerId', 'counterId'] },
  properties: [{ name: 'sortOrder', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CollateNaturalOwner',
      mappedProperty: 'children',
      nullable: true
    },
    {
      name: 'counter',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CollateCountedOwner',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class CollateNaturalChild extends EntityBase {}

const where = (operator: string, value: unknown, field = 'sortOrder'): RuleGroup =>
  ({ combinator: 'and', rules: [{ field, operator, value }] }) as RuleGroup;

const ruleSql = (EntityType: typeof CollateCategory, rule: RuleGroup): string =>
  buildRuleGroupPG(rule, [], new Map(), getEntityMetadata(EntityType));

const createAdapter = (): RxDBAdapterPGlite => {
  const rxdb = new RxDB({
    dbName: 'manual-order-collate',
    entities: [
      CollateCategory,
      CollatePlain,
      CollateShelf,
      CollateNaturalOwner,
      CollateCountedOwner,
      CollateNaturalChild
    ],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  return new RxDBAdapterPGlite(rxdb, { store: 'memory' });
};

const orderSql = (EntityType: typeof CollateCategory, orderBy: OrderBy[]): string =>
  generate_find_sql(createAdapter(), getEntityMetadata(EntityType), {
    where: { combinator: 'and', rules: [] },
    orderBy
  }).sql;

const whereSql = (EntityType: typeof CollateCategory, rule: RuleGroup): string =>
  generate_find_sql(createAdapter(), getEntityMetadata(EntityType), { where: rule }).sql;

const findSql = (EntityType: typeof CollateCategory, field: string): string =>
  orderSql(EntityType, [
    { field, sort: 'asc' },
    { field: 'id', sort: 'desc' }
  ]);

describe('US-028 PGlite 手动排序键 COLLATE "C"', () => {
  it('ORDER BY sortOrder 显式 COLLATE "C"，排在方向之前；id 不加', () => {
    const sql = findSql(CollateCategory, 'sortOrder');
    expect(sql).toContain('_."sortOrder" COLLATE "C" ASC');
    expect(sql).toContain('_."id" DESC');
    expect(sql).not.toContain('"id" COLLATE');
  });

  it.each(['<', '<=', '>', '>='])('区间比较 %s 带 COLLATE "C"', operator => {
    expect(ruleSql(CollateCategory, where(operator, 'a0'))).toBe(`"sortOrder" COLLATE "C" ${operator} $1`);
  });

  it.each([
    ['between', 'BETWEEN'],
    ['notBetween', 'NOT BETWEEN']
  ])('%s 带 COLLATE "C"', (operator, sql) => {
    expect(ruleSql(CollateCategory, where(operator, ['a0', 'a5']))).toBe(`"sortOrder" COLLATE "C" ${sql} $1 AND $2`);
  });

  it('等值比较与集合判断不受 collation 影响，不加', () => {
    expect(ruleSql(CollateCategory, where('=', 'a0'))).toBe('"sortOrder" = $1');
    expect(ruleSql(CollateCategory, where('in', ['a0']))).toBe('"sortOrder" = ANY($1)');
  });

  it('手动排序实体的其他字段不加', () => {
    expect(findSql(CollateCategory, 'title')).not.toContain('COLLATE');
    expect(ruleSql(CollateCategory, where('<', 'm', 'title'))).toBe('"title" < $1');
  });

  it('未声明 manualOrder 的同名字段保持原样（AC#10）', () => {
    expect(findSql(CollatePlain, 'sortOrder')).not.toContain('COLLATE');
    expect(ruleSql(CollatePlain, where('<', 'a0'))).toBe('"sortOrder" < $1');
    expect(ruleSql(CollatePlain, where('between', ['a0', 'a5']))).toBe('"sortOrder" BETWEEN $1 AND $2');
  });
});

describe('US-028 阶段 D PGlite 分组字段 COLLATE "C"', () => {
  const groupOrder: OrderBy[] = ['shelf', 'status', 'done', 'ownerId', 'categoryId', 'sortOrder', 'id'].map(field => ({
    field,
    sort: 'asc' as const
  }));

  it('默认排序里 string / enum 分组字段与 sortOrder 显式 COLLATE "C"', () => {
    const sql = orderSql(CollateShelf, groupOrder);
    expect(sql).toContain('_."shelf" COLLATE "C" ASC NULLS FIRST');
    expect(sql).toContain('_."status" COLLATE "C" ASC');
    expect(sql).toContain('_."sortOrder" COLLATE "C" ASC');
  });

  it.each(['done', 'ownerId', 'categoryId', 'id'])('非文本列 %s 不加', field => {
    expect(orderSql(CollateShelf, groupOrder)).not.toContain(`"${field}" COLLATE`);
  });

  it('string 分组字段的区间比较带 COLLATE "C"，等值不加', () => {
    expect(ruleSql(CollateShelf, where('>', 'A', 'shelf'))).toBe('"shelf" COLLATE "C" > $1');
    expect(ruleSql(CollateShelf, where('=', 'A', 'shelf'))).toBe('"shelf" = $1');
  });

  it('非分组的同名 string 字段不加', () => {
    expect(ruleSql(CollateShelf, where('<', 'm', 'title'))).toBe('"title" < $1');
  });
});

describe('R04 PGlite 文本外键分组字段 COLLATE "C"', () => {
  const childOrder: OrderBy[] = ['ownerId', 'counterId', 'sortOrder', 'id'].map(field => ({
    field,
    sort: 'asc' as const
  }));

  it('关联实体是 string 主键时，外键分组字段在默认排序里显式 COLLATE "C"，可空方向不变', () => {
    const sql = orderSql(CollateNaturalChild, childOrder);
    expect(sql).toContain('_."ownerId" COLLATE "C" ASC NULLS FIRST');
    expect(sql).toContain('_."sortOrder" COLLATE "C" ASC');
  });

  it.each(['<', '<=', '>', '>='])('文本外键的游标区间比较 %s 带 COLLATE "C"', operator => {
    expect(whereSql(CollateNaturalChild, where(operator, 'Zz', 'ownerId'))).toContain(
      `"ownerId" COLLATE "C" ${operator} $1`
    );
  });

  it('文本外键的 between 带 COLLATE "C"，等值与 null 判断不加', () => {
    expect(whereSql(CollateNaturalChild, where('between', ['a', 'z'], 'ownerId'))).toContain(
      '"ownerId" COLLATE "C" BETWEEN $1 AND $2'
    );
    expect(whereSql(CollateNaturalChild, where('=', 'a', 'ownerId'))).toContain('"ownerId" = $1');
    expect(whereSql(CollateNaturalChild, where('=', null, 'ownerId'))).toContain('"ownerId" IS NULL');
  });

  it('bigint 主键的外键分组字段不加文本 collation', () => {
    expect(orderSql(CollateNaturalChild, childOrder)).not.toContain('"counterId" COLLATE');
    expect(whereSql(CollateNaturalChild, where('>', 1, 'counterId'))).not.toContain('COLLATE');
  });

  it('不给关联实体解析器时，外键分组字段的 collation 无从判定，直接报错而不是猜', () => {
    expect(() => ruleSql(CollateNaturalChild, where('>', 'a', 'ownerId'))).toThrow(
      'Foreign key "ownerId" needs an entity metadata resolver to decide its collation'
    );
  });
});
