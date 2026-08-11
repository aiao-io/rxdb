import { quote_sql_identifier } from '../sqlite-core.utils.js';
import type { FtsField } from './types.js';

const valueExpr = (field: FtsField, alias: 'NEW' | 'OLD', valueWrapper?: string): string => {
  const fieldName = quote_sql_identifier(field.name);
  const raw =
    field.isArray ?
      // StringArrayProperty: 原表存 JSON 数组文本；NULL/空数组 → 空串
      `COALESCE((SELECT group_concat(value, char(10)) FROM json_each(${alias}.${fieldName})), '')`
    : `${alias}.${fieldName}`;
  return valueWrapper ? `${valueWrapper}(${raw})` : raw;
};

/** {@link buildFtsTriggersSql} 的可选项。 */
export interface FtsTriggerOptions {
  /**
   * 写入 FTS 索引前套用的 SQL 函数名（如 `rxdb_fts_bigram`）。
   *
   * @remarks
   * 缺省不套用，行为与历史版本完全一致——其余适配器无需注册任何自定义函数。
   * 一旦指定，**backfill 必须套用同一个函数**，否则存量与增量数据的分词方式不一致。
   * 该函数只改写进索引的文本，不动源表；摘要仍由查询层从源表原文截取。
   *
   * 必须是**裸 SQL 标识符**（`[A-Za-z_][A-Za-z0-9_]*`），否则抛错，见 {@link buildFtsTriggersSql}。
   */
  readonly valueWrapper?: string;
}

/**
 * 合法的 SQL 函数标识符。
 *
 * 与 {@link quote_sql_identifier} 处理的字段名不同，函数名不能加引号——加了引号 SQLite
 * 会当成字符串字面量而不是函数调用，所以这里只能靠白名单式校验挡住注入（SQLC-028）。
 */
const SQL_FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const columnsCsv = (fields: readonly FtsField[]): string => fields.map(f => quote_sql_identifier(f.name)).join(', ');

const valuesCsv = (fields: readonly FtsField[], alias: 'NEW' | 'OLD', valueWrapper?: string): string =>
  fields.map(f => valueExpr(f, alias, valueWrapper)).join(', ');

/**
 * 生成 UPDATE trigger 的 `WHEN` 守卫：仅当任一 searchable 字段实际变化时才同步。
 *
 * 使用 `OLD.<f> IS NOT NEW.<f>`（NULL-safe），减少非 searchable 字段更新时的写放大。
 * 对 stringArray 字段直接比较 JSON 文本——业务侧若用同义但不同序列化的 JSON 写入
 * 仍会被视为变更，由调用方保证序列化稳定（与 RxDB 默认行为一致）。
 */
const buildUpdateGuard = (fields: readonly FtsField[]): string =>
  fields.map(f => `OLD.${quote_sql_identifier(f.name)} IS NOT NEW.${quote_sql_identifier(f.name)}`).join(' OR ');

/**
 * 生成 FTS5 同步 trigger 三件套（`_ai` / `_ad` / `_au`）。
 *
 * 通过 `AFTER INSERT/DELETE/UPDATE` trigger 把业务表变更同步到 `_fts_<table>`。
 * `StringArrayProperty` 字段使用 `json_each + group_concat(value, char(10))` 子查询
 * 展开为换行分隔字符串，**不可**直接写 `NEW.<field>`；`NULL` / 空数组 → 空串。
 *
 * UPDATE trigger 带 `WHEN OLD.<f> IS NOT NEW.<f> OR ...` 守卫：仅 searchable 字段变化
 * 才同步，避免非 searchable 字段（如计数器）更新引发的全字段写放大。
 *
 * @param table - 业务表名
 * @param fields - 与 {@link buildCreateFtsTableSql} 完全一致的字段集合
 * @param options - 可选的写入变换，见 {@link FtsTriggerOptions}
 * @returns 包含 3 条 `CREATE TRIGGER IF NOT EXISTS` 的 SQL 串
 * @throws 当 `fields` 为空，或 `options.valueWrapper` 不是裸 SQL 标识符时
 * @public
 */
export const buildFtsTriggersSql = (
  table: string,
  fields: readonly FtsField[],
  options: FtsTriggerOptions = {}
): string => {
  if (fields.length === 0) {
    throw new Error(`buildFtsTriggersSql: no searchable fields for table "${table}"`);
  }
  const { valueWrapper } = options;
  // 函数名无法引号转义，必须在拼进 CREATE TRIGGER 之前挡住（SQLC-028）
  if (valueWrapper !== undefined && !SQL_FUNCTION_NAME.test(valueWrapper)) {
    throw new Error(`buildFtsTriggersSql: invalid valueWrapper ${JSON.stringify(valueWrapper)}`);
  }
  const cols = columnsCsv(fields);
  const newVals = valuesCsv(fields, 'NEW', valueWrapper);
  const oldVals = valuesCsv(fields, 'OLD', valueWrapper);
  const sourceTable = quote_sql_identifier(table);
  const ftsTable = quote_sql_identifier(`_fts_${table}`);
  const deleteColumn = quote_sql_identifier(`_fts_${table}`);
  const insertTrigger = quote_sql_identifier(`_fts_${table}_ai`);
  const deleteTrigger = quote_sql_identifier(`_fts_${table}_ad`);
  const updateTrigger = quote_sql_identifier(`_fts_${table}_au`);
  const updateGuard = buildUpdateGuard(fields);

  const insert = [
    `CREATE TRIGGER IF NOT EXISTS ${insertTrigger} AFTER INSERT ON ${sourceTable} BEGIN`,
    `  INSERT INTO ${ftsTable}(rowid, ${cols}) VALUES (NEW.rowid, ${newVals});`,
    `END;`
  ].join('\n');

  const del = [
    `CREATE TRIGGER IF NOT EXISTS ${deleteTrigger} AFTER DELETE ON ${sourceTable} BEGIN`,
    `  INSERT INTO ${ftsTable}(${deleteColumn}, rowid, ${cols}) VALUES ('delete', OLD.rowid, ${oldVals});`,
    `END;`
  ].join('\n');

  const update = [
    `CREATE TRIGGER IF NOT EXISTS ${updateTrigger} AFTER UPDATE ON ${sourceTable}`,
    `WHEN ${updateGuard} BEGIN`,
    `  INSERT INTO ${ftsTable}(${deleteColumn}, rowid, ${cols}) VALUES ('delete', OLD.rowid, ${oldVals});`,
    `  INSERT INTO ${ftsTable}(rowid, ${cols}) VALUES (NEW.rowid, ${newVals});`,
    `END;`
  ].join('\n');

  return [insert, del, update].join('\n\n');
};
