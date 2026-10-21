import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * 工作台预置的轻量资产数据场景：分类 → 资产 → 维护记录。
 *
 * @remarks 这是工作台自带的「会持续维护的真实数据」场景（US-526 In Scope）：
 * 三类实体有关联链（详情显示关联字段的值、筛选可用关联字段条件），
 * 不是一次性演示种子。实体可见性由 `entity-registry` 的命名空间清单派生，
 * 新增实体只需在此声明并加入 {@link ENTITIES}。
 */

@Entity({
  name: 'AssetCategory',
  namespace: 'assets',
  tableName: 'asset_category',
  displayName: '资产分类',
  properties: [
    { name: 'name', type: PropertyType.string, unique: true, required: true, displayName: '分类名' },
    { name: 'description', type: PropertyType.string, displayName: '说明', nullable: true }
  ],
  relations: [
    {
      name: 'assets',
      displayName: '资产',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Asset',
      mappedProperty: 'category'
    }
  ]
})
export class AssetCategory extends EntityBase {
  name!: string;
  description?: string;
}

@Entity({
  name: 'Asset',
  namespace: 'assets',
  tableName: 'asset',
  displayName: '资产',
  properties: [
    { name: 'name', type: PropertyType.string, unique: true, required: true, displayName: '名称' },
    { name: 'status', type: PropertyType.string, displayName: '状态', default: '在用', nullable: true },
    { name: 'purchasePrice', type: PropertyType.number, displayName: '购入价', nullable: true },
    { name: 'purchaseDate', type: PropertyType.string, displayName: '购入日期', nullable: true }
  ],
  relations: [
    {
      name: 'category',
      displayName: '分类',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AssetCategory',
      mappedProperty: 'assets'
    },
    {
      name: 'events',
      displayName: '维护记录',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'AssetEvent',
      mappedProperty: 'asset'
    }
  ]
})
export class Asset extends EntityBase {
  name!: string;
  status?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  categoryId!: string;
}

@Entity({
  name: 'AssetEvent',
  namespace: 'assets',
  tableName: 'asset_event',
  displayName: '维护记录',
  properties: [
    { name: 'summary', type: PropertyType.string, required: true, displayName: '事项' },
    { name: 'cost', type: PropertyType.number, displayName: '费用', nullable: true },
    { name: 'happenedAt', type: PropertyType.string, required: true, displayName: '日期' }
  ],
  relations: [
    {
      name: 'asset',
      displayName: '所属资产',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Asset',
      mappedProperty: 'events'
    }
  ]
})
export class AssetEvent extends EntityBase {
  summary!: string;
  cost?: number;
  happenedAt!: string;
  assetId!: string;
}

/** 工作台注册的全部实体（排序影响导航顺序，见 entity-registry 的排序规则）。 */
export const ENTITIES = [AssetCategory, Asset, AssetEvent] as const;
