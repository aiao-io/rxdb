/**
 * @fileoverview BOM 视图解析器（US-508 首轮）
 *
 * 按显式 {@link ResolutionContext} 解析唯一一份有效行集：父修订选择（按时点取已发布最新或
 * 显式指定）→ released 头与备选判定 → 发生项过滤（生效窗口含评估日）→ 子件修订解析。
 * 全部读取在同一个读事务里完成（AC#15 一致快照）；结果附 manifest，供下游审计与比对。
 */

import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor, buildAlternativeHeadersSql, buildParentRevisionSql, buildResolvedOccurrencesSql } from './bom-sql.js';
import {
  BomResolutionError,
  ResolutionContext,
  ResolutionManifest,
  ResolutionResult,
  ResolvedLineOccurrence
} from './resolution.js';

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
};

/**
 * 按上下文解析父修订 / 头 / 行发生项，返回有效行集与 manifest。
 *
 * @param adapter - 本地适配器（全部读取在 `adapter.transaction` 的一个读事务里，AC#15）
 * @param context - 解析上下文
 * @param target - 解析目标（按时点或显式修订）
 * @returns 解析结果；多备选且未指定时 `occurrences` 为空、manifest 标 `unresolved`
 */
export const resolveBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget
): Promise<ResolutionResult> => {
  assertContext(context);
  if (target.parentItemId === undefined && target.parentRevisionId === undefined) {
    throw new BomResolutionError('parent', '需要 parentItemId 或 parentRevisionId 之一');
  }
  const dialect = bomSqlDialectFor(adapter.name);

  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);
    // 1. 父修订
    const parentSql = buildParentRevisionSql(dialect, {
      itemId: target.parentItemId ?? '',
      asOfDate: context.asOfDate,
      explicitRevisionId: target.parentRevisionId
    });
    const parentResult = await query(parentSql.sql, parentSql.params);
    const parentRow = parentResult.rows[0];
    if (!parentRow) {
      throw new BomResolutionError(
        'parentRevisionId',
        target.parentRevisionId !== undefined ? '父修订不存在' : '评估日前没有已发布的最新修订'
      );
    }
    const parentColumns = parentResult.columns;
    const parentRevisionId = String(parentRow[columnIndexOf(parentColumns, 'revisionId')]);
    const parentItemId = String(parentRow[columnIndexOf(parentColumns, 'itemId')]);
    if (parentRow[columnIndexOf(parentColumns, 'state')] !== 'released') {
      throw new BomResolutionError('parentRevisionId', '父修订未发布，草稿不入解析结果');
    }

    // 2. 备选头判定（AC#3/#11）
    const headersSql = buildAlternativeHeadersSql(dialect, {
      parentRevisionId,
      bomType: context.bomType,
      orgId: context.orgId
    });
    const headersResult = await query(headersSql.sql, headersSql.params);
    const headers = headersResult.rows.map(row => ({
      headerId: String(row[columnIndexOf(headersResult.columns, 'headerId')]),
      alternativeNo: Number(row[columnIndexOf(headersResult.columns, 'alternativeNo')])
    }));
    const selectedHeaders =
      context.alternativeNo !== undefined ?
        headers.filter(header => header.alternativeNo === context.alternativeNo)
      : headers;

    const unresolved =
      selectedHeaders.length > 1 ?
        [
          {
            parentItemId,
            parentRevisionId,
            candidates: selectedHeaders
          }
        ]
      : [];

    // 3. 发生项
    const occurrences: ResolvedLineOccurrence[] = [];
    let occurrenceIds: string[] = [];
    const childRevisions: ResolutionManifest['childRevisions'] = [];
    if (unresolved.length === 0 && selectedHeaders.length > 0) {
      const occSql = buildResolvedOccurrencesSql(dialect, {
        asOfDate: context.asOfDate,
        parentRevisionId,
        bomType: context.bomType,
        orgId: context.orgId,
        alternativeNo: context.alternativeNo
      });
      const occResult = await query(occSql.sql, occSql.params);
      const cols = occResult.columns;
      for (const row of occResult.rows) {
        const occurrence: ResolvedLineOccurrence = {
          lineId: String(row[columnIndexOf(cols, 'lineId')]),
          lineNo: Number(row[columnIndexOf(cols, 'lineNo')]),
          occurrenceId: String(row[columnIndexOf(cols, 'occurrenceId')]),
          childItemId: String(row[columnIndexOf(cols, 'childItemId')]),
          childRevisionId: row[columnIndexOf(cols, 'childRevisionId')] === null ?
            null
          : String(row[columnIndexOf(cols, 'childRevisionId')]),
          resolvedChildRevisionId: row[columnIndexOf(cols, 'resolvedChildRevisionId')] === null ?
            null
          : String(row[columnIndexOf(cols, 'resolvedChildRevisionId')]),
          qty: row[columnIndexOf(cols, 'qty')] === null ? null : String(row[columnIndexOf(cols, 'qty')]),
          effectiveFrom: normalizeDate(row[columnIndexOf(cols, 'effectiveFrom')]) as Date,
          effectiveTo: normalizeDate(row[columnIndexOf(cols, 'effectiveTo')])
        };
        occurrences.push(occurrence);
        if (occurrence.resolvedChildRevisionId !== null) {
          childRevisions.push({
            occurrenceId: occurrence.occurrenceId,
            childItemId: occurrence.childItemId,
            revisionId: occurrence.resolvedChildRevisionId
          });
        }
      }
      occurrenceIds = occurrences.map(occurrence => occurrence.occurrenceId);
    }

    const manifest: ResolutionManifest = {
      context,
      parentItemId,
      parentRevisionId,
      headerIds: selectedHeaders.map(header => header.headerId),
      occurrenceIds,
      childRevisions,
      unresolved
    };

    return { manifest, occurrences };
  }, false);
};
