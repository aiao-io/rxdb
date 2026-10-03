/**
 * @fileoverview US-028 阶段 D — 分组字段的声明与注册期校验（AC#13 前半）。
 *
 * 1. 分组字段随可排序声明一并声明：`manualOrder: { groupBy: [...] }`，与 `true` 同样就近继承；
 * 2. 分组字段只能是实体自身的标量列（含多对一外键列），非计算、可写；
 *    关系路径、关系名本身、JSON / 数组 / 二进制列、`sortOrder` / `id`、重复声明、不存在的字段都报 `invalidManualOrder`；
 * 3. 声明形状本身不对（非对象、`groupBy` 不是字符串数组、多余的键）同样报错。
 */

import { describe, expect, it } from 'vitest';
import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import type { OrderBy } from '../../repository/query-options.interface.js';
import { manualOrderGroupFields, normalizeManualOrderBy } from '../../sortable/sortable.utils.js';

const options = (manualOrder: unknown, overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: 'Product',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean },
    { name: 'shelf', type: PropertyType.string, nullable: true },
    { name: 'code', type: PropertyType.string, readonly: true },
    { name: 'secret', type: PropertyType.string, encrypted: true },
    { name: 'meta', type: PropertyType.json },
    { name: 'attrs', type: PropertyType.keyValue, properties: [] },
    { name: 'tags', type: PropertyType.stringArray },
    { name: 'scores', type: PropertyType.numberArray },
    { name: 'blob', type: PropertyType.binary }
  ],
  computedProperties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'category',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Category',
      mappedProperty: 'products',
      nullable: true
    }
  ],
  manualOrder: manualOrder as EntityMetadataOptions['manualOrder'],
  ...overrides
});

const violations = (manualOrder: unknown) =>
  validateEntityMetadata(transitionMetadata(options(manualOrder))).filter(error => error.rule === 'invalidManualOrder');

describe('US-028 AC#13 分组字段声明', () => {
  it('合法：可空外键列、boolean 列、可空 string 列，可组合', () => {
    expect(violations({ groupBy: ['categoryId'] })).toEqual([]);
    expect(violations({ groupBy: ['completed'] })).toEqual([]);
    expect(violations({ groupBy: ['shelf', 'categoryId'] })).toEqual([]);
  });

  it('groupBy 为空数组等同 true（整表一条序列）', () => {
    expect(violations({ groupBy: [] })).toEqual([]);
    expect(manualOrderGroupFields(transitionMetadata(options({ groupBy: [] })))).toEqual([]);
  });

  it('分组字段按声明顺序取出；true 没有分组字段', () => {
    expect(manualOrderGroupFields(transitionMetadata(options({ groupBy: ['shelf', 'categoryId'] })))).toEqual([
      'shelf',
      'categoryId'
    ]);
    expect(manualOrderGroupFields(transitionMetadata(options(true)))).toEqual([]);
  });

  it('子类继承祖先的分组声明，也可改回整表', () => {
    const ancestor: EntityMetadataOptions = { name: 'Base', properties: [], manualOrder: { groupBy: ['completed'] } };
    const inherited = transitionMetadata(options(undefined), [ancestor]);
    expect(manualOrderGroupFields(inherited)).toEqual(['completed']);
    const overridden = transitionMetadata(options(true), [ancestor]);
    expect(manualOrderGroupFields(overridden)).toEqual([]);
  });

  it.each([
    ['不存在的字段', 'missing', '不存在'],
    ['计算字段', 'label', '计算'],
    ['不可写', 'code', 'readonly'],
    ['加密列', 'secret', 'encrypted'],
    ['关系路径', 'category.title', '关系路径'],
    ['关系名本身', 'category', 'categoryId'],
    ['JSON 列', 'meta', 'json'],
    ['keyValue 列', 'attrs', 'keyValue'],
    ['字符串数组列', 'tags', 'stringArray'],
    ['数字数组列', 'scores', 'numberArray'],
    ['二进制列', 'blob', 'binary'],
    ['排序键自身', 'sortOrder', 'sortOrder'],
    ['主键', 'id', '主键']
  ])('%s：invalidManualOrder', (_label, field, keyword) => {
    const found = violations({ groupBy: [field] });
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe(`manualOrder.groupBy.${field}`);
    expect(found[0].message).toContain(keyword);
  });

  it('多个分组字段各自违规，各报一条', () => {
    expect(violations({ groupBy: ['meta', 'label'] }).map(error => error.field)).toEqual([
      'manualOrder.groupBy.label',
      'manualOrder.groupBy.meta'
    ]);
  });

  it('重复声明同一字段', () => {
    const found = violations({ groupBy: ['completed', 'completed'] });
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('重复');
  });

  it.each([
    ['字符串', 'completed'],
    ['null', null],
    ['数组', ['completed']],
    ['groupBy 不是数组', { groupBy: 'completed' }],
    ['groupBy 含非字符串', { groupBy: ['completed', 1] }],
    ['多余的键', { groupBy: ['completed'], field: 'rank' }]
  ])('声明形状不对（%s）：报在 manualOrder 上', (_label, declared) => {
    const found = violations(declared);
    expect(found).toHaveLength(1);
    expect(found[0].field).toBe('manualOrder');
  });

  it('分组声明同样要求 sortOrder 合法', () => {
    const found = validateEntityMetadata(
      transitionMetadata(
        options({ groupBy: ['completed'] }, { properties: [{ name: 'completed', type: PropertyType.boolean }] })
      )
    ).filter(error => error.rule === 'invalidManualOrder');
    expect(found.map(error => error.field)).toEqual(['sortOrder']);
  });
});

describe('US-028 AC#13 默认排序带分组字段', () => {
  it('未给 orderBy 时归一化为 [分组字段… asc, sortOrder asc, id asc]', () => {
    const metadata = transitionMetadata(options({ groupBy: ['shelf', 'categoryId'] }));
    expect(normalizeManualOrderBy<{ orderBy?: OrderBy[] }>(metadata, {}).orderBy).toEqual([
      { field: 'shelf', sort: 'asc' },
      { field: 'categoryId', sort: 'asc' },
      { field: 'sortOrder', sort: 'asc' },
      { field: 'id', sort: 'asc' }
    ]);
  });

  it('显式 orderBy 原样尊重', () => {
    const metadata = transitionMetadata(options({ groupBy: ['completed'] }));
    const orderBy = [{ field: 'title', sort: 'desc' as const }];
    expect(normalizeManualOrderBy(metadata, { orderBy }).orderBy).toBe(orderBy);
  });
});
