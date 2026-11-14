import { getInheritedProperties } from '../../constants';
import type { EntityNodeData, EntityNodeField } from '../../interfaces/designer.interface';
import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';

/** 根据实体、属性、关系构建 EntityNodeData，用于 ER 图画布节点 */
export function toNodeData(
  entity: DesignEntity,
  properties: DesignProperty[],
  relations: DesignRelation[],
  nameMap: Map<string, string>,
  selected: boolean,
  invalidRelationIds: ReadonlySet<string>,
  invalidPropertyIds: ReadonlySet<string> = new Set()
): EntityNodeData {
  const allInherited = getInheritedProperties(entity.extendsBase);

  const inheritedFields: EntityNodeField[] = allInherited
    .filter(p => p.category === 'property')
    .map(p => ({
      name: p.name,
      type: p.type,
      keyType: p.name === 'id' ? ('primary' as const) : undefined,
      inherited: true,
      category: 'property' as const
    }));

  const inheritedRelationFields: EntityNodeField[] = allInherited
    .filter(p => p.category === 'relation')
    .map(p => ({
      id: `tree:${p.name}:${entity.id}`,
      name: p.name,
      type: p.type === 'OneToMany' ? `${entity.name}[]` : entity.name,
      keyType: 'foreign' as const,
      ref: { entity: entity.name, field: 'id' },
      inherited: true,
      category: 'relation' as const
    }));

  const customFields: EntityNodeField[] = properties.map(p => ({
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    type: p.propertyType,
    keyType: p.isUnique ? ('unique' as const) : undefined,
    inherited: false,
    invalid: invalidPropertyIds.has(p.id),
    category: 'property' as const
  }));

  const relationFields: EntityNodeField[] = relations.map(r => {
    const targetName = nameMap.get(r.mappedEntityId ?? '') ?? r.mappedEntityId ?? '';
    return {
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      type: r.relationKind === 'ONE_TO_MANY' || r.relationKind === 'MANY_TO_MANY' ? `${targetName}[]` : targetName,
      keyType: 'foreign' as const,
      ref: { entity: targetName, field: 'id' },
      inherited: false,
      invalid: invalidRelationIds.has(r.id),
      category: 'relation' as const
    };
  });

  return {
    id: entity.id,
    name: entity.name,
    displayName: entity.displayName ?? null,
    extendsBase: entity.extendsBase,
    fields: [...inheritedFields, ...customFields, ...inheritedRelationFields, ...relationFields],
    selected
  };
}
