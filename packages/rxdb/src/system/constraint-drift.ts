/**
 * @fileoverview 存储约束漂移比对的共享核心（US-030 阶段 A）。
 *
 * 两后端（SQLite family / PGlite）的漂移检查只有「读实际约束名」这一步是方言：
 * 期望集合由元数据确定性生成（{@link expectedCheckConstraintNames}），缺失 / 多余
 * 差集与抛错逻辑完全一致——各写一份必然像历史上发生过的那样语义分叉
 * （表缺失时一边静默跳过、一边报全部缺失）。所以差集与抛错放在这里，
 * 适配器只注入「表在不在」与「实际约束名集合」。
 *
 * 比对只纳入 `ck_` 起头对象（阶段 A 范围）；`uq_` / `ex_`（阶段 B / C）沿用
 * 同一差集与错误类，届时只需扩前缀过滤。
 */

import { CHECK_NAME_PREFIX, compileCheckConstraint } from '../entity/check-constraint.js';
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
  /** 元数据确定性生成的约束名（阶段 A 只含 `ck_`） */
  expected: readonly string[];
  /** 库里实际的约束名（适配器已过滤到比对范围内） */
  actual: readonly string[];
}

/** 元数据确定性生成的全部 CHECK 约束名。 */
export const expectedCheckConstraintNames = (metadata: EntityMetadata): string[] =>
  Array.from(metadata.checkMap.values(), check => compileCheckConstraint(metadata, check).name);

/** 只保留比对范围内的约束名（阶段 A：`ck_` 起头）。 */
export const inDriftScope = (name: string): boolean => name.startsWith(CHECK_NAME_PREFIX);

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
