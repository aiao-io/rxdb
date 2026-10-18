import { BomCostError } from './quantity/cost-error.js';
import type { CostNodeDetail, CostRollupContext, CostRollupResult } from './quantity/cost.js';
import { decimalDiv, decimalFromCanonical, decimalMul, decimalToCanonical } from './quantity/decimal.js';
import type { PlannedQuantity } from './quantity/explosion.js';
import type { JointCostOutputInput, JointCostSummary } from './quantity/joint-cost.js';
import { convertUom } from './quantity/uom.js';
import type { BomSqlDialect } from './resolve/bom-sql.js';
import type { ResolutionContext } from './resolve/resolution.js';
import type { BomQueryExecutor } from './resolve/resolver.js';
export { BomJointCostSourceError } from './quantity/joint-cost-error.js';

/** 联产来源选择仅扩展成本上下文，不改变数量与默认单产解析输入。 */
export interface JointCostRollupContext extends CostRollupContext {
  jointCostSources?: Readonly<Record<string, string>>;
}

/** 一个已解析生产头在指定批量下的主产物集合。 */
export interface JointProduction {
  headerId: string;
  parentRevisionId: string;
  parentItemId: string;
  baseQty: string;
  baseUom: string;
  outputs: readonly JointCostOutputInput[];
}

/** 实际用于下游材料计价的联产来源依据。 */
export interface JointCostSourceUse {
  outputRevisionId: string;
  producerHeaderId: string;
  outputLineId: string | null;
  outputOccurrenceId: string | null;
  share: string;
  qty: string;
  uom: string;
}

/** 联产数据才出现的成本节点扩展，旧单产不新增空字段。 */
export interface JointCostNodeDetail extends CostNodeDetail {
  jointCost?: JointCostSummary;
}

/** 联产数据的可选来源依据，不向旧单产结果附加空 manifest。 */
export interface JointCostRollupResult extends CostRollupResult {
  context: JointCostRollupContext;
  root: JointCostNodeDetail;
  jointManifest?: { sources: readonly JointCostSourceUse[] };
}

/** 同一组织与BOM类型下可供显式选择的生产头。 */
export interface JointProducerHeader {
  headerId: string;
  parentRevisionId: string;
  parentItemId: string;
  baseUom: string;
  baseQty: string;
  assemblyScrap: string;
  assemblyScrapConvention: 'additive' | 'yield';
  costLotQty: string | null;
  routingId: string | null;
}

type Query = BomQueryExecutor['query'];
type Row = Record<string, unknown>;
const records = async (query: Query, sql: string, params: unknown[] = []): Promise<Row[]> => {
  const result = await query(sql, params);
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
};

const visibleOutputs = async (
  query: Query,
  dialect: BomSqlDialect,
  context: ResolutionContext,
  selection: { headerId?: string; revisionId?: string }
): Promise<Row[]> => {
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(dialect.encode(value));
    return dialect.placeholder(params.length - 1);
  };
  const filters = [
    `o."flowDirection" = 'produce'`,
    `h."state" = 'released'`,
    `r."state" = 'released'`,
    `r."effectiveFrom" <= ${bind(context.asOfDate)}`,
    `h."bomType" = ${bind(context.bomType)}`,
    `h."orgId" = ${bind(context.orgId)}`,
    `o."effectiveFrom" <= ${bind(context.asOfDate)}`,
    `(o."ecnInId" IS NULL OR EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = o."ecnInId" AND e."state" = 'released'))`,
    `(l."ecnInId" IS NULL OR EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = l."ecnInId" AND e."state" = 'released'))`,
    `(o."effectiveTo" IS NULL OR o."effectiveTo" > ${bind(context.asOfDate)} OR (o."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = o."ecnOutId" AND e."state" = 'released')))`
  ];
  if (selection.headerId !== undefined) filters.push(`h."id" = ${bind(selection.headerId)}`);
  if (selection.revisionId !== undefined) filters.push(`o."childRevisionId" = ${bind(selection.revisionId)}`);
  return records(
    query,
    `SELECT h."id" AS "headerId", h."parentRevisionId", r."itemId" AS "parentItemId", h."baseUom", h."baseQty", h."assemblyScrap", h."assemblyScrapConvention", h."costLotQty", h."routingId", o."id" AS "occurrenceId", l."id" AS "lineId", l."lineNo", o."childItemId" AS "itemId", o."childRevisionId" AS "revisionId", o."qty", o."uom", o."jointCostShare" AS "share" FROM ${dialect.table('bom_line_occurrence')} o JOIN ${dialect.table('bom_line')} l ON l."id" = o."lineId" JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId" JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE ${filters.join(' AND ')} ORDER BY h."id", l."lineNo", l."id", o."id"`,
    params
  );
};

/** 在当前读取快照中列出精确输出修订的来源候选，不擅自选择。 */
export const findJointCostSources = async (
  query: Query,
  dialect: BomSqlDialect,
  context: ResolutionContext,
  outputRevisionId: string
): Promise<JointProducerHeader[]> => {
  const rows = await visibleOutputs(query, dialect, context, { revisionId: outputRevisionId });
  return [
    ...new Map(
      rows.map(row => [
        String(row['headerId']),
        {
          headerId: String(row['headerId']),
          parentRevisionId: String(row['parentRevisionId']),
          parentItemId: String(row['parentItemId']),
          baseUom: String(row['baseUom']),
          baseQty: String(row['baseQty']),
          assemblyScrap: String(row['assemblyScrap']),
          assemblyScrapConvention: String(row['assemblyScrapConvention']) as 'additive' | 'yield',
          costLotQty: row['costLotQty'] === null ? null : String(row['costLotQty']),
          routingId: row['routingId'] === null ? null : String(row['routingId'])
        }
      ])
    ).values()
  ];
};

/**
 * 在调用方已有的读取快照中装载生产头及其有效联产品，不另开事务。
 *
 * @param query - 当前事务的真实查询执行器
 * @param dialect - 当前后端的表名与占位符规则
 * @param input - 明确上下文、生产头与第一主产物计划量
 * @returns 联产头的完整输出集合；普通单产返回 null
 */
export const readJointProduction = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  input: { context: ResolutionContext; headerId: string; plannedQty: PlannedQuantity }
): Promise<JointProduction | null> => {
  const headers = await records(
    query,
    `SELECT h."id", h."parentRevisionId", r."itemId", h."baseQty", h."baseUom", h."jointCostShare" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE h."id" = ${dialect.placeholder(0)} AND h."state" = 'released' AND r."state" = 'released' AND h."bomType" = ${dialect.placeholder(1)} AND h."orgId" = ${dialect.placeholder(2)}`,
    [input.headerId, input.context.bomType, input.context.orgId]
  );
  const header = headers[0];
  if (header === undefined) throw new BomCostError(input.headerId, '联产来源头不适用于当前组织/类型');
  const rows = await visibleOutputs(query, dialect, input.context, { headerId: input.headerId });
  if (rows.length === 0 && header['jointCostShare'] === null) return null;
  if (header['jointCostShare'] === null) throw new BomCostError(input.headerId, '联产头缺少jointCostShare');
  const planned = convertUom(input.plannedQty.value, input.plannedQty.uom, String(header['baseUom']));
  const ratio = decimalDiv(decimalFromCanonical(planned), decimalFromCanonical(String(header['baseQty'])));
  const outputs: JointCostOutputInput[] = [
    {
      kind: 'primary',
      itemId: String(header['itemId']),
      revisionId: String(header['parentRevisionId']),
      lineId: null,
      occurrenceId: null,
      lineNo: null,
      qty: planned,
      uom: String(header['baseUom']),
      share: String(header['jointCostShare'])
    },
    ...rows.map(row => ({
      kind: 'coproduct' as const,
      itemId: String(row['itemId']),
      revisionId: String(row['revisionId']),
      lineId: String(row['lineId']),
      occurrenceId: String(row['occurrenceId']),
      lineNo: Number(row['lineNo']),
      qty: decimalToCanonical(decimalMul(decimalFromCanonical(String(row['qty'])), ratio)),
      uom: String(row['uom']),
      share: String(row['share'])
    }))
  ];
  return {
    headerId: input.headerId,
    parentRevisionId: String(header['parentRevisionId']),
    parentItemId: String(header['itemId']),
    baseQty: String(header['baseQty']),
    baseUom: String(header['baseUom']),
    outputs
  };
};
