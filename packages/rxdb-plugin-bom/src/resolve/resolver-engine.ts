import type { BomLocalAdapter } from './bom-adapter.js';
import {
  bomSqlDialectFor,
  buildAlternativeHeadersSql,
  buildParentRevisionSql,
  buildResolvedOccurrencesSql
} from './bom-sql.js';
import { filterResolutionRows } from './config-validate.js';
import {
  BomResolutionError,
  type ResolutionContext,
  type ResolutionManifest,
  type ResolutionResult,
  type ResolvedLineOccurrence
} from './resolution.js';
import {
  assertContext,
  columnIndexOf,
  normalizeDate,
  selectRootAlternatives,
  type BomQueryExecutor,
  type ResolveTarget
} from './resolver.js';

/** 按需执行既有单快照解析，查询和领域校验顺序保持不变。 */
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
    const selectedHeaders = selectRootAlternatives(headers, context, parentRevisionId);

    const unresolved: ResolutionManifest['unresolved'] =
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
        alternativeNo: selectedHeaders[0].alternativeNo
      });
      const occResult = await query(occSql.sql, occSql.params);
      const cols = occResult.columns;
      const filtered = await filterResolutionRows(
        query,
        dialect,
        context,
        occResult.rows.map(row => ({
          row,
          headerId: selectedHeaders[0].headerId,
          alternativeNo: selectedHeaders[0].alternativeNo,
          parentItemId,
          parentRevisionId,
          lineId: String(row[columnIndexOf(cols, 'lineId')]),
          occurrenceId: String(row[columnIndexOf(cols, 'occurrenceId')]),
          childItemId: String(row[columnIndexOf(cols, 'childItemId')]),
          unitFrom: row[columnIndexOf(cols, 'unitFrom')] === null ? null : Number(row[columnIndexOf(cols, 'unitFrom')]),
          unitTo: row[columnIndexOf(cols, 'unitTo')] === null ? null : Number(row[columnIndexOf(cols, 'unitTo')]),
          lotCodes: row[columnIndexOf(cols, 'lotCodes')] === null ? null : String(row[columnIndexOf(cols, 'lotCodes')]),
          selectionConditionId:
            row[columnIndexOf(cols, 'selectionConditionId')] === null ?
              null
            : String(row[columnIndexOf(cols, 'selectionConditionId')])
        })),
        unresolved
      );
      for (const { row } of filtered) {
        const occurrence: ResolvedLineOccurrence = {
          lineId: String(row[columnIndexOf(cols, 'lineId')]),
          lineNo: Number(row[columnIndexOf(cols, 'lineNo')]),
          occurrenceId: String(row[columnIndexOf(cols, 'occurrenceId')]),
          childItemId: String(row[columnIndexOf(cols, 'childItemId')]),
          childRevisionId:
            row[columnIndexOf(cols, 'childRevisionId')] === null ?
              null
            : String(row[columnIndexOf(cols, 'childRevisionId')]),
          resolvedChildRevisionId:
            row[columnIndexOf(cols, 'resolvedChildRevisionId')] === null ?
              null
            : String(row[columnIndexOf(cols, 'resolvedChildRevisionId')]),
          qty: row[columnIndexOf(cols, 'qty')] === null ? null : String(row[columnIndexOf(cols, 'qty')]),
          ...(row[columnIndexOf(cols, 'qtyFormula')] === null ?
            {}
          : {
              qtyFormula: String(row[columnIndexOf(cols, 'qtyFormula')]),
              formulaGrammarVersion:
                row[columnIndexOf(cols, 'formulaGrammarVersion')] === null ?
                  null
                : String(row[columnIndexOf(cols, 'formulaGrammarVersion')])
            }),
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
