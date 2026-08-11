import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import { pgDialect } from '../sql_dialect.js';
import { DEFAULT_FTS_ARRAY_KIND, DEFAULT_FTS_REGCONFIG, FTS_COLUMN, type FtsField, type FtsOptions } from './types.js';

/**
 * 合法的 PostgreSQL 文本搜索配置名。
 *
 * 允许可选的 schema 限定（`pg_catalog.english`），每段都是标准标识符：
 * 字母或下划线开头，其后为字母、数字、下划线或 `$`。
 */
const REGCONFIG_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)?$/;

/**
 * 校验 `regconfig`，非法即抛。
 *
 * @param regconfig - 文本搜索配置名
 * @returns 原值（校验通过）
 * @throws {RxdbAdapterPGliteError} 不是合法的配置名标识符时
 *
 * @remarks
 * `regconfig` 来自 `buildCreateFtsTableSql(..., { regconfig })` 这一**公开选项**，
 * 而它被直接插进 plpgsql 函数体的 `to_tsvector('<regconfig>', ...)` —— 单引号一闭合
 * 就能往函数体里塞任意语句。这里不做转义而是**白名单校验**：配置名本就只能是标识符，
 * 任何不符合的输入都是调用错误，应当 fail-fast 而不是被静默转义成一个不存在的配置名。
 */
const assertRegconfig = (regconfig: string): string => {
  if (!REGCONFIG_PATTERN.test(regconfig)) {
    throw new RxdbAdapterPGliteError(
      `Invalid FTS regconfig ${JSON.stringify(regconfig)}: expected a text search configuration identifier ` +
        `such as "english" or "pg_catalog.english".`
    );
  }
  return regconfig;
};

/**
 * 单字段在 trigger 函数体内的取值表达式。
 *
 * - 标量字段：`COALESCE(NEW."<col>", '')`
 * - `text[]` 数组（**默认**）：`COALESCE(array_to_string(NEW."<col>", ' '), '')`
 * - `jsonb` 数组：`COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(NEW."<col>")), '')`
 *
 * 数组展开成空格分隔字符串，使 `to_tsvector` 把每个元素当作独立 token。
 * NULL 与空数组统一返回空串，保证 `concat_ws` 不会因 NULL 被吞掉中间分隔符。
 *
 * 分支是必须的：两个函数各自只接受一种类型，
 * 对 `text[]` 调 `jsonb_array_elements_text` 是 42883（PGL-007）。
 */
const valueExpr = (field: FtsField): string => {
  const col = pgDialect.escapeIdentifier(field.name);
  if (!field.isArray) {
    return `COALESCE(NEW.${col}, '')`;
  }
  if ((field.arrayKind ?? DEFAULT_FTS_ARRAY_KIND) === 'jsonb') {
    return `COALESCE((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(NEW.${col})), '')`;
  }
  return `COALESCE(array_to_string(NEW.${col}, ' '), '')`;
};

/**
 * 生成 PostgreSQL FTS 同步 trigger（函数 + trigger）。
 *
 * 与 SQLite FTS5 `_ai/_ad/_au` 三 trigger 写虚拟表的方案不同，PG 用一个
 * `BEFORE INSERT OR UPDATE` trigger 直接在行写入前计算 `tsvector` 写到 `_fts` 列：
 * 这样既省去 AFTER trigger 的额外写入，也避免了删除/虚拟表同步的开销。
 *
 * 返回 SQL 包含 3 条语句（以 `;` 分隔）：
 * 1. `CREATE OR REPLACE FUNCTION "<table>__fts_update"()` —— 计算并写入 `NEW."_fts"`
 * 2. `DROP TRIGGER IF EXISTS "<table>__fts_trg" ON "<table>"` —— 幂等清理
 * 3. `CREATE TRIGGER "<table>__fts_trg" BEFORE INSERT OR UPDATE ON "<table>" FOR EACH ROW EXECUTE FUNCTION "<table>__fts_update"()`
 *
 * 字段集合必须与 {@link buildCreateFtsTableSql} 的 `fields` 一致，否则查询时
 * 漏字段或多字段都会让 ranking 失真。
 *
 * @param table - 业务表名
 * @param fields - 参与 FTS 的字段（顺序影响 `concat_ws` 中字段拼接顺序，对 ranking 有轻微影响）
 * @param options - 可选 `regconfig`，默认 {@link DEFAULT_FTS_REGCONFIG}
 * @returns 多条 SQL 拼接（以 `;` 分隔）
 * @throws 当 `fields` 为空时抛出
 * @public
 */
export const buildFtsTriggersSql = (table: string, fields: readonly FtsField[], options?: FtsOptions): string => {
  if (fields.length === 0) {
    throw new Error(`buildFtsTriggersSql: no searchable fields for table "${table}"`);
  }
  const regconfig = assertRegconfig(options?.regconfig ?? DEFAULT_FTS_REGCONFIG);
  const escapedTable = pgDialect.escapeIdentifier(table);
  const escapedFtsCol = pgDialect.escapeIdentifier(FTS_COLUMN);
  const functionName = pgDialect.escapeIdentifier(`${table}_${FTS_COLUMN}_update`);
  const triggerName = pgDialect.escapeIdentifier(`${table}_${FTS_COLUMN}_trg`);

  const concatArgs = fields.map(valueExpr).join(', ');

  const functionSql = [
    `CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$`,
    `BEGIN`,
    `  NEW.${escapedFtsCol} := to_tsvector('${regconfig}', concat_ws(' ', ${concatArgs}));`,
    `  RETURN NEW;`,
    `END;`,
    `$$ LANGUAGE plpgsql;`
  ].join('\n');

  const dropTrigger = `DROP TRIGGER IF EXISTS ${triggerName} ON ${escapedTable};`;

  const createTrigger = [
    `CREATE TRIGGER ${triggerName}`,
    `BEFORE INSERT OR UPDATE ON ${escapedTable}`,
    `FOR EACH ROW EXECUTE FUNCTION ${functionName}();`
  ].join('\n');

  return `${functionSql}\n${dropTrigger}\n${createTrigger}`;
};
