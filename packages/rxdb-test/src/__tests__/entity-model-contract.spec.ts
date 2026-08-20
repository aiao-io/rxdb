/**
 * 发布的 `entities` / `shop` 子路径是三端 demo / e2e 的共享模型，但它们不在 `src` 下，
 * 既不进 vitest 的 include，也不进 coverage acceptance 的分母（RXT-030）——
 * 模型层的约束缺失因此长期没有任何用例守着。本文件直接对**源实体**断言元数据契约。
 */
import { getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { Article } from '../../entities/Article.js';
import { FileLarge } from '../../entities/FileLarge.js';
import { FileNode } from '../../entities/FileNode.js';
import { MenuLarge } from '../../entities/MenuLarge.js';
import { MenuSimple } from '../../entities/MenuSimple.js';
import { AttributeValue } from '../../shop/AttributeValue.js';
import { IdCard } from '../../shop/IdCard.js';
import { SKUAttributes } from '../../shop/SKUAttributes.js';
import { User } from '../../shop/User.js';

type CompositeForeignKey = {
  name: string;
  properties: string[];
  mappedEntity: string;
  mappedNamespace: string;
  mappedProperties: string[];
};

const getCompositeForeignKeys = (entity: Parameters<typeof getEntityMetadata>[0]): CompositeForeignKey[] =>
  (getEntityMetadata(entity) as unknown as { foreignKeys?: CompositeForeignKey[] }).foreignKeys ?? [];

describe('published entity model contract', () => {
  it('declares the Article tags default in metadata', () => {
    const tags = getEntityMetadata(Article).properties.find(property => property.name === 'tags');

    expect(tags?.default).toEqual([]);
  });

  // RXT-013：class 上写的是 `'file' | 'folder'`，metadata 却是 PropertyType.string ——
  // 生成的声明和数据库都接受任意字符串，`isFolder` / `fullName` 这些按 discriminator
  // 分支的计算属性在脏数据上会静默走错分支。联合类型必须由 metadata 承载。
  it.each([
    ['FileNode', FileNode],
    ['FileLarge', FileLarge]
  ])('%s declares the file/folder discriminator as an enum', (_name, entity) => {
    const type = getEntityMetadata(entity).properties.find(property => property.name === 'type');

    expect(type).toBeDefined();
    expect(type?.type).toBe(PropertyType.enum);
    expect(type && 'enum' in type ? type.enum : undefined).toEqual(['file', 'folder']);
    expect(type?.nullable).toBe(false);
  });

  // RXT-015：MenuLarge 是 1000+ 节点的懒加载模型，按 parentId 查询、按 sortOrder 排序，
  // `hasChildren: true` 还让每行再发一次子查询；没有 (parentId, sortOrder) 索引时
  // 列表渲染会退化到近 O(N²)。FileNode / FileLarge 都有这条索引，MenuLarge 漏了。
  it('indexes MenuLarge by (parentId, sortOrder) for lazy-loaded children', () => {
    const indexes = getEntityMetadata(MenuLarge).indexes;

    expect(indexes.map(index => index.properties)).toContainEqual(['parentId', 'sortOrder']);
  });

  // RXT-010 / RXT-016：同级唯一必须由**数据库**承担。
  // 光有 `unique: true` 不够 —— SQL 规定每个 NULL 互不相等，树形实体的根节点
  // （`parentId IS NULL`）和无扩展名的文件夹（`extension IS NULL`）会让整条索引失效；
  // `normalized` 才把 NULL 折成可比值，并顺带对齐 UI 侧的大小写不敏感判定。
  // 行为端由 `src/tree-unique/` 的跨适配器契约套件守着，这里只固定**模型声明**。
  it.each([
    ['FileNode', FileNode, 'parent_fullname', ['parentId', 'name', 'extension']],
    ['FileLarge', FileLarge, 'parent_fullname', ['parentId', 'name', 'extension']],
    ['MenuSimple', MenuSimple, 'parent_title', ['parentId', 'title']],
    ['MenuLarge', MenuLarge, 'parent_title', ['parentId', 'title']]
  ])('%s declares a normalized unique sibling index', (_name, entity, indexName, properties) => {
    const index = getEntityMetadata(entity).indexes.find(candidate => candidate.name === indexName);

    expect(index).toBeDefined();
    expect(index?.properties).toEqual(properties);
    expect(index?.unique).toBe(true);
    expect(index?.normalized).toBe(true);
  });

  // RXT-011：`SKUAttributes` 的 skuId / attributeId / valueId 是三条互不关联的 FK，
  // 「同一 SKU 上同一属性出现两次」在库里合法，读出来是两条互相冲突的记录。
  // 这里只固定**模型声明**，行为端在 sqlite-core 的 `shared-crud.suite.ts`
  // 与 pglite 的 `sku-attribute-unique.spec.ts`。
  // 不加 `normalized`：两列都是 NOT NULL 的 uuid FK，没有 NULL 要折、也没有大小写变体要归一，
  // 裸列 UNIQUE 就是准确口径。
  it('SKUAttributes declares one row per (sku, attribute)', () => {
    const index = getEntityMetadata(SKUAttributes).indexes.find(candidate => candidate.name === 'sku_attribute');

    expect(index).toBeDefined();
    expect(index?.properties).toEqual(['skuId', 'attributeId']);
    expect(index?.unique).toBe(true);
    expect(index?.normalized).toBeUndefined();
  });

  it('declares the composite foreign key that binds an SKU value to its attribute', () => {
    const targetIndex = getEntityMetadata(AttributeValue).indexes.find(
      candidate => candidate.name === 'attribute_value_identity'
    );
    const foreignKey = getCompositeForeignKeys(SKUAttributes).find(
      candidate => candidate.name === 'attribute_value_consistency'
    );

    expect(targetIndex).toMatchObject({ properties: ['attributeId', 'id'], unique: true });
    expect(foreignKey).toEqual({
      name: 'attribute_value_consistency',
      properties: ['attributeId', 'valueId'],
      mappedEntity: 'AttributeValue',
      mappedNamespace: 'shop',
      mappedProperties: ['attributeId', 'id']
    });
  });

  it('declares the composite foreign key that makes both one-to-one columns agree', () => {
    const targetIndex = getEntityMetadata(IdCard).indexes.find(candidate => candidate.name === 'card_owner_identity');
    const foreignKey = getCompositeForeignKeys(User).find(candidate => candidate.name === 'id_card_owner_consistency');

    expect(targetIndex).toMatchObject({ properties: ['id', 'ownerId'], unique: true });
    expect(foreignKey).toEqual({
      name: 'id_card_owner_consistency',
      properties: ['idCardId', 'id'],
      mappedEntity: 'IdCard',
      mappedNamespace: 'shop',
      mappedProperties: ['id', 'ownerId']
    });
  });
});
