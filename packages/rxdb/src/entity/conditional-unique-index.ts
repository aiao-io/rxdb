/**
 * @fileoverview 条件唯一索引（US-030 阶段 B）：`EntityIndexMetadataOptions.where`。
 *
 * `where` 与 CHECK 用同一份收窄后的规则组、同一条字面量编译路径（{@link compileCheckRuleGroup}，
 * 含 `ref` 与 AC#9 的白名单）；白名单里只有确定性比较，PG 与 SQLite 的部分索引都接受。
 *
 * 只对 `unique: true` 有意义：本故事交付的是「条件唯一」这一存储约束，不是部分索引的查询优化。
 * 非唯一索引带 `where` 在元数据期拒绝（与 `normalized` 同口径，不静默忽略）。
 *
 * 命名：`uq_` + 表名 + 索引 `name` + 规范化定义 8 位哈希。定义含 namespace、列、`normalized`
 * 与 where 表达式——SQLite 的索引名是库级的，跨 namespace 的同名表必须分得开。约束类索引只走
 * 漂移检查（`checkEntityConstraints`），`reconcileEntityIndexes` 补建时跳过。
 *
 * 违约不新增错误类：与既有唯一冲突同一口径（`isUniqueConstraintViolation`，
 * PG `23505` / SQLite `UNIQUE constraint failed`）。
 */

import { RxDBError } from '../RxDBError.js';
import { quoteSqlIdentifier } from '../system/sql-literal.js';
import { compileCheckRuleGroup } from './check-constraint.js';
import { storageConstraintName } from './constraint-name.js';
import type { EntityIndexMetadata, EntityMetadata } from './metadata.interface.js';

/** 条件唯一索引确定性名字的前缀。 */
export const UNIQUE_INDEX_NAME_PREFIX = 'uq_';

/** 编译后的条件唯一索引：名字、列与 where 谓词，两后端建索引 DDL 与漂移比对共用。 */
export interface CompiledConditionalUniqueIndex {
  /** 确定性索引名（`uq_` 起头，含定义哈希）。 */
  name: string;
  /** 索引列的物理列名（按声明序）。 */
  columns: readonly string[];
  /** 列是否按 `normalized` 口径参与比较（`lower(COALESCE(CAST(列 AS TEXT), ''))`）。 */
  normalized: boolean;
  /** 只拼字面量的 where 谓词（可直接嵌入 `WHERE ...`）。 */
  where: string;
}

/** 索引是否是条件唯一索引（声明了 `where`）。 */
export const isConditionalUniqueIndex = (index: EntityIndexMetadata): boolean => index.where !== undefined;

/** 实体全部条件唯一索引（读 `indexMap`：继承合并后的全集）。 */
export const conditionalUniqueIndexesOf = (metadata: EntityMetadata): EntityIndexMetadata[] =>
  Array.from(metadata.indexMap.values()).filter(isConditionalUniqueIndex);

/** 索引列解析：实体自身属性或关系外键列；不存在的字段在元数据期拒绝。 */
const resolveIndexColumn = (metadata: EntityMetadata, field: string, subject: string): string => {
  const property = metadata.propertyMap.get(field);
  if (property) return property.columnName;
  const foreignKeyIndex = metadata.foreignKeyNames.indexOf(field);
  if (foreignKeyIndex >= 0) return metadata.foreignKeyColumnNames[foreignKeyIndex];
  throw new RxDBError(`${subject} 的列引用了不存在的字段：'${field}'`);
};

/**
 * 编译条件唯一索引。
 *
 * @param metadata - `transitionMetadata()` 产出的实体元数据
 * @param index - 声明了 `where` 的索引
 * @returns 确定性索引名、物理列与 where 谓词
 * @throws {@link RxDBError} 没有 `unique`、列不存在、where 不在单行白名单内、
 *   索引 `name` 不合 `[a-z][a-z0-9_]*` 或整名超 63 字节时（AC#9 / AC#15）
 */
export const compileConditionalUniqueIndex = (
  metadata: EntityMetadata,
  index: EntityIndexMetadata
): CompiledConditionalUniqueIndex => {
  const subject = `条件唯一索引 ${index.name}`;
  if (index.unique !== true) {
    throw new RxDBError(`${subject} 声明了 where 却没有 unique：where 只用于条件唯一约束，非唯一索引不接受`);
  }
  const fields = index.properties?.length ? index.properties : [index.name];
  const columns = fields.map(field => resolveIndexColumn(metadata, field, subject));
  const where = compileCheckRuleGroup(metadata, index.where!, `${subject} 的 where`);
  const normalized = index.normalized === true;
  const definition =
    `${JSON.stringify([metadata.namespace, metadata.tableName])} UNIQUE ` +
    `(${columns.map(quoteSqlIdentifier).join(', ')})${normalized ? ' NORMALIZED' : ''} WHERE ${where}`;
  return {
    name: storageConstraintName(UNIQUE_INDEX_NAME_PREFIX, metadata, index.name, definition, '条件唯一索引'),
    columns,
    normalized,
    where
  };
};
