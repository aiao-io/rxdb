import type {
  ModelSnapshot,
  PropertyTypeName,
  RelationKindName,
  SnapshotEntity,
  SnapshotIndex,
  SnapshotProperty,
  SnapshotRelation
} from './types';

/** 一个字段从旧值到新值的变化。 */
export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** 两个快照之间的一条变更，全部用名称表述。 */
export type ModelChange =
  | { kind: 'entityAdded'; entity: string }
  | { kind: 'entityRemoved'; entity: string }
  | { kind: 'entityRenamed'; from: string; to: string }
  | { kind: 'entityUpdated'; entity: string; changes: FieldChange[] }
  | { kind: 'propertyAdded'; entity: string; property: string; propertyType: PropertyTypeName }
  | { kind: 'propertyRemoved'; entity: string; property: string }
  | { kind: 'propertyRenamed'; entity: string; from: string; to: string }
  | { kind: 'propertyUpdated'; entity: string; property: string; changes: FieldChange[] }
  | { kind: 'relationAdded'; entity: string; relation: string; relationKind: RelationKindName; target: string }
  | { kind: 'relationRemoved'; entity: string; relation: string; target: string }
  | { kind: 'relationUpdated'; entity: string; relation: string; changes: FieldChange[] }
  | { kind: 'indexAdded'; entity: string; properties: string[]; isUnique: boolean }
  | { kind: 'indexRemoved'; entity: string; properties: string[] };

const ENTITY_FIELDS = ['displayName', 'entityNamespace'] as const;
const PROPERTY_FIELDS = [
  'propertyType',
  'displayName',
  'isRequired',
  'isNullable',
  'isUnique',
  'defaultValue',
  'enumValues'
] as const;

function fieldChanges<T>(before: T, after: T, fields: readonly (keyof T & string)[]): FieldChange[] {
  return fields
    .filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map(field => ({ field, from: before[field], to: after[field] }));
}

function entityName(snapshot: ModelSnapshot, id: string): string {
  return snapshot.entities.find(entity => entity.id === id)?.name ?? id;
}

function indexProperties(entity: SnapshotEntity, index: SnapshotIndex): string[] {
  return index.propertyIds.map(id => entity.properties.find(property => property.id === id)?.name ?? id);
}

function byId<T extends { id: string }>(items: readonly T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

function propertyChanges(entity: string, before: SnapshotProperty[], after: SnapshotProperty[]): ModelChange[] {
  const existing = before.flatMap((previous): ModelChange[] => {
    const next = byId(after, previous.id);
    if (!next) return [{ kind: 'propertyRemoved', entity, property: previous.name }];
    const changes = fieldChanges(previous, next, PROPERTY_FIELDS);
    return [
      ...(previous.name === next.name ?
        []
      : [{ kind: 'propertyRenamed', entity, from: previous.name, to: next.name } as const]),
      ...(changes.length ? [{ kind: 'propertyUpdated', entity, property: next.name, changes } as const] : [])
    ];
  });
  const added = after
    .filter(next => !byId(before, next.id))
    .map((next): ModelChange => ({
      kind: 'propertyAdded',
      entity,
      property: next.name,
      propertyType: next.propertyType
    }));
  return [...existing, ...added];
}

function relationChanges(
  snapshots: { before: ModelSnapshot; after: ModelSnapshot },
  entity: string,
  lists: { before: SnapshotRelation[]; after: SnapshotRelation[] }
): ModelChange[] {
  const targetChange = (previous: SnapshotRelation, next: SnapshotRelation): FieldChange => ({
    field: 'target',
    from: entityName(snapshots.before, previous.mappedEntityId),
    to: entityName(snapshots.after, next.mappedEntityId)
  });
  const existing = lists.before.flatMap((previous): ModelChange[] => {
    const next = byId(lists.after, previous.id);
    const target = entityName(snapshots.before, previous.mappedEntityId);
    if (!next) return [{ kind: 'relationRemoved', entity, relation: previous.name, target }];
    const changes = fieldChanges(previous, next, ['name', 'relationKind', 'mappedEntityId', 'onDeleteAction']).map(
      change => (change.field === 'mappedEntityId' ? targetChange(previous, next) : change)
    );
    return changes.length ? [{ kind: 'relationUpdated', entity, relation: next.name, changes }] : [];
  });
  const added = lists.after
    .filter(next => !byId(lists.before, next.id))
    .map((next): ModelChange => ({
      kind: 'relationAdded',
      entity,
      relation: next.name,
      relationKind: next.relationKind,
      target: entityName(snapshots.after, next.mappedEntityId)
    }));
  return [...existing, ...added];
}

function indexChanges(entity: string, before: SnapshotEntity, after: SnapshotEntity): ModelChange[] {
  const removed = before.indexes
    .filter(index => !byId(after.indexes, index.id))
    .map((index): ModelChange => ({ kind: 'indexRemoved', entity, properties: indexProperties(before, index) }));
  const added = after.indexes
    .filter(index => !byId(before.indexes, index.id))
    .map((index): ModelChange => ({
      kind: 'indexAdded',
      entity,
      properties: indexProperties(after, index),
      isUnique: index.isUnique
    }));
  return [...removed, ...added];
}

function entityChanges(
  snapshots: { before: ModelSnapshot; after: ModelSnapshot },
  previous: SnapshotEntity
): ModelChange[] {
  const next = byId(snapshots.after.entities, previous.id);
  if (!next) return [{ kind: 'entityRemoved', entity: previous.name }];
  const changes = fieldChanges(previous, next, ENTITY_FIELDS);
  return [
    ...(previous.name === next.name ? [] : [{ kind: 'entityRenamed', from: previous.name, to: next.name } as const]),
    ...(changes.length ? [{ kind: 'entityUpdated', entity: next.name, changes } as const] : []),
    ...propertyChanges(next.name, previous.properties, next.properties),
    ...relationChanges(snapshots, next.name, { before: previous.relations, after: next.relations }),
    ...indexChanges(next.name, previous, next)
  ];
}

/**
 * 按 ID 比较两个快照，返回从 `before` 到 `after` 的变更。
 *
 * 先列既有实体上的删除、改名与修改（按 `before` 的顺序），再列新增的实体。新增实体只报一条，
 * 不再展开它自带的属性和关系。
 */
export function diffSnapshots(before: ModelSnapshot, after: ModelSnapshot): ModelChange[] {
  const snapshots = { before, after };
  const added = after.entities
    .filter(entity => !byId(before.entities, entity.id))
    .map((entity): ModelChange => ({ kind: 'entityAdded', entity: entity.name }));
  return [...before.entities.flatMap(entity => entityChanges(snapshots, entity)), ...added];
}

function fieldsText(changes: FieldChange[]): string {
  return changes.map(({ field, from, to }) => `${field} ${JSON.stringify(from)} → ${JSON.stringify(to)}`).join('，');
}

const DESCRIBE: { [K in ModelChange['kind']]: (change: Extract<ModelChange, { kind: K }>) => string } = {
  entityAdded: change => `新增实体 ${change.entity}`,
  entityRemoved: change => `删除实体 ${change.entity}`,
  entityRenamed: change => `实体 ${change.from} 改名为 ${change.to}`,
  entityUpdated: change => `修改实体 ${change.entity}：${fieldsText(change.changes)}`,
  propertyAdded: change => `新增属性 ${change.entity}.${change.property}（${change.propertyType}）`,
  propertyRemoved: change => `删除属性 ${change.entity}.${change.property}`,
  propertyRenamed: change => `属性 ${change.entity}.${change.from} 改名为 ${change.to}`,
  propertyUpdated: change => `修改属性 ${change.entity}.${change.property}：${fieldsText(change.changes)}`,
  relationAdded: change => `新增关系 ${change.entity}.${change.relation}（${change.relationKind} → ${change.target}）`,
  relationRemoved: change => `删除关系 ${change.entity}.${change.relation}（→ ${change.target}）`,
  relationUpdated: change => `修改关系 ${change.entity}.${change.relation}：${fieldsText(change.changes)}`,
  indexAdded: change => `新增${change.isUnique ? '唯一' : ''}索引 ${change.entity}(${change.properties.join(', ')})`,
  indexRemoved: change => `删除索引 ${change.entity}(${change.properties.join(', ')})`
};

function describeChange<K extends ModelChange['kind']>(change: Extract<ModelChange, { kind: K }>): string {
  return (DESCRIBE[change.kind] as (item: typeof change) => string)(change);
}

/** 把变更写成逐行的可读说明，供回读块使用。 */
export function describeChanges(changes: readonly ModelChange[]): string[] {
  return changes.map(change => describeChange(change));
}
