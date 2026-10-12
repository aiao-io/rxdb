/**
 * @fileoverview CHECK 违约错误的识别与归一化。
 *
 * 适配器的写入路径（仓储 create/update、批量 mutations、同步分支重放）在抛出原始
 * 数据库错误后，用本模块把它归一成 {@link RxDBCheckViolationError}。识别口径与
 * {@link isUniqueConstraintViolation} 一致的双重识别：PostgreSQL 的 SQLSTATE `23514`
 * 优先，再回退到消息文本 `violates check constraint "…"`（worker 模式 / 错误再包装
 * 会丢 SQLSTATE）；SQLite 各绑定（wa-sqlite / sqlite-wasm / sqliteai / node / rusqlite）
 * 的消息里必带原生文本 `CHECK constraint failed: <约束名>`，取**最后**一次匹配——
 * 部分绑定会回显整条 SQL，数据字面量里的同名片段不能抢先命中。
 *
 * 只有 `ck_` 起头的约束名且能反查到实体元数据声明时才归一：内置的匿名 CHECK
 * （enum / JSON_VALID / boolean 0-1）与直连 SQL 自建的约束保持原始错误原样上抛，
 * 不改变既有行为。归一后的错误按仓库 `cause` 惯例（见 {@link RxDBPartialSyncError}）
 * 挂原始错误。
 */

import { CHECK_NAME_PREFIX, findCheckByConstraintName, referencedCheckFields } from '../entity/check-constraint.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { RxDBCheckViolationError } from '../RxDBError.js';

const errorMessageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** PostgreSQL 的 CHECK 违约：SQLSTATE `23514`，或（worker / 再包装后）消息里的约束名。 */
const PG_CHECK_VIOLATION_PATTERN = /violates check constraint "([^"]+)"/i;

/** SQLite 的原生违约文本。取**最后**一次匹配，见本文件 @fileoverview。 */
const SQLITE_CHECK_VIOLATION_PATTERN = /CHECK constraint failed:\s*([^\s,"]+)/gi;

/** 在消息文本里取 SQLite 违约约束名的最后一次出现。 */
const lastSqliteCheckViolationName = (message: string): string | undefined => {
  let last: string | undefined;
  for (const match of message.matchAll(SQLITE_CHECK_VIOLATION_PATTERN)) {
    last = match[1];
  }
  return last;
};

/**
 * 从原始数据库错误里解析 CHECK 违约的约束名。
 *
 * @param cause - 适配器抛出的原始错误
 * @returns 约束名；不是 CHECK 违约时返回 `undefined`
 */
export const parseCheckConstraintViolation = (cause: unknown): { constraintName: string } | undefined => {
  if (cause !== null && typeof cause === 'object' && (cause as { code?: unknown }).code === '23514') {
    const match = errorMessageOf(cause).match(PG_CHECK_VIOLATION_PATTERN);
    return match ? { constraintName: match[1] } : undefined;
  }
  const message = errorMessageOf(cause);
  const sqlite = lastSqliteCheckViolationName(message);
  if (sqlite) return { constraintName: sqlite };
  const pg = message.match(PG_CHECK_VIOLATION_PATTERN);
  return pg ? { constraintName: pg[1] } : undefined;
};

/**
 * 判定原始错误是否为元数据声明的 CHECK 违约（用于消息里带不带冲突值的分支）。
 *
 * @param cause - 适配器抛出的原始错误
 * @param metadata - 写入实体的元数据
 * @returns 能反查到声明的 CHECK 时返回约束名
 */
export const declaredCheckViolationOf = (cause: unknown, metadata: EntityMetadata): string | undefined => {
  const parsed = parseCheckConstraintViolation(cause);
  if (!parsed || !parsed.constraintName.startsWith(CHECK_NAME_PREFIX)) return undefined;
  return findCheckByConstraintName(metadata, parsed.constraintName) ? parsed.constraintName : undefined;
};

/**
 * 把 CHECK 违约的原始错误归一成 {@link RxDBCheckViolationError}。
 *
 * @param cause - 适配器抛出的原始错误；不是本实体声明的 CHECK 违约时原样返回
 * @param metadata - 写入实体的元数据
 * @param row - 适配器自己发出的那一行（按**属性名**取值；键不存在的列不上报）
 * @returns 归一后的错误，或原错误
 *
 * @remarks
 * 原生 CHECK 消息不带冲突值，所以冲突值只能取自已发出的那一行——约束声明引用的
 * 每个列（含 `ref` 目标）与该行的值。行里**没有**该键的列（同步重放的增量 patch）
 * 不上报，避免误导性的 `undefined` 冲突值。
 */
export const toCheckViolationError = (
  cause: unknown,
  metadata: EntityMetadata,
  row: Readonly<Record<string, unknown>>
): unknown => toCheckViolationErrorForRows(cause, metadata, [row]);

/**
 * 多行批量写入的 CHECK 违约归一化：冲突值按行并列（批量 INSERT 命中哪一行原生消息不说，
 * 全部候选行的值都列出）。
 */
export const toCheckViolationErrorForRows = (
  cause: unknown,
  metadata: EntityMetadata,
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>
): unknown => {
  const constraintName = declaredCheckViolationOf(cause, metadata);
  if (!constraintName) return cause;
  const fields = referencedCheckFields(findCheckByConstraintName(metadata, constraintName)!);
  const conflicts = rows.flatMap(row =>
    fields
      .filter(field => Object.prototype.hasOwnProperty.call(row, field))
      .map(field => ({
        column: metadata.propertyMap.get(field)?.columnName ?? field,
        value: row[field]
      }))
  );
  return new RxDBCheckViolationError(metadata.name, constraintName, conflicts, cause);
};
