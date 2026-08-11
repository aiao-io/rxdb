/**
 * `entities/` 与 `shop/` 是 `@aiao/rxdb-test` 对外发布的共享模型 —— 三端 demo、e2e
 * 与四个适配器包都直接消费它们。但它们不在 `src` 下，长期既不进 vitest 的 include，
 * 也不进 coverage acceptance 的分母（RXT-030）：**20 个已发布的 TS 文件没有任何用例守着**。
 *
 * `entity-model-contract.spec.ts` 钉的是具体 finding（某个实体缺某条索引）。
 * 本文件互补，钉的是与实体无关的**结构性不变量**：名字、表名、关系闭合、索引引用的列。
 * 这些都是「声明时不报错、建表或 join 时才炸」的类别，届时错误信息离病因已经很远；
 * 而且模型是发布产物，错了是下游三端一起错。
 */
import { getEntityMetadata, type EntityMetadata, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import * as demoModule from '../../entities/index.js';
import { ENTITIES as DEMO_ENTITIES } from '../../entities/index.js';
import * as shopModule from '../../shop/index.js';
import { ENTITIES as SHOP_ENTITIES } from '../../shop/index.js';

const PUBLISHED: ReadonlyArray<readonly [string, EntityType]> = [
  ...DEMO_ENTITIES.map(entity => ['entities', entity] as const),
  ...SHOP_ENTITIES.map(entity => ['shop', entity] as const)
];

/** 每个子路径的「登记表」与「导出表」，用于交叉校验二者不脱节。 */
const SUBPATHS = [
  { group: 'entities', registered: DEMO_ENTITIES, module: demoModule as Record<string, unknown> },
  { group: 'shop', registered: SHOP_ENTITIES, module: shopModule as Record<string, unknown> }
] as const;

const metadataOf = (entity: EntityType): EntityMetadata => getEntityMetadata(entity);

/** 按 metadata 上声明的实体名建索引，用于校验关系的对端。 */
const BY_ENTITY_NAME = new Map(PUBLISHED.map(([, entity]) => [metadataOf(entity).name, metadataOf(entity)]));

describe('published model invariants', () => {
  it('exports at least the documented entity count', () => {
    // 防止 index.ts 的 `ENTITIES` 与目录里的文件脱节 —— 漏登记的实体不会被建表，
    // 症状是运行时「表不存在」，而不是编译错误。
    expect(DEMO_ENTITIES).toHaveLength(8);
    expect(SHOP_ENTITIES).toHaveLength(10);
  });

  it('exports every registered entity under its own metadata name', () => {
    // `name` 是查询、关系解析与表名推导的主键，写错时不报错，只会安静地解析到别处。
    // 这里对着**导出名**校验而不是 `Class.name`：装饰器返回的是匿名子类，
    // 运行时 `Entity.name` 恒为 `''`（原类名退到 `getPrototypeOf` 上），
    // 拿 `Class.name` 比对等于什么都没比。导出名则是下游真正 import 的那个标识符。
    const problems = SUBPATHS.flatMap(({ group, registered, module }) =>
      registered.map(entity => {
        const declared = metadataOf(entity).name;
        return module[declared] === entity ? '' : `${group}: 导出里找不到与 metadata.name「${declared}」同名的这个类`;
      })
    ).filter(Boolean);

    expect(problems).toEqual([]);
  });

  it('maps every entity to a distinct table within its namespace', () => {
    const seen = new Map<string, string>();
    const collisions = PUBLISHED.flatMap(([, entity]) => {
      const metadata = metadataOf(entity);
      const key = `${metadata.namespace}.${metadata.tableName}`;
      const previous = seen.get(key);
      seen.set(key, metadata.name);
      return previous === undefined ? [] : [`${key}: ${previous} 与 ${metadata.name} 共用同一张表`];
    });

    expect(collisions).toEqual([]);
  });

  it('closes every relation with a matching reverse relation on the target entity', () => {
    // 单向写错的关系在声明期完全合法：`mappedEntity` / `mappedProperty` 只是字符串。
    // 直到 join 生成或级联保存时才炸，而那时报错指向的是 SQL，不是这行声明。
    const broken = PUBLISHED.flatMap(([, entity]) =>
      metadataOf(entity).relations.flatMap(relation => {
        const source = metadataOf(entity).name;
        const target = BY_ENTITY_NAME.get(relation.mappedEntity);
        if (!target) return [`${source}.${relation.name} → 未知实体 ${relation.mappedEntity}`];
        const reverse = target.relationMap.get(relation.mappedProperty);
        if (!reverse) return [`${source}.${relation.name} → ${target.name} 上没有 ${relation.mappedProperty}`];
        if (reverse.mappedEntity !== source) {
          return [`${source}.${relation.name} 的反向 ${target.name}.${reverse.name} 指向 ${reverse.mappedEntity}`];
        }
        return [];
      })
    );

    expect(broken).toEqual([]);
  });

  it('only indexes columns that actually exist on the entity', () => {
    // 索引里的列名同样只是字符串。写错时建表 DDL 会引用不存在的列，
    // 报错发生在 connect 期、信息是数据库原话，回溯到这行声明要花很久。
    const dangling = PUBLISHED.flatMap(([, entity]) => {
      const metadata = metadataOf(entity);
      const known = new Set([...metadata.propertyMap.keys(), ...metadata.foreignKeyNames]);
      return metadata.indexes.flatMap(index => {
        const label = `${metadata.name}.${index.name ?? '(匿名)'}`;
        // `properties` 在类型上是可选的。一条没有列的索引会生成 `CREATE INDEX … ()`，
        // 同样是「建表时才炸」，所以按缺陷记，不当作「没什么可检查」跳过。
        if (index.properties === undefined || index.properties.length === 0) return [`${label} 没有声明任何列`];
        return index.properties
          .filter(property => !known.has(property))
          .map(property => `${label} 引用了不存在的 ${property}`);
      });
    });

    expect(dangling).toEqual([]);
  });

  it('gives every enum property a non-empty set of allowed values', () => {
    // `PropertyType.enum` 却没有候选值 = 生成的类型退化成 string，
    // 数据库也不会有 CHECK 约束，等于白声明。
    const empty = PUBLISHED.flatMap(([, entity]) => {
      const metadata = metadataOf(entity);
      return metadata.properties
        .filter(property => 'enum' in property)
        .filter(property => !Array.isArray(property.enum) || property.enum.length === 0)
        .map(property => `${metadata.name}.${property.name}`);
    });

    expect(empty).toEqual([]);
  });
});
