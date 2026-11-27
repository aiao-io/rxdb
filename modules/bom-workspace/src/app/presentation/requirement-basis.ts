import type { RequirementLine } from '@aiao/rxdb-plugin-bom';
import type { RequirementCalculationBasis } from '../components/step-panel';

interface BasisQueryResult {
  columns: string[];
  rows: unknown[][];
}
interface BasisExecutor {
  query(sql: string, params?: readonly unknown[]): Promise<BasisQueryResult>;
}

/** 依据读取只需要一个事务及事务内参数化查询。 */
export interface RequirementBasisAdapter {
  transaction<T>(read: (executor: BasisExecutor) => Promise<T>, transactionLog?: boolean): Promise<T>;
}

const sourceSql = `SELECT h."id" AS "headerId", o."id" AS "occurrenceId", o."childItemId", r."id" AS "revisionId",
  h."baseQty", h."baseUom", h."assemblyScrap", h."assemblyScrapConvention",
  o."qty", o."qtyFormula", o."isFixedQty", o."tierGroupNo", o."lotsizeFrom", o."lotsizeTo",
  o."componentScrap", o."componentScrapConvention", o."componentScrapFixed",
  o."uom" AS "occurrenceUom", o."uomConversion" AS "occurrenceUomConversion",
  i."uomConversion" AS "itemUomConversion", i."stockUom", i."uomDecimals", h."routingId", o."operationSeq"
  FROM "bom$bom_line_occurrence" o
  JOIN "bom$bom_line" l ON l."id" = o."lineId"
  JOIN "bom$bom_header" h ON h."id" = l."headerId"
  JOIN "bom$item" i ON i."id" = o."childItemId"
  LEFT JOIN "bom$item_revision" r ON r."id" = ? AND r."itemId" = i."id"
  WHERE o."id" = ? AND i."id" = ?`;

const operationsSql = `SELECT op."operationSeq", op."operationScrap" AS "scrap", op."scrapConvention",
  split."ratio", split."operationSeq" AS "splitOperationSeq"
  FROM "bom$routing_operation" op
  LEFT JOIN "bom$bom_line_operation_split" split ON split."occurrenceId" = ? AND split."operationSeq" <= op."operationSeq"
  WHERE op."routingId" = ? AND ((? IS NOT NULL AND op."operationSeq" >= ?) OR (? IS NULL AND split."occurrenceId" IS NOT NULL))
  ORDER BY split."operationSeq", op."operationSeq"`;

const recordOf = (result: BasisQueryResult, row: unknown[]): Record<string, unknown> =>
  Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
const nullableString = (value: unknown): string | null => (value === null ? null : String(value));
const conventionOf = (value: unknown): 'additive' | 'yield' => {
  if (value !== 'additive' && value !== 'yield') throw new Error('计算依据的损耗约定无效');
  return value;
};

const basisOf = (source: Record<string, unknown>): RequirementCalculationBasis => ({
  headerId: String(source['headerId']),
  occurrenceId: String(source['occurrenceId']),
  baseQty: String(source['baseQty']),
  baseUom: String(source['baseUom']),
  assemblyScrap: String(source['assemblyScrap']),
  assemblyScrapConvention: conventionOf(source['assemblyScrapConvention']),
  qty: nullableString(source['qty']),
  qtyFormula: nullableString(source['qtyFormula']),
  isFixedQty: source['isFixedQty'] === true || source['isFixedQty'] === 1,
  ...(source['tierGroupNo'] === undefined ?
    {}
  : {
      tierGroupNo: nullableString(source['tierGroupNo']),
      lotsizeFrom: nullableString(source['lotsizeFrom']),
      lotsizeTo: nullableString(source['lotsizeTo'])
    }),
  componentScrap: String(source['componentScrap']),
  componentScrapConvention: conventionOf(source['componentScrapConvention']),
  componentScrapFixed: String(source['componentScrapFixed']),
  occurrenceUom: String(source['occurrenceUom']),
  occurrenceUomConversion: nullableString(source['occurrenceUomConversion']),
  itemUomConversion: nullableString(source['itemUomConversion']),
  stockUom: String(source['stockUom']),
  uomDecimals: Number(source['uomDecimals']),
  operations: []
});

const readOperations = async (
  executor: BasisExecutor,
  source: Record<string, unknown>
): Promise<NonNullable<RequirementCalculationBasis['operations']>> => {
  const start = source['operationSeq'];
  const result = await executor.query(operationsSql, [
    source['occurrenceId'],
    source['routingId'],
    start,
    start,
    start
  ]);
  return result.rows.map(row => {
    const value = recordOf(result, row);
    return {
      operationSeq: Number(value['operationSeq']),
      scrap: String(value['scrap']),
      scrapConvention: conventionOf(value['scrapConvention']),
      ...(value['ratio'] === null ?
        {}
      : { ratio: String(value['ratio']), splitFrom: Number(value['splitOperationSeq']) })
    };
  });
};

/** 在同一只读快照中加载真实系数，不以中间量倒推或重算数量。 */
export const loadRequirementBasis = async (
  adapter: RequirementBasisAdapter,
  line: RequirementLine
): Promise<RequirementCalculationBasis> => {
  const occurrenceId = line.path[line.path.length - 1];
  if (!occurrenceId) throw new Error('计算依据不存在：需求路径为空');
  return adapter.transaction(async executor => {
    const result = await executor.query(sourceSql, [line.revisionId, occurrenceId, line.itemId]);
    if (result.rows.length !== 1) throw new Error('计算依据不存在：发生项已变化，请重新展开');
    const source = recordOf(result, result.rows[0]);
    if (
      source['childItemId'] !== line.itemId ||
      source['occurrenceId'] !== occurrenceId ||
      source['revisionId'] !== line.revisionId
    )
      throw new Error('计算依据与所选需求不一致，请重新展开');
    const basis = basisOf(source);
    if (line.steps.operationScrapped !== null) basis.operations = await readOperations(executor, source);
    return basis;
  }, false);
};
