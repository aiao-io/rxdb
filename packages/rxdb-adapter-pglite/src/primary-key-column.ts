/**
 * @fileoverview 业务表的主键物理列：主键属性名恒为 `id`，物理列名可被 `columnName` 改写
 *
 * @remarks
 * 拼进业务表 SQL 的主键列都从这里取：仓库写入的 `WHERE`、按行号回查、变更触发器里的 `NEW.` / `OLD.`、
 * 版本切换的删除与冲突目标。写死字面量 `id` 的那一处，在自定义主键列上报 `column "id" does not exist`
 *（触发器里报 `record "new" has no field "id"`）。sqlite-core 同一口径的是 `get_primary_key_column`（SQLC-014）。
 *
 * 系统表（变更日志、分支、迁移）的主键列就叫 `id`，它们的 SQL 不经这里。
 */
import type { EntityMetadata, EntityPropertyMetadata } from '@aiao/rxdb';
import { quoteIdentifier } from './pglite.utils.js';

/**
 * 实体的主键属性。
 *
 * @param metadata - 实体元数据
 * @returns `id` 属性的元数据，`columnName` 已由元数据归一化填好
 * @throws TypeError 元数据里没有 `id` 属性
 *
 * @remarks
 * 真实实体都经 `EntityBase` 或系统实体带着 `id`；缺了是元数据装配坏了，不回落到字面量 `id`。
 */
export const requireIdProperty = (metadata: EntityMetadata): EntityPropertyMetadata => {
  const idProperty = metadata.propertyMap.get('id');
  if (!idProperty) throw new TypeError(`Missing id metadata for ${metadata.namespace}.${metadata.name}`);
  return idProperty;
};

/**
 * 主键物理列，已加双引号。
 *
 * @param metadata - 实体元数据
 * @returns 形如 `"row_key"` 的标识符
 * @throws TypeError 同 {@link requireIdProperty}
 */
export const primaryKeyColumnSql = (metadata: EntityMetadata): string =>
  quoteIdentifier(requireIdProperty(metadata).columnName);
