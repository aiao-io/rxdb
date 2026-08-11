/**
 * @fileoverview transitionMetadata 回归测试。
 * 1. 基类/树实体元数据合并 — 基类字段必须注入 propertyMap 且先于自有字段。
 * 2. T017 — encryptedPropertyMap 派生。
 * 3. 实体级配置（features / repository / sync / log）沿原型链继承。
 */

import { describe, expect, it } from 'vitest';
import { ENTITY_BASE_METADATA_OPTIONS } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import {
  BooleanProperty,
  EntityMetadataOptions,
  PropertyType,
  StringProperty,
  SyncOptions,
  SyncType
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { getEntityMetadata } from '../../rxdb-utils.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({
    name: name as Uncapitalize<string>,
    type: PropertyType.string,
    ...extra
  }) as StringProperty;

const boolProp = (name: string, extra: Partial<BooleanProperty> = {}): BooleanProperty =>
  ({
    name: name as Uncapitalize<string>,
    type: PropertyType.boolean,
    ...extra
  }) as BooleanProperty;

const mkOptions = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions =>
  ({
    name: 'User' as Capitalize<string>,
    namespace: 'public',
    properties: [stringProp('id', { primary: true }), stringProp('name')],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  }) as EntityMetadataOptions;

describe('transitionMetadata — 基类元数据合并', () => {
  it('injects ENTITY_BASE_METADATA_OPTIONS fields ahead of own properties', () => {
    const result = transitionMetadata(
      mkOptions({
        name: 'Todo' as Capitalize<string>,
        properties: [stringProp('title'), boolProp('completed', { default: false })]
      }),
      ENTITY_BASE_METADATA_OPTIONS
    );
    expect([...result.propertyMap.keys()]).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'title',
      'completed'
    ]);
  });

  it('merges the tree adjacency-list base chain into propertyMap', () => {
    const result = transitionMetadata(
      mkOptions({
        name: 'Menu' as Capitalize<string>,
        properties: [stringProp('title')]
      }),
      [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]
    );

    expect([...result.propertyMap.keys()]).toEqual(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'title']);
  });
});

describe('transitionMetadata — encryptedPropertyMap', () => {
  it('initialises an empty map when no property is encrypted', () => {
    const meta = transitionMetadata(mkOptions());
    expect(meta.encryptedPropertyMap).toBeInstanceOf(Map);
    expect(meta.encryptedPropertyMap.size).toBe(0);
  });

  it('collects only properties with encrypted: true', () => {
    const meta = transitionMetadata(
      mkOptions({
        properties: [
          stringProp('id', { primary: true }),
          stringProp('name'),
          stringProp('ssn', { encrypted: true }),
          stringProp('phone', { encrypted: true })
        ]
      })
    );
    expect(meta.encryptedPropertyMap.size).toBe(2);
    expect([...meta.encryptedPropertyMap.keys()].sort()).toEqual(['phone', 'ssn']);
    expect(meta.encryptedPropertyMap.get('ssn')?.encrypted).toBe(true);
  });

  it('does not throw on encrypted+primary combination (validation is deferred)', () => {
    // 校验位于 @aiao/rxdb-adapter-encrypted；rxdb-core 只负责构建。
    // 该映射。这样的解耦可以避免循环依赖。
    expect(() =>
      transitionMetadata(
        mkOptions({
          properties: [stringProp('id', { primary: true, encrypted: true })]
        })
      )
    ).not.toThrow();
  });
});

/**
 * `features` / `repository` / `sync` / `log` 描述的是**整个实体的行为**，
 * 不是「自己定义的那几个字段」——语义上必须被子类继承。
 *
 * 属性 / 关系 / 索引早就沿原型链合并了，这四项却完全没有：`metadata` 是
 * `{ ...metadataOptions }` 的浅拷贝，只带自身声明的值；`repository` 更是在原型链
 * 收集**之前**就被 `|| 'Repository'` 定死。后果是继承一个基类只继承到「形状」，
 * 继承不到「行为」。
 */
describe('transitionMetadata — 实体级配置沿原型链继承', () => {
  const child = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions =>
    mkOptions({ name: 'Menu' as Capitalize<string>, ...overrides });

  const ancestor = (overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions =>
    mkOptions({ name: 'Base' as Capitalize<string>, properties: [], ...overrides });

  it('子类未声明 features 时继承祖先的 features', () => {
    const meta = transitionMetadata(child(), [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]);

    // 适配器靠 features.tree 决定是否生成 hasChildren 子查询与树 SQL
    //（`rxdb-adapter-sqlite-core/src/query/query_sql.ts:96`）：继承断链 =
    // 子类的树能力静默消失，而 computedPropertyMap 里的 hasChildren 还在，谁也不会报错
    expect(meta.features?.tree).toEqual({ type: 'adjacency-list', hasChildren: true });
  });

  it('features 按特性逐层深合并，子类只覆盖自己写的字段', () => {
    const meta = transitionMetadata(child({ features: { tree: { hasChildren: false } } }), [
      TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS
    ]);

    // 只写 hasChildren 不该把祖先的 type 一起抹掉：整块替换会让 tree.type 丢失，
    // 而生成 hasChildren 子查询要求 type === 'adjacency-list' 同时成立
    expect(meta.features?.tree).toEqual({ type: 'adjacency-list', hasChildren: false });
  });

  it('祖先与子类各自声明的不同特性并存', () => {
    const meta = transitionMetadata(child({ features: { tree: { hasChildren: true } } }), [
      ancestor({ features: { graph: { type: 'directed-graph' } } })
    ]);

    expect(meta.features).toEqual({ graph: { type: 'directed-graph' }, tree: { hasChildren: true } });
  });

  it('repository 回退到最近有值的祖先', () => {
    const meta = transitionMetadata(child(), [ancestor({ repository: 'TreeRepository' })]);

    // 兜底 `|| 'Repository'` 若发生在原型链合并之前，祖先的 TreeRepository 永远传不下来，
    // 子类的 findDescendants / findAncestors 静默缺失
    expect(meta.repository).toBe('TreeRepository');
  });

  it('更近的祖先覆盖更远的祖先', () => {
    const meta = transitionMetadata(child(), [
      ancestor({ name: 'Mid' as Capitalize<string>, repository: 'MidRepository' }),
      ancestor({ repository: 'TreeRepository' })
    ]);

    expect(meta.repository).toBe('MidRepository');
  });

  it('自身声明的 repository 覆盖祖先', () => {
    const meta = transitionMetadata(child({ repository: 'CustomRepository' }), [
      ancestor({ repository: 'TreeRepository' })
    ]);

    expect(meta.repository).toBe('CustomRepository');
  });

  it('整条链都没声明 repository 才兜底为 Repository', () => {
    const meta = transitionMetadata(child(), [ancestor()]);

    expect(meta.repository).toBe('Repository');
  });

  it('sync 回退到最近有值的祖先', () => {
    const sync = { type: SyncType.None, local: { adapter: 'local' } } satisfies SyncOptions;
    const meta = transitionMetadata(child(), [ancestor({ sync })]);

    // `Repository.ts` 取的是 `metadata.sync || rxdb.config.sync`：继承断链会让子类
    // 静默掉回全局同步配置 —— 基类说「只存本地」，子类却把数据推到远端
    expect(meta.sync).toEqual(sync);
  });

  it('log 回退到最近有值的祖先', () => {
    const meta = transitionMetadata(child(), [ancestor({ log: false })]);

    // 适配器一律判 `metadata.log !== false`：继承断链会给「本身不记变更日志」的
    // 系统实体子类装上变更日志触发器（`system/change.ts` 正是为避免递归才关的）
    expect(meta.log).toBe(false);
  });

  it('自身的 log: true 覆盖祖先的 log: false', () => {
    const meta = transitionMetadata(child({ log: true }), [ancestor({ log: false })]);

    expect(meta.log).toBe(true);
  });
});

/**
 * `tree-entity-base.ts` 与 `TreeRepository.ts` 的 TSDoc 都把
 * `@Entity({ name: 'Category' }) class Category extends TreeAdjacencyListEntityBase {}`
 * 写成推荐用法，却从没有测试跑过它。这个 describe 就是那份示例。
 */
describe('TreeAdjacencyListEntityBase 的 @Entity 子类（TSDoc 示例）', () => {
  @Entity({ name: 'Category' })
  class Category extends TreeAdjacencyListEntityBase {}

  it('继承到 TreeRepository 与 features.tree', () => {
    const meta = getEntityMetadata(Category);

    // 基类声明了 findDescendants / countAncestors 等静态方法，而这些只由
    // TreeRepository 注入 —— 子类拿不到它就是「类型上有、运行时没有」
    expect(meta.repository).toBe('TreeRepository');
    expect(meta.features?.tree).toEqual({ type: 'adjacency-list', hasChildren: true });
    expect(meta.computedPropertyMap.has('hasChildren')).toBe(true);
    expect(meta.relationMap.has('parent')).toBe(true);
  });
});

// RXD-053：父类索引只进 `indexMap`，不进 `metadata.indexes`（后者是「仅本类定义」语义，
// 与 `properties` / `relations` 一致）。问题出在**建表侧读错了集合** ——
// `create_table_sql.ts` 对属性读的是合并视图 `propertyMap`，唯独索引读了 `metadata.indexes`，
// 于是继承索引静默丢失：查询照常能跑，只是退化成全表扫描，大数据集上才暴露。
//
// 因此权威集合是 `indexMap`（与 propertyMap 对称），建表侧已改为读它。
// 这里锁定 `indexMap` 必须含继承索引；不再要求 `metadata.indexes` 变成合并视图，
// 那会破坏它与 properties/relations 的一致语义。
describe('RXD-053 继承索引', () => {
  it('父类索引必须同时出现在 indexMap 与 indexes 里', () => {
    @Entity({
      name: 'IndexBase',
      properties: [stringProp('name')],
      indexes: [{ name: 'by_name', properties: ['name'] }]
    })
    class IndexBase {}

    @Entity({ name: 'IndexChild', properties: [stringProp('title')] })
    class IndexChild extends IndexBase {}

    const metadata = getEntityMetadata(IndexChild);

    expect([...metadata.indexMap.keys()]).toContain('by_name');
    // metadata.indexes 保持「仅本类定义」语义
    expect(metadata.indexes.map(index => index.name)).not.toContain('by_name');
  });

  it('子类自有索引与父类索引并存', () => {
    @Entity({
      name: 'IndexBase2',
      properties: [stringProp('name')],
      indexes: [{ name: 'by_name', properties: ['name'] }]
    })
    class IndexBase2 {}

    @Entity({
      name: 'IndexChild2',
      properties: [stringProp('title')],
      indexes: [{ name: 'by_title', properties: ['title'] }]
    })
    class IndexChild2 extends IndexBase2 {}

    const names = [...getEntityMetadata(IndexChild2).indexMap.keys()];

    expect(names).toEqual(expect.arrayContaining(['by_name', 'by_title']));
  });

  it('继承链上的索引全部进入 indexMap（建表遍历的集合）', () => {
    @Entity({
      name: 'IndexBase3',
      properties: [stringProp('name')],
      indexes: [{ name: 'by_name', properties: ['name'] }]
    })
    class IndexBase3 {}

    @Entity({ name: 'IndexChild3', properties: [] })
    class IndexChild3 extends IndexBase3 {}

    const metadata = getEntityMetadata(IndexChild3);

    expect([...metadata.indexMap.keys()]).toEqual(['by_name']);
  });
});

// RXT-010 / RXT-016：`normalized` 把索引每一列改写成
// `lower(COALESCE(CAST(列 AS TEXT), ''))` 参与比较，唯一目的就是让含 NULL 的元组
// 重新可比（SQL 规定每个 NULL 互不相等）。非唯一索引上它没有任何可执行语义 ——
// 静默忽略换来的是「以为加了约束、其实一行都拦不住」，所以必须当场抛错。
describe('RXT-010 normalized 唯一索引', () => {
  it('normalized 缺 unique 时抛错，不静默降级', () => {
    expect(() =>
      transitionMetadata(
        mkOptions({
          name: 'NormalizedWithoutUnique' as Capitalize<string>,
          indexes: [{ name: 'by_name', properties: ['name'], normalized: true }]
        })
      )
    ).toThrow(/normalized/);
  });

  it('normalized + unique 原样保留到 indexMap', () => {
    const metadata = transitionMetadata(
      mkOptions({
        name: 'NormalizedUnique' as Capitalize<string>,
        indexes: [{ name: 'by_name', properties: ['name'], unique: true, normalized: true }]
      })
    );

    expect(metadata.indexMap.get('by_name')?.normalized).toBe(true);
  });

  it('继承来的 normalized 索引同样被校验', () => {
    expect(() => {
      @Entity({
        name: 'NormalizedBase',
        properties: [stringProp('name')],
        indexes: [{ name: 'by_name', properties: ['name'], normalized: true }]
      })
      class NormalizedBase {}

      @Entity({ name: 'NormalizedChild', properties: [] })
      class NormalizedChild extends NormalizedBase {}

      getEntityMetadata(NormalizedChild);
    }).toThrow(/normalized/);
  });
});

describe('实体级组合外键', () => {
  it('补齐引用命名空间并保留列顺序', () => {
    const metadata = transitionMetadata(
      mkOptions({
        namespace: 'shop',
        foreignKeys: [
          {
            name: 'owner_consistency',
            properties: ['cardId', 'id'],
            mappedEntity: 'Card',
            mappedProperties: ['id', 'ownerId']
          }
        ]
      })
    );

    expect(metadata.foreignKeys).toEqual([
      {
        name: 'owner_consistency',
        properties: ['cardId', 'id'],
        mappedEntity: 'Card',
        mappedNamespace: 'shop',
        mappedProperties: ['id', 'ownerId']
      }
    ]);
  });

  it('本地字段与引用字段数量不一致时立即拒绝', () => {
    expect(() =>
      transitionMetadata(
        mkOptions({
          foreignKeys: [
            {
              name: 'broken_reference',
              properties: ['cardId', 'id'],
              mappedEntity: 'Card',
              mappedProperties: ['id']
            }
          ]
        })
      )
    ).toThrow(/字段数不一致/);
  });
});
