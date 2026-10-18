import { afterEach, describe, expect, it } from 'vitest';
import { compileAdvancedIndex } from '../../entity/advanced-index.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { generatedColumnsOf } from '../../entity/generated-column.js';
import { PropertyType } from '../../entity/property-types.interface.js';
import { getEntityStorageMetadata, type EntityStorageOverride } from '../../entity/storage-override.js';
import { SyncType } from '../../entity/sync-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBChange } from '../../system/change.js';

@Entity({
  name: 'StorageProfileRow',
  properties: [
    { name: 'ext', type: PropertyType.string, nullable: true },
    { name: 'title', type: PropertyType.string }
  ],
  indexes: [{ name: 'title_unique', properties: ['title'], unique: true }]
})
class StorageProfileRow extends EntityBase {}

@Entity({ name: 'UnregisteredStorageRow', properties: [{ name: 'ext', type: PropertyType.string }] })
class UnregisteredStorageRow extends EntityBase {}

@Entity({
  name: 'UniqueGeneratedStorageRow',
  generatedColumns: [
    {
      name: 'unique_hot',
      expression: {
        kind: 'jsonScalar',
        property: 'ext',
        key: 'original',
        dataType: 'string',
        jsonText: true
      }
    }
  ],
  indexes: [{ name: 'generated_unique', properties: ['unique_hot'], unique: true }]
})
class UniqueGeneratedStorageRow extends StorageProfileRow {}

@Entity({
  name: 'ShorthandUniqueStorageRow',
  generatedColumns: [
    {
      name: 'unique_hot',
      expression: {
        kind: 'jsonScalar',
        property: 'ext',
        key: 'original',
        dataType: 'string',
        jsonText: true
      }
    }
  ],
  indexes: [{ name: 'unique_hot', unique: true }]
})
class ShorthandUniqueStorageRow extends StorageProfileRow {}

@Entity({
  name: 'ReplaceableStorageRow',
  generatedColumns: [
    {
      name: 'replaceable_hot',
      expression: {
        kind: 'jsonScalar',
        property: 'ext',
        key: 'original',
        dataType: 'string',
        jsonText: true
      }
    }
  ],
  indexes: [{ name: 'hot_lookup', properties: ['replaceable_hot'], method: 'btree' }]
})
class ReplaceableStorageRow extends StorageProfileRow {}

const declarations = (): EntityStorageOverride[] => [
  {
    entity: StorageProfileRow,
    generatedColumns: [
      {
        name: 'rohs_hot',
        expression: {
          kind: 'jsonScalar',
          property: 'ext',
          key: 'rohs_status',
          dataType: 'string',
          jsonText: true
        }
      }
    ],
    indexes: [{ name: 'rohs_lookup', properties: ['rohs_hot'] }]
  }
];

const databases: RxDB[] = [];
const create = (
  entityStorage?: readonly EntityStorageOverride[],
  entities: EntityType[] = [StorageProfileRow]
): RxDB => {
  const db = new RxDB({
    dbName: `s-${crypto.randomUUID()}`,
    entities,
    sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } },
    entityStorage
  });
  databases.push(db);
  return db;
};

const createUnchecked = (entityStorage: unknown): RxDB => create(entityStorage as readonly EntityStorageOverride[]);

afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.destroy()));
});

describe('实例级只读存储声明', () => {
  it('无覆盖时保持原元数据身份，配置时不改全局 Map 或可写字段', () => {
    const plain = create();
    const hot = create(declarations());
    const original = getEntityMetadata(StorageProfileRow);
    expect(getEntityStorageMetadata(plain, StorageProfileRow)).toBe(original);
    const effective = getEntityStorageMetadata(hot, StorageProfileRow);
    expect(effective).not.toBe(original);
    expect(generatedColumnsOf(effective).map(column => column.name)).toEqual(['rohs_hot']);
    expect(original.generatedColumnMap.size).toBe(0);
    expect(effective.propertyMap.has('rohs_hot')).toBe(false);
    expect(effective.indexMap.has('title_unique')).toBe(true);
  });

  it('构造时深快照，外部随后改数组/表达式不改变数据库计划', () => {
    const input = declarations();
    const db = create(input);
    input[0].generatedColumns![0].expression.key = 'changed';
    input.length = 0;
    expect(getEntityStorageMetadata(db, StorageProfileRow).generatedColumnMap.get('rohs_hot')?.expression.key).toBe(
      'rohs_status'
    );
    expect(Object.isFrozen(db.config.entityStorage)).toBe(true);
    expect(Object.isFrozen(db.config.entityStorage?.[0].generatedColumns?.[0].expression)).toBe(true);
  });

  it('相同实体类的两个库可选择不同热键，彼此及全局定义不污染', () => {
    const firstInput = declarations();
    const secondInput = declarations();
    secondInput[0].generatedColumns![0].expression.key = 'another_status';
    const first = create(firstInput);
    const second = create(secondInput);
    expect(getEntityStorageMetadata(first, StorageProfileRow).generatedColumnMap.get('rohs_hot')?.expression.key).toBe(
      'rohs_status'
    );
    expect(getEntityStorageMetadata(second, StorageProfileRow).generatedColumnMap.get('rohs_hot')?.expression.key).toBe(
      'another_status'
    );
    expect(getEntityMetadata(StorageProfileRow).generatedColumnMap.size).toBe(0);
  });

  it('未注册目标、系统实体、重复实体声明在构造期拒绝', () => {
    expect(() => create([{ ...declarations()[0], entity: UnregisteredStorageRow }])).toThrow(/注册|目标/);
    expect(() => create([{ ...declarations()[0], entity: RxDBChange }], [StorageProfileRow, RxDBChange])).toThrow(
      /系统/
    );
    expect(() => create([...declarations(), ...declarations()])).toThrow(/重复/);
  });

  it('只允许加速，不允许替换原唯一约束或新增唯一性改变写入语义', () => {
    expect(() =>
      create([
        { entity: StorageProfileRow, indexes: [{ name: 'title_unique', properties: ['title'], method: 'btree' }] }
      ])
    ).toThrow(/约束|已有|覆盖/);
    expect(() =>
      create([
        {
          entity: StorageProfileRow,
          indexes: [{ name: 'new_unique', properties: ['title'], method: 'btree', unique: true }]
        }
      ])
    ).toThrow(/唯一|unique|加速/);
  });

  it('不能通过替换生成列定义间接改变已有唯一索引的写入语义', () => {
    expect(() =>
      create(
        [
          {
            entity: UniqueGeneratedStorageRow,
            generatedColumns: [
              {
                name: 'unique_hot',
                expression: {
                  kind: 'jsonScalar',
                  property: 'ext',
                  key: 'changed',
                  dataType: 'string',
                  jsonText: true
                }
              }
            ]
          }
        ],
        [UniqueGeneratedStorageRow]
      )
    ).toThrow(/唯一|约束/);
  });

  it.each([null, {}, 'storage'])('JavaScript 调用方传入非数组声明 %j 时立即拒绝', input => {
    expect(() => createUnchecked(input)).toThrow(/存储声明必须是数组/);
  });

  it.each([null, 'storage', []])('声明条目 %j 不是对象时立即拒绝', entry => {
    expect(() => createUnchecked([entry])).toThrow(/存储声明必须是对象/);
  });

  it.each(['generatedColumns', 'indexes'] as const)('%s 必须是数组，不能传 null 或对象', field => {
    expect(() => createUnchecked([{ entity: StorageProfileRow, [field]: null }])).toThrow(/必须是数组/);
    expect(() => createUnchecked([{ entity: StorageProfileRow, [field]: {} }])).toThrow(/必须是数组/);
  });

  it.each(['generatedColumns', 'indexes'] as const)('%s 的空条目和非字符串名称不能穿透声明协议', field => {
    expect(() => createUnchecked([{ entity: StorageProfileRow, [field]: [null] }])).toThrow(/名称无效或重复/);
    expect(() => createUnchecked([{ entity: StorageProfileRow, [field]: [{ name: 1 }] }])).toThrow(/名称无效或重复/);
  });

  it.each(['generatedColumns', 'indexes'] as const)('%s 不能靠后声明覆盖同一份声明中的重复名称', field => {
    expect(() =>
      createUnchecked([{ entity: StorageProfileRow, [field]: [{ name: 'same' }, { name: 'same' }] }])
    ).toThrow(/名称无效或重复/);
  });

  it.each([
    ['函数', () => 'rohs_status'],
    ['symbol', Symbol('rohs_status')]
  ])('嵌套表达式中的%s不是可快照的纯数据', (_label, key) => {
    expect(() =>
      createUnchecked([
        {
          entity: StorageProfileRow,
          generatedColumns: [
            {
              name: 'rohs_hot',
              expression: {
                kind: 'jsonScalar',
                property: 'ext',
                key,
                dataType: 'string',
                jsonText: true
              }
            }
          ]
        }
      ])
    ).toThrow(/只接受纯数据/);
  });

  it.each([
    ['日期对象', new Date('2026-01-01T00:00:00Z')],
    ['无原型对象', Object.create(null) as Record<string, unknown>]
  ])('%s不能伪装成存储表达式交给深快照', (_label, expression) => {
    expect(() =>
      createUnchecked([{ entity: StorageProfileRow, generatedColumns: [{ name: 'rohs_hot', expression }] }])
    ).toThrow(/只接受普通对象/);
  });

  it('显式 null 选项不能被快照吞掉并退回默认索引语义', () => {
    expect(() =>
      createUnchecked([
        { entity: StorageProfileRow, indexes: [{ name: 'title_lookup', properties: ['title'], unique: null }] }
      ])
    ).toThrow(/unique 必须是布尔值/);
  });

  it('省略或显式留空的存储声明都保留原逻辑字段和约束', () => {
    const original = getEntityMetadata(StorageProfileRow);
    const omitted = create([{ entity: StorageProfileRow }]);
    const empty = create([{ entity: StorageProfileRow, generatedColumns: [], indexes: [] }]);
    expect(omitted.config.entityStorage?.[0]).toEqual({ entity: StorageProfileRow });
    expect(getEntityStorageMetadata(omitted, StorageProfileRow).propertyMap).toBe(original.propertyMap);
    expect(getEntityStorageMetadata(empty, StorageProfileRow).indexMap).toEqual(original.indexMap);
    expect(getEntityStorageMetadata(empty, StorageProfileRow).generatedColumnMap.size).toBe(0);
  });

  it('索引字段与方言数组在首次读取计划前就已深快照并冻结', () => {
    const properties = ['rohs_hot'];
    const dialects: ('sqlite' | 'postgres')[] = ['sqlite'];
    const input = declarations();
    input[0] = { ...input[0], indexes: [{ name: 'rohs_lookup', properties, dialects, unique: false }] };
    const db = create(input);
    properties[0] = 'missing';
    dialects[0] = 'postgres';
    input[0].indexes![0].unique = true;
    const metadata = getEntityStorageMetadata(db, StorageProfileRow);
    const index = metadata.indexMap.get('rohs_lookup')!;
    expect(index).toMatchObject({ properties: ['rohs_hot'], dialects: ['sqlite'], method: 'btree', unique: false });
    expect(compileAdvancedIndex(metadata, index, 'sqlite')).not.toBeNull();
    expect(compileAdvancedIndex(metadata, index, 'postgres')).toBeNull();
    const snapshot = db.config.entityStorage![0];
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.generatedColumns)).toBe(true);
    expect(Object.isFrozen(snapshot.indexes)).toBe(true);
    expect(Object.isFrozen(snapshot.indexes![0])).toBe(true);
    expect(Object.isFrozen(snapshot.indexes![0].properties)).toBe(true);
    expect(Object.isFrozen(snapshot.indexes![0].dialects)).toBe(true);
    expect(() => snapshot.indexes![0].properties!.push('title')).toThrow(TypeError);
    expect(() => Object.assign(snapshot.indexes![0], { unique: true })).toThrow(TypeError);
    expect(metadata.indexMap.get('rohs_lookup')?.unique).toBe(false);
  });

  it('同一数据库按实体缓存生效元数据，未覆盖的实体仍返回全局身份', () => {
    const db = create(declarations(), [StorageProfileRow, UnregisteredStorageRow]);
    const first = getEntityStorageMetadata(db, StorageProfileRow);
    expect(getEntityStorageMetadata(db, StorageProfileRow)).toBe(first);
    expect(getEntityStorageMetadata(db, UnregisteredStorageRow)).toBe(getEntityMetadata(UnregisteredStorageRow));
    expect(getEntityStorageMetadata(db, StorageProfileRow)).toBe(first);
  });

  it('可替换既有非唯一生成列及其高级加速索引，原定义仍可供其它数据库使用', () => {
    const original = getEntityMetadata(ReplaceableStorageRow);
    const db = create(
      [
        {
          entity: ReplaceableStorageRow,
          generatedColumns: [
            {
              name: 'replaceable_hot',
              expression: {
                kind: 'jsonScalar',
                property: 'ext',
                key: 'changed',
                dataType: 'string',
                jsonText: true
              }
            }
          ],
          indexes: [{ name: 'hot_lookup', properties: ['title'], method: 'btree' }]
        }
      ],
      [ReplaceableStorageRow]
    );
    const effective = getEntityStorageMetadata(db, ReplaceableStorageRow);
    expect(effective.generatedColumnMap.get('replaceable_hot')?.expression.key).toBe('changed');
    expect(effective.indexMap.get('hot_lookup')?.properties).toEqual(['title']);
    expect(original.generatedColumnMap.get('replaceable_hot')?.expression.key).toBe('original');
    expect(original.indexMap.get('hot_lookup')?.properties).toEqual(['replaceable_hot']);
  });

  it('唯一索引按名称简写引用生成列时也禁止替换该生成列', () => {
    expect(() =>
      create(
        [
          {
            entity: ShorthandUniqueStorageRow,
            generatedColumns: [
              {
                name: 'unique_hot',
                expression: {
                  kind: 'jsonScalar',
                  property: 'ext',
                  key: 'changed',
                  dataType: 'string',
                  jsonText: true
                }
              }
            ]
          }
        ],
        [ShorthandUniqueStorageRow]
      )
    ).toThrow(/唯一约束引用的生成列/);
  });

  it('已有唯一高级索引不能通过声明成非唯一加速索引而移除唯一性', () => {
    expect(() =>
      create(
        [
          {
            entity: ShorthandUniqueStorageRow,
            indexes: [{ name: 'unique_hot', properties: ['title'], method: 'btree', unique: false }]
          }
        ],
        [ShorthandUniqueStorageRow]
      )
    ).toThrow(/不能覆盖已有约束索引/);
  });

  it('仅限 SQLite 的加速声明在构造期也要验证该端方法能力', () => {
    expect(() =>
      create([
        {
          entity: StorageProfileRow,
          indexes: [{ name: 'title_lookup', properties: ['title'], dialects: ['sqlite'], method: 'gist' }]
        }
      ])
    ).toThrow(/SQLite 不支持索引方法 gist/);
  });
});
