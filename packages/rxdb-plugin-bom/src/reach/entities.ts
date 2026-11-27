import { Entity, EntityBase, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';
import { BomHeader, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';

/** 物料并集图的源实体：判环与可达维护读取的四张表，缺任一张并集边集即为空。 */
export const BOM_GRAPH_ENTITIES = [BomItemRevision, BomHeader, BomLine, BomLineOccurrence] as const;

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
