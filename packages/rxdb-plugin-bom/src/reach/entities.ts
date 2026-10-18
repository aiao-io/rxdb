import { Entity, EntityBase, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

/** 物料并集图的正长度可达对，只由存储层维护，不属于用户主数据。 */
@Entity({
  name: 'BomReach',
  namespace: 'bom',
  tableName: 'bom_reach',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'bomType', type: PropertyType.enum, enum: ['ebom', 'mbom', 'sales'] },
    { name: 'orgId', type: PropertyType.string },
    { name: 'ancestorItemId', type: PropertyType.uuid },
    { name: 'descendantItemId', type: PropertyType.uuid }
  ],
  indexes: [
    { name: 'reach_pair', properties: ['bomType', 'orgId', 'ancestorItemId', 'descendantItemId'], unique: true },
    { name: 'reach_descendant', properties: ['bomType', 'orgId', 'descendantItemId', 'ancestorItemId'] }
  ],
  checks: [
    {
      name: 'reach_positive_length',
      rule: { combinator: 'and', rules: [{ field: 'ancestorItemId', operator: '!=', ref: 'descendantItemId' }] }
    }
  ]
})
export class BomReach extends EntityBase {
  bomType!: 'ebom' | 'mbom' | 'sales';
  orgId!: string;
  ancestorItemId!: string;
  descendantItemId!: string;
}
