/**
 * @fileoverview 声明式 CHECK 约束的元数据层：类型、白名单编译、约束命名。
 *
 * 复用查询 `RuleGroup` 的形状（`combinator` + 递归 `rules`），按 CHECK 只看单行的性质
 * 收窄为单行子集（操作符白名单见 {@link CHECK_OPERATORS}），另补查询里没有的
 * `ref` 字段对字段比较。`exists` / `contains` 系 / 关系路径 / JSON / 键值 / 二进制字段
 * 一律在元数据期拒绝（US-030 AC#9）。
 *
 * 编译产物是**只拼字面量**的 SQL 表达式：DDL 里的 CHECK 不能带占位符，所以不走
 * 查询构造器（PG 的 `buildRuleGroupPG` 走 `$n` 占位符）。列名用 {@link quoteSqlIdentifier}，
 * 值用 `sql-literal.ts` 的字面量函数——它们已按两后端的存储形态统一，同一个字面量
 * 两边都对，不按后端分叉；转不动的输入在这里拒绝，而不是拼出一条语法正确、语义错误的语句。
 *
 * 约束名确定性生成：`ck_` + 表名 + 作者给的 `name` + 规范化表达式（即本文件的编译产物）
 * 的 8 位哈希。哈希让「改表达式不改名」也成为可检出的漂移（AC#11）。作者 `name` 限
 * `[a-z][a-z0-9_]*`，整名按 UTF-8 字节数 ≤ 63（PG 标识符上限），超长在元数据期抛错、
 * 不截断——截断会让两个约束撞名（AC#15）。
 *
 * 字符串比较按字节序：PGlite 默认排序规则是 `C`，与 SQLite 的 `BINARY` 一致，
 * 因此同一表达式两后端语义相同，无需按后端分叉。
 */

import { RxDBError } from '../RxDBError.js';
import {
  quoteSqlIdentifier,
  sqlBooleanLiteral,
  sqlIntegerLiteral,
  sqlStringLiteral,
  sqlTimestampLiteral
} from '../system/sql-literal.js';
import type { EntityMetadata } from './metadata.interface.js';
import { PropertyType } from './property-types.interface.js';

/** CHECK 的操作符白名单（US-030 AC#9）。`exists` / `contains` 系 / `startsWith` 系不在其中。 */
export const CHECK_OPERATORS = [
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'in',
  'notIn',
  'between',
  'notBetween',
  'null',
  'notNull'
] as const;

/**
 * CHECK 单行规则允许的操作符。
 *
 * @remarks
 * 有意不复用查询的 `OperatorName`：那个联合含 `contains` / `startsWith` / `exists` 等
 * 单行 CHECK 语义不一致或需要子查询的操作符，类型层就要挡住。
 */
export type CheckOperator = (typeof CHECK_OPERATORS)[number];

/** 需要携带字面量 `value` 的操作符。 */
const VALUE_OPERATORS: ReadonlySet<string> = new Set([
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'in',
  'notIn',
  'between',
  'notBetween'
]);

/** 只配比较操作符的字段对字段比较（`ref`）。 */
const REF_OPERATORS: ReadonlySet<string> = new Set(['=', '!=', '<', '>', '<=', '>=']);

/**
 * CHECK 单行规则：字段与字面量比较，或字段对字段（`ref`）比较，或空值判定。
 *
 * - `value` 只在比较 / 成员 / 区间操作符上出现，按字段列类型编译成字面量；
 * - `ref` 指向同实体的另一列，只配比较操作符，与 `value` 互斥；
 * - `null` / `notNull` 两者都不带。
 */
export interface CheckRule {
  /** 参与比较的字段（属性名，不支持关系路径）。 */
  field: string;
  /** 操作符，限 {@link CHECK_OPERATORS}。 */
  operator: CheckOperator;
  /** 比较用的字面量；`in` / `notIn` 收数组，`between` / `notBetween` 收二元组。 */
  value?: unknown;
  /** 对字段比较的目标字段（同实体另一列）。 */
  ref?: string;
}

/**
 * CHECK 规则组：与查询 `RuleGroup` 同形状（`combinator` + 递归 `rules`），收窄为单行子集。
 */
export interface CheckRuleGroup {
  combinator: 'and' | 'or';
  rules: ReadonlyArray<CheckRuleGroup | CheckRule>;
}

/**
 * 实体级 CHECK 声明。
 *
 * @example
 * ```typescript
 * @Entity({
 *   checks: [{
 *     name: 'unit_range',
 *     rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
 *   }]
 * })
 * class Item extends EntityBase {}
 * ```
 */
export interface EntityCheckMetadataOptions {
  /** 作者给的约束名，限 `[a-z][a-z0-9_]*`，进确定性约束名的中段。 */
  name: Uncapitalize<string>;
  /** 单行规则组。 */
  rule: CheckRuleGroup;
}

/** 归一化之后的实体级 CHECK 元数据（与 {@link EntityCheckMetadataOptions} 同形状）。 */
export type EntityCheckMetadata = EntityCheckMetadataOptions;

/** 属性级 `check` 语法糖：一条省略 `field` 的规则，编译成以属性名为 `name` 的实体级 CHECK。 */
export type PropertyCheckRule = Omit<CheckRule, 'field'>;

/** CHECK 不能参与比较的列类型：JSON / 键值 / 二进制在单行 SQL 里没有一致的可比语义。 */
const UNSUPPORTED_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  PropertyType.json,
  PropertyType.keyValue,
  PropertyType.binary,
  PropertyType.stringArray,
  PropertyType.numberArray
]);

/** 作者给的约束名形状：小写开头，只含小写字母、数字与下划线。 */
const CHECK_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** 确定性约束名的前缀。 */
export const CHECK_NAME_PREFIX = 'ck_';

/** 约束名总长上限（UTF-8 字节数）：PG 标识符上限 63 字节，SQLite 不受限但两边要对齐。 */
export const CHECK_NAME_MAX_BYTES = 63;

/** PG `PropertyType.integer` 建成 `integer`（int4）的值域，字面量超出即元数据期拒绝（AC#15）。 */
const PG_INT4_MIN = -2147483648;
const PG_INT4_MAX = 2147483647;

/** `PropertyType.bigint` 的值域（两后端都是 8 字节有符号整数）。 */
const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;

/** 规范化表达式的 8 位哈希（FNV-1a 32 位，hex 小写）。 */
export const hashCheckExpression = (expression: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < expression.length; index++) {
    hash ^= expression.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const isCheckRuleGroup = (rule: CheckRule | CheckRuleGroup): rule is CheckRuleGroup => 'rules' in rule;

/** 拼非整数字面量（`PropertyType.number` 的 REAL/float8 存储形态）。 */
const sqlNumberLiteral = (value: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RxDBError(`不是有限数字，不能内联进 SQL：${String(value)}`);
  }
  return String(value);
};

/** 拼 64 位整数字面量，超出值域即拒绝。 */
const sqlBigIntLiteral = (value: bigint): string => {
  if (value < BIGINT_MIN || value > BIGINT_MAX) {
    throw new RxDBError(`bigint 字面量 ${value} 超出 64 位有符号整数值域`);
  }
  return String(value);
};

/** 解析规则里引用的字段：只认实体自身标量属性；关系路径 / 外键列 / 缺失字段一律拒绝。 */
const resolveCheckField = (metadata: EntityMetadata, field: string, label: string): string => {
  if (field.includes('.')) {
    throw new RxDBError(`CHECK 不支持关系路径：${label} '${field}' 含 '.'，只允许实体自身的列`);
  }
  const property = metadata.propertyMap.get(field);
  if (property) {
    if (UNSUPPORTED_PROPERTY_TYPES.has(property.type)) {
      throw new RxDBError(`CHECK 不支持 ${property.type} 列：${label} '${field}' 在单行 SQL 里没有一致的可比语义`);
    }
    if ((property as { encrypted?: boolean }).encrypted) {
      throw new RxDBError(`CHECK 不支持加密列：${label} '${field}' 比较的是密文`);
    }
    return property.columnName;
  }
  if (metadata.isForeignKey(field)) {
    throw new RxDBError(`CHECK 暂不支持关系外键列：${label} '${field}' 由关系派生，阶段 A 只支持实体自身标量属性`);
  }
  throw new RxDBError(`CHECK 引用了不存在的字段：${label} '${field}'`);
};

/**
 * 按列类型把单个字面量拼成 SQL。
 *
 * @throws {@link RxDBError} 字面量与列类型不匹配、或超出列类型值域时（AC#15）
 */
const compileCheckLiteral = (propertyType: string, value: unknown, label: string): string => {
  switch (propertyType) {
    case PropertyType.string:
    case PropertyType.enum:
    case PropertyType.uuid:
      if (typeof value !== 'string') {
        throw new RxDBError(`CHECK ${label} 的字面量必须是字符串，实际为 ${typeof value}`);
      }
      return sqlStringLiteral(value);
    case PropertyType.integer: {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new RxDBError(`CHECK ${label} 的字面量必须是安全整数，实际为 ${String(value)}`);
      }
      if (value < PG_INT4_MIN || value > PG_INT4_MAX) {
        throw new RxDBError(
          `CHECK ${label} 的字面量 ${value} 超出 integer 列的值域 [${PG_INT4_MIN}, ${PG_INT4_MAX}]：` +
            'PG 把 PropertyType.integer 建成 int4，超出会在 PG 先撞列类型（SQLSTATE 22003）而不是 CHECK（23514）；' +
            '需要更大值域的列请声明为 bigint'
        );
      }
      return sqlIntegerLiteral(value);
    }
    case PropertyType.bigint:
      if (typeof value !== 'bigint') {
        throw new RxDBError(`CHECK ${label} 的字面量必须是 bigint，实际为 ${typeof value}`);
      }
      return sqlBigIntLiteral(value);
    case PropertyType.number:
      if (typeof value !== 'number') {
        throw new RxDBError(`CHECK ${label} 的字面量必须是数字，实际为 ${typeof value}`);
      }
      return sqlNumberLiteral(value);
    case PropertyType.boolean:
      if (typeof value !== 'boolean') {
        throw new RxDBError(`CHECK ${label} 的字面量必须是布尔值，实际为 ${typeof value}`);
      }
      return sqlBooleanLiteral(value);
    case PropertyType.date:
      if (!(value instanceof Date)) {
        throw new RxDBError(`CHECK ${label} 的字面量必须是 Date，实际为 ${typeof value}`);
      }
      return sqlTimestampLiteral(value);
    default:
      throw new RxDBError(`CHECK 不支持的列类型：${String(propertyType)}`);
  }
};

/**
 * 按字段列类型把一条比较 / 成员 / 区间规则拼成 SQL。
 */
const compileCheckRule = (metadata: EntityMetadata, rule: CheckRule, checkName: string): string => {
  const label = `${checkName} 的规则 (${rule.field})`;
  if (typeof rule.operator !== 'string' || !(CHECK_OPERATORS as readonly string[]).includes(rule.operator)) {
    throw new RxDBError(
      `CHECK ${label} 的操作符非法：${JSON.stringify(rule.operator)}，白名单为 ${CHECK_OPERATORS.join(' / ')}`
    );
  }
  const column = quoteSqlIdentifier(resolveCheckField(metadata, rule.field, label));

  if (rule.operator === 'null' || rule.operator === 'notNull') {
    return `${column} ${rule.operator === 'null' ? 'IS NULL' : 'IS NOT NULL'}`;
  }

  if (rule.ref !== undefined) {
    if (rule.value !== undefined) {
      throw new RxDBError(`CHECK ${label} 的 ref 与 value 互斥：字段对字段比较不能同时带字面量`);
    }
    if (!REF_OPERATORS.has(rule.operator)) {
      throw new RxDBError(`CHECK ${label} 的 ref 只配比较操作符（= != < > <= >=），不能配 ${rule.operator}`);
    }
    const refColumn = quoteSqlIdentifier(resolveCheckField(metadata, rule.ref, `${checkName} 的 ref (${rule.ref})`));
    return `${column} ${rule.operator} ${refColumn}`;
  }

  if (!VALUE_OPERATORS.has(rule.operator)) {
    throw new RxDBError(`CHECK ${label} 的 ${rule.operator} 需要 value`);
  }
  if (rule.value === undefined || rule.value === null) {
    throw new RxDBError(
      `CHECK ${label} 的 ${rule.operator} 不能拿 null 作字面量：SQL 三值逻辑下 '= NULL' 恒为 unknown，` +
        'CHECK 会静默放行所有行；要判空请用 null / notNull 操作符'
    );
  }
  const propertyType = metadata.propertyMap.get(rule.field)?.type;
  if (!propertyType) {
    throw new RxDBError(`CHECK ${label} 引用了不存在的字段：${rule.field}`);
  }

  switch (rule.operator) {
    case 'in':
    case 'notIn': {
      if (!Array.isArray(rule.value) || rule.value.length === 0) {
        throw new RxDBError(`CHECK ${label} 的 ${rule.operator} 需要非空数组`);
      }
      const literals = rule.value.map(item => compileCheckLiteral(propertyType, item, label)).join(', ');
      return `${column} ${rule.operator === 'in' ? 'IN' : 'NOT IN'} (${literals})`;
    }
    case 'between':
    case 'notBetween': {
      if (!Array.isArray(rule.value) || rule.value.length !== 2) {
        throw new RxDBError(`CHECK ${label} 的 ${rule.operator} 需要二元组 [下界, 上界]`);
      }
      const [lower, upper] = rule.value;
      const lowerSql = compileCheckLiteral(propertyType, lower, label);
      const upperSql = compileCheckLiteral(propertyType, upper, label);
      return `${column} ${rule.operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN'} ${lowerSql} AND ${upperSql}`;
    }
    default:
      return `${column} ${rule.operator} ${compileCheckLiteral(propertyType, rule.value, label)}`;
  }
};

/** 把一条规则（组或叶子）编译成 SQL 表达式片段。 */
const compileCheckNode = (metadata: EntityMetadata, node: CheckRule | CheckRuleGroup, checkName: string): string =>
  isCheckRuleGroup(node) ? compileCheckGroup(metadata, node, checkName) : compileCheckRule(metadata, node, checkName);

/** 把规则组编译成带括号的 SQL 表达式。 */
const compileCheckGroup = (metadata: EntityMetadata, group: CheckRuleGroup, checkName: string): string => {
  if (group.combinator !== 'and' && group.combinator !== 'or') {
    throw new RxDBError(
      `CHECK ${checkName} 的 combinator 非法：${JSON.stringify(group.combinator)}，只能是 'and' / 'or'`
    );
  }
  if (!Array.isArray(group.rules) || group.rules.length === 0) {
    throw new RxDBError(`CHECK ${checkName} 的规则组不能为空`);
  }
  return `(${group.rules.map(node => compileCheckNode(metadata, node, checkName)).join(` ${group.combinator.toUpperCase()} `)})`;
};

/**
 * 编译实体级 CHECK 为规范化 SQL 表达式（不含 `CHECK (...)` 包装）。
 *
 * @param metadata - `transitionMetadata()` 产出的实体元数据
 * @param check - 实体级 CHECK 声明
 * @returns 规范化表达式：列名双引号定界、字面量按列类型编译，两后端同一条语句
 * @throws {@link RxDBError} 白名单外的操作符、关系路径、JSON / 键值 / 二进制 / 加密列、
 *   超值域字面量等，消息点名约束与原因（AC#9 / AC#15）
 */
export const compileCheckExpression = (metadata: EntityMetadata, check: EntityCheckMetadata): string =>
  compileCheckGroup(metadata, check.rule, check.name);

/**
 * 生成确定性约束名：`ck_<表名>_<作者 name>_<规范化表达式 8 位哈希>`。
 *
 * @throws {@link RxDBError} 作者 `name` 不合 `[a-z][a-z0-9_]*`、或整名超 63 UTF-8 字节时（AC#15）
 */
export const checkConstraintName = (metadata: EntityMetadata, check: EntityCheckMetadata): string => {
  if (!CHECK_NAME_PATTERN.test(check.name)) {
    throw new RxDBError(
      `CHECK 约束名 '${check.name}' 非法：只允许 [a-z][a-z0-9_]*（小写字母开头，只含小写字母、数字与下划线）`
    );
  }
  const fullName = `${CHECK_NAME_PREFIX}${metadata.tableName}_${check.name}_${hashCheckExpression(compileCheckExpression(metadata, check))}`;
  if (new TextEncoder().encode(fullName).length > CHECK_NAME_MAX_BYTES) {
    throw new RxDBError(
      `CHECK 约束名 '${fullName}' 超过 ${CHECK_NAME_MAX_BYTES} UTF-8 字节（PG 标识符上限），请缩短表名或约束 name；不截断，截断会让两个约束撞名`
    );
  }
  return fullName;
};

/**
 * 编译实体级 CHECK 为 `{ name, expression }`：约束名 + 规范化表达式。
 */
export interface CompiledCheckConstraint {
  /** 确定性约束名（含 `ck_` 前缀与表达式哈希）。 */
  name: string;
  /** 规范化 SQL 表达式（可直接嵌入 `CONSTRAINT ... CHECK (...)`）。 */
  expression: string;
}

/**
 * 编译实体级 CHECK。
 *
 * @returns 约束名与规范化表达式；两后端建表 DDL 与漂移比对共用
 */
export const compileCheckConstraint = (
  metadata: EntityMetadata,
  check: EntityCheckMetadata
): CompiledCheckConstraint => {
  const expression = compileCheckExpression(metadata, check);
  return { name: checkConstraintName(metadata, check), expression };
};

/** 收集规则树引用的全部字段（含 `ref` 目标），按声明序去重。 */
export const referencedCheckFields = (check: EntityCheckMetadata): readonly string[] => {
  const fields = new Set<string>();
  const visit = (node: CheckRule | CheckRuleGroup): void => {
    if (isCheckRuleGroup(node)) {
      node.rules.forEach(visit);
      return;
    }
    fields.add(node.field);
    if (node.ref !== undefined) fields.add(node.ref);
  };
  visit(check.rule);
  return Array.from(fields);
};

/**
 * 按约束名反查实体元数据里声明的 CHECK（漂移比对与违约归一化共用）。
 *
 * @returns 约束名匹配的声明；没声明过（或编译失败）时为 `undefined`
 */
export const findCheckByConstraintName = (
  metadata: EntityMetadata,
  constraintName: string
): EntityCheckMetadata | undefined => {
  for (const check of metadata.checkMap.values()) {
    try {
      if (checkConstraintName(metadata, check) === constraintName) return check;
    } catch {
      // 元数据在 init() 已校验过；这里兜底防的是调用方拿着未校验元数据直调
    }
  }
  return undefined;
};
