/**
 * @fileoverview CHECK / 条件唯一 `where` / 区间排他的 SQL 编译与约束命名
 *
 * 这是「只拼字面量、无占位符」的 DDL 编译路径，放在核心、SQLite family 与 PGlite 共用，
 * 与查询构造器（占位符参数化、按后端分叉）完全分开。值一律经 {@link ../system/sql-literal.ts}
 * 的字面量函数——「转不动就拒绝」，不尽力而为。字面量超出列类型值域（如 `integer` 列写
 * `3000000000`，PG 会先撞 `22003` 而不是 CHECK）在建元数据期由
 * {@link renderCheckLiteral} 拒绝，保证两后端的错误类不分叉。
 */

import {
  quoteSqlIdentifier,
  sqlBigIntLiteral,
  sqlBooleanLiteral,
  sqlIntegerLiteral,
  sqlNumberLiteral,
  sqlStringLiteral,
  sqlTimestampLiteral
} from '../system/sql-literal.js';
import { getEntityColumnName } from './entity-field.utils.js';
import { EntityCheckMetadata, EntityExclusionMetadata, EntityMetadata } from './metadata.interface.js';
import { EnumProperty, PropertyType } from './property-types.interface.js';
import { CheckOperatorName, CheckRule, CheckRuleGroup } from './storage-constraints.interface.js';

/** FNV-1a 32 位哈希：纯同步、跨端确定，作约束名的表达式指纹。 */
const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** 表达式哈希的十六进制位数（约束名尾部）。 */
export const CONSTRAINT_HASH_LENGTH = 8;

/** 约束名前缀 → 用途：`ck_` CHECK、`uq_` 条件唯一索引、`ex_` 区间排他（漂移比对只纳入这三类）。 */
export type StorageConstraintPrefix = 'ck_' | 'uq_' | 'ex_';

/**
 * 按「前缀 + 物理表名 + 作者名 + 表达式哈希」确定性生成约束名
 *
 * @param prefix - 约束类前缀
 * @param namespace - 实体命名空间（SQLite 侧是表名前缀，约束名内不区分后端）
 * @param tableName - 实体表名
 * @param authorName - 作者给的 `name`
 * @param expressionSql - 规范化表达式（CHECK 的编译结果、`where` 的编译结果或排他的规范串）
 * @returns 完整约束名；长度门限（PG 标识符 63 UTF-8 字节）在建元数据期校验
 */
export const buildStorageConstraintName = (
  prefix: StorageConstraintPrefix,
  namespace: string,
  tableName: string,
  authorName: string,
  expressionSql: string
): string => {
  const hash = fnv1a32(expressionSql).toString(16).padStart(CONSTRAINT_HASH_LENGTH, '0');
  return `${prefix}${namespace}$${tableName}_${authorName}_${hash}`;
};

/** 字面量渲染结果：成功返回 SQL 文本，失败返回「点名原因」的诊断（供元数据期校验）。 */
export type CheckLiteralResult = { ok: true; sql: string } | { ok: false; reason: string };

const fail = (reason: string): CheckLiteralResult => ({ ok: false, reason });

const PG_INT4_MIN = -2147483648;
const PG_INT4_MAX = 2147483647;
const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;

/**
 * 把 CHECK 字面量按列类型渲染成 SQL
 *
 * @param value - 声明值
 * @param type - 列的 `PropertyType` 值（联合类型上取到的是值联合，按字符串判别）
 * @param enumValues - `enum` 列的取值集合（非 enum 列忽略）
 * @returns 渲染结果；「转不动」一律返回原因而不是尽力而为
 *
 * @remarks
 * 值域判定与渲染同源：`integer` 列限 PG `integer`（int4）值域——SQLite 的整数是 8 字节，
 * 不在此收窄，超 int4 的字面量会先在 PG 撞列类型（SQLSTATE `22003`）而不是 CHECK（`23514`），
 * 两后端错误类分叉；需要更大值域的列应声明 `bigint`。日期字面量统一折叠成 ISO 8601 UTC 文本。
 */
export const renderCheckLiteral = (
  value: unknown,
  type: string,
  enumValues?: readonly string[]
): CheckLiteralResult => {
  switch (type) {
    case PropertyType.uuid:
    case PropertyType.string: {
      if (typeof value !== 'string') return fail(`需要字符串字面量，实际为 ${typeof value}`);
      return { ok: true, sql: sqlStringLiteral(value) };
    }
    case PropertyType.enum: {
      if (typeof value !== 'string') return fail(`需要字符串字面量，实际为 ${typeof value}`);
      if (enumValues && !enumValues.includes(value)) return fail(`不在 enum 取值集合内：${JSON.stringify(value)}`);
      return { ok: true, sql: sqlStringLiteral(value) };
    }
    case PropertyType.number: {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail(`需要有限数字字面量，实际为 ${typeof value}`);
      }
      return { ok: true, sql: sqlNumberLiteral(value) };
    }
    case PropertyType.integer: {
      if (typeof value !== 'number' || !Number.isInteger(value)) return fail(`需要整数字面量，实际为 ${typeof value}`);
      if (value < PG_INT4_MIN || value > PG_INT4_MAX) {
        return fail(`超出 integer（int4）列值域 [${PG_INT4_MIN}, ${PG_INT4_MAX}]，请改用 bigint 列或收窄字面量`);
      }
      return { ok: true, sql: sqlIntegerLiteral(value) };
    }
    case PropertyType.bigint: {
      if (typeof value !== 'bigint') return fail(`需要 bigint 字面量，实际为 ${typeof value}`);
      if (value < BIGINT_MIN || value > BIGINT_MAX) {
        return fail(`超出 bigint 列值域，实际为 ${String(value)}`);
      }
      return { ok: true, sql: sqlBigIntLiteral(value) };
    }
    case PropertyType.boolean: {
      if (typeof value !== 'boolean') return fail(`需要布尔字面量，实际为 ${typeof value}`);
      return { ok: true, sql: sqlBooleanLiteral(value) };
    }
    case PropertyType.date: {
      const date =
        value instanceof Date ? value
        : typeof value === 'string' ? new Date(value)
        : undefined;
      if (!date || Number.isNaN(date.getTime())) return fail(`需要日期字面量，实际为 ${JSON.stringify(value)}`);
      return { ok: true, sql: sqlTimestampLiteral(date) };
    }
    default:
      return fail(`${String(type)} 列不能作 CHECK 字面量载体`);
  }
};

/** 列可参与 CHECK / `where` 比较的标量类型集合（数组 / 对象 / 二进制列一律拒绝）。 */
export const CHECK_COMPARABLE_TYPES: ReadonlySet<string> = new Set([
  PropertyType.uuid,
  PropertyType.string,
  PropertyType.enum,
  PropertyType.number,
  PropertyType.integer,
  PropertyType.bigint,
  PropertyType.boolean,
  PropertyType.date
]);

/** 区间排他的区间维只接受时间类与整数列。 */
export const EXCLUSION_RANGE_TYPES: ReadonlySet<string> = new Set([
  PropertyType.date,
  PropertyType.integer,
  PropertyType.bigint
]);

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['=', '!=', '<', '>', '<=', '>=']);

/**
 * 校验并编译单条 CHECK 规则
 *
 * @param rule - 单条规则
 * @param metadata - 实体元数据（列名解析与 enum 取值集合）
 * @returns 编译出的 SQL 谓词；非法声明抛 {@link Error}（元数据期校验已先行拦截）
 */
export const compileCheckRule = (rule: CheckRule, metadata: EntityMetadata): string => {
  const columnName = getEntityColumnName(metadata, rule.field);
  if (!columnName) throw new Error(`CHECK 规则引用了不存在的列：${rule.field}`);
  const column = quoteSqlIdentifier(columnName);
  const operator = rule.operator as CheckOperatorName;
  if (rule.ref !== undefined) {
    if (!COMPARISON_OPERATORS.has(operator)) {
      throw new Error(`CHECK 规则 ${rule.field} 的 ref 只能配比较操作符，实际为 ${operator}`);
    }
    const refColumnName = getEntityColumnName(metadata, rule.ref);
    if (!refColumnName) throw new Error(`CHECK 规则 ${rule.field} 的 ref 引用了不存在的列：${rule.ref}`);
    const refColumn = quoteSqlIdentifier(refColumnName);
    const sqlOperator = operator === '!=' ? '<>' : operator;
    return `${column} ${sqlOperator} ${refColumn}`;
  }
  const property = metadata.propertyMap.get(rule.field) as EnumProperty | undefined;
  const literal = (value: unknown): string => {
    const rendered = renderCheckLiteral(value, property?.type as PropertyType, property?.enum);
    if (!rendered.ok) throw new Error(`CHECK 规则 ${rule.field} 的字面量非法：${rendered.reason}`);
    return rendered.sql;
  };
  switch (operator) {
    case 'null':
      return `${column} IS NULL`;
    case 'notNull':
      return `${column} IS NOT NULL`;
    case 'in':
    case 'notIn': {
      const list = (rule.values as unknown[]).map(literal).join(', ');
      return `${column} ${operator === 'in' ? 'IN' : 'NOT IN'} (${list})`;
    }
    case 'between':
    case 'notBetween':
      return `${column} ${operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN'} ${literal(rule.low)} AND ${literal(rule.high)}`;
    default: {
      const sqlOperator = operator === '!=' ? '<>' : operator;
      return `${column} ${sqlOperator} ${literal(rule.value)}`;
    }
  }
};

/**
 * 编译 CHECK 规则组为 SQL 谓词（含外层括号）
 *
 * @param group - 规则组
 * @param metadata - 实体元数据
 */
export const compileCheckRuleGroup = (group: CheckRuleGroup, metadata: EntityMetadata): string => {
  const compiled = group.rules.map(rule =>
    'combinator' in rule ? compileCheckRuleGroup(rule, metadata) : compileCheckRule(rule, metadata)
  );
  return `(${compiled.join(group.combinator === 'and' ? ' AND ' : ' OR ')})`;
};

/**
 * 编译实体级 CHECK 为完整 SQL 表达式并生成约束名
 *
 * @param metadata - 实体元数据
 * @param check - CHECK 声明
 * @returns `{ name, sql }`：完整约束名与不带 `CONSTRAINT` 前缀的谓词文本
 */
export const compileCheckConstraint = (
  metadata: EntityMetadata,
  check: EntityCheckMetadata
): { name: string; sql: string } => {
  const sql = compileCheckRuleGroup(check.rule, metadata);
  return { name: buildStorageConstraintName('ck_', metadata.namespace, metadata.tableName, check.name, sql), sql };
};

/** 排他声明的规范串（哈希输入）：逐列、逐维确定性序列化。 */
export const serializeExclusion = (exclusion: EntityExclusionMetadata): string => {
  const ranges = exclusion.ranges.map(range => `${range.from}:${range.to}:${range.bounds}`).join(';');
  return `equal=${exclusion.equal.join(',')};ranges=${ranges}`;
};

/**
 * 生成区间排他的完整约束名
 *
 * @param metadata - 实体元数据
 * @param exclusion - 排他声明
 */
export const buildExclusionConstraintName = (metadata: EntityMetadata, exclusion: EntityExclusionMetadata): string =>
  buildStorageConstraintName(
    'ex_',
    metadata.namespace,
    metadata.tableName,
    exclusion.name,
    serializeExclusion(exclusion)
  );

/**
 * 生成条件唯一索引的完整约束名（`uq_`）
 *
 * @param metadata - 实体元数据
 * @param indexName - 索引作者名
 * @param whereSql - 编译后的 `WHERE` 谓词
 */
export const buildConditionalUniqueName = (metadata: EntityMetadata, indexName: string, whereSql: string): string =>
  buildStorageConstraintName('uq_', metadata.namespace, metadata.tableName, indexName, whereSql);

/**
 * 实体声明的全部约束对象名（漂移比对的期望集合）
 *
 * @param metadata - 实体元数据
 * @returns `{ constraints, triggers }`：约束名（`ck_` / `uq_` / `ex_`，PG 侧的全部对象）与
 *   SQLite 排他触发器名（`ex_…_i` / `ex_…_u`，只存在于 SQLite 侧）
 */
export const expectedStorageConstraintObjects = (
  metadata: EntityMetadata
): { constraints: string[]; triggers: string[] } => {
  const constraints: string[] = [];
  for (const check of metadata.checks) {
    constraints.push(compileCheckConstraint(metadata, check).name);
  }
  for (const index of metadata.indexMap.values()) {
    if (!index.where) continue;
    constraints.push(buildConditionalUniqueName(metadata, index.name, compileCheckRuleGroup(index.where, metadata)));
  }
  const triggers: string[] = [];
  for (const exclusion of metadata.exclusions) {
    const name = buildExclusionConstraintName(metadata, exclusion);
    constraints.push(name);
    triggers.push(`${name}_i`, `${name}_u`);
  }
  return { constraints, triggers };
};
