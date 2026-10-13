/**
 * @fileoverview 存储约束违约的判别与归一
 *
 * US-030 的「同一错误码」指适配器归一后的**同一个错误类**，不另立码表：
 * CHECK 违约 → {@link RxDBCheckViolationError}（PG SQLSTATE `23514` / SQLite 原生
 * `CHECK constraint failed`），区间排他 → {@link RxDBExclusionViolationError}
 * （PG SQLSTATE `23P01` / SQLite 触发器消息前缀 `rxdb:exclusion_violation:`）。
 * 条件唯一复用既有唯一冲突口径（{@link isUniqueConstraintViolation}），不新增类。
 *
 * 归一发生在适配器的实体写入路径（那里有元数据与行值）；直连 SQL 拿不到归一后的类，
 * 只拿到原生消息或 `rxdb:` 前缀消息。
 */

import { RxDBCheckViolationError, RxDBExclusionViolationError } from '../RxDBError.js';
import { compileCheckConstraint } from '../entity/check-sql.js';
import { getEntityColumnName } from '../entity/entity-field.utils.js';
import { EntityMetadata } from '../entity/metadata.interface.js';
import { CheckRuleGroup } from '../entity/storage-constraints.interface.js';

/**
 * 沿 `cause` 链展开：适配器包装错误（如 `RxDBAdapterSqliteError`）把 SQLSTATE / 原生消息
 * 藏在内层，只读外层会漏判。
 */
const causeChain = (cause: unknown): unknown[] => {
  const values: unknown[] = [];
  let current = cause;
  while (current) {
    values.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return values;
};

/** 提取底层错误的 SQLSTATE 码（PG 系错误对象的 `code` 字段，沿 cause 链取第一个字符串）。 */
const sqlStateOf = (cause: unknown): string | undefined =>
  causeChain(cause)
    .map(value => (value as { code?: unknown } | null | undefined)?.code)
    .find((code): code is string => typeof code === 'string');

const messageOf = (cause: unknown): string =>
  causeChain(cause)
    .map(value => (value instanceof Error ? value.message : String(value)))
    .join('\n');

/** SQLite 原生 CHECK 消息里提取约束名：`CHECK constraint failed: <名>`。 */
const SQLITE_CHECK_RE = /CHECK constraint failed:\s*([^\s]+)/;

/** PG 23514 消息里提取约束名：`violates check constraint "<名>"`。 */
const PG_CHECK_RE = /violates check constraint "([^"]+)"/;

/** SQLite 触发器消息前缀：`rxdb:exclusion_violation:<约束名>:`。 */
const SQLITE_EXCLUSION_RE = /rxdb:exclusion_violation:([^:]+):/;

/** PG 23P01 消息里提取约束名：`violates exclusion constraint "<名>"`。 */
const PG_EXCLUSION_RE = /violates exclusion constraint "([^"]+)"/;

/**
 * 判别并提取 CHECK 违约的约束名
 *
 * @param cause - 底层错误
 * @returns 约束名；不是 CHECK 违约时返回 `undefined`
 */
export const checkConstraintNameOf = (cause: unknown): string | undefined => {
  if (sqlStateOf(cause) === '23514') {
    return PG_CHECK_RE.exec(messageOf(cause))?.[1];
  }
  return SQLITE_CHECK_RE.exec(messageOf(cause))?.[1];
};

/**
 * 判别是否为 CHECK 约束违约
 *
 * @param cause - 底层错误
 */
export const isCheckConstraintViolation = (cause: unknown): boolean => checkConstraintNameOf(cause) !== undefined;

/**
 * 判别并提取区间排他违约的约束名
 *
 * @param cause - 底层错误
 * @returns 约束名；不是排他违约时返回 `undefined`
 */
export const exclusionConstraintNameOf = (cause: unknown): string | undefined => {
  if (sqlStateOf(cause) === '23P01') {
    return PG_EXCLUSION_RE.exec(messageOf(cause))?.[1];
  }
  return SQLITE_EXCLUSION_RE.exec(messageOf(cause))?.[1];
};

/**
 * 判别是否为区间排他违约
 *
 * @param cause - 底层错误
 */
export const isExclusionViolation = (cause: unknown): boolean => exclusionConstraintNameOf(cause) !== undefined;

/** 底层错误包装成 {@link Error}（保持 `cause` 链），原值不变时返回 `undefined`。 */
const asError = (cause: unknown): Error | undefined => (cause instanceof Error ? cause : undefined);

/**
 * 把底层适配器错误归一为存储约束错误类
 *
 * @param cause - 底层错误（适配器抛出的包装错误）
 * @returns 归一后的错误类；不是本模块认识的违约时返回 `undefined`（原样上抛）
 */
export const normalizeStorageConstraintError = (cause: unknown): RxDBCheckViolationError | RxDBExclusionViolationError | undefined => {
  const checkName = checkConstraintNameOf(cause);
  if (checkName) return new RxDBCheckViolationError(checkName, undefined, undefined, undefined, asError(cause));
  const exclusionName = exclusionConstraintNameOf(cause);
  if (exclusionName) return new RxDBExclusionViolationError(exclusionName, asError(cause));
  return undefined;
};

/** 单条规则上的字段（仅一层、非嵌套组）；组或嵌套组返回 `undefined`。 */
const singleRuleField = (rule: CheckRuleGroup): string | undefined => {
  if (rule.rules.length !== 1) return undefined;
  const only = rule.rules[0];
  return 'combinator' in only ? undefined : only.field;
};

/**
 * 把实体写入路径的底层错误归一为存储约束错误类，并尽力补上冲突列与冲突值
 *
 * @param cause - 底层错误（适配器抛出的包装错误）
 * @param metadata - 被写实体的元数据（凭约束名反查声明与列）
 * @param attempted - 尝试写入的行值（按属性名取值；UPDATE 传 patch 合并后的值）
 * @returns 归一后的错误类；不是本模块认识的违约时返回 `undefined`（原样上抛）
 *
 * @remarks
 * 约束名由元数据确定性生成：拿违约消息里的约束名与 `metadata.checks` 的编译名比对，
 * 命中单列规则时 `column` / `value` 取该规则字段与尝试行里的值——组规则不猜是哪一条。
 */
export const normalizeEntityWriteConstraintError = (
  cause: unknown,
  metadata: EntityMetadata,
  attempted: Record<string, unknown>
): RxDBCheckViolationError | RxDBExclusionViolationError | undefined => {
  const normalized = normalizeStorageConstraintError(cause);
  if (!normalized) return undefined;
  if (normalized instanceof RxDBExclusionViolationError) return normalized;
  for (const check of metadata.checks) {
    if (compileCheckConstraint(metadata, check).name !== normalized.constraintName) continue;
    const field = singleRuleField(check.rule);
    if (!field) break;
    const column = getEntityColumnName(metadata, field);
    return new RxDBCheckViolationError(
      normalized.constraintName,
      metadata.name,
      column ?? field,
      attempted[field],
      asError(cause)
    );
  }
  return new RxDBCheckViolationError(normalized.constraintName, metadata.name, undefined, undefined, asError(cause));
};
