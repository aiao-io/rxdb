import type { ModelSnapshot, SnapshotEntity, SnapshotProperty, SnapshotRelation } from './types';

function propertyLine(property: SnapshotProperty): string {
  const type =
    property.propertyType === 'enum' ? `enum(${(property.enumValues ?? []).join('|')})` : property.propertyType;
  const parts = [
    `${property.name}: ${type}`,
    ...(property.isRequired ? ['required'] : []),
    ...(property.isNullable ? ['nullable'] : []),
    ...(property.isUnique ? ['unique'] : []),
    ...(property.defaultValue === null ? [] : [`default=${property.defaultValue}`]),
    ...(property.displayName ? [`「${property.displayName}」`] : [])
  ];
  return `  ${parts.join(' ')}`;
}

function relationLine(snapshot: ModelSnapshot, relation: SnapshotRelation): string {
  const target = snapshot.entities.find(entity => entity.id === relation.mappedEntityId);
  const inverse = target?.relations.find(item => item.id === relation.mappedPropertyId);
  const parts = [
    `${relation.name} → ${target?.name ?? `<缺失:${relation.mappedEntityId}>`}`,
    relation.relationKind,
    `inverse=${inverse?.name ?? '<无>'}`,
    ...(relation.onDeleteAction ? [`onDelete=${relation.onDeleteAction}`] : [])
  ];
  return `  ${parts.join(' ')}`;
}

function entityLines(snapshot: ModelSnapshot, entity: SnapshotEntity): string[] {
  const title = `${entity.name}${entity.displayName ? `「${entity.displayName}」` : ''}`;
  const header = entity.entityNamespace ? `${title} namespace=${entity.entityNamespace}` : title;
  const propertyName = (id: string) => entity.properties.find(property => property.id === id)?.name ?? id;
  return [
    header,
    ...entity.properties.map(propertyLine),
    ...entity.relations.map(relation => relationLine(snapshot, relation)),
    ...entity.indexes.map(
      index => `  ${index.isUnique ? 'unique ' : ''}index(${index.propertyIds.map(propertyName).join(', ')})`
    )
  ];
}

/**
 * 把模型写成给智能体看的紧凑概要：只用名称，不含 ID。
 *
 * @param only 只输出这些名称的实体；缺省时输出全部实体
 */
export function outlineModel(snapshot: ModelSnapshot, only?: readonly string[]): string {
  const entities = only ? snapshot.entities.filter(entity => only.includes(entity.name)) : snapshot.entities;
  if (!snapshot.entities.length) return '（空模型，还没有实体）';
  return entities.flatMap(entity => entityLines(snapshot, entity)).join('\n');
}
