import { entityNameProblem, fieldNameProblem } from './naming';
import { INVERSE_KIND, type ModelSnapshot, type SnapshotEntity, type SnapshotProperty, type SnapshotRelation } from './types';

function propertyIssues(entity: SnapshotEntity, property: SnapshotProperty): string[] {
  const label = `${entity.name}.${property.name}`;
  const nameProblem = fieldNameProblem(property.name);
  const values = property.enumValues ?? [];
  return [
    ...(nameProblem ? [`属性 ${label}：${nameProblem}`] : []),
    ...(property.propertyType === 'enum' && !values.length ? [`枚举属性 ${label} 必须提供枚举选项`] : []),
    ...(property.propertyType !== 'enum' && values.length ? [`属性 ${label} 不是枚举类型，不能带枚举选项`] : []),
    ...(new Set(values).size === values.length ? [] : [`枚举属性 ${label} 的选项有重复`])
  ];
}

function duplicateFieldIssues(entity: SnapshotEntity): string[] {
  const names = [...entity.properties, ...entity.relations].map(field => field.name);
  return names.filter((name, index) => names.indexOf(name) !== index).map(name => `字段 ${entity.name}.${name} 已存在`);
}

function pairingIssue(snapshot: ModelSnapshot, entity: SnapshotEntity, relation: SnapshotRelation): string | null {
  const label = `${entity.name}.${relation.name}`;
  const target = snapshot.entities.find(item => item.id === relation.mappedEntityId);
  if (!target) return `关系 ${label} 的目标实体 ${relation.mappedEntityId} 不存在`;
  if (!relation.mappedPropertyId) return `关系 ${label} 缺少逆关系`;
  const inverse = target.relations.find(item => item.id === relation.mappedPropertyId);
  if (!inverse) return `关系 ${label} 的逆关系 ${relation.mappedPropertyId} 不存在于 ${target.name}`;
  if (inverse.mappedPropertyId !== relation.id || inverse.mappedEntityId !== entity.id)
    return `关系 ${label} 的逆关系 ${target.name}.${inverse.name} 没有指回`;
  const expected = INVERSE_KIND[relation.relationKind];
  if (inverse.relationKind === expected) return null;
  return `关系 ${label} 为 ${relation.relationKind}，逆关系 ${target.name}.${inverse.name} 应为 ${expected}`;
}

function relationIssues(snapshot: ModelSnapshot, entity: SnapshotEntity, relation: SnapshotRelation): string[] {
  const nameProblem = fieldNameProblem(relation.name);
  const pairing = pairingIssue(snapshot, entity, relation);
  return [
    ...(nameProblem ? [`关系 ${entity.name}.${relation.name}：${nameProblem}`] : []),
    ...(pairing ? [pairing] : [])
  ];
}

function indexIssues(entity: SnapshotEntity): string[] {
  return entity.indexes.flatMap(index => {
    if (!index.propertyIds.length) return [`实体 ${entity.name} 的索引 ${index.id} 至少引用一个属性`];
    return index.propertyIds
      .filter(id => !entity.properties.some(property => property.id === id))
      .map(id => `实体 ${entity.name} 的索引 ${index.id} 引用了不存在的属性 ${id}`);
  });
}

function entityIssues(snapshot: ModelSnapshot, entity: SnapshotEntity): string[] {
  const nameProblem = entityNameProblem(entity.name);
  return [
    ...(nameProblem ? [nameProblem] : []),
    ...(entity.properties.length ? [] : [`实体 ${entity.name} 没有任何属性（基类字段除外）`]),
    ...entity.properties.flatMap(property => propertyIssues(entity, property)),
    ...duplicateFieldIssues(entity),
    ...entity.relations.flatMap(relation => relationIssues(snapshot, entity, relation)),
    ...indexIssues(entity)
  ];
}

/**
 * 整体检查模型，逐条返回问题；没有问题时返回空数组。
 *
 * 与 `applyOps` 只检查本批改动不同，这里检查整个模型，包括用户手工留下的问题。
 */
export function validateModel(snapshot: ModelSnapshot): string[] {
  const names = snapshot.entities.map(entity => entity.name);
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  return [
    ...snapshot.entities.flatMap(entity => entityIssues(snapshot, entity)),
    ...duplicates.map(name => `实体名 ${name} 重复`)
  ];
}
