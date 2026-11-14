/** 设计属性支持的类型，与 DesignProperty.propertyType 的枚举一致。 */
export const PROPERTY_TYPES = [
  'uuid',
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'stringArray',
  'numberArray',
  'keyValue',
  'json',
  'enum'
] as const;

/** 设计属性类型。 */
export type PropertyTypeName = (typeof PROPERTY_TYPES)[number];

/** 关系种类，与 DesignRelation.relationKind 一致。 */
export const RELATION_KINDS = ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'MANY_TO_MANY'] as const;

/** 关系种类。 */
export type RelationKindName = (typeof RELATION_KINDS)[number];

/** 删除目标时的级联策略，与 DesignRelation.onDeleteAction 一致。 */
export const ON_DELETE_ACTIONS = ['NO_ACTION', 'CASCADE', 'SET_NULL', 'RESTRICT'] as const;

/** 删除策略。 */
export type OnDeleteActionName = (typeof ON_DELETE_ACTIONS)[number];

/** 每种关系的逆关系种类，成对关系的两端必须互为逆种类。 */
export const INVERSE_KIND: Readonly<Record<RelationKindName, RelationKindName>> = {
  ONE_TO_ONE: 'ONE_TO_ONE',
  ONE_TO_MANY: 'MANY_TO_ONE',
  MANY_TO_ONE: 'ONE_TO_MANY',
  MANY_TO_MANY: 'MANY_TO_MANY'
};

/** 快照中的属性，字段名与 DesignProperty 一致。 */
export interface SnapshotProperty {
  id: string;
  name: string;
  propertyType: PropertyTypeName;
  displayName: string | null;
  isRequired: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue: string | null;
  enumValues: string[] | null;
}

/** 快照中的关系，`mappedPropertyId` 指向目标实体上的逆关系。 */
export interface SnapshotRelation {
  id: string;
  name: string;
  relationKind: RelationKindName;
  mappedEntityId: string;
  mappedPropertyId: string | null;
  onDeleteAction: OnDeleteActionName | null;
}

/** 快照中的索引。 */
export interface SnapshotIndex {
  id: string;
  propertyIds: string[];
  isUnique: boolean;
}

/** 快照中的实体。 */
export interface SnapshotEntity {
  id: string;
  name: string;
  displayName: string | null;
  entityNamespace: string | null;
  properties: SnapshotProperty[];
  relations: SnapshotRelation[];
  indexes: SnapshotIndex[];
}

/** 浏览器每轮发给智能体的模型快照，也是智能体草稿的形状。 */
export interface ModelSnapshot {
  entities: SnapshotEntity[];
}

/** 实体上可修改的字段。 */
export type EntityChanges = Partial<Pick<SnapshotEntity, 'name' | 'displayName' | 'entityNamespace'>>;

/** 属性上可修改的字段。 */
export type PropertyChanges = Partial<Omit<SnapshotProperty, 'id'>>;

/**
 * 操作日志中的一条操作。
 *
 * 工具输出携带操作数组，浏览器按顺序写入 AI 分支；`applyOps` 在服务端用同一组操作推进草稿。
 * 新增实体只带基本字段，属性、关系、索引都以独立操作追加。
 */
export type ModelOp =
  | { op: 'addEntity'; entity: Omit<SnapshotEntity, 'properties' | 'relations' | 'indexes'> }
  | { op: 'updateEntity'; entityId: string; changes: EntityChanges }
  | { op: 'removeEntity'; entityId: string }
  | { op: 'addProperty'; entityId: string; property: SnapshotProperty }
  | { op: 'updateProperty'; entityId: string; propertyId: string; changes: PropertyChanges }
  | { op: 'removeProperty'; entityId: string; propertyId: string }
  | { op: 'addRelation'; entityId: string; relation: SnapshotRelation }
  | { op: 'removeRelation'; entityId: string; relationId: string }
  | { op: 'addIndex'; entityId: string; index: SnapshotIndex }
  | { op: 'removeIndex'; entityId: string; indexId: string };

/** 操作校验失败的一条原因；`op` 为操作在批次中的下标，批次级检查为 -1。 */
export interface ModelOpError {
  op: number;
  message: string;
}

/** `applyOps` 的结果：成功给出新快照，失败给出全部原因且不改输入。 */
export type ApplyOpsResult = { ok: true; snapshot: ModelSnapshot } | { ok: false; errors: ModelOpError[] };
