/**
 * @fileoverview 成本卷算引擎（US-514）
 *
 * 按拓扑逆序单遍（递归后序 + `unit_cost` 独立 memo）算 `batch_cost(n, L)` 与 `unit_cost(n)`：
 * 材料 = Σ 本层局部需求（US-511 第 2~6 步共享实现，换算到子头 base_uom）× 子件 unit_cost；
 * 加工 = Σ 工序（setup + run × W_op + fixed，time_uom 求和 → 换算 rate_uom）× 费率（按费率日取区间值）；
 * 制费 = Σ 换算后工时 × 工作中心 overhead_rate；副产抵减 = Σ by_product 产出量 × credit_price。
 * 节点是已解析头（缓存键含修订/类型/组织/备选与 as_of_date/币种/费率日）；虚拟件不是节点；
 * 环、缺成本、缺费率、币种不符、unresolved/truncated 一律报错，不以 0 兜底。
 */

import {
  BomJointCostSourceError,
  findJointCostSources,
  readJointProduction,
  type JointCostSourceUse
} from '../coproduct.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor, buildAlternativeHeadersSql, buildParentRevisionSql } from '../resolve/bom-sql.js';
import { BomResolutionError, type ResolutionContext } from '../resolve/resolution.js';
import {
  assertContext,
  columnIndexOf,
  selectRootAlternatives,
  type BomQueryExecutor,
  type ResolveTarget
} from '../resolve/resolver.js';
import { BomError } from '../types.js';
import { BomCostError } from './cost-error.js';
import {
  decimalAdd,
  decimalDiv,
  decimalFromCanonical,
  decimalIsZero,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';
import {
  fetchHeaderRows,
  resolveChildHeader,
  rowHopRates,
  substituteMemberOf,
  type ResolvedChildHeader
} from './explosion.js';
import { allocateJointCost, type JointCostSummary } from './joint-cost.js';
import {
  allocateSubstituteShares,
  computeGross,
  computeLayerNet,
  computeOutputQuantity,
  operationScrapChain,
  scrap,
  selectTierRows,
  substitutePrimaryOf,
  type LayerRoutingOp
} from './layer.js';
import { normalizePlannedQuantity } from './planned-quantity.js';
import { findMissingOperation, routingUncoveredReason } from './routing-effectivity.js';
import { convertUom, type UomConversionRates } from './uom.js';

export { BomCostError } from './cost-error.js';

/** 成本卷算的上下文：评估日 + 币种 + 费率日（与 as_of_date 一并进缓存键）。 */
export interface CostRollupContext extends ResolutionContext {
  bomType: 'ebom' | 'mbom' | 'sales';
  orgId: string;
  asOfDate: Date;
  currency: string;
  rateDate: Date;
  formulaParams?: Record<string, string>;
  /** 已解析输出修订到生产头的显式联产成本来源。 */
  jointCostSources?: Readonly<Record<string, string>>;
  substituteSelections?: ResolutionContext['substituteSelections'];
  substituteAvailabilities?: ResolutionContext['substituteAvailabilities'];
}

/** 一条材料明细（本层局部）。 */
export interface CostMaterialLine {
  occurrenceId: string;
  childItemId: string;
  /** 本层需求（换算到子头 base_uom 或外购 price_uom 后）。 */
  demand: string;
  demandUom: string;
  unitCost: string;
  amount: string;
}

/** 一条加工明细（一道工序）。 */
export interface CostProcessingLine {
  operationSeq: number;
  setup: string;
  run: string;
  fixed: string;
  hours: string;
  timeUom: string;
  rateHours: string;
  rateUom: string;
  rate: string;
  amount: string;
}

/** 一条副产抵减明细。 */
export interface CostCreditLine {
  occurrenceId: string;
  childItemId: string;
  /** 按抵减价的计价单位折算后的副产量。 */
  outQty: string;
  /** 抵减价的计价单位；未声明 priceUom 时为库存单位。 */
  outUom: string;
  creditPrice: string;
  amount: string;
}

/** 一个成本节点的明细（逐层可展开）。 */
export interface CostNodeDetail {
  headerId: string;
  itemId: string;
  batchQty: string;
  baseUom: string;
  costLotQty: string;
  batchCost: string;
  unitCost: string;
  material: CostMaterialLine[];
  processing: CostProcessingLine[];
  overhead: string;
  overheadReason: '按工时计' | '无路线' | '工作中心未声明制费';
  credits: CostCreditLine[];
  children: CostNodeDetail[];
  /** 仅联产数据提供过程净成本与各主产物分配明细。 */
  jointCost?: JointCostSummary;
}

/** 卷算结果：根节点明细树（金额均为规范十进制串，币种由上下文给出）。 */
export interface CostRollupResult {
  context: CostRollupContext;
  root: CostNodeDetail;
  /** 仅实际消费联产来源时记录本快照的选择依据。 */
  jointManifest?: { sources: readonly JointCostSourceUse[] };
}

type ExplosionRowLike =
  Parameters<typeof fetchHeaderRows>[0] extends never ? never
  : Awaited<ReturnType<typeof fetchHeaderRows>> extends Map<string, infer R> ?
    R extends (infer T)[] ?
      T
    : never
  : never;

interface JointUnitPrice {
  unitCost: string;
  uom: string;
  rates: UomConversionRates;
}

interface HeaderMeta {
  headerId: string;
  parentItemId: string;
  parentRevisionId: string;
  baseUom: string;
  baseQty: string;
  assemblyScrap: string;
  assemblyScrapConvention: 'additive' | 'yield';
  costLotQty: string | null;
  routingId: string | null;
}

interface LayerCostDetail {
  material: CostMaterialLine[];
  processing: CostProcessingLine[];
  credits: CostCreditLine[];
  children: CostNodeDetail[];
  batchCost: Decimal;
  overhead: Decimal;
  overheadReason: CostNodeDetail['overheadReason'];
}

const sumAmounts = (lines: readonly { amount: string }[]): Decimal =>
  lines.reduce((total, line) => decimalAdd(total, decimalFromCanonical(line.amount)), { coeff: 0n, exp: 0 });

const headerMetaOf = (child: ResolvedChildHeader, itemId: string, revisionId: string): HeaderMeta => ({
  headerId: child.headerId,
  parentItemId: itemId,
  parentRevisionId: revisionId,
  baseUom: child.baseUom,
  baseQty: child.baseQty,
  assemblyScrap: child.assemblyScrap,
  assemblyScrapConvention: child.assemblyScrapConvention,
  costLotQty: child.costLotQty,
  routingId: child.routingId
});

/** 事务执行器查询（rows 数组归一）。 */
type CostQuery = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[][] }>;

const queryRows = async (query: CostQuery, sql: string, params?: unknown[]): Promise<unknown[][]> =>
  (await query(sql, params)).rows;

/** 按 (work_center, activity_type) 取费率日的生效费率（validFrom ≤ 费率日 最大者）；缺失即报错。 */
const fetchRate = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  workCenterId: string,
  activityTypeId: string,
  rateDate: Date,
  currency: string
): Promise<{ rate: string; rateUom: string }> => {
  const rateTable = dialect.table('activity_rate');
  const rows = await queryRows(
    query,
    `SELECT "rate", "rateUom", "currency" FROM ${rateTable} WHERE "workCenterId" = ${dialect.placeholder(0)} AND "activityTypeId" = ${dialect.placeholder(1)}` +
      ` AND "validFrom" <= ${dialect.placeholder(2)} ORDER BY "validFrom" DESC LIMIT 1`,
    [workCenterId, activityTypeId, dialect.encode(rateDate)]
  );
  if (rows.length === 0) {
    throw new BomCostError(
      `工序费率（work_center=${workCenterId}, activity=${activityTypeId}, 费率日=${rateDate.toISOString().slice(0, 10)}）`,
      '无生效费率，不以 0 兜底'
    );
  }
  if (String(rows[0][2]) !== currency) {
    throw new BomCostError('费率的币种', `费率币种 ${String(rows[0][2])} 与上下文币种 ${currency} 不符`);
  }
  return { rate: String(rows[0][0]), rateUom: String(rows[0][1]) };
};

/** 头挂路由时读工序（工时 + 损耗）与工作中心；无路由返回空。 */
const fetchRoutingOps = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  routingId: string,
  asOfDate: Date
): Promise<{
  operations: {
    operationSeq: number;
    operationScrap: string;
    scrapConvention: 'additive' | 'yield';
    setupTime: string;
    runTime: string;
    fixedTime: string;
    timeUom: string;
    workCenterId: string;
  }[];
  uncoveredReason: string | null;
}> => {
  const routingTable = dialect.table('routing');
  const routingRows = await queryRows(
    query,
    `SELECT "validFrom" AS "validFrom", "disabledAt" AS "disabledAt" FROM ${routingTable} WHERE "id" = ${dialect.placeholder(0)}`,
    [routingId]
  );
  const validity = routingRows[0];
  const uncoveredReason = routingUncoveredReason(
    validity === undefined ? undefined : { validFrom: validity[0], disabledAt: validity[1] },
    asOfDate
  );
  const opTable = dialect.table('routing_operation');
  const rows = await queryRows(
    query,
    `SELECT "operationSeq", "operationScrap", "scrapConvention", "setupTime", "runTime", "fixedTime", "timeUom", "workCenterId" FROM ${opTable} WHERE "routingId" = ${dialect.placeholder(0)} ORDER BY "operationSeq" ASC`,
    [routingId]
  );
  return {
    uncoveredReason,
    operations: rows.map(row => ({
      operationSeq: Number(row[0]),
      operationScrap: String(row[1]),
      scrapConvention: String(row[2]) as 'additive' | 'yield',
      setupTime: String(row[3]),
      runTime: String(row[4]),
      fixedTime: String(row[5]),
      timeUom: String(row[6]),
      workCenterId: String(row[7])
    }))
  };
};

/** 物料的成本字段（价格 / 抵减价 / 换算）。 */
const fetchItemCost = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  itemId: string
): Promise<{
  unitPrice: string | null;
  priceUom: string | null;
  priceCurrency: string | null;
  creditPrice: string | null;
  uomConversion: string | null;
}> => {
  const rows = await queryRows(
    query,
    `SELECT "unitPrice", "priceUom", "priceCurrency", "creditPrice", "uomConversion" FROM ${dialect.table('item')} WHERE "id" = ${dialect.placeholder(0)}`,
    [itemId]
  );
  if (rows.length === 0) throw new BomCostError(`物料 ${itemId}`, '不存在');
  return {
    unitPrice: rows[0][0] === null ? null : String(rows[0][0]),
    priceUom: rows[0][1] === null ? null : String(rows[0][1]),
    priceCurrency: rows[0][2] === null ? null : String(rows[0][2]),
    creditPrice: rows[0][3] === null ? null : String(rows[0][3]),
    uomConversion: rows[0][4] === null ? null : String(rows[0][4])
  };
};

/** 工作中心的制费属性。 */
const fetchCenterCost = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  workCenterId: string
): Promise<{ overheadRate: string | null; overheadCurrency: string | null }> => {
  const rows = await queryRows(
    query,
    `SELECT "overheadRate", "overheadCurrency" FROM ${dialect.table('work_center')} WHERE "id" = ${dialect.placeholder(0)}`,
    [workCenterId]
  );
  return {
    overheadRate: rows[0][0] === null ? null : String(rows[0][0]),
    overheadCurrency: rows[0][1] === null ? null : String(rows[0][1])
  };
};

/** 工序所属工作中心的（第一个）作业类型 id（首轮工作中心单作业类型）。 */
const fetchActivityTypeId = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  workCenterId: string
): Promise<string> => {
  const rows = await queryRows(
    query,
    `SELECT "id" FROM ${dialect.table('activity_type')} WHERE "workCenterId" = ${dialect.placeholder(0)} ORDER BY "code" LIMIT 1`,
    [workCenterId]
  );
  if (rows.length === 0) throw new BomCostError(`工作中心 ${workCenterId}`, '没有作业类型，费率无从取值');
  return String(rows[0][0]);
};

/** IN 列表分块大小（避开两后端的绑定变量上限，与展开引擎同值）。 */
const SPLIT_CHUNK_SIZE = 200;

/** 行发生项的分摊（按 occurrenceId 收集；IN 列表走占位符分块绑定）。 */
const fetchSplits = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  occurrenceIds: string[]
): Promise<Map<string, { operationSeq: number; ratio: string }[]>> => {
  const map = new Map<string, { operationSeq: number; ratio: string }[]>();
  for (let offset = 0; offset < occurrenceIds.length; offset += SPLIT_CHUNK_SIZE) {
    const chunk = occurrenceIds.slice(offset, offset + SPLIT_CHUNK_SIZE);
    const rows = await queryRows(
      query,
      `SELECT "occurrenceId", "operationSeq", "ratio" FROM ${dialect.table('bom_line_operation_split')} WHERE "occurrenceId" IN (${chunk.map((_, index) => dialect.placeholder(index)).join(', ')}) ORDER BY "operationSeq" ASC`,
      chunk
    );
    for (const row of rows) {
      const list = map.get(String(row[0])) ?? [];
      list.push({ operationSeq: Number(row[1]), ratio: String(row[2]) });
      map.set(String(row[0]), list);
    }
  }
  return map;
};

/**
 * 声明了投料工序（operation_seq 或分摊行）的行要求头选了路线：头未选路线与「路线未覆盖」同口径拒绝，
 * 不按空工序链静默少算工序损耗。
 */
const assertRoutedRowsHaveRouting = (
  headerMeta: HeaderMeta,
  rows: readonly ExplosionRowLike[],
  splitsByOccurrence: ReadonlyMap<string, unknown>
): void => {
  if (headerMeta.routingId !== null) return;
  const routed = rows.find(row => row.operationSeq !== null || splitsByOccurrence.has(row.occurrenceId));
  if (routed === undefined) return;
  throw new BomCostError(
    `头 ${headerMeta.headerId}（发生项 ${routed.occurrenceId}）`,
    '路线未覆盖：头未选路线，但发生项声明了投料工序 / 分摊行，成本不能退化成无路线'
  );
};

/**
 * 声明的投料工序（operation_seq 与分摊行的工序号）必须在头所选路线的工序集内：工序事后改号 / 删除与
 * 「路线未覆盖」同口径拒绝，不按剩余工序链静默少算工序损耗（与数量展开共用判定）。
 */
const assertDeclaredOperations = (
  headerMeta: HeaderMeta,
  rows: readonly ExplosionRowLike[],
  splitsByOccurrence: ReadonlyMap<string, readonly { operationSeq: number }[]>,
  operations: readonly { operationSeq: number }[]
): void => {
  const missing = findMissingOperation(rows, occurrenceId => splitsByOccurrence.get(occurrenceId) ?? [], operations);
  if (missing === null) return;
  throw new BomCostError(
    `路线 ${headerMeta.routingId}（发生项 ${missing.row.occurrenceId}）`,
    `路线未覆盖：投料工序 ${missing.operationSeq} 不在路线工序集内，成本不能按剩余工序链静默计算`
  );
};

/** 路线的一道工序（工时、损耗与工作中心）。 */
type RoutingOperation = Awaited<ReturnType<typeof fetchRoutingOps>>['operations'][number];

/** 本层的路线：工序明细（加工与制费用）、工序损耗链（W_op 与第 5 步用）与行的投料分摊。 */
interface LayerRouting {
  operations: RoutingOperation[];
  routingOps: LayerRoutingOp[];
  splitsByOccurrence: Map<string, { operationSeq: number; ratio: string }[]>;
}

/**
 * 读本层的路线与分摊（batch_cost 与明细树同一份）：路线未覆盖、头未选路线而行声明了投料工序、
 * 声明的工序不在路线工序集内都拒绝，两条路径不各自维护一份判定。
 */
const loadLayerRouting = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  headerMeta: HeaderMeta,
  effectiveRows: readonly ExplosionRowLike[],
  asOfDate: Date
): Promise<LayerRouting> => {
  const splitsByOccurrence = await fetchSplits(
    query,
    dialect,
    effectiveRows.map(row => row.occurrenceId)
  );
  const routingDetail =
    headerMeta.routingId !== null ?
      await fetchRoutingOps(query, dialect, headerMeta.routingId, asOfDate)
    : { operations: [], uncoveredReason: null };
  if (routingDetail.uncoveredReason !== null) {
    const firstRouted = effectiveRows.find(
      row => row.operationSeq !== null || splitsByOccurrence.has(row.occurrenceId)
    );
    throw new BomCostError(
      `路线 ${headerMeta.routingId}${firstRouted !== undefined ? `（发生项 ${firstRouted.occurrenceId}）` : ''}`,
      `路线未覆盖：${routingDetail.uncoveredReason}，成本不能继续使用工序或退化成无路线`
    );
  }
  assertRoutedRowsHaveRouting(headerMeta, effectiveRows, splitsByOccurrence);
  assertDeclaredOperations(headerMeta, effectiveRows, splitsByOccurrence, routingDetail.operations);
  return {
    operations: routingDetail.operations,
    routingOps: routingDetail.operations.map(operation => ({
      operationSeq: operation.operationSeq,
      operationScrap: operation.operationScrap,
      scrapConvention: operation.scrapConvention
    })),
    splitsByOccurrence
  };
};

/** 副产抵减：产出量先转库存单位，再按物料级率转计价单位；币种必须与卷算上下文一致。 */
const creditOf = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  row: ExplosionRowLike,
  pPrime: Decimal,
  context: CostRollupContext
): Promise<{ outQty: string; outUom: string; creditPrice: string; amount: Decimal } | null> => {
  const itemRow = await fetchItemCost(query, dialect, row.childItemId);
  if (itemRow.creditPrice === null) return null;
  if (itemRow.priceCurrency !== null && itemRow.priceCurrency !== context.currency) {
    throw new BomCostError(
      `副产品 ${row.childItemId} 的币种`,
      `抵减价币种 ${itemRow.priceCurrency} 与上下文币种 ${context.currency} 不符`
    );
  }
  const out = computeOutputQuantity(row, pPrime, row.headerBaseQty, context.formulaParams);
  const hops = rowHopRates(row);
  const outInStock = convertUom(decimalToCanonical(out), row.occurrenceUom, row.childStockUom, hops.toStock);
  const outUom = itemRow.priceUom ?? row.childStockUom;
  const outQty = convertUom(outInStock, row.childStockUom, outUom, { itemRate: hops.fromStock.itemRate });
  return {
    outQty,
    outUom,
    creditPrice: itemRow.creditPrice,
    amount: decimalMul(decimalFromCanonical(outQty), decimalFromCanonical(itemRow.creditPrice))
  };
};

/** 一道工序的加工：setup + run × W_op + fixed 在 time_uom 下求和，换算一次到费率 rate_uom 后乘费率。 */
const operationCostOf = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  operation: RoutingOperation,
  pPrime: Decimal,
  routingOps: LayerRoutingOp[],
  context: CostRollupContext
): Promise<{ hoursRaw: Decimal; rate: string; rateUom: string; rateHours: string; amount: Decimal }> => {
  const wOp = operationScrapChain(pPrime, routingOps, operation.operationSeq);
  const hoursRaw = decimalAdd(
    decimalAdd(decimalFromCanonical(operation.setupTime), decimalMul(decimalFromCanonical(operation.runTime), wOp)),
    decimalFromCanonical(operation.fixedTime)
  );
  const activityTypeId = await fetchActivityTypeId(query, dialect, operation.workCenterId);
  const { rate, rateUom } = await fetchRate(
    query,
    dialect,
    operation.workCenterId,
    activityTypeId,
    context.rateDate,
    context.currency
  );
  const rateHours = convertUom(decimalToCanonical(hoursRaw), operation.timeUom, rateUom);
  return {
    hoursRaw,
    rate,
    rateUom,
    rateHours,
    amount: decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(rate))
  };
};

/** 制费 = 换算后工时 × 工作中心 overhead_rate：未声明制费返回 null（不是错误），币种不符拒绝。 */
const overheadOf = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  workCenterId: string,
  rateHours: string,
  currency: string
): Promise<Decimal | null> => {
  const centerRow = await fetchCenterCost(query, dialect, workCenterId);
  if (centerRow.overheadRate === null) return null;
  if (centerRow.overheadCurrency !== null && centerRow.overheadCurrency !== currency) {
    throw new BomCostError('工作中心制费币种', `制费币种 ${centerRow.overheadCurrency} 与上下文币种 ${currency} 不符`);
  }
  return decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(centerRow.overheadRate));
};

/**
 * cost_lot_qty 是 unit_cost 的分母（US-514 卷算必填）：缺失即拒绝；写入期已限定大于 0（正数域），
 * 为 0 的拒绝是绕过守卫的存量数据的第二道防线。
 */
const requireCostLotQty = (headerMeta: HeaderMeta): string => {
  if (headerMeta.costLotQty === null) {
    throw new BomCostError(`头 ${headerMeta.headerId} 的 cost_lot_qty`, '卷算必填，缺失即拒绝');
  }
  if (decimalIsZero(decimalFromCanonical(headerMeta.costLotQty))) {
    throw new BomCostError(`头 ${headerMeta.headerId} 的 cost_lot_qty`, '为 0：它是 unit_cost 的分母，必须大于 0');
  }
  return headerMeta.costLotQty;
};

/** 阶梯选行（与爆炸引擎同口径）；无命中按卷算违约点名头。 */
const selectCostTierRows = (headerId: string, rows: ExplosionRowLike[], plannedQty: Decimal): ExplosionRowLike[] => {
  try {
    return selectTierRows(rows, plannedQty);
  } catch (error) {
    throw new BomCostError(`头 ${headerId}`, (error as Error).message);
  }
};

/** 卷算行：普通行原样；替代组成员带分流后的份额毛需求（成员单位）。 */
type CostRow = ExplosionRowLike & { gross?: Decimal };

/**
 * 替代组分流（AC#2：按 usage_probability × equiv_qty 加权；AC#11：manual 未选即拒绝），
 * 与爆炸引擎共用同一个纯函数，返回普通行 + 带份额的成员行。
 */
const groupSubstituteRows = (
  effectiveRows: ExplosionRowLike[],
  pPrime: Decimal,
  context: CostRollupContext
): CostRow[] => {
  const groups = new Map<string, ExplosionRowLike[]>();
  for (const row of effectiveRows) {
    if (row.substituteGroupId === null) continue;
    const list = groups.get(row.substituteGroupId) ?? [];
    list.push(row);
    groups.set(row.substituteGroupId, list);
  }
  const grouped: CostRow[] = effectiveRows.filter(row => row.substituteGroupId === null);
  for (const [groupId, members] of groups) {
    const primary = substitutePrimaryOf(members);
    const primaryGross = computeGross(primary, {
      plannedPrime: pPrime,
      headerBaseQty: primary.headerBaseQty,
      formulaParams: context.formulaParams,
      routingOps: [],
      splits: []
    });
    const allocated = (() => {
      try {
        return allocateSubstituteShares(
          members.map(substituteMemberOf),
          primaryGross,
          context.substituteAvailabilities,
          context.substituteSelections
        );
      } catch (error) {
        throw new BomCostError(`替代组 ${primary.substituteGroupCode ?? groupId}`, (error as Error).message);
      }
    })();
    if (allocated.unresolved) {
      throw new BomCostError(
        `manual 替代组 ${allocated.unresolved.groupCode}`,
        '未给选择，卷算拒绝不按候选集任意一个计算'
      );
    }
    for (const { member, gross } of allocated.shares) {
      const source = members.find(candidate => candidate.occurrenceId === member.occurrenceId);
      if (source) grouped.push({ ...source, gross });
    }
  }
  return grouped;
};

/**
 * 卷算拒绝统一为 {@link BomCostError}（cost-error.ts 的合同：缺成本、缺费率、币种不符、环、
 * unresolved / truncated）：数量、解析、配置等领域错误包一层并以 `cause` 保留原错误；
 * 非领域错误（程序缺陷）原样抛出，不伪装成卷算违约。
 */
const asCostError = (error: unknown): unknown => {
  if (error instanceof BomCostError) return error;
  if (!(error instanceof BomError) && !(error instanceof BomResolutionError)) return error;
  return new BomCostError(error.name, error.message.replace(/^\[rxdb-plugin-bom\]\s*/, ''), { cause: error });
};

/**
 * 成本卷算：从根头出发按拓扑逆序单遍（递归后序 + `unit_cost` memo），返回逐层明细树。
 *
 * @param adapter - 本地适配器（全部读取在一个事务快照内）
 * @param context - 卷算上下文（币种/费率日/评估日必填）
 * @param target - 根目标（父修订）
 * @param batchQty - 根件的批量（缺省按根头 cost_lot_qty；根头 cost_lot_qty 仍必填，它是 unit_cost 的分母）
 *
 * @throws {@link BomCostError} 一切卷算拒绝（数量 / 解析 / 配置违约经 `cause` 保留原错误）
 */
export const rollupCost = async (
  adapter: BomLocalAdapter,
  context: CostRollupContext,
  target: ResolveTarget,
  batchQty?: { value: string; uom: string }
): Promise<CostRollupResult> => {
  try {
    return await rollupCostInSnapshot(adapter, context, target, batchQty);
  } catch (error) {
    throw asCostError(error);
  }
};

const rollupCostInSnapshot = async (
  adapter: BomLocalAdapter,
  context: CostRollupContext,
  target: ResolveTarget,
  batchQty?: { value: string; uom: string }
): Promise<CostRollupResult> => {
  assertContext(context as ResolutionContext);
  const dialect = bomSqlDialectFor(adapter.name);
  const resolutionContext: ResolutionContext = {
    bomType: context.bomType,
    orgId: context.orgId,
    asOfDate: context.asOfDate,
    alternativeNo: context.alternativeNo,
    configSelection: context.configSelection,
    unit: context.unit,
    lot: context.lot,
    substituteSelections: context.substituteSelections,
    substituteAvailabilities: context.substituteAvailabilities
  };
  return adapter.transaction(async executor => {
    const reads = new Map<string, ReturnType<BomQueryExecutor['query']>>();
    const query: BomQueryExecutor['query'] = (sql, params) => {
      const key = JSON.stringify([sql, params ?? []]);
      let result = reads.get(key);
      if (result === undefined) {
        result = executor.query(sql, params);
        reads.set(key, result);
      }
      return result;
    };

    // 根：父修订选择（同 explodeBom 的根解析）
    const q: CostQuery = query;
    const parentSql = buildParentRevisionSql(dialect, {
      itemId: target.parentItemId ?? '',
      asOfDate: context.asOfDate,
      explicitRevisionId: target.parentRevisionId
    });
    const parentResult = await query(parentSql.sql, parentSql.params);
    const parent = parentResult.rows[0];
    if (parent === undefined || parent[columnIndexOf(parentResult.columns, 'state')] !== 'released') {
      throw new BomCostError('根修订', '评估日没有已发布修订');
    }
    const parentRevisionId = String(parent[columnIndexOf(parentResult.columns, 'revisionId')]);
    const parentItemId = String(parent[columnIndexOf(parentResult.columns, 'itemId')]);
    const headersSql = buildAlternativeHeadersSql(dialect, {
      parentRevisionId,
      bomType: context.bomType,
      orgId: context.orgId
    });
    const headersResult = await query(headersSql.sql, headersSql.params);
    // 备选裁决与解析 / 展开 / 数量同口径（alternativeNo 只裁决根头；指定但零匹配即拒绝）
    const headerRows = selectRootAlternatives(
      headersResult.rows.map(row => ({
        row,
        alternativeNo: Number(row[columnIndexOf(headersResult.columns, 'alternativeNo')])
      })),
      context,
      parentRevisionId
    );
    if (headerRows.length !== 1)
      throw new BomCostError(
        '根头',
        headerRows.length === 0 ? '评估日没有已发布 BOM 头' : '存在未裁决的备选，请指定 alternativeNo'
      );
    const readHeader = (name: string): unknown => headerRows[0].row[columnIndexOf(headersResult.columns, name)];
    const rootHeader: HeaderMeta = {
      headerId: String(readHeader('headerId')),
      parentItemId,
      parentRevisionId,
      baseUom: String(readHeader('baseUom')),
      baseQty: String(readHeader('baseQty')),
      assemblyScrap: String(readHeader('assemblyScrap')),
      assemblyScrapConvention: String(readHeader('assemblyScrapConvention')) as 'additive' | 'yield',
      costLotQty: readHeader('costLotQty') === null ? null : String(readHeader('costLotQty')),
      routingId: readHeader('routingId') === null ? null : String(readHeader('routingId'))
    };

    // 根批量：显式 batchQty（归一到基准单位）或 cost_lot_qty；cost_lot_qty 是 unit_cost 的分母，显式批量也替代不了
    const rootLotQty = requireCostLotQty(rootHeader);
    const plannedQty = batchQty === undefined ? undefined : normalizePlannedQuantity(batchQty);
    const rootL = decimalFromCanonical(
      plannedQty ? convertUom(plannedQty.value, plannedQty.uom, rootHeader.baseUom) : rootLotQty
    );

    // unit_cost 独立 memo：键 = 头 + 上下文（节点是已解析头，AC#8 不串）；
    // 相同头和批量复用本次事务的计算结果，明细与标准单位成本共用批成本。
    const unitCostCache = new Map<string, string>();
    const batchCostCache = new Map<string, Decimal>();
    const batchKey = (header: HeaderMeta, quantity: Decimal, allocated: boolean) =>
      JSON.stringify([header.headerId, decimalToCanonical(quantity), allocated]);
    const jointCache = new Map<string, JointCostSummary>();
    const sourceCache = new Map<string, JointUnitPrice | null>();
    const sourceUses = new Map<string, JointCostSourceUse>();
    const selections = { ...context.jointCostSources };
    const sourceIdentity = JSON.stringify(
      Object.entries(selections).sort(([left], [right]) =>
        left < right ? -1
        : left > right ? 1
        : 0
      )
    );
    const stack: string[] = [];

    const assertAcyclic = (headerMeta: HeaderMeta, path: readonly string[]): void => {
      if (!path.includes(headerMeta.headerId)) return;
      throw new BomCostError(`头 ${headerMeta.headerId}`, `卷算检出环：${[...path, headerMeta.headerId].join(' → ')}`);
    };

    const phantomChildOf = async (
      row: CostRow,
      demandInStock: string
    ): Promise<{ header: HeaderMeta; planned: Decimal } | null> => {
      if (!(row.phantomOverride ?? row.childRevisionPhantom ?? false)) return null;
      const revisionId = row.resolvedChildRevisionId;
      const child =
        revisionId === null ? null : await resolveChildHeader(query, dialect, resolutionContext, revisionId);
      if (child === null || revisionId === null)
        throw new BomCostError(`虚拟件 ${row.childItemId}`, '评估日没有已发布 BOM 头，无法穿透');
      return {
        header: headerMetaOf(child, row.childItemId, revisionId),
        planned: decimalFromCanonical(
          convertUom(demandInStock, row.childStockUom, child.baseUom, rowHopRates(row).fromStock)
        )
      };
    };

    const allocate = async (headerMeta: HeaderMeta, L: Decimal, total: Decimal) => {
      const production = await readJointProduction(query, dialect, {
        context: resolutionContext,
        headerId: headerMeta.headerId,
        plannedQty: { value: decimalToCanonical(L), uom: headerMeta.baseUom }
      });
      if (production === null) return { batch: total, joint: undefined };
      const joint = allocateJointCost(decimalToCanonical(total), production.outputs);
      jointCache.set(`${headerMeta.headerId}|${decimalToCanonical(L)}`, joint);
      return { batch: decimalFromCanonical(joint.outputs[0].batchCost), joint };
    };

    const unitCostOf = async (headerMeta: HeaderMeta): Promise<string> => {
      const key = `${headerMeta.headerId}|${context.asOfDate.toISOString()}|${context.currency}|${context.rateDate.toISOString()}|${sourceIdentity}`;
      const cached = unitCostCache.get(key);
      if (cached !== undefined) return cached;
      if (stack.includes(headerMeta.headerId)) {
        throw new BomCostError(
          `头 ${headerMeta.headerId}`,
          Object.keys(selections).length > 0 ?
            `生产头成本依赖检出环：${[...stack, headerMeta.headerId].join(' → ')}`
          : '卷算检出环（写入期约束可能被绕过），不死循环'
        );
      }
      const lotQty = requireCostLotQty(headerMeta);
      stack.push(headerMeta.headerId);
      const batch = await batchCostOf(headerMeta, decimalFromCanonical(lotQty));
      stack.pop();
      const unit = decimalToCanonical(decimalDiv(batch, decimalFromCanonical(lotQty)));
      unitCostCache.set(key, unit);
      return unit;
    };

    const jointUnitCost = async (revisionId: string | null): Promise<JointUnitPrice | null> => {
      if (revisionId === null) return null;
      if (sourceCache.has(revisionId)) return sourceCache.get(revisionId)!;
      const candidates = await findJointCostSources(query, dialect, resolutionContext, revisionId);
      const selected = selections[revisionId];
      if (candidates.length === 0 && selected === undefined) {
        sourceCache.set(revisionId, null);
        return null;
      }
      const producer = candidates.find(candidate => candidate.headerId === selected);
      if (producer === undefined)
        throw new BomJointCostSourceError(
          revisionId,
          candidates.map(candidate => candidate.headerId),
          selected
        );
      await unitCostOf(producer);
      const summary = jointCache.get(`${producer.headerId}|${producer.costLotQty}`);
      const output = summary?.outputs.find(candidate => candidate.revisionId === revisionId);
      if (output === undefined)
        throw new BomJointCostSourceError(
          revisionId,
          candidates.map(candidate => candidate.headerId),
          selected
        );
      sourceUses.set(`${revisionId}|${producer.headerId}`, {
        outputRevisionId: revisionId,
        producerHeaderId: producer.headerId,
        outputLineId: output.lineId,
        outputOccurrenceId: output.occurrenceId,
        share: output.share,
        qty: output.qty,
        uom: output.uom
      });
      const price: JointUnitPrice = {
        unitCost: output.unitCost,
        uom: output.uom,
        rates: { ...producer.outputRates, direction: 'reverse' }
      };
      sourceCache.set(revisionId, price);
      return price;
    };

    const batchCostOf = async (headerMeta: HeaderMeta, L: Decimal, path: readonly string[] = []): Promise<Decimal> => {
      assertAcyclic(headerMeta, path);
      const key = batchKey(headerMeta, L, path.length === 0);
      const cached = batchCostCache.get(key);
      if (cached !== undefined) return cached;
      const result = await computeBatchCostOf(headerMeta, L, path);
      batchCostCache.set(key, result);
      return result;
    };

    const computeBatchCostOf = async (
      headerMeta: HeaderMeta,
      L: Decimal,
      path: readonly string[] = []
    ): Promise<Decimal> => {
      assertAcyclic(headerMeta, path);
      const byHeader = await fetchHeaderRows(query, dialect, resolutionContext, [headerMeta.headerId]);
      const rows = byHeader.get(headerMeta.headerId) ?? [];
      const effectiveRows = selectCostTierRows(headerMeta.headerId, rows, L);
      if (
        !effectiveRows.some(row => row.flowDirection === 'consume') &&
        !(rows.length === 0 && byHeader.has(headerMeta.headerId))
      ) {
        throw new BomCostError(`头 ${headerMeta.headerId}`, '没有 consume 行（无投入），不能构成成本层级');
      }
      // P′ = 装配损耗后的计划量（加工量与副产缩放共用）
      const pPrime = scrap(L, headerMeta.assemblyScrap, headerMeta.assemblyScrapConvention);
      // 路由工序链（批级加工量用）+ 加工明细
      const routing = await loadLayerRouting(q, dialect, headerMeta, effectiveRows, context.asOfDate);
      let total: Decimal = { coeff: 0n, exp: 0 };

      // 替代组分流（共享纯函数，与爆炸引擎同口径）
      const groupedRows = groupSubstituteRows(effectiveRows, pPrime, context);

      for (const row of groupedRows) {
        const credit = row.flowDirection === 'by_product' ? await creditOf(q, dialect, row, pPrime, context) : null;
        if (credit !== null) total = decimalSub(total, credit.amount);
        if (row.flowDirection !== 'consume') continue;
        // 本层需求（第 2~6 步共享实现，不取整）：G → G′ → G″ → 换算
        const gross =
          row.gross ??
          computeGross(row, {
            plannedPrime: pPrime,
            headerBaseQty: row.headerBaseQty,
            formulaParams: context.formulaParams,
            routingOps: [],
            splits: []
          });
        const layer = computeLayerNet(gross, row, {
          plannedPrime: pPrime,
          headerBaseQty: row.headerBaseQty,
          formulaParams: context.formulaParams,
          routingOps: routing.routingOps,
          splits: routing.splitsByOccurrence.get(row.occurrenceId) ?? []
        });
        const hops = rowHopRates(row);
        const demandInStock = convertUom(
          decimalToCanonical(layer.net),
          row.occurrenceUom,
          row.childStockUom,
          hops.toStock
        );
        const phantom = await phantomChildOf(row, demandInStock);
        if (phantom !== null) {
          total = decimalAdd(total, await batchCostOf(phantom.header, phantom.planned, [...path, headerMeta.headerId]));
          continue;
        }
        const jointPrice = await jointUnitCost(row.resolvedChildRevisionId);
        if (jointPrice !== null) {
          const demand = convertUom(demandInStock, row.childStockUom, jointPrice.uom, jointPrice.rates);
          total = decimalAdd(
            total,
            decimalMul(decimalFromCanonical(demand), decimalFromCanonical(jointPrice.unitCost))
          );
          continue;
        }
        // 普通子装配换算到子头基准单位后，按标准批量单位成本计价。
        // 爆炸层已拒绝 unresolved（US-514 AC#11），此处 null 不可达。
        const childHeader = await resolveChildHeader(query, dialect, resolutionContext, row.resolvedChildRevisionId!);
        if (childHeader !== null) {
          const childDemand = convertUom(demandInStock, row.childStockUom, childHeader.baseUom, hops.fromStock);
          const childUnit = await unitCostOf(
            headerMetaOf(childHeader, row.childItemId, row.resolvedChildRevisionId as string)
          );
          total = decimalAdd(total, decimalMul(decimalFromCanonical(childDemand), decimalFromCanonical(childUnit)));
        } else {
          // 外购叶子：按物料级换算转到价格 price_uom；缺价或币种不符报缺失
          const itemRow = await fetchItemCost(q, dialect, row.childItemId);
          if (itemRow.unitPrice === null) {
            throw new BomCostError(`外购件 ${row.childItemId}`, '缺成本，不以 0 兜底');
          }
          if (itemRow.priceCurrency !== null && itemRow.priceCurrency !== context.currency) {
            throw new BomCostError(
              `外购件 ${row.childItemId} 的币种`,
              `价格币种 ${itemRow.priceCurrency} 与上下文币种 ${context.currency} 不符`
            );
          }
          const priceDemand = convertUom(demandInStock, row.childStockUom, itemRow.priceUom ?? row.childStockUom, {
            itemRate: hops.fromStock.itemRate
          });
          total = decimalAdd(
            total,
            decimalMul(decimalFromCanonical(priceDemand), decimalFromCanonical(itemRow.unitPrice))
          );
        }
      }

      // 加工 + 制费（头挂路由才有工序；无路线 = 加工项为空）
      for (const operation of routing.operations) {
        const operationCost = await operationCostOf(q, dialect, operation, pPrime, routing.routingOps, context);
        total = decimalAdd(total, operationCost.amount);
        const overhead = await overheadOf(
          q,
          dialect,
          operation.workCenterId,
          operationCost.rateHours,
          context.currency
        );
        if (overhead !== null) total = decimalAdd(total, overhead);
      }
      return path.length === 0 ? (await allocate(headerMeta, L, total)).batch : total;
    };

    const buildLayerDetail = async (
      headerMeta: HeaderMeta,
      L: Decimal,
      path: readonly string[] = []
    ): Promise<LayerCostDetail> => {
      assertAcyclic(headerMeta, path);
      const byHeader = await fetchHeaderRows(query, dialect, resolutionContext, [headerMeta.headerId]);
      const rows = byHeader.get(headerMeta.headerId) ?? [];
      const effectiveRows = selectCostTierRows(headerMeta.headerId, rows, L);
      const pPrime = scrap(L, headerMeta.assemblyScrap, headerMeta.assemblyScrapConvention);
      const routing = await loadLayerRouting(q, dialect, headerMeta, effectiveRows, context.asOfDate);
      const material: CostMaterialLine[] = [];
      const credits: CostCreditLine[] = [];
      const children: CostNodeDetail[] = [];
      const processing: CostProcessingLine[] = [];
      let materialTotal: Decimal = { coeff: 0n, exp: 0 };
      let creditTotal: Decimal = { coeff: 0n, exp: 0 };
      let processingTotal: Decimal = { coeff: 0n, exp: 0 };
      let overheadAmount: Decimal = { coeff: 0n, exp: 0 };
      let overheadReason: CostNodeDetail['overheadReason'] = '无路线';

      // 替代组分流（与 batchCostOf 同口径）
      const groupedRows = groupSubstituteRows(effectiveRows, pPrime, context);

      for (const row of groupedRows) {
        const credit = row.flowDirection === 'by_product' ? await creditOf(q, dialect, row, pPrime, context) : null;
        if (credit !== null) {
          creditTotal = decimalAdd(creditTotal, credit.amount);
          credits.push({
            occurrenceId: row.occurrenceId,
            childItemId: row.childItemId,
            outQty: credit.outQty,
            outUom: credit.outUom,
            creditPrice: credit.creditPrice,
            amount: decimalToCanonical(credit.amount)
          });
        }
        if (row.flowDirection !== 'consume') continue;
        const gross =
          row.gross ??
          computeGross(row, {
            plannedPrime: pPrime,
            headerBaseQty: row.headerBaseQty,
            formulaParams: context.formulaParams,
            routingOps: [],
            splits: []
          });
        const layer = computeLayerNet(gross, row, {
          plannedPrime: pPrime,
          headerBaseQty: row.headerBaseQty,
          formulaParams: context.formulaParams,
          routingOps: routing.routingOps,
          splits: routing.splitsByOccurrence.get(row.occurrenceId) ?? []
        });
        const hops = rowHopRates(row);
        const demandInStock = convertUom(
          decimalToCanonical(layer.net),
          row.occurrenceUom,
          row.childStockUom,
          hops.toStock
        );
        const phantom = await phantomChildOf(row, demandInStock);
        if (phantom !== null) {
          const detail = await buildLayerDetail(phantom.header, phantom.planned, [...path, headerMeta.headerId]);
          material.push(...detail.material);
          processing.push(...detail.processing);
          credits.push(...detail.credits);
          children.push(...detail.children);
          materialTotal = decimalAdd(materialTotal, sumAmounts(detail.material));
          processingTotal = decimalAdd(processingTotal, sumAmounts(detail.processing));
          creditTotal = decimalAdd(creditTotal, sumAmounts(detail.credits));
          overheadAmount = decimalAdd(overheadAmount, detail.overhead);
          if (detail.overheadReason !== '无路线') overheadReason = detail.overheadReason;
          continue;
        }
        const jointPrice = await jointUnitCost(row.resolvedChildRevisionId);
        if (jointPrice !== null) {
          const demand = convertUom(demandInStock, row.childStockUom, jointPrice.uom, jointPrice.rates);
          const amount = decimalMul(decimalFromCanonical(demand), decimalFromCanonical(jointPrice.unitCost));
          materialTotal = decimalAdd(materialTotal, amount);
          material.push({
            occurrenceId: row.occurrenceId,
            childItemId: row.childItemId,
            demand,
            demandUom: jointPrice.uom,
            unitCost: jointPrice.unitCost,
            amount: decimalToCanonical(amount)
          });
          continue;
        }
        // 爆炸层已拒绝 unresolved（US-514 AC#11），此处 null 不可达。
        const childHeader = await resolveChildHeader(query, dialect, resolutionContext, row.resolvedChildRevisionId!);
        if (childHeader !== null) {
          const childDemand = convertUom(demandInStock, row.childStockUom, childHeader.baseUom, hops.fromStock);
          const childDetail = await buildDetail(
            headerMetaOf(childHeader, row.childItemId, row.resolvedChildRevisionId as string),
            decimalFromCanonical(childDemand),
            [...path, headerMeta.headerId]
          );
          const childUnit = childDetail.unitCost;
          const amount = decimalMul(decimalFromCanonical(childDemand), decimalFromCanonical(childUnit));
          materialTotal = decimalAdd(materialTotal, amount);
          material.push({
            occurrenceId: row.occurrenceId,
            childItemId: row.childItemId,
            demand: childDemand,
            demandUom: childHeader.baseUom,
            unitCost: childUnit,
            amount: decimalToCanonical(amount)
          });
          children.push(childDetail);
        } else {
          const itemRow = await fetchItemCost(q, dialect, row.childItemId);
          if (itemRow.unitPrice === null) {
            throw new BomCostError(`外购件 ${row.childItemId}`, '缺成本，不以 0 兜底');
          }
          if (itemRow.priceCurrency !== null && itemRow.priceCurrency !== context.currency) {
            throw new BomCostError(
              `外购件 ${row.childItemId} 的币种`,
              `价格币种 ${itemRow.priceCurrency} 与上下文币种 ${context.currency} 不符`
            );
          }
          const priceDemand = convertUom(demandInStock, row.childStockUom, itemRow.priceUom ?? row.childStockUom, {
            itemRate: hops.fromStock.itemRate
          });
          const amount = decimalMul(decimalFromCanonical(priceDemand), decimalFromCanonical(itemRow.unitPrice));
          materialTotal = decimalAdd(materialTotal, amount);
          material.push({
            occurrenceId: row.occurrenceId,
            childItemId: row.childItemId,
            demand: priceDemand,
            demandUom: itemRow.priceUom ?? row.childStockUom,
            unitCost: itemRow.unitPrice,
            amount: decimalToCanonical(amount)
          });
        }
      }

      for (const operation of routing.operations) {
        const operationCost = await operationCostOf(q, dialect, operation, pPrime, routing.routingOps, context);
        processingTotal = decimalAdd(processingTotal, operationCost.amount);
        processing.push({
          operationSeq: operation.operationSeq,
          setup: operation.setupTime,
          run: operation.runTime,
          fixed: operation.fixedTime,
          hours: decimalToCanonical(operationCost.hoursRaw),
          timeUom: operation.timeUom,
          rateHours: operationCost.rateHours,
          rateUom: operationCost.rateUom,
          rate: operationCost.rate,
          amount: decimalToCanonical(operationCost.amount)
        });
        const overhead = await overheadOf(
          q,
          dialect,
          operation.workCenterId,
          operationCost.rateHours,
          context.currency
        );
        if (overhead !== null) overheadReason = '按工时计';
        else if (overheadReason === '无路线') overheadReason = '工作中心未声明制费';
        if (overhead !== null) overheadAmount = decimalAdd(overheadAmount, overhead);
      }

      const batchCost = decimalSub(decimalAdd(decimalAdd(materialTotal, processingTotal), overheadAmount), creditTotal);
      return { batchCost, material, processing, credits, children, overhead: overheadAmount, overheadReason };
    };

    const buildDetail = async (
      headerMeta: HeaderMeta,
      L: Decimal,
      path: readonly string[] = []
    ): Promise<CostNodeDetail> => {
      const costLotQty = requireCostLotQty(headerMeta);
      const detail = await buildLayerDetail(headerMeta, L, path);
      const allocated = await allocate(headerMeta, L, detail.batchCost);
      batchCostCache.set(batchKey(headerMeta, L, false), detail.batchCost);
      batchCostCache.set(batchKey(headerMeta, L, true), allocated.batch);
      const unitCost = await unitCostOf(headerMeta);
      return {
        headerId: headerMeta.headerId,
        itemId: headerMeta.parentItemId,
        batchQty: decimalToCanonical(L),
        baseUom: headerMeta.baseUom,
        costLotQty,
        batchCost: decimalToCanonical(allocated.batch),
        unitCost,
        material: detail.material,
        processing: detail.processing,
        overhead: decimalToCanonical(detail.overhead),
        overheadReason: detail.overheadReason,
        credits: detail.credits,
        children: detail.children,
        ...(allocated.joint === undefined ? {} : { jointCost: allocated.joint })
      };
    };

    const root = await buildDetail(rootHeader, rootL);
    return {
      context,
      root,
      ...(sourceUses.size === 0 ? {} : { jointManifest: { sources: [...sourceUses.values()] } })
    };
  }, false);
};
