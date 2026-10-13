/**
 * @fileoverview 存储约束漂移比对的共享核心（US-030）。
 *
 * 两后端（SQLite family / PGlite）的漂移检查只有「读实际约束名」这一步是方言：
 * 期望集合由元数据确定性生成，缺失 / 多余差集与抛错逻辑完全一致——各写一份必然像
 * 历史上发生过的那样语义分叉（表缺失时一边静默跳过、一边报全部缺失）。所以差集与抛错
 * 放在这里，适配器只注入「表在不在」与「实际约束名集合」。
 *
 * 比对纳入三类对象，按前缀各自过滤：`ck_` CHECK（阶段 A）、`uq_` 条件唯一索引（阶段 B）、
 * `ex_` 区间排他（阶段 C：PG 是 `EXCLUDE` 约束，SQLite 是它的 `_i` / `_u` 两个触发器，
 * 见 `exclusionTriggerNames`）。外键、`idx_` 普通索引、系统 CRUD 触发器、FTS 触发器
 * 都不在范围（AC#16）。
 */

import { CHECK_NAME_PREFIX, compileCheckConstraint } from '../entity/check-constraint.js';
import {
  compileConditionalUniqueIndex,
  conditionalUniqueIndexesOf,
  UNIQUE_INDEX_NAME_PREFIX
} from '../entity/conditional-unique-index.js';
import { compileExclusionConstraint, EXCLUSION_NAME_PREFIX } from '../entity/exclusion-constraint.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { RxDBConstraintDriftError } from '../RxDBError.js';

/**
 * 一张实体表的漂移比对输入。
 */
export interface EntityConstraintDriftReport {
  /** 实体名（元数据里的 `name`） */
  entity: string;
  /** 表名（元数据里的 `tableName`） */
  tableName: string;
  /** 表本身在目录里不存在（缺表）。与「有表但约束不一致」分开点名（fail-fast）。 */
  tableMissing: boolean;
  /** 元数据确定性生成的约束名（`ck_` / `uq_` / `ex_`，由适配器按本方言的对象形态拼好） */
  expected: readonly string[];
  /** 库里实际的约束名（适配器已过滤到比对范围内） */
  actual: readonly string[];
}

/** 元数据确定性生成的全部 CHECK 约束名。 */
export const expectedCheckConstraintNames = (metadata: EntityMetadata): string[] =>
  Array.from(metadata.checkMap.values(), check => compileCheckConstraint(metadata, check).name);

/** 元数据确定性生成的全部条件唯一索引名（`uq_`，阶段 B）。 */
export const expectedConditionalUniqueIndexNames = (metadata: EntityMetadata): string[] =>
  conditionalUniqueIndexesOf(metadata).map(index => compileConditionalUniqueIndex(metadata, index).name);

/**
 * 元数据确定性生成的全部区间排他约束名（`ex_`，阶段 C）。
 *
 * @remarks
 * 这是**约束**名：PG 上就是 `EXCLUDE` 约束本身；SQLite 上每条约束落成两个触发器，
 * 适配器用 `exclusionTriggerNames` 展开后再比对。
 */
export const expectedExclusionConstraintNames = (metadata: EntityMetadata): string[] =>
  Array.from(metadata.exclusionMap.values(), exclusion => compileExclusionConstraint(metadata, exclusion).name);

/** 漂移比对纳入的对象名前缀：`ck_` CHECK、`uq_` 条件唯一索引、`ex_` 区间排他。 */
export const STORAGE_CONSTRAINT_NAME_PREFIXES = [
  CHECK_NAME_PREFIX,
  UNIQUE_INDEX_NAME_PREFIX,
  EXCLUSION_NAME_PREFIX
] as const;

/**
 * 是否在比对范围内（`ck_` / `uq_` / `ex_` 起头）。
 *
 * @remarks
 * 适配器读目录时按对象类别用**各自的**前缀过滤（表 SQL 里的命名约束只认 `ck_`、索引只认 `uq_`、
 * 触发器只认 `ex_`），本函数回答的是「这个名字归不归漂移检查管」。
 */
export const inDriftScope = (name: string): boolean =>
  STORAGE_CONSTRAINT_NAME_PREFIXES.some(prefix => name.startsWith(prefix));

/**
 * 实体是否声明了任何声明式存储约束（CHECK / 条件唯一索引 / 区间排他，含继承来的）。
 *
 * @remarks
 * 能力判定（AC#6：适配器没有漂移检查即报不支持）与 SQLite 宿主版本门槛（AC#7）都以它为准：
 * 一项都没声明的应用不受这两道门影响。
 */
export const declaresStorageConstraints = (metadata: EntityMetadata): boolean =>
  metadata.checkMap.size > 0 || metadata.exclusionMap.size > 0 || conditionalUniqueIndexesOf(metadata).length > 0;

/**
 * 断言一张实体表没有约束漂移。
 *
 * @param report - 比对输入，见 {@link EntityConstraintDriftReport}
 * @throws {@link RxDBConstraintDriftError} 表缺失、或有缺失 / 多余的约束名时
 *
 * @remarks
 * 只读判定、不自动补建：补建由用户写进 `migrations`，它恰好排在漂移检查之前执行。
 * 表缺失同样 fail-fast——漂移检查的契约是「表应该存在」（缺表补建排在它之前），
 * 静默跳过会把这轮 connect 变成一个两边语义不同的半成品。
 */
export const assertNoEntityConstraintDrift = (report: EntityConstraintDriftReport): void => {
  if (report.tableMissing) {
    throw new RxDBConstraintDriftError(report.entity, report.tableName, [...report.expected].sort(), [], true);
  }
  const expected = new Set(report.expected);
  const actual = new Set(report.actual);
  const missing = Array.from(expected)
    .filter(name => !actual.has(name))
    .sort();
  const extra = Array.from(actual)
    .filter(name => !expected.has(name))
    .sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new RxDBConstraintDriftError(report.entity, report.tableName, missing, extra);
  }
};
