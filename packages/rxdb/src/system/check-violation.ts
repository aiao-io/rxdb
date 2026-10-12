/**
 * @fileoverview CHECK 违约错误的识别与归一化。
 *
 * 适配器的写入路径（仓储 create/update、批量 mutations、同步分支重放）在抛出原始
 * 数据库错误后，用本模块把它归一成 {@link RxDBCheckViolationError}。识别只认两样
 * 与后端无关的信号：PostgreSQL 的 SQLSTATE `23514`，以及 SQLite 各绑定
 * （wa-sqlite / sqlite-wasm / sqliteai / node / rusqlite）消息里必带的原生文本
 * `CHECK constraint failed: <约束名>`。
 *
 * 只有 `ck_` 起头的约束名且能反查到实体元数据声明时才归一：内置的匿名 CHECK
 * （enum / JSON_VALID / boolean 0-1）与直连 SQL 自建的约束保持原始错误原样上抛，
 * 不改变既有行为。
 */

import type { EntityMetadata } from '../entity/metadata.interface.js';
import { findCheckByConstraintName, referencedCheckFields, CHECK_NAME_PREFIX } from '../entity/check-constraint.js';
import { RxDBCheckViolationError } from '../RxDBError.js';

const errorMessageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * 从原始数据库错误里解析 CHECK 违约的约束名。
 *
 * @param cause - 适配器抛出的原始错误
 * @returns 约束名；不是 CHECK 违约时返回 `undefined`
 */
export const parseCheckConstraintViolation = (cause: unknown): { constraintName: string } | undefined => {
  if (cause !== null && typeof cause === 'object' && (cause as { code?: unknown }).code === '23514') {
    const match = errorMessageOf(cause).match(/check constraint "([^"]+)"/i);
    return match ? { constraintName: match[1] } : undefined;
  }
  const match = errorMessageOf(cause).match(/CHECK constraint failed:\s*([^\s,"]+)/i);
  return match ? { constraintName: match[1] } : undefined;
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
 * @param row - 适配器自己发出的那一行（按**属性名**取值；字段缺失时冲突值记为 `undefined`）
 * @returns 归一后的错误，或原错误
 *
 * @remarks
 * 原生 CHECK 消息不带冲突值，所以冲突值只能取自已发出的那一行——约束声明引用的
 * 每个列（含 `ref` 目标）与该行的值。
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
    fields.map(field => ({
      column: metadata.propertyMap.get(field)?.columnName ?? field,
      value: row[field]
    }))
  );
  return new RxDBCheckViolationError(metadata.name, constraintName, conflicts);
};
