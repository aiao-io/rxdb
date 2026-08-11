/**
 * @fileoverview 树形实体的数值 ID 公开契约（RXD-069）
 *
 * `IEntity.id` 早已迁到 {@link RxDBEntityId}（`string | number | bigint`），
 * 但 `ITreeEntity.parentId` 一度仍是 `UUID`，导致同一个接口内部不自洽：
 * 树节点的 `id` 可以是数值、`parentId` 却只能是字符串，用户根本无法以类型安全
 * 的方式声明一棵「数值主键的树」，测试也只能靠 `0 as unknown as string` 绕过。
 *
 * 本 spec 锁定迁移后的契约：
 * - `ITreeEntity.parentId` 与 `IEntity.id` 同为 `RxDBEntityId`；
 * - `TreeAdjacencyListEntityBase<Id>` 与 `EntityBase<Id>` 一样按 ID 泛型收窄，
 *   子类拿到的 `parentId` 精确到自己的 ID 类型，而不是被放宽成联合类型；
 * - 数值主键（含边界值 `0`）能走完整的装饰器 / 元数据链路。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import type { EntityStaticType, IEntity, RxDBEntityId, UUID } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import type { ISortableTreeEntity, ITreeEntity } from '../../entity/tree-entity.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';

@TreeEntity({
  name: 'NumericTreeNode',
  properties: [
    { name: 'id', type: PropertyType.integer, primary: true, readonly: true },
    { name: 'title', type: PropertyType.string }
  ]
})
class NumericTreeNode extends TreeAdjacencyListEntityBase<number> {
  declare title?: string;
}

@TreeEntity({
  name: 'UuidTreeNode',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class UuidTreeNode extends TreeAdjacencyListEntityBase {
  declare title?: string;
}

describe('树形实体的数值 ID 公开契约（RXD-069）', () => {
  it('ITreeEntity.parentId 与 IEntity.id 用同一个 ID 域', () => {
    expectTypeOf<ITreeEntity['parentId']>().toEqualTypeOf<RxDBEntityId | null | undefined>();
    expectTypeOf<ISortableTreeEntity['parentId']>().toEqualTypeOf<RxDBEntityId | null | undefined>();
    expectTypeOf<ITreeEntity['id']>().toEqualTypeOf<IEntity['id']>();
  });

  it('TreeAdjacencyListEntityBase 的 parentId 跟随 ID 泛型收窄', () => {
    expectTypeOf<NumericTreeNode['id']>().toEqualTypeOf<number>();
    expectTypeOf<NumericTreeNode['parentId']>().toEqualTypeOf<number | null | undefined>();
    expectTypeOf<UuidTreeNode['id']>().toEqualTypeOf<UUID>();
    expectTypeOf<UuidTreeNode['parentId']>().toEqualTypeOf<UUID | null | undefined>();
  });

  it('数值 ID 树实体的 idType 推导为 number', () => {
    expectTypeOf<EntityStaticType<typeof NumericTreeNode, 'idType'>>().toEqualTypeOf<number>();
    expectTypeOf<EntityStaticType<typeof UuidTreeNode, 'idType'>>().toEqualTypeOf<UUID>();
  });

  it('数值 ID 树实体仍然是 ITreeEntity / EntityBase 的子类型', () => {
    expectTypeOf<NumericTreeNode>().toExtend<ITreeEntity>();
    expectTypeOf<NumericTreeNode>().toExtend<EntityBase<number>>();
    expectTypeOf<UuidTreeNode>().toExtend<EntityBase>();
  });

  it('parentId 可以直接写入数值（含边界值 0），无需 cast', () => {
    const node = Object.create(NumericTreeNode.prototype) as NumericTreeNode;
    node.parentId = 0;
    expect(node.parentId).toBe(0);
    node.parentId = null;
    expect(node.parentId).toBeNull();
  });

  it('数值主键覆盖基类的 uuid 主键元数据，并保留邻接表树形特征', () => {
    const metadata = getEntityMetadata(NumericTreeNode);
    expect(metadata.propertyMap.get('id')).toMatchObject({ type: PropertyType.integer, primary: true });
    expect(metadata.features?.tree?.type).toBe('adjacency-list');
    expect(metadata.relationMap.get('parent')).toMatchObject({ columnName: 'parentId' });
    expect(metadata.repository).toBe('TreeRepository');
  });
});
