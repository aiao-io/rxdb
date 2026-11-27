/**
 * @fileoverview 实体界面能力派生（US-027 实体级、US-029 按行）
 *
 * 实体管理界面的「新增 / 编辑 / 删除」入口只读这一份结论，结论只来自实体的 `permissions` 声明与授权快照：
 * 是不是系统表、在哪个命名空间都不参与——系统表已经显式声明三项都为 `'system'`。
 *
 * 规则形式（`{ requires }`，US-029）的操作看授权快照：实体级看「有没有一个带该前缀的作用域有所需权限」，
 * 按行看「这一行所属的作用域有没有」。快照没传或还没取到时，规则形式一律关闭，与写入口的 fail-closed 同口径。
 */

import {
  ENTITY_OPERATIONS,
  getEntityAccessScope,
  getEntityPermission,
  getEntityPermissionRule,
  type EntityAccessScope,
  type EntityMetadata,
  type EntityOperation,
  type RxDBGrantSnapshot
} from '@aiao/rxdb';

/**
 * 实体在公开写入口上允许的界面操作
 */
export interface EntityCapabilities {
  /** 可新增：`create` 为 `'both'`；规则形式时快照里有一个带该前缀的作用域有所需权限 */
  readonly canCreate: boolean;
  /** 已有行可编辑：`update` 为 `'both'`；规则形式时同上（具体哪一行可编辑见 {@link deriveRowCapabilities}） */
  readonly canEdit: boolean;
  /** 已有行可删除：`delete` 为 `'both'`；规则形式时同上 */
  readonly canDelete: boolean;
}

/** {@link deriveEntityCapabilities} 的实例侧上下文。 */
export interface EntityCapabilityContext {
  /**
   * 实体所在的实例是只读的（`rxdb.readOnly`，如只读检出位，US-313）：三项全关。
   *
   * @remarks
   * 只读实例的公开写入口一律抛 `RxDBReadOnlyError`，出了写控件也只会点出一个错误。
   */
  readonly readOnly?: boolean;
  /**
   * 授权快照（`rxdb.grants.snapshot`，US-029）：规则形式的操作按它派生
   *
   * @remarks
   * 没传与快照未取到一样，规则形式一律关闭。界面要随快照变化重算（订阅 `rxdb.grants.snapshot$`）。
   */
  readonly grants?: RxDBGrantSnapshot;
}

/**
 * 某个操作在界面上不可用的原因
 *
 * - `'read-only-instance'`：实例只读
 * - `'system'`：只许系统写
 * - `'grants-unknown'`：规则形式而授权快照还没取到
 * - `'missing-permission'`：规则形式而快照在这一行（实体级：任何一个）作用域上没有所需权限
 */
export type CapabilityDeniedReason = 'read-only-instance' | 'system' | 'grants-unknown' | 'missing-permission';

/** 一行能不能编辑、能不能删除，不能时的原因 */
export interface RowCapabilities {
  /** 这一行可编辑；否则行只读、详情以查看模式打开 */
  readonly canEdit: boolean;
  /** 这一行可删除 */
  readonly canDelete: boolean;
  /** 不可编辑的原因；可编辑时没有 */
  readonly editReason?: CapabilityDeniedReason;
  /** 不可删除的原因；可删除时没有 */
  readonly deleteReason?: CapabilityDeniedReason;
}

/**
 * 整个实体的写入口都关着、要告诉用户为什么时的原因
 *
 * - `'read-only-instance'`：实例只读
 * - `'grants-unknown'`：实体有规则形式的操作，而授权快照还没取到
 */
export type EntityWriteBlockedReason = 'read-only-instance' | 'grants-unknown';

type Declared = Pick<EntityMetadata, 'permissions' | 'access'>;

/** 规则形式的放行判据：快照已取到，看候选作用域里有没有所需权限 */
type RuleAllows = (grants: RxDBGrantSnapshot, requires: string, scope: EntityAccessScope) => boolean;

const reasonOf = (
  metadata: Declared,
  operation: EntityOperation,
  context: EntityCapabilityContext,
  allows: RuleAllows
): CapabilityDeniedReason | undefined => {
  if (context.readOnly === true) return 'read-only-instance';
  const permission = getEntityPermission(metadata, operation);
  if (permission === 'both') return undefined;
  if (permission === 'system') return 'system';
  const { grants } = context;
  if (grants === undefined || grants.status === 'unknown') return 'grants-unknown';
  const scope = getEntityAccessScope(metadata);
  return scope !== undefined && allows(grants, permission.requires, scope) ? undefined : 'missing-permission';
};

/** 实体级：快照里有一个带该前缀的作用域有所需权限（`user:` 区的 edit 不能让 `tenant:` 实体开入口） */
const anyScopeAllows: RuleAllows = (grants, requires, { prefix }) =>
  grants.grants.some(grant => grant.scope.startsWith(prefix) && grant.permissions.includes(requires));

/** 按行：这一行的作用域属性拼出的作用域键上有所需权限 */
const rowScopeAllows =
  (record: Readonly<Record<string, unknown>>): RuleAllows =>
  (grants, requires, { property, prefix }) => {
    const value = record[property];
    return typeof value === 'string' && value.length > 0 && grants.has(`${prefix}${value}`, requires);
  };

/**
 * 由实体元数据派生界面能力
 *
 * @param metadata - 实体元数据（只读其中的 `permissions` 与 `access`）
 * @param context - 实例侧上下文，见 {@link EntityCapabilityContext}
 * @returns 三项能力；未声明的操作按 `'both'` 计，即可用
 *
 * @example
 * ```typescript
 * const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice), {
 *   readOnly: rxdb.readOnly,
 *   grants: rxdb.grants.snapshot
 * });
 * ```
 */
export const deriveEntityCapabilities = (
  metadata: Declared,
  context: EntityCapabilityContext = {}
): EntityCapabilities => {
  const can = (operation: EntityOperation) => reasonOf(metadata, operation, context, anyScopeAllows) === undefined;
  return { canCreate: can('create'), canEdit: can('update'), canDelete: can('delete') };
};

/**
 * 一行能不能编辑、能不能删除（US-029）
 *
 * @param metadata - 实体元数据（只读其中的 `permissions` 与 `access`）
 * @param record - 这一行的字段值（表格记录或实体实例）；规则形式按其中的作用域属性取作用域
 * @param context - 实例侧上下文，见 {@link EntityCapabilityContext}
 * @returns 两项能力与不能时的原因；没有规则形式的实体与实体级结论一致、与行无关
 *
 * @remarks
 * 看的是这一行此刻的值。写入口按持久化前像判定，两者在保存之后一致；界面只是快速反馈，被拒以写入口为准。
 */
export const deriveRowCapabilities = (
  metadata: Declared,
  record: Readonly<Record<string, unknown>>,
  context: EntityCapabilityContext = {}
): RowCapabilities => {
  const allows = rowScopeAllows(record);
  const editReason = reasonOf(metadata, 'update', context, allows);
  const deleteReason = reasonOf(metadata, 'delete', context, allows);
  return {
    canEdit: editReason === undefined,
    canDelete: deleteReason === undefined,
    ...(editReason === undefined ? {} : { editReason }),
    ...(deleteReason === undefined ? {} : { deleteReason })
  };
};

/**
 * 整个实体的写入口为什么都关着（US-029 AC#20）：界面据此给出可读的原因
 *
 * @param metadata - 实体元数据（只读其中的 `permissions`）
 * @param context - 实例侧上下文，见 {@link EntityCapabilityContext}
 * @returns 只读实例为 `'read-only-instance'`；有规则形式的操作而快照没传或未取到为 `'grants-unknown'`；否则 `undefined`
 */
export const deriveWriteBlockedReason = (
  metadata: Pick<EntityMetadata, 'permissions'>,
  context: EntityCapabilityContext = {}
): EntityWriteBlockedReason | undefined => {
  if (context.readOnly === true) return 'read-only-instance';
  const hasRule = ENTITY_OPERATIONS.some(operation => getEntityPermissionRule(metadata, operation) !== undefined);
  const known = context.grants !== undefined && context.grants.status === 'known';
  return hasRule && !known ? 'grants-unknown' : undefined;
};
