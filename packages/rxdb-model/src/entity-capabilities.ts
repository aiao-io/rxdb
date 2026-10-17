/**
 * @fileoverview 实体界面能力派生（US-027）
 *
 * 实体管理界面的「新增 / 编辑 / 删除」入口只读这一份结论，结论只来自实体的 `permissions` 声明：
 * 是不是系统表、在哪个命名空间都不参与——系统表已经显式声明三项都为 `'system'`。
 */

import { type EntityMetadata, getEntityPermission } from '@aiao/rxdb';

/**
 * 实体在公开写入口上允许的界面操作
 */
export interface EntityCapabilities {
  /** 可新增：`create` 为 `'both'` */
  readonly canCreate: boolean;
  /** 已有行可编辑：`update` 为 `'both'`；否则行只读、详情以查看模式打开 */
  readonly canEdit: boolean;
  /** 已有行可删除：`delete` 为 `'both'` */
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
}

/**
 * 由实体元数据派生界面能力
 *
 * @param metadata - 实体元数据（只读其中的 `permissions`）
 * @param context - 实例侧上下文，见 {@link EntityCapabilityContext}
 * @returns 三项能力；未声明的操作按 `'both'` 计，即可用
 *
 * @example
 * ```typescript
 * const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice), {
 *   readOnly: rxdb.readOnly
 * });
 * ```
 */
export const deriveEntityCapabilities = (
  metadata: Pick<EntityMetadata, 'permissions'>,
  context: EntityCapabilityContext = {}
): EntityCapabilities => {
  if (context.readOnly === true) return { canCreate: false, canEdit: false, canDelete: false };
  return {
    canCreate: getEntityPermission(metadata, 'create') === 'both',
    canEdit: getEntityPermission(metadata, 'update') === 'both',
    canDelete: getEntityPermission(metadata, 'delete') === 'both'
  };
};
