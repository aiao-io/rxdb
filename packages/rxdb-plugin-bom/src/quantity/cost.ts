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

import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import { assertContext, type BomQueryExecutor, type ResolveTarget } from '../resolve/resolver.js';
import {
  decimalAdd,
  decimalDiv,
  decimalFromCanonical,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';
import { fetchHeaderRows, resolveChildHeader, rowRates, type ResolvedChildHeader } from './explosion.js';
import {
  allocateSubstituteShares,
  computeGross,
  computeLayerNet,
  computeOutputQuantity,
  operationScrapChain,
  scrap,
  selectTierRows,
  type LayerRoutingOp,
  type SubstituteMember
} from './layer.js';
import { convertUom } from './uom.js';

/** 成本卷算的上下文：评估日 + 币种 + 费率日（与 as_of_date 一并进缓存键）。 */
export interface CostRollupContext {
  bomType: 'ebom' | 'mbom' | 'sales';
  orgId: string;
  asOfDate: Date;
  currency: string;
  rateDate: Date;
  formulaParams?: Record<string, string>;
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
  outQty: string;
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
}

/** 卷算结果：根节点明细树（金额均为规范十进制串，币种由上下文给出）。 */
export interface CostRollupResult {
  context: CostRollupContext;
  root: CostNodeDetail;
}

/** 卷算违约（缺成本、缺费率、币种不符、环、unresolved/truncated）。 */
export class BomCostError extends Error {
  constructor(
    /** 违约的头/发生项/工序标识。 */
    readonly subject: string,
    message: string
  ) {
    super(`[rxdb-plugin-bom] 成本卷算违约（${subject}）：${message}`);
    this.name = 'BomCostError';
    Object.setPrototypeOf(this, BomCostError.prototype);
  }
}

type ExplosionRowLike =
  Parameters<typeof fetchHeaderRows>[0] extends never ? never
  : Awaited<ReturnType<typeof fetchHeaderRows>> extends Map<string, infer R> ?
    R extends (infer T)[] ?
      T
    : never
  : never;

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
    `SELECT "rate", "rateUom", "currency" FROM ${rateTable} WHERE "workCenterId" = '${workCenterId}' AND "activityTypeId" = '${activityTypeId}'` +
      ` AND "validFrom" <= '${rateDate.toISOString()}' ORDER BY "validFrom" DESC LIMIT 1`
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
  routingId: string
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
}> => {
  const opTable = dialect.table('routing_operation');
  const rows = await queryRows(
    query,
    `SELECT "operationSeq", "operationScrap", "scrapConvention", "setupTime", "runTime", "fixedTime", "timeUom", "workCenterId" FROM ${opTable} WHERE "routingId" = '${routingId}' ORDER BY "operationSeq" ASC`
  );
  return {
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
    `SELECT "unitPrice", "priceUom", "priceCurrency", "creditPrice", "uomConversion" FROM ${dialect.table('item')} WHERE "id" = '${itemId}'`
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
    `SELECT "overheadRate", "overheadCurrency" FROM ${dialect.table('work_center')} WHERE "id" = '${workCenterId}'`
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
    `SELECT "id" FROM ${dialect.table('activity_type')} WHERE "workCenterId" = '${workCenterId}' ORDER BY "code" LIMIT 1`
  );
  if (rows.length === 0) throw new BomCostError(`工作中心 ${workCenterId}`, '没有作业类型，费率无从取值');
  return String(rows[0][0]);
};

/** 行发生项的分摊（按 occurrenceId 收集）。 */
const fetchSplits = async (
  query: CostQuery,
  dialect: ReturnType<typeof bomSqlDialectFor>,
  occurrenceIds: string[]
): Promise<Map<string, { operationSeq: number; ratio: string }[]>> => {
  const map = new Map<string, { operationSeq: number; ratio: string }[]>();
  if (occurrenceIds.length === 0) return map;
  const inList = occurrenceIds.map(id => `'${id}'`).join(', ');
  const rows = await queryRows(
    query,
    `SELECT "occurrenceId", "operationSeq", "ratio" FROM ${dialect.table('bom_line_operation_split')} WHERE "occurrenceId" IN (${inList}) ORDER BY "operationSeq" ASC`
  );
  for (const row of rows) {
    const list = map.get(String(row[0])) ?? [];
    list.push({ operationSeq: Number(row[1]), ratio: String(row[2]) });
    map.set(String(row[0]), list);
  }
  return map;
};

/**
 * 成本卷算：从根头出发按拓扑逆序单遍（递归后序 + `unit_cost` memo），返回逐层明细树。
 *
 * @param adapter - 本地适配器（全部读取在一个事务快照内）
 * @param context - 卷算上下文（币种/费率日/评估日必填）
 * @param target - 根目标（父修订）
 * @param batchQty - 根件的批量（缺省按根头 cost_lot_qty）
 */
export const rollupCost = async (
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
    substituteSelections: context.substituteSelections,
    substituteAvailabilities: context.substituteAvailabilities
  };
  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);

    // 根：父修订选择（同 explodeBom 的根解析）
    const q: CostQuery = (executor as unknown as BomQueryExecutor).query.bind(executor) as unknown as CostQuery;
    const revisionRows = await queryRows(
      q,
      target.parentRevisionId !== undefined ?
        `SELECT r."id" AS "revisionId", r."itemId" AS "itemId" FROM ${dialect.table('item_revision')} r WHERE r."id" = '${target.parentRevisionId}'`
      : `SELECT r."id" AS "revisionId", r."itemId" AS "itemId" FROM ${dialect.table('item_revision')} r WHERE r."itemId" = '${target.parentItemId}' AND r."state" = 'released' AND r."effectiveFrom" <= '${context.asOfDate.toISOString()}' ORDER BY r."effectiveFrom" DESC LIMIT 1`
    );
    if (revisionRows.length === 0) {
      throw new BomCostError('根修订', '评估日没有已发布修订');
    }
    const parentRevisionId = String(revisionRows[0][0]);
    const parentItemId = String(revisionRows[0][1]);

    // 根头（同 explodeBom 的头选择）
    const headerRows = await queryRows(
      q,
      `SELECT h."id" AS "headerId", h."baseUom" AS "baseUom", h."baseQty" AS "baseQty", h."assemblyScrap" AS "assemblyScrap",` +
        ` h."assemblyScrapConvention" AS "assemblyScrapConvention", h."costLotQty" AS "costLotQty", h."routingId" AS "routingId"` +
        ` FROM ${dialect.table('bom_header')} h WHERE h."state" = 'released' AND h."parentRevisionId" = '${parentRevisionId}' AND h."bomType" = '${context.bomType}' AND h."orgId" = '${context.orgId}'` +
        ` AND h."alternativeNo" = 1 LIMIT 1`
    );
    if (headerRows.length === 0) {
      throw new BomCostError('根头', '评估日没有已发布 BOM 头');
    }
    const rootHeader: HeaderMeta = {
      headerId: String(headerRows[0][0]),
      parentItemId,
      parentRevisionId,
      baseUom: String(headerRows[0][1]),
      baseQty: String(headerRows[0][2]),
      assemblyScrap: String(headerRows[0][3]),
      assemblyScrapConvention: String(headerRows[0][4]) as 'additive' | 'yield',
      costLotQty: headerRows[0][5] === null ? null : String(headerRows[0][5]),
      routingId: headerRows[0][6] === null ? null : String(headerRows[0][6])
    };

    // 根批量：显式 batchQty（归一到基准单位）或 cost_lot_qty
    const rootL: Decimal =
      batchQty ? decimalFromCanonical(convertUom(batchQty.value, batchQty.uom, rootHeader.baseUom))
      : rootHeader.costLotQty !== null ? decimalFromCanonical(rootHeader.costLotQty)
      : ((): never => {
          throw new BomCostError('根头的 cost_lot_qty', '卷算必填，缺失即拒绝');
        })();

    // unit_cost 独立 memo：键 = 头 + 上下文（节点是已解析头，AC#8 不串）；
    // batch_cost 随请求批量变，本层每次现算、子件只取 unit_cost（拓扑逆序单遍的实质）
    const unitCostCache = new Map<string, string>();
    const stack: string[] = [];

    const unitCostOf = async (headerMeta: HeaderMeta): Promise<string> => {
      const key = `${headerMeta.headerId}|${context.asOfDate.toISOString()}|${context.currency}|${context.rateDate.toISOString()}`;
      const cached = unitCostCache.get(key);
      if (cached !== undefined) return cached;
      if (stack.includes(headerMeta.headerId)) {
        throw new BomCostError(`头 ${headerMeta.headerId}`, '卷算检出环（写入期约束可能被绕过），不死循环');
      }
      if (headerMeta.costLotQty === null) {
        throw new BomCostError(`头 ${headerMeta.headerId} 的 cost_lot_qty`, '卷算必填，缺失即拒绝');
      }
      stack.push(headerMeta.headerId);
      const batch = await batchCostOf(headerMeta, decimalFromCanonical(headerMeta.costLotQty));
      stack.pop();
      const unit = decimalToCanonical(decimalDiv(batch, decimalFromCanonical(headerMeta.costLotQty)));
      unitCostCache.set(key, unit);
      return unit;
    };

    /** 本层 batch_cost（不缓存；子件单位成本经 {@link unitCostOf} 缓存）。 */
    const batchCostOf = async (headerMeta: HeaderMeta, L: Decimal): Promise<Decimal> => {
      const rows =
        (await fetchHeaderRows(query, dialect, resolutionContext, [headerMeta.headerId])).get(headerMeta.headerId) ??
        [];
      const effectiveRows = selectTierRows(rows, L);
      if (!effectiveRows.some(row => row.flowDirection === 'consume')) {
        throw new BomCostError(`头 ${headerMeta.headerId}`, '没有 consume 行（无投入），不能构成成本层级');
      }
      // P′ = 装配损耗后的计划量（加工量与副产缩放共用）
      const pPrime = scrap(L, headerMeta.assemblyScrap, headerMeta.assemblyScrapConvention);

      // 路由工序链（批级加工量用）+ 加工明细
      const routingOps: LayerRoutingOp[] = [];
      const routingDetail =
        headerMeta.routingId !== null ? await fetchRoutingOps(q, dialect, headerMeta.routingId) : { operations: [] };
      for (const operation of routingDetail.operations) {
        routingOps.push({
          operationSeq: operation.operationSeq,
          operationScrap: operation.operationScrap,
          scrapConvention: operation.scrapConvention
        });
      }
      const splitsByOccurrence = await fetchSplits(
        q,
        dialect,
        effectiveRows.map(row => row.occurrenceId)
      );

      let total: Decimal = { coeff: 0n, exp: 0 };

      // 替代组分流（AC#2：按 usage_probability × equiv_qty 加权；AC#11：manual 未选即拒绝）
      const substituteRows = effectiveRows.filter(row => row.substituteGroupId !== null);
      const plainRows = effectiveRows.filter(row => row.substituteGroupId === null);
      const substituteGroups = new Map<string, typeof substituteRows>();
      for (const row of substituteRows) {
        const list = substituteGroups.get(row.substituteGroupId as string);
        if (list) list.push(row);
        else substituteGroups.set(row.substituteGroupId as string, [row]);
      }
      const groupedRows: (ExplosionRowLike & { gross?: Decimal })[] = [...plainRows];
      for (const members of substituteGroups.values()) {
        const primary = members.find(member => member.substituteRole === 'primary');
        if (!primary) continue;
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
              members.map(
                member =>
                  ({
                    childItemId: member.childItemId,
                    occurrenceId: member.occurrenceId,
                    substituteRole: member.substituteRole,
                    substitutePriority: member.substitutePriority,
                    usageProbability: member.usageProbability,
                    equivQty: member.equivQty,
                    substituteGroupCode: member.substituteGroupCode ?? (member.substituteGroupId as string).slice(0, 8),
                    substituteStrategy: member.substituteStrategy ?? 'proportional',
                    substituteAllowMix: member.substituteAllowMix ?? true,
                    occurrenceUom: member.occurrenceUom
                  }) satisfies SubstituteMember
              ),
              primaryGross,
              context.substituteAvailabilities,
              context.substituteSelections
            );
          } catch (error) {
            throw new BomCostError(
              `替代组 ${primary.substituteGroupCode ?? primary.substituteGroupId}`,
              error instanceof Error ? error.message : String(error)
            );
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
          if (!source) continue;
          groupedRows.push({ ...source, gross });
        }
      }

      for (const entry of groupedRows) {
        const row = entry;
        if (row.flowDirection !== 'consume') {
          if (row.flowDirection === 'by_product') {
            // 副产抵减：产出量 → 库存单位 → × credit_price（以物料 stock_uom 计）
            const itemRow = await fetchItemCost(q, dialect, row.childItemId);
            if (itemRow.creditPrice !== null) {
              const out = computeOutputQuantity(row.qty, row.isFixedQty, pPrime, row.headerBaseQty);
              const rates = rowRates(row);
              const outInStock = convertUom(decimalToCanonical(out), row.occurrenceUom, row.childStockUom, rates);
              total = decimalSub(
                total,
                decimalMul(decimalFromCanonical(outInStock), decimalFromCanonical(itemRow.creditPrice))
              );
            }
          }
          continue;
        }
        // 本层需求（第 2~6 步共享实现，不取整）：G → G′ → G″ → 换算
        const gross =
          (row as { gross?: Decimal }).gross ??
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
          routingOps,
          splits: splitsByOccurrence.get(row.occurrenceId) ?? []
        });
        const rates = rowRates(row);
        const demandInStock = convertUom(decimalToCanonical(layer.net), row.occurrenceUom, row.childStockUom, rates);
        // 子件有头：换算到子头 base_uom × unit_cost（虚拟件同样走链式，穿透数值等价）。
        // 爆炸层已拒绝 unresolved（US-514 AC#11），此处 null 不可达。
        const childHeader = await resolveChildHeader(query, dialect, resolutionContext, row.resolvedChildRevisionId!);
        if (childHeader !== null) {
          const childDemand = convertUom(demandInStock, row.childStockUom, childHeader.baseUom, rates);
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
            itemRate: itemRow.uomConversion
          });
          total = decimalAdd(
            total,
            decimalMul(decimalFromCanonical(priceDemand), decimalFromCanonical(itemRow.unitPrice))
          );
        }
      }

      // 加工 + 制费（头挂路由才有；无路线 = 加工项为空，明细注明）
      if (headerMeta.routingId !== null && routingDetail.operations.length > 0) {
        for (const operation of routingDetail.operations) {
          const wOp = operationScrapChain(pPrime, routingOps, operation.operationSeq);
          const hoursRaw = decimalAdd(
            decimalAdd(
              decimalFromCanonical(operation.setupTime),
              decimalMul(decimalFromCanonical(operation.runTime), wOp)
            ),
            decimalFromCanonical(operation.fixedTime)
          );
          const activityTypeId = await fetchActivityTypeId(q, dialect, operation.workCenterId);
          const { rate, rateUom } = await fetchRate(
            q,
            dialect,
            operation.workCenterId,
            activityTypeId,
            context.rateDate,
            context.currency
          );
          const rateHours = convertUom(decimalToCanonical(hoursRaw), operation.timeUom, rateUom);
          total = decimalAdd(total, decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(rate)));
          // 制费 = Σ 换算后工时 × 工作中心 overhead_rate（未声明 = 无制费，不是错误）
          const centerRow = await fetchCenterCost(q, dialect, operation.workCenterId);
          if (centerRow.overheadRate !== null) {
            if (centerRow.overheadCurrency !== null && centerRow.overheadCurrency !== context.currency) {
              throw new BomCostError(
                '工作中心制费币种',
                `制费币种 ${centerRow.overheadCurrency} 与上下文币种 ${context.currency} 不符`
              );
            }
            total = decimalAdd(
              total,
              decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(centerRow.overheadRate))
            );
          }
        }
      }
      return total;
    };

    // 明细树：根按请求批量展开；children 按各自的本层需求批量展开（unit_cost 共享缓存）
    const buildDetail = async (headerMeta: HeaderMeta, L: Decimal): Promise<CostNodeDetail> => {
      const rows =
        (await fetchHeaderRows(query, dialect, resolutionContext, [headerMeta.headerId])).get(headerMeta.headerId) ??
        [];
      const effectiveRows = selectTierRows(rows, L);
      const pPrime = scrap(L, headerMeta.assemblyScrap, headerMeta.assemblyScrapConvention);
      const routingOps: LayerRoutingOp[] = [];
      const routingDetail =
        headerMeta.routingId !== null ? await fetchRoutingOps(q, dialect, headerMeta.routingId) : { operations: [] };
      for (const operation of routingDetail.operations) {
        routingOps.push({
          operationSeq: operation.operationSeq,
          operationScrap: operation.operationScrap,
          scrapConvention: operation.scrapConvention
        });
      }
      const splitsByOccurrence = await fetchSplits(
        q,
        dialect,
        effectiveRows.map(row => row.occurrenceId)
      );

      const material: CostMaterialLine[] = [];
      const credits: CostCreditLine[] = [];
      const children: CostNodeDetail[] = [];
      let materialTotal: Decimal = { coeff: 0n, exp: 0 };
      let creditTotal: Decimal = { coeff: 0n, exp: 0 };

      // 替代组分流（与 batchCostOf 同口径）
      const substituteRows = effectiveRows.filter(row => row.substituteGroupId !== null);
      const plainRows = effectiveRows.filter(row => row.substituteGroupId === null);
      const substituteGroups = new Map<string, typeof substituteRows>();
      for (const row of substituteRows) {
        const list = substituteGroups.get(row.substituteGroupId as string);
        if (list) list.push(row);
        else substituteGroups.set(row.substituteGroupId as string, [row]);
      }
      const groupedRows: (ExplosionRowLike & { gross?: Decimal })[] = [...plainRows];
      for (const members of substituteGroups.values()) {
        const primary = members.find(member => member.substituteRole === 'primary');
        if (!primary) continue;
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
              members.map(
                member =>
                  ({
                    childItemId: member.childItemId,
                    occurrenceId: member.occurrenceId,
                    substituteRole: member.substituteRole,
                    substitutePriority: member.substitutePriority,
                    usageProbability: member.usageProbability,
                    equivQty: member.equivQty,
                    substituteGroupCode: member.substituteGroupCode ?? (member.substituteGroupId as string).slice(0, 8),
                    substituteStrategy: member.substituteStrategy ?? 'proportional',
                    substituteAllowMix: member.substituteAllowMix ?? true,
                    occurrenceUom: member.occurrenceUom
                  }) satisfies SubstituteMember
              ),
              primaryGross,
              context.substituteAvailabilities,
              context.substituteSelections
            );
          } catch (error) {
            throw new BomCostError(
              `替代组 ${primary.substituteGroupCode ?? primary.substituteGroupId}`,
              error instanceof Error ? error.message : String(error)
            );
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
          if (!source) continue;
          groupedRows.push({ ...source, gross });
        }
      }

      for (const row of groupedRows) {
        if (row.flowDirection !== 'consume') {
          if (row.flowDirection === 'by_product') {
            const itemRow = await fetchItemCost(q, dialect, row.childItemId);
            if (itemRow.creditPrice !== null) {
              const out = computeOutputQuantity(row.qty, row.isFixedQty, pPrime, row.headerBaseQty);
              const rates = rowRates(row);
              const outInStock = convertUom(decimalToCanonical(out), row.occurrenceUom, row.childStockUom, rates);
              const amount = decimalMul(decimalFromCanonical(outInStock), decimalFromCanonical(itemRow.creditPrice));
              creditTotal = decimalAdd(creditTotal, amount);
              credits.push({
                occurrenceId: row.occurrenceId,
                childItemId: row.childItemId,
                outQty: outInStock,
                outUom: row.childStockUom,
                creditPrice: itemRow.creditPrice,
                amount: decimalToCanonical(amount)
              });
            }
          }
          continue;
        }
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
          routingOps,
          splits: splitsByOccurrence.get(row.occurrenceId) ?? []
        });
        const rates = rowRates(row);
        const demandInStock = convertUom(decimalToCanonical(layer.net), row.occurrenceUom, row.childStockUom, rates);
        // 爆炸层已拒绝 unresolved（US-514 AC#11），此处 null 不可达。
        const childHeader = await resolveChildHeader(query, dialect, resolutionContext, row.resolvedChildRevisionId!);
        if (childHeader !== null) {
          const childDemand = convertUom(demandInStock, row.childStockUom, childHeader.baseUom, rates);
          const childUnit = await unitCostOf(
            headerMetaOf(childHeader, row.childItemId, row.resolvedChildRevisionId as string)
          );
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
          children.push(
            await buildDetail(
              headerMetaOf(childHeader, row.childItemId, row.resolvedChildRevisionId as string),
              decimalFromCanonical(childDemand)
            )
          );
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
            itemRate: itemRow.uomConversion
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

      const processing: CostProcessingLine[] = [];
      let processingTotal: Decimal = { coeff: 0n, exp: 0 };
      let overheadAmount: Decimal = { coeff: 0n, exp: 0 };
      let overheadReason: CostNodeDetail['overheadReason'] = '无路线';
      if (headerMeta.routingId !== null && routingDetail.operations.length > 0) {
        for (const operation of routingDetail.operations) {
          const wOp = operationScrapChain(pPrime, routingOps, operation.operationSeq);
          const hoursRaw = decimalAdd(
            decimalAdd(
              decimalFromCanonical(operation.setupTime),
              decimalMul(decimalFromCanonical(operation.runTime), wOp)
            ),
            decimalFromCanonical(operation.fixedTime)
          );
          const activityTypeId = await fetchActivityTypeId(q, dialect, operation.workCenterId);
          const { rate, rateUom } = await fetchRate(
            q,
            dialect,
            operation.workCenterId,
            activityTypeId,
            context.rateDate,
            context.currency
          );
          const rateHours = convertUom(decimalToCanonical(hoursRaw), operation.timeUom, rateUom);
          const amount = decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(rate));
          processingTotal = decimalAdd(processingTotal, amount);
          processing.push({
            operationSeq: operation.operationSeq,
            setup: operation.setupTime,
            run: operation.runTime,
            fixed: operation.fixedTime,
            hours: decimalToCanonical(hoursRaw),
            timeUom: operation.timeUom,
            rateHours,
            rateUom,
            rate,
            amount: decimalToCanonical(amount)
          });
          const centerRow = await fetchCenterCost(q, dialect, operation.workCenterId);
          if (centerRow.overheadRate !== null) {
            if (centerRow.overheadCurrency !== null && centerRow.overheadCurrency !== context.currency) {
              throw new BomCostError(
                '工作中心制费币种',
                `制费币种 ${centerRow.overheadCurrency} 与上下文币种 ${context.currency} 不符`
              );
            }
            overheadAmount = decimalAdd(
              overheadAmount,
              decimalMul(decimalFromCanonical(rateHours), decimalFromCanonical(centerRow.overheadRate))
            );
            overheadReason = '按工时计';
          } else {
            overheadReason = '工作中心未声明制费';
          }
        }
      }

      const batchCost = decimalSub(decimalAdd(decimalAdd(materialTotal, processingTotal), overheadAmount), creditTotal);
      const unitCost = await unitCostOf(headerMeta);
      if (headerMeta.costLotQty === null) {
        throw new BomCostError(`头 ${headerMeta.headerId} 的 cost_lot_qty`, '卷算必填，缺失即拒绝');
      }
      return {
        headerId: headerMeta.headerId,
        itemId: headerMeta.parentItemId,
        batchQty: decimalToCanonical(L),
        baseUom: headerMeta.baseUom,
        costLotQty: headerMeta.costLotQty,
        batchCost: decimalToCanonical(batchCost),
        unitCost,
        material,
        processing,
        overhead: decimalToCanonical(overheadAmount),
        overheadReason,
        credits,
        children
      };
    };

    const root = await buildDetail(rootHeader, rootL);
    return { context, root };
  }, false);
};
