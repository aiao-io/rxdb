/**
 * @fileoverview SQLite 区间排他触发器的 DDL 生成
 *
 * SQLite 没有 PG 的 `EXCLUDE USING gist`，用触发器补齐：每条排他声明生成
 * `BEFORE INSERT` 与 `BEFORE UPDATE` 两个触发器。UPDATE 判定按主键排除被更新行自身——
 * 只建 INSERT 时 UPDATE 能静默造出重叠，不排除自身则合法的自身扩区间会被误拒（US-030 AC#12）。
 *
 * 消息走 `rxdb:exclusion_violation:<约束名>:…` 前缀（与 PG 侧 `RAISE EXCEPTION` 文本同构），
 * 核心按前缀归一为 {@link RxDBExclusionViolationError}。`RAISE(ABORT, <表达式>)` 需要
 * SQLite ≥ 3.47.0（宿主版本门槛见 US-030 AC#7）。
 *
 * 端点 NULL 即该侧无界，两后端一致；相等列用 `=`（NULL 与 NULL 不相等，与 PG `EXCLUDE` 一致）。
 */

import { buildExclusionConstraintName, EntityExclusionMetadata, EntityMetadata, getEntityColumnName } from '@aiao/rxdb';
import { get_primary_key_column, get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';

/**
 * 单维区间相交谓词：`existing` 与 `NEW` 两行在该维上重叠
 *
 * 半开 `[)`：`b > c AND d > a`；全闭 `[]`：`b >= c AND d >= a`（a/b 为 existing 端点，c/d 为 NEW 端点）。
 * 端点 NULL 即无界：出现 NULL 的因子恒真（`b IS NULL` = 上界 +∞、`c IS NULL` = 下界 -∞）。
 */
const overlapFactor = (
  existingFrom: string,
  existingTo: string,
  newFrom: string,
  newTo: string,
  bounds: string
): string => {
  // 运算符由区间的**闭合端**决定：半开 `[)` 两因子都严格大于（相邻不冲突），全闭 `[]` 两因子都 >=
  const operator = bounds[1] === ']' ? '>=' : '>';
  return `(${existingTo} IS NULL OR ${newFrom} IS NULL OR ${existingTo} ${operator} ${newFrom}) AND (${newTo} IS NULL OR ${existingFrom} IS NULL OR ${newTo} ${operator} ${existingFrom})`;
};

/** 单条排他声明的冲突谓词：全部相等列 `=` 且全部区间维相交。 */
const conflictPredicate = (
  metadata: EntityMetadata,
  exclusion: EntityExclusionMetadata,
  prefix: 'existing' | 'NEW'
): string => {
  const other = prefix === 'existing' ? 'NEW' : 'existing';
  const quoted = (row: string, field: string): string =>
    `${row}.${quote_sql_identifier(getEntityColumnName(metadata, field) as string)}`;
  const equals = exclusion.equal.map(field => `${quoted(prefix, field)} = ${quoted(other, field)}`).join(' AND ');
  const ranges = exclusion.ranges
    .map(range =>
      overlapFactor(
        quoted('existing', range.from),
        quoted('existing', range.to),
        quoted('NEW', range.from),
        quoted('NEW', range.to),
        range.bounds
      )
    )
    .join(' AND ');
  return `${equals} AND ${ranges}`;
};

/** 冲突区间文本：`from~to`，端点 NULL 写空串（SQLite 的 `||` 遇 NULL 整体为空）。 */
const rangeText = (row: 'existing' | 'NEW', metadata: EntityMetadata, exclusion: EntityExclusionMetadata): string =>
  exclusion.ranges
    .map(range => {
      const from = `${row}.${quote_sql_identifier(getEntityColumnName(metadata, range.from) as string)}`;
      const to = `${row}.${quote_sql_identifier(getEntityColumnName(metadata, range.to) as string)}`;
      return `(COALESCE(${from}, '') || '~' || COALESCE(${to}, ''))`;
    })
    .join(` || ';' || `);

/**
 * 生成单条排他声明的两个触发器（`_i` 插入 / `_u` 更新）
 *
 * @param metadata - 实体元数据
 * @param tableName - 物理表名（`namespace$name`）
 * @param exclusion - 排他声明
 * @returns 两条 `CREATE TRIGGER IF NOT EXISTS` 语句
 */
const buildExclusionTriggerSql = (
  metadata: EntityMetadata,
  tableName: string,
  exclusion: EntityExclusionMetadata
): string => {
  const constraintName = buildExclusionConstraintName(metadata, exclusion);
  const pkColumn = quote_sql_identifier(get_primary_key_column(metadata));
  const conflict = conflictPredicate(metadata, exclusion, 'existing');
  const message = `'rxdb:exclusion_violation:' || '${constraintName}' || ':' || COALESCE(existing.${pkColumn}, '') || ':' || ${rangeText('existing', metadata, exclusion)} || ':' || ${rangeText('NEW', metadata, exclusion)}`;

  const insertTrigger = [
    `CREATE TRIGGER IF NOT EXISTS ${quote_sql_identifier(`${constraintName}_i`)}`,
    `BEFORE INSERT ON ${quote_sql_identifier(tableName)}`,
    `BEGIN`,
    `  SELECT RAISE(ABORT, ${message}) FROM ${quote_sql_identifier(tableName)} AS existing WHERE ${conflict} LIMIT 1;`,
    `END;`
  ].join('\n');

  const selfExcluded = `${conflict} AND existing.${pkColumn} <> NEW.${pkColumn}`;
  const updateTrigger = [
    `CREATE TRIGGER IF NOT EXISTS ${quote_sql_identifier(`${constraintName}_u`)}`,
    `BEFORE UPDATE ON ${quote_sql_identifier(tableName)}`,
    `BEGIN`,
    `  SELECT RAISE(ABORT, ${message}) FROM ${quote_sql_identifier(tableName)} AS existing WHERE ${selfExcluded} LIMIT 1;`,
    `END;`
  ].join('\n');

  return `${insertTrigger}\n\n${updateTrigger}`;
};

/**
 * 生成实体全部排他声明的触发器 SQL
 *
 * @param metadata - 实体元数据
 * @returns 无排他声明时返回空串
 */
export const buildExclusionTriggersSql = (metadata: EntityMetadata): string => {
  if (metadata.exclusions.length === 0) return '';
  const tableName = get_table_name_by_metadata(metadata);
  return metadata.exclusions.map(exclusion => buildExclusionTriggerSql(metadata, tableName, exclusion)).join('\n\n');
};
