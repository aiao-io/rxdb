/**
 * @fileoverview BOM 视图解析器（US-508 首轮）
 *
 * 按显式 {@link ResolutionContext} 解析唯一一份有效行集：父修订选择（按时点取已发布最新或
 * 显式指定）→ released 头与备选判定 → 发生项过滤（生效窗口含评估日）→ 子件修订解析。
 * 全部读取在同一个读事务里完成（AC#15 一致快照）；结果附 manifest，供下游审计与比对。
 */

import type { BomLocalAdapter } from './bom-adapter.js';
import { BomResolutionError, type ResolutionContext, type ResolutionResult } from './resolution.js';

/** 解析目标：按时点选择父修订，或显式指定修订。 */
export interface ResolveTarget {
  /** 按评估日取该物料已发布的最新修订（US-508 AC#6）。 */
  parentItemId?: string;
  /** 显式指定父修订。 */
  parentRevisionId?: string;
}

/** 事务执行器的查询面（两后端已归一为 `{ columns, rows }`）。 */
export interface BomQueryExecutor {
  query(sql: string, params?: unknown[]): Promise<{ columns: string[]; rows: unknown[][] }>;
}

/** 把执行器返回的行值归一为 JS 值（日期列在 SQLite 是 ISO 文本、PGlite 是 Date）。 */
export const normalizeDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 取行内指定列（按列名解析下标，避免列序耦合）。 */
export const columnIndexOf = (columns: string[], name: string): number => {
  const index = columns.indexOf(name);
  if (index === -1) throw new Error(`[rxdb-plugin-bom] 查询结果缺少列 ${name}`);
  return index;
};

/**
 * 校验解析上下文：`asOfDate` 必填（AC#7），类型与组织必填。
 */
export const assertContext = (context: ResolutionContext): void => {
  if (!context.asOfDate || Number.isNaN(context.asOfDate.getTime())) {
    throw new BomResolutionError('asOfDate', '评估日必填，不读系统时钟、不默认今天');
  }
  if (!context.bomType) throw new BomResolutionError('bomType', '必填');
  if (!context.orgId) throw new BomResolutionError('orgId', '必填');
  if (context.unit !== undefined && (!Number.isSafeInteger(context.unit) || context.unit < 1)) {
    throw new BomResolutionError('unit', '序列号必须是从 1 起的安全整数');
  }
};

/**
 * 根修订的备选头裁决（{@link ResolutionContext.alternativeNo} 只裁决根头，四引擎共用）。
 *
 * @param headers - 根修订在上下文下的已发布头（含备选编号）
 * @param context - 解析上下文
 * @param parentRevisionId - 根修订 id（错误点名用）
 * @returns 指定时为命中的那个头；未指定时原样返回全部（调用方按 0 / 1 / 多 处理，多 = unresolved）
 * @throws {@link BomResolutionError} 指定了根修订在上下文下不存在的备选编号（字段 `alternativeNo`）
 */
export const selectRootAlternatives = <T extends { alternativeNo: number }>(
  headers: readonly T[],
  context: ResolutionContext,
  parentRevisionId: string
): T[] => {
  if (context.alternativeNo === undefined) return [...headers];
  const selected = headers.filter(header => header.alternativeNo === context.alternativeNo);
  if (selected.length === 0) {
    const existing = headers.map(header => header.alternativeNo).join('、');
    throw new BomResolutionError(
      'alternativeNo',
      `根修订 ${parentRevisionId} 在上下文下没有备选 ${context.alternativeNo}（已发布备选：${existing || '无'}）`
    );
  }
  return selected;
};

/**
 * 按上下文解析父修订 / 头 / 行发生项，返回有效行集与 manifest。
 *
 * @param adapter - 本地适配器（全部读取在 `adapter.transaction` 的一个读事务里，AC#15）
 * @param context - 解析上下文
 * @param target - 解析目标（按时点或显式修订）
 * @returns 解析结果；多备选且未指定时 `occurrences` 为空、manifest 标 `unresolved`
 * @throws {@link BomResolutionError} 指定的 `alternativeNo` 在根修订上不存在
 */
export const resolveBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget
): Promise<ResolutionResult> => (await import('./resolver-engine.js')).resolveBom(adapter, context, target);
