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
