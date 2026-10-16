/**
 * @fileoverview US-519 扩展属性的纯函数面：写入校验与过滤查询 SQL 生成。
 *
 * 写入路径：`ext` 对象先经 {@link validateExtWrite} 按 `attr_def` 校验，再经
 * {@link normalizeExtValue} 序列化为规范 JSON 文本写入 `ext` 列；
 * 查询路径：{@link buildExtFilterSql} 只生成谓词片段，由查询执行面拼进
 * WHERE 子句（本模块不执行 SQL、不绑定参数）。SQLite 与 PGlite 对同一组
 * 过滤给出同一结果（US-519 AC#4 的 conformance 契约）。
 *
 * 缺字段与显式 null 等价：`exists` 对二者都为假，其余比较对缺字段一律不匹配
 * （含 `ne`）；过滤值类型与 `data_type` 不符即拒绝查询，不做隐式转换。
 */

import { BomError } from '../types.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor } from './bom-sql.js';

/**
 * 扩展属性违约（US-519）：非法 JSON、越界 / 枚举 / 必填 / 类型违约、非法过滤值。
 */
export class BomExtAttrError extends BomError {
  constructor(
    /** 违约点：属性 code 或键路径。 */
    readonly subject: string,
    readonly detail: string
  ) {
    super(`扩展属性违约：${subject} ${detail}`, 'BomExtAttrError');
  }
}

/** attr_def 的校验用形状（`enumValues` 为已解析的 JSON 数组，无枚举为 null）。 */
export interface ExtAttrDefShape {
  code: string;
  dataType: string;
  required: boolean;
  enumValues: string[] | null;
  appliesTo: string;
}

/** 写入模式：create / update-complete 强制必填；update-partial 不触碰扩展属性不强制。 */
export type ExtWriteMode = 'create' | 'update-complete' | 'update-partial';

/** attr_def.dataType 合法取值（超出即 fail-fast，不猜测语义）。 */
const EXT_DATA_TYPES: readonly string[] = ['string', 'number', 'boolean', 'date'];

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** 纯日期或带时区偏移的完整时间戳；形似但不可解析（如 2026-02-30）拒绝。 */
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const isIsoDateText = (value: string): boolean => {
  if ((!ISO_DATE_ONLY_RE.test(value) && !ISO_DATETIME_RE.test(value)) || !Number.isFinite(Date.parse(value)))
    return false;
  // Date.parse 对「2026-02-30」这类形似日期做宽松滚动（V8 实测），必须回读比对真实性
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

/** 错误消息里的值描述（JSON.stringify 对 bigint / symbol / 循环引用不安全，仅消息用兜底）。 */
const valueText = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/** 值是否符合 dataType（null / undefined 由调用方先处理，不算值）。 */
const matchesDataType = (dataType: string, value: unknown): boolean => {
  if (dataType === 'number') return isFiniteNumber(value);
  if (dataType === 'boolean') return typeof value === 'boolean';
  if (dataType === 'string') return typeof value === 'string';
  if (dataType === 'date') return typeof value === 'string' && isIsoDateText(value);
  return false;
};

/**
 * 递归规范化 + 键排序：对象键按码点升序（键序稳定），undefined 值视为缺字段跳过；
 * 函数 / symbol / bigint / Date / 非有限数值无法进入 JSON 文本，一律抛错
 * （fail-fast，不静默丢弃）。
 */
const canonicalize = (value: unknown, path: string): unknown => {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'number') {
    throw new BomExtAttrError(path === '' ? 'ext' : path, `非法 JSON 数值 ${String(value)}（仅有限数值可入 JSON）`);
  }
  if (typeof value !== 'object') {
    throw new BomExtAttrError(path === '' ? 'ext' : path, `值类型 ${typeof value} 无法序列化为 JSON`);
  }
  if (value instanceof Date) {
    throw new BomExtAttrError(path === '' ? 'ext' : path, 'Date 对象无法序列化为 JSON（date 属性应存 ISO 日期文本）');
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }
  // Object.create(null)：防 __proto__ 之类的键改写原型导致键丢失
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) continue;
    out[key] = canonicalize(item, path === '' ? key : `${path}.${key}`);
  }
  return out;
};

/**
 * 把扩展属性序列化为规范 JSON 文本（键序稳定、无 undefined / 函数）。
 *
 * @param ext - 对象，或对象 JSON 文本
 * @returns 规范 JSON 文本
 * @throws BomExtAttrError - 字符串输入不是合法 JSON、非对象输入（数组 / 标量 / null），
 *   或对象含无法序列化的值（函数 / symbol / bigint / Date / 非有限数值）
 */
export const normalizeExtValue = (ext: unknown): string => {
  let source: unknown = ext;
  if (typeof ext === 'string') {
    try {
      source = JSON.parse(ext);
    } catch {
      throw new BomExtAttrError('ext', `非法 JSON 文本：${ext.length > 64 ? `${ext.slice(0, 64)}…` : ext}`);
    }
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new BomExtAttrError('ext', '扩展属性必须是 JSON 对象（非数组 / 标量）');
  }
  return JSON.stringify(canonicalize(source, ''));
};

/**
 * 写入期扩展属性校验（US-519 AC#1 / #2 / #5 / #6）。
 *
 * @param defs - attr_def 声明（可含多个 appliesTo；本函数只取与 appliesTo 匹配的声明）
 * @param appliesTo - 本次写入的目标作用域（item / bom_header / bom_line_occurrence）
 * @param ext - 扩展属性对象（键为属性 code）
 * @param mode - create / update-complete 强制必填；update-partial 不触碰扩展属性不强制
 * @throws BomExtAttrError - 枚举违约（点名字段与合法取值）、作用域越界（点名未声明的 key）、
 *   dataType 不符、create / update-complete 缺必填字段（点名缺失字段）
 */
export const validateExtWrite = (
  defs: ExtAttrDefShape[],
  appliesTo: string,
  ext: Record<string, unknown>,
  mode: ExtWriteMode
): void => {
  const scoped = new Map<string, ExtAttrDefShape>();
  for (const attrDef of defs) {
    if (!EXT_DATA_TYPES.includes(attrDef.dataType)) {
      throw new BomExtAttrError(attrDef.code, `未知 dataType「${attrDef.dataType}」`);
    }
    if (attrDef.appliesTo === appliesTo) scoped.set(attrDef.code, attrDef);
  }
  // AC#2：本作用域未声明的 key 一律拒绝（越界语义）
  for (const key of Object.keys(ext)) {
    if (!scoped.has(key)) {
      throw new BomExtAttrError(key, `未在 appliesTo = '${appliesTo}' 声明（作用域越界）`);
    }
  }
  for (const [key, value] of Object.entries(ext)) {
    const attrDef = scoped.get(key)!;
    if (value === undefined || value === null) continue; // 缺字段与显式 null 等价，跳过类型 / 枚举
    if (!matchesDataType(attrDef.dataType, value)) {
      throw new BomExtAttrError(key, `值 ${valueText(value)} 与 dataType「${attrDef.dataType}」不符`);
    }
    const enumValues = attrDef.enumValues;
    if (enumValues !== null && enumValues.length > 0 && !enumValues.some(item => String(item) === String(value))) {
      throw new BomExtAttrError(key, `值 ${valueText(value)} 不在枚举 [${enumValues.join(', ')}] 中`);
    }
  }
  // AC#5：create / update-complete 强制必填；update-partial 不触碰扩展属性不强制
  if (mode !== 'update-partial') {
    for (const attrDef of scoped.values()) {
      if (!attrDef.required) continue;
      const value = ext[attrDef.code];
      if (value === undefined || value === null) {
        throw new BomExtAttrError(attrDef.code, `必填属性缺失（${mode} 必须提供该字段）`);
      }
    }
  }
};

/** 过滤操作符（US-519：等值 / 不等 / 集合 / 数值与日期范围 / 存在性）。 */
export type ExtFilterOp = 'eq' | 'ne' | 'in' | 'lt' | 'lte' | 'gt' | 'gte' | 'exists';

/** 单条扩展属性过滤：value 为单值（eq / ne / 范围）或数组（in）；exists 无需 value。 */
export interface ExtFilter {
  code: string;
  op: ExtFilterOp;
  value?: unknown;
  dataType: string;
}

/** 过滤方言（与 bomSqlDialectFor 的适配器口径一致）。 */
export type ExtFilterDialect = 'sqlite' | 'pglite';

/** 字符串 SQL 字面量（单引号翻倍转义）。 */
const sqlStringLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** SQL 字面量（调用前已按 dataType 校验，不做隐式转换）。 */
const sqlLiteral = (value: unknown): string => {
  if (typeof value === 'string') return sqlStringLiteral(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value as number);
};

/**
 * 按方言与 dataType 生成 ext 列提取表达式：
 * SQLite 用 json_extract（自带 JSON 类型）；PGlite 文本用 ->>，
 * 数值 / 布尔先取 jsonb（->）再 ::numeric / ::boolean，日期走 ISO 文本比较。
 * 表列名一律双引号转义；tableRef 为空时列不加表限定（单表查询）。
 */
const extJsonExpr = (dialect: ExtFilterDialect, dataType: string, code: string, tableRef: string): string => {
  const reference = tableRef === '' ? '"ext"' : `${tableRef}."ext"`;
  const column = dialect === 'pglite' ? `(${reference})::jsonb` : reference;
  if (dialect === 'sqlite') {
    const path = /^[A-Za-z_][A-Za-z0-9_]*$/.test(code) ? `$.${code}` : `$.${JSON.stringify(code)}`;
    const value = `json_extract(${column}, ${sqlStringLiteral(path)})`;
    return dataType === 'date' ? `julianday(${value})` : value;
  }
  const value = `NULLIF(${column}->${sqlStringLiteral(code)}, 'null'::jsonb)`;
  if (dataType === 'number') return `(${value})::numeric`;
  if (dataType === 'boolean') return `(${value})::boolean`;
  if (dataType === 'date') return `(${column}->>${sqlStringLiteral(code)})::timestamptz`;
  return `${column}->>${sqlStringLiteral(code)}`;
};

/** 单条过滤的谓词片段；`in` 展开为 OR 相等列表（空数组恒假）。 */
const filterClause = (dialect: ExtFilterDialect, filter: ExtFilter, tableRef: string): string => {
  const dataType = filter.dataType;
  if (!EXT_DATA_TYPES.includes(dataType)) {
    throw new BomExtAttrError(filter.code, `未知 dataType「${dataType}」`);
  }
  if (['lt', 'lte', 'gt', 'gte'].includes(filter.op) && dataType !== 'number' && dataType !== 'date') {
    throw new BomExtAttrError(filter.code, '范围比较仅支持 number / date');
  }
  const json = extJsonExpr(dialect, dataType, filter.code, tableRef);
  const literalOf = (value: unknown): string =>
    dataType === 'date' && dialect === 'sqlite' ? `julianday(${sqlLiteral(value)})` : sqlLiteral(value);
  if (filter.op === 'exists') return `${json} IS NOT NULL`;
  if (filter.op === 'in') {
    if (!Array.isArray(filter.value)) throw new BomExtAttrError(filter.code, 'in 的 value 必须是数组');
    for (const item of filter.value) {
      if (item === undefined || item === null || !matchesDataType(dataType, item)) {
        throw new BomExtAttrError(filter.code, `过滤值 ${valueText(item)} 与 dataType「${dataType}」不符`);
      }
    }
    if (filter.value.length === 0) return '(1 = 0)';
    return filter.value.map(item => `${json} = ${literalOf(item)}`).join(' OR ');
  }
  const value = filter.value;
  if (value === undefined || value === null || !matchesDataType(dataType, value)) {
    throw new BomExtAttrError(filter.code, `过滤值 ${valueText(value)} 与 dataType「${dataType}」不符`);
  }
  const literal = literalOf(value);
  if (filter.op === 'eq') return `${json} = ${literal}`;
  // ne（US-519 契约：缺字段与显式 null 等价，其余比较对缺字段一律不匹配，含 ne）：
  // 提取表达式对缺字段与 JSON null 都返回 SQL NULL，`IS NOT NULL AND <>` 让二者都落败；
  // 若用 `IS NULL OR <>` 形态，缺字段 / null 会命中，违背契约。
  if (filter.op === 'ne') return `(${json} IS NOT NULL AND ${json} <> ${literal})`;
  if (filter.op === 'lt') return `${json} < ${literal}`;
  if (filter.op === 'lte') return `${json} <= ${literal}`;
  if (filter.op === 'gt') return `${json} > ${literal}`;
  if (filter.op === 'gte') return `${json} >= ${literal}`;
  throw new BomExtAttrError(filter.code, `未知操作符 ${String(filter.op)}`);
};

/**
 * 生成扩展属性过滤谓词片段（US-519 AC#4）：只生成 SQL，不执行查询。
 *
 * @param dialect - 'sqlite'（json_extract）或 'pglite'（jsonb 操作符）
 * @param tableName - ext 列所属表的引用文本（如 bomSqlDialectFor(adapter).table('bom_item')）；
 *   传空字符串则列不加表限定（单表查询无歧义）
 * @param filters - 过滤条件（按序 AND 组合）
 * @returns `{ sql }` 谓词片段（每条过滤自带括号）；无过滤时 sql 为空字符串。
 *   查询执行面把片段拼进 WHERE（本模块只生成 SQL，不绑定参数、不执行）
 *
 * @remarks
 * 值以 SQL 字面量内联（与 bom-map.ts 直连 SQL 口径一致），调用前已按 dataType 校验，
 * 不做隐式转换；字符串单引号翻倍转义。
 */
export const buildExtFilterSql = (
  dialect: ExtFilterDialect,
  tableName: string,
  filters: ExtFilter[]
): { sql: string } => {
  const clauses = filters.map(filter => filterClause(dialect, filter, tableName));
  if (clauses.length === 0) return { sql: '' };
  return { sql: clauses.map(clause => `(${clause})`).join(' AND ') };
};

/** 查询时类型来自属性声明，调用方只提供字段、操作符与值。 */
export type ExtAttrQueryFilter = Omit<ExtFilter, 'dataType'>;

/** 扩展属性所在的三种实体作用域。 */
export type ExtAttrScope = 'item' | 'bom_header' | 'bom_line_occurrence';

/** 在同一快照内读取属性声明并执行过滤，未知属性或类型错误直接拒绝。 */
export const filterByAttr = async (
  adapter: BomLocalAdapter,
  appliesTo: ExtAttrScope,
  filters: ExtAttrQueryFilter[]
): Promise<Record<string, unknown>[]> =>
  adapter.transaction(async executor => {
    if (!['item', 'bom_header', 'bom_line_occurrence'].includes(appliesTo))
      throw new BomExtAttrError('appliesTo', `未知作用域「${String(appliesTo)}」`);
    const dialect = bomSqlDialectFor(adapter.name);
    const defs = await executor.query(
      `SELECT "code", "dataType" FROM ${dialect.table('attr_def')} WHERE "appliesTo" = ${dialect.placeholder(0)}`,
      [appliesTo]
    );
    const types = new Map(defs.rows.map(row => [String(row[0]), String(row[1])]));
    const typed = filters.map(filter => {
      const dataType = types.get(filter.code);
      if (dataType === undefined) throw new BomExtAttrError(filter.code, `未在作用域「${appliesTo}」声明`);
      return { ...filter, dataType };
    });
    const { sql } = buildExtFilterSql(adapter.name === 'pglite' ? 'pglite' : 'sqlite', '', typed);
    const result = await executor.query(
      `SELECT * FROM ${dialect.table(appliesTo)}${sql.length > 0 ? ` WHERE ${sql}` : ''} ORDER BY "id"`
    );
    return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
  });
