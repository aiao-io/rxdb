import { entityNameProblem, fieldNameProblem } from './naming';
import {
  INVERSE_KIND,
  type ApplyOpsResult,
  type ModelOp,
  type ModelOpError,
  type ModelSnapshot,
  type SnapshotEntity,
  type SnapshotProperty,
  type SnapshotRelation
} from './types';

type OpOf<K extends ModelOp['op']> = Extract<ModelOp, { op: K }>;
type Step<K extends ModelOp['op']> = (draft: ModelSnapshot, op: OpOf<K>) => string[];

function allIds(draft: ModelSnapshot): Set<string> {
  return new Set(
    draft.entities.flatMap(entity => [
      entity.id,
      ...entity.properties.map(item => item.id),
      ...entity.relations.map(item => item.id),
      ...entity.indexes.map(item => item.id)
    ])
  );
}

function fieldTaken(entity: SnapshotEntity, name: string, selfId?: string): boolean {
  return [...entity.properties, ...entity.relations].some(field => field.name === name && field.id !== selfId);
}

function entityNameTaken(draft: ModelSnapshot, name: string, selfId?: string): boolean {
  return draft.entities.some(entity => entity.name === name && entity.id !== selfId);
}

function enumProblems(entity: SnapshotEntity, property: SnapshotProperty): string[] {
  const label = `${entity.name}.${property.name}`;
  const values = property.enumValues ?? [];
  if (property.propertyType !== 'enum') return values.length ? [`属性 ${label} 不是枚举类型，不能带枚举选项`] : [];
  if (!values.length) return [`枚举属性 ${label} 必须提供枚举选项`];
  return new Set(values).size === values.length ? [] : [`枚举属性 ${label} 的选项有重复`];
}

function fieldProblems(entity: SnapshotEntity, name: string, selfId?: string): string[] {
  const problem = fieldNameProblem(name);
  if (problem) return [problem];
  return fieldTaken(entity, name, selfId) ? [`字段 ${entity.name}.${name} 已存在`] : [];
}

function idProblems(draft: ModelSnapshot, id: string): string[] {
  return allIds(draft).has(id) ? [`ID ${id} 已被使用`] : [];
}

function withEntity(draft: ModelSnapshot, entityId: string, run: (entity: SnapshotEntity) => string[]): string[] {
  const entity = draft.entities.find(item => item.id === entityId);
  return entity ? run(entity) : [`实体 ${entityId} 不存在`];
}

function commit(problems: string[], mutate: () => void): string[] {
  if (!problems.length) mutate();
  return problems;
}

const addEntity: Step<'addEntity'> = (draft, { entity }) => {
  const nameProblem = entityNameProblem(entity.name);
  const problems = [
    ...(nameProblem ? [nameProblem] : []),
    ...(entityNameTaken(draft, entity.name) ? [`实体 ${entity.name} 已存在`] : []),
    ...idProblems(draft, entity.id)
  ];
  return commit(problems, () => draft.entities.push({ ...entity, properties: [], relations: [], indexes: [] }));
};

const updateEntity: Step<'updateEntity'> = (draft, { entityId, changes }) =>
  withEntity(draft, entityId, entity => {
    const name = changes.name ?? entity.name;
    const nameProblem = name === entity.name ? null : entityNameProblem(name);
    const problems = [
      ...(nameProblem ? [nameProblem] : []),
      ...(entityNameTaken(draft, name, entity.id) ? [`实体 ${name} 已存在`] : [])
    ];
    return commit(problems, () => Object.assign(entity, changes));
  });

const removeEntity: Step<'removeEntity'> = (draft, { entityId }) =>
  withEntity(draft, entityId, entity => {
    const inbound = draft.entities
      .filter(other => other.id !== entity.id)
      .flatMap(other => other.relations.filter(rel => rel.mappedEntityId === entity.id).map(rel => `${other.name}.${rel.name}`));
    const problems = inbound.map(source => `实体 ${entity.name} 仍被 ${source} 关联，先删除对端关系`);
    return commit(problems, () => draft.entities.splice(draft.entities.indexOf(entity), 1));
  });

const addProperty: Step<'addProperty'> = (draft, { entityId, property }) =>
  withEntity(draft, entityId, entity => {
    const problems = [
      ...fieldProblems(entity, property.name),
      ...idProblems(draft, property.id),
      ...enumProblems(entity, property)
    ];
    return commit(problems, () => entity.properties.push({ ...property }));
  });

const updateProperty: Step<'updateProperty'> = (draft, { entityId, propertyId, changes }) =>
  withEntity(draft, entityId, entity => {
    const current = entity.properties.find(item => item.id === propertyId);
    if (!current) return [`属性 ${propertyId} 不存在于 ${entity.name}`];
    const next = { ...current, ...changes };
    const problems = [
      ...(next.name === current.name ? [] : fieldProblems(entity, next.name, current.id)),
      ...enumProblems(entity, next)
    ];
    return commit(problems, () => Object.assign(current, changes));
  });

const removeProperty: Step<'removeProperty'> = (draft, { entityId, propertyId }) =>
  withEntity(draft, entityId, entity => {
    const current = entity.properties.find(item => item.id === propertyId);
    if (!current) return [`属性 ${propertyId} 不存在于 ${entity.name}`];
    const indexed = entity.indexes.some(index => index.propertyIds.includes(propertyId));
    const problems = indexed ? [`属性 ${entity.name}.${current.name} 仍被索引引用，先删除索引`] : [];
    return commit(problems, () => entity.properties.splice(entity.properties.indexOf(current), 1));
  });

const addRelation: Step<'addRelation'> = (draft, { entityId, relation }) =>
  withEntity(draft, entityId, entity => {
    const targetExists = draft.entities.some(item => item.id === relation.mappedEntityId);
    const problems = [
      ...fieldProblems(entity, relation.name),
      ...idProblems(draft, relation.id),
      ...(targetExists ? [] : [`目标实体 ${relation.mappedEntityId} 不存在`])
    ];
    return commit(problems, () => entity.relations.push({ ...relation }));
  });

const removeRelation: Step<'removeRelation'> = (draft, { entityId, relationId }) =>
  withEntity(draft, entityId, entity => {
    const current = entity.relations.find(item => item.id === relationId);
    if (!current) return [`关系 ${relationId} 不存在于 ${entity.name}`];
    entity.relations.splice(entity.relations.indexOf(current), 1);
    return [];
  });

const addIndex: Step<'addIndex'> = (draft, { entityId, index }) =>
  withEntity(draft, entityId, entity => {
    const missing = index.propertyIds.filter(id => !entity.properties.some(property => property.id === id));
    const problems = [
      ...idProblems(draft, index.id),
      ...(index.propertyIds.length ? [] : ['索引至少引用一个属性']),
      ...missing.map(id => `属性 ${id} 不存在于 ${entity.name}`)
    ];
    return commit(problems, () => entity.indexes.push({ ...index, propertyIds: [...index.propertyIds] }));
  });

const removeIndex: Step<'removeIndex'> = (draft, { entityId, indexId }) =>
  withEntity(draft, entityId, entity => {
    const current = entity.indexes.find(item => item.id === indexId);
    if (!current) return [`索引 ${indexId} 不存在于 ${entity.name}`];
    entity.indexes.splice(entity.indexes.indexOf(current), 1);
    return [];
  });

const STEPS: { [K in ModelOp['op']]: Step<K> } = {
  addEntity,
  updateEntity,
  removeEntity,
  addProperty,
  updateProperty,
  removeProperty,
  addRelation,
  removeRelation,
  addIndex,
  removeIndex
};

function runStep<K extends ModelOp['op']>(draft: ModelSnapshot, op: OpOf<K>): string[] {
  return (STEPS[op.op] as Step<K>)(draft, op);
}

interface LocatedRelation {
  entity: SnapshotEntity;
  relation: SnapshotRelation;
}

function relationsOf(snapshot: ModelSnapshot): Map<string, LocatedRelation> {
  return new Map(
    snapshot.entities.flatMap(entity => entity.relations.map(relation => [relation.id, { entity, relation }] as const))
  );
}

function addedRelationProblem(after: Map<string, LocatedRelation>, { entity, relation }: LocatedRelation): string[] {
  const label = `${entity.name}.${relation.name}`;
  const inverse = relation.mappedPropertyId ? after.get(relation.mappedPropertyId) : undefined;
  const pointsBack =
    inverse?.entity.id === relation.mappedEntityId &&
    inverse.relation.mappedPropertyId === relation.id &&
    inverse.relation.mappedEntityId === entity.id;
  if (!pointsBack) return [`关系 ${label} 的逆关系 ${relation.mappedPropertyId ?? '（未指定）'} 不存在或没有指回`];
  const expected = INVERSE_KIND[relation.relationKind];
  if (inverse.relation.relationKind === expected) return [];
  return [`关系 ${label} 为 ${relation.relationKind}，逆关系 ${inverse.entity.name}.${inverse.relation.name} 应为 ${expected}`];
}

function removedRelationProblem(after: Map<string, LocatedRelation>, { entity, relation }: LocatedRelation): string[] {
  const inverse = relation.mappedPropertyId ? after.get(relation.mappedPropertyId) : undefined;
  if (inverse?.relation.mappedPropertyId !== relation.id) return [];
  return [`删除了 ${entity.name}.${relation.name}，其逆关系 ${inverse.entity.name}.${inverse.relation.name} 需要一起删除`];
}

/** 本批新增的关系必须与逆关系互相指向且种类互逆；本批删除的关系，其仍指回它的逆关系也必须删除。 */
function pairingProblems(before: ModelSnapshot, after: ModelSnapshot): string[] {
  const previous = relationsOf(before);
  const next = relationsOf(after);
  const added = [...next.values()].filter(item => !previous.has(item.relation.id));
  const removed = [...previous.values()].filter(item => !next.has(item.relation.id));
  return [
    ...added.flatMap(item => addedRelationProblem(next, item)),
    ...removed.flatMap(item => removedRelationProblem(next, item))
  ];
}

/**
 * 按顺序把操作应用到快照上。
 *
 * 每条操作都对照前面操作推进后的状态校验；校验失败的操作不生效，其余操作继续检查，
 * 以便一次返回全部原因。全部通过才返回新快照，输入快照始终不变。
 */
export function applyOps(snapshot: ModelSnapshot, ops: readonly ModelOp[]): ApplyOpsResult {
  const draft = structuredClone(snapshot);
  const errors: ModelOpError[] = ops.flatMap((op, index) => runStep(draft, op).map(message => ({ op: index, message })));
  errors.push(...pairingProblems(snapshot, draft).map(message => ({ op: -1, message })));
  return errors.length ? { ok: false, errors } : { ok: true, snapshot: draft };
}
