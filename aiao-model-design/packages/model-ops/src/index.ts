/**
 * 模型设计器的模型操作：快照类型、建模操作的应用与校验、两个快照的差异与概要。
 *
 * 设计器（浏览器）与建模智能体（Trigger.dev）共用这一份纯函数，不依赖浏览器、Angular 或服务端入口。
 *
 * @packageDocumentation
 */
export { applyOps } from './apply';
export { describeChanges, diffSnapshots, type FieldChange, type ModelChange } from './diff';
export {
  ENTITY_NAME_PATTERN,
  PROPERTY_NAME_PATTERN,
  RESERVED_FIELD_NAMES,
  entityNameProblem,
  fieldNameProblem
} from './naming';
export { outlineModel } from './outline';
export { hasModelOps, type ModelToolOutput } from './tool-output';
export {
  INVERSE_KIND,
  ON_DELETE_ACTIONS,
  PROPERTY_TYPES,
  RELATION_KINDS,
  type ApplyOpsResult,
  type EntityChanges,
  type ModelOp,
  type ModelOpError,
  type ModelSnapshot,
  type OnDeleteActionName,
  type PropertyChanges,
  type PropertyTypeName,
  type RelationKindName,
  type SnapshotEntity,
  type SnapshotIndex,
  type SnapshotProperty,
  type SnapshotRelation
} from './types';
export { validateModel } from './validate';
