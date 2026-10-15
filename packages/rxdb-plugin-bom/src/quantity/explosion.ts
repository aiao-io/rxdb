/**
 * @fileoverview 七步数量展开（US-511 阶段 A / B1 / C 的计算）
 *
 * 顺序不可颠倒（MRP 与成本算错最常见的根因）：
 *
 * ```
 * 1. 父件计划量                P   = 头基准单位（上一层已归一；根由调用方 plannedQty 归一）
 * 2. 装配损耗（头级）          P'  = scrap(P, h.assembly_scrap, h.convention)
 * 3. 组件毛需求                q   = 本发生项 qty，或按语法版本求值 qty_formula；阶梯按损耗前 P 选行
 *                              G   = is_fixed ? q : q × P' / h.base_qty     单位 = 行 UoM
 * 4. 组件损耗（行级）          G'  = scrap(G, occ.component_scrap, occ.convention) + occ.component_scrap_fixed
 * 5. 工序损耗                  --  阶段 B2 前无此步
 * 6. 单位换算                  D   = conv(G', 行 UoM → 子件库存 UoM)
 * 7. 穿透 / 产出需求行         phantom = COALESCE(occ.phantom_override, revision.default_phantom)
 *                             真：conv(D, 库存 UoM → 子头基准 UoM) 作为 P 下钻，不产出需求行、不舍入
 *                             假：按库存单位小数位向上取整，产出需求行
 * ```
 *
 * 精度：34 位有效数字、中间量 half-even、只在需求行上向上取整一次；工作精度与舍入模式
 * 进 manifest 的 {@link EXPLOSION_ALGORITHM_VERSION}。全部读取在一个读事务里（US-508 AC#15）。
 * 遇到 `truncated` / `unresolved` 结构拒绝计算（US-510 AC#11 / US-508 AC#11 口径）。
 */

import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import {
  bomSqlDialectFor,
  buildAlternativeHeadersSql,
  buildHeaderOccurrencesSql,
  buildParentRevisionSql,
  type BomSqlDialect
} from '../resolve/bom-sql.js';
import { assertContext, columnIndexOf, type BomQueryExecutor, type ResolveTarget } from '../resolve/resolver.js';
import {
  BomResolutionError,
  type ResolutionContext,
  type UnresolvedAlternative
} from '../resolve/resolution.js';
import { BomQuantityError, type TruncationReason } from '../types.js';
import {
  ceilToDecimalPlaces,
  decimalAdd,
  decimalCmp,
  decimalDiv,
  decimalFromCanonical,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';
import { evaluateFormula, FORMULA_GRAMMAR_VERSION } from './formula.js';
import { allocateSubstituteShares, computeGross, computeLayerNet, computeOutputQuantity, scrap, selectTierRows, type LayerRoutingOp, type SubstituteMember } from './layer.js';
import { convertUom } from './uom.js';

/** 展开算法版本：34 位有效数字、half-even 中间量、七步顺序、需求行向上取整（改动即升版本）。 */
export const EXPLOSION_ALGORITHM_VERSION = '2';

/** 调用方给的计划量：值 + 单位（归一后成为根头的 P）。 */
export interface PlannedQuantity {
  value: string;
  uom: string;
}

/** 数量展开选项。 */
export interface ExplosionOptions {
  plannedQty: PlannedQuantity;
  /** 公式参数（公式行按语法版本求值用）。 */
  params?: Record<string, string>;
  /** 预算（深度 / 展开数 / 需求行数）与取消信号，触顶标 truncated。 */
  budgets?: { depth?: number; expansions?: number; paths?: number };
  signal?: AbortSignal;
}

/** 七步公式的一个中间量：值 + 单位。 */
export interface ExplosionStepValue {
  value: string;
  uom: string;
}

/** 一条需求行的七步中间值（US-525 算式面板的展示输入；面板只展示、不重算）。 */
export interface ExplosionSteps {
  /** 第 1 步 P：父计划量（头基准单位，已由上层归一）。 */
  planned: ExplosionStepValue;
  /** 第 2 步 P'：装配损耗后。 */
  assemblyScrapped: ExplosionStepValue;
  /** 第 3 步 G：组件毛需求（行 UoM；定量 / 公式 / 阶梯命中行）。 */
  gross: ExplosionStepValue;
  /** 第 4 步 G'：组件损耗后（含固定损耗）。 */
  componentScrapped: ExplosionStepValue;
  /** 第 5 步 G″：工序损耗（从投料工序含至末工序逐道累乘；无工序行为 null）。 */
  operationScrapped: ExplosionStepValue | null;
  /** 第 6 步 D：换算到子件库存单位。 */
  converted: ExplosionStepValue;
  /** 本行自身的 phantom 判定（COALESCE(phantom_override, default_phantom)）。 */
  phantom: { value: boolean; source: 'override' | 'revision' | 'fallback'; revisionId: string | null };
}

/** 一次穿透记录（虚拟件不产需求行，但其第 7 步判定与换算要能在算式面板摊开）。 */
export interface PenetrationRecord {
  /** 到穿透发生项的路径。 */
  path: string[];
  /** 穿透边（行发生项 id）。 */
  occurrenceId: string;
  /** 虚拟件物料 id。 */
  childItemId: string;
  /** 解析所得虚拟件修订 id。 */
  revisionId: string;
  /** phantom 判定来源：行级覆盖 / 修订级默认。 */
  source: 'override' | 'revision';
  /** 第 6 步 D（子件库存单位）。 */
  converted: ExplosionStepValue;
  /** 换算到子头基准单位后作为 P 的值。 */
  childPlanned: ExplosionStepValue;
}

/** 一条需求行（非虚拟件的向上取整结果；虚拟件不产出需求行）。 */
export interface RequirementLine {
  /** 行发生项 id 序列（根→本节点）。 */
  path: string[];
  /** 子件物料 id。 */
  itemId: string;
  /** 解析所得子件修订 id（评估日前无已发布修订时为 null）。 */
  revisionId: string | null;
  /** 向上取整后的需求（规范十进制串）。 */
  qty: string;
  /** 子件库存单位。 */
  uom: string;
  /** 七步中间值（算式面板展示输入）。 */
  steps: ExplosionSteps;
}

/** 展开 manifest：上下文、命中头与发生项、用到的换算率、公式信息与算法版本。 */
export interface ExplosionManifest {
  context: ResolutionContext;
  parentItemId: string;
  parentRevisionId: string;
  headerIds: string[];
  occurrenceIds: string[];
  /** 本次用到的换算（rate 为 null 表示同量纲标准系数）。 */
  conversions: { from: string; to: string; rate: string | null }[];
  /** 公式参数（调用方给过时记入，供审计）。 */
  formulaParams?: Record<string, string>;
  formulaGrammarVersion: string;
  algorithmVersion: string;
  unresolved: UnresolvedAlternative[];
}

/** 未裁决的替代组（US-512 AC#8：manual 组未给选择）。 */
export interface UnresolvedSubstituteGroup {
  groupCode: string;
  candidates: { itemId: string; role: 'primary' | 'substitute'; occurrenceId: string }[];
}

/** 一条产出量（US-513：by_product 副产 / scrap_out 废料，不进需求行）。 */
export interface OutputLine {
  path: string[];
  itemId: string;
  direction: 'by_product' | 'scrap_out';
  /** 产出量（规范十进制串，行 UoM）。 */
  qty: string;
  uom: string;
}

/** 一次数量展开的结果：需求行 + 产出量 + 穿透记录 + manifest + 截断标记。 */
export interface ExplosionResult {
  manifest: ExplosionManifest;
  requirementLines: RequirementLine[];
  /** 反向物料流产出（by_product / scrap_out），不产需求行、可归集。 */
  outputs: OutputLine[];
  /** 虚拟件穿透记录（不产需求行，供算式面板展示第 7 步判定与换算）。 */
  penetrations: PenetrationRecord[];
  /** 未裁决的替代组（manual 未给选择；消费方按 US-512 AC#8 拒绝）。 */
  unresolved: UnresolvedSubstituteGroup[];
  truncated: { reason: TruncationReason } | null;
}

/** 展开内部的行（SQL 行 → 类型化）。 */
interface ExplosionRow {
  headerId: string;
  headerBaseUom: string;
  headerBaseQty: string;
  headerAssemblyScrap: string;
  headerAssemblyScrapConvention: 'additive' | 'yield';
  headerRoutingId: string | null;
  lineNo: number;
  occurrenceId: string;
  childItemId: string;
  resolvedChildRevisionId: string | null;
  qty: string | null;
  qtyFormula: string | null;
  formulaGrammarVersion: string | null;
  isFixedQty: boolean;
  tierGroupNo: string | null;
  lotsizeFrom: string | null;
  lotsizeTo: string | null;
  componentScrap: string;
  componentScrapConvention: 'additive' | 'yield';
  componentScrapFixed: string;
  occurrenceUom: string;
  occurrenceUomConversion: string | null;
  phantomOverride: boolean | null;
  flowDirection: 'consume' | 'by_product' | 'scrap_out';
  substituteGroupId: string | null;
  substituteGroupCode: string | null;
  substituteStrategy: 'priority' | 'proportional' | 'manual' | null;
  substituteAllowMix: boolean | null;
  substituteRole: 'primary' | 'substitute' | null;
  substitutePriority: number | null;
  usageProbability: string | null;
  equivQty: string | null;
  operationSeq: number | null;
  childRevisionPhantom: boolean | null;
  childStockUom: string;
  childUomDecimals: number;
  childItemUomConversion: string | null;
}

/** BFS 节点：进入子 BOM 的（头, 计划量）。 */
interface ExplosionNode {
  path: string[];
  depth: number;
  headerId: string;
  itemId: string;
  revisionId: string;
  /** 计划量（已归一到头基准单位）。 */
  plannedQty: Decimal;
  baseUom: string;
}

interface ResolvedBudgets {
  depth: number;
  expansions: number;
  paths: number;
}

const DEFAULT_BUDGETS: ResolvedBudgets = { depth: 128, expansions: 100_000, paths: 100_000 };

const CHUNK_SIZE = 200;

const readString = (row: unknown[], columns: string[], name: string): string =>
  String(row[columnIndexOf(columns, name)]);

const readNullableString = (row: unknown[], columns: string[], name: string): string | null => {
  const index = columnIndexOf(columns, name);
  return row[index] === null ? null : String(row[index]);
};

const readNullableBool = (row: unknown[], columns: string[], name: string): boolean | null => {
  const index = columnIndexOf(columns, name);
  return row[index] === null ? null : Boolean(row[index]);
};

/** 分块取一层已解析发生项并按头分组。 */
export const fetchHeaderRows = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  headerIds: string[]
): Promise<Map<string, ExplosionRow[]>> => {
  const byHeader = new Map<string, ExplosionRow[]>();
  for (let offset = 0; offset < headerIds.length; offset += CHUNK_SIZE) {
    const chunk = headerIds.slice(offset, offset + CHUNK_SIZE);
    const built = buildHeaderOccurrencesSql(dialect, {
      asOfDate: context.asOfDate,
      bomType: context.bomType,
      orgId: context.orgId,
      headerIds: chunk
    });
    const result = await query(built.sql, built.params);
    for (const row of result.rows) {
      const mapped: ExplosionRow = {
        headerId: readString(row, result.columns, 'headerId'),
        headerBaseUom: readString(row, result.columns, 'headerBaseUom'),
        headerBaseQty: readString(row, result.columns, 'headerBaseQty'),
        headerAssemblyScrap: readString(row, result.columns, 'headerAssemblyScrap'),
        headerAssemblyScrapConvention: readString(row, result.columns, 'headerAssemblyScrapConvention') as 'additive' | 'yield',
        headerRoutingId: readNullableString(row, result.columns, 'headerRoutingId'),
        lineNo: Number(row[columnIndexOf(result.columns, 'lineNo')]),
        occurrenceId: readString(row, result.columns, 'occurrenceId'),
        childItemId: readString(row, result.columns, 'childItemId'),
        resolvedChildRevisionId: readNullableString(row, result.columns, 'resolvedChildRevisionId'),
        qty: readNullableString(row, result.columns, 'qty'),
        qtyFormula: readNullableString(row, result.columns, 'qtyFormula'),
        formulaGrammarVersion: readNullableString(row, result.columns, 'formulaGrammarVersion'),
        isFixedQty: Boolean(row[columnIndexOf(result.columns, 'isFixedQty')]),
        tierGroupNo: readNullableString(row, result.columns, 'tierGroupNo'),
        lotsizeFrom: readNullableString(row, result.columns, 'lotsizeFrom'),
        lotsizeTo: readNullableString(row, result.columns, 'lotsizeTo'),
        componentScrap: readString(row, result.columns, 'componentScrap'),
        componentScrapConvention: readString(row, result.columns, 'componentScrapConvention') as 'additive' | 'yield',
        componentScrapFixed: readString(row, result.columns, 'componentScrapFixed'),
        occurrenceUom: readString(row, result.columns, 'occurrenceUom'),
        occurrenceUomConversion: readNullableString(row, result.columns, 'occurrenceUomConversion'),
        phantomOverride: readNullableBool(row, result.columns, 'phantomOverride'),
        flowDirection: readString(row, result.columns, 'flowDirection') as 'consume' | 'by_product' | 'scrap_out',
        substituteGroupId: readNullableString(row, result.columns, 'substituteGroupId'),
        substituteGroupCode: readNullableString(row, result.columns, 'substituteGroupCode'),
        substituteStrategy: readNullableString(row, result.columns, 'substituteStrategy') as 'priority' | 'proportional' | 'manual' | null,
        substituteAllowMix: readNullableBool(row, result.columns, 'substituteAllowMix'),
        substituteRole: readNullableString(row, result.columns, 'substituteRole') as 'primary' | 'substitute' | null,
        substitutePriority: row[columnIndexOf(result.columns, 'substitutePriority')] === null ? null : Number(row[columnIndexOf(result.columns, 'substitutePriority')]),
        usageProbability: readNullableString(row, result.columns, 'usageProbability'),
        equivQty: readNullableString(row, result.columns, 'equivQty'),
        operationSeq: row[columnIndexOf(result.columns, 'operationSeq')] === null ? null : Number(row[columnIndexOf(result.columns, 'operationSeq')]),
        childRevisionPhantom: readNullableBool(row, result.columns, 'childRevisionPhantom'),
        childStockUom: readString(row, result.columns, 'childStockUom'),
        childUomDecimals: Number(row[columnIndexOf(result.columns, 'childUomDecimals')]),
        childItemUomConversion: readNullableString(row, result.columns, 'childItemUomConversion')
      };
      const list = byHeader.get(mapped.headerId);
      if (list) list.push(mapped);
      else byHeader.set(mapped.headerId, [mapped]);
    }
  }
  return byHeader;
};

/** 行的换算率链（行级覆盖物料级）。 */
export const rowRates = (row: ExplosionRow): { lineRate?: string | null; itemRate?: string | null } => ({
  lineRate: row.occurrenceUomConversion,
  itemRate: row.childItemUomConversion
});

/** 子头选择：该修订在上下文下的 released 头（恰好一个；多备选未裁决拒绝）。 */
/** 子头（含成本卷算所需的头字段；多备选未裁决拒绝）。 */
export interface ResolvedChildHeader {
  headerId: string;
  baseUom: string;
  baseQty: string;
  assemblyScrap: string;
  assemblyScrapConvention: 'additive' | 'yield';
  costLotQty: string | null;
  routingId: string | null;
}

/** 子头选择：该修订在上下文下的 released 头（恰好一个；多备选未裁决拒绝）。 */
export const resolveChildHeader = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  revisionId: string
): Promise<ResolvedChildHeader | null> => {
  const built = buildAlternativeHeadersSql(dialect, {
    parentRevisionId: revisionId,
    bomType: context.bomType,
    orgId: context.orgId
  });
  const result = await query(built.sql, built.params);
  const headers = result.rows;
  if (headers.length === 0) return null;
  if (headers.length > 1) {
    throw new BomResolutionError('alternativeNo', `修订 ${revisionId} 存在多个备选头，数量展开需要裁决`);
  }
  return {
    headerId: String(headers[0][columnIndexOf(result.columns, 'headerId')]),
    baseUom: readString(headers[0], result.columns, 'baseUom'),
    baseQty: readString(headers[0], result.columns, 'baseQty'),
    assemblyScrap: readString(headers[0], result.columns, 'assemblyScrap'),
    assemblyScrapConvention: readString(headers[0], result.columns, 'assemblyScrapConvention') as 'additive' | 'yield',
    costLotQty: readNullableString(headers[0], result.columns, 'costLotQty'),
    routingId: readNullableString(headers[0], result.columns, 'routingId')
  };
};

/**
 * 七步数量展开：从父修订出发，逐层按七步公式产出需求行（虚拟件穿透、非虚拟件取整下传）。
 *
 * @param adapter - 本地适配器（全部读取在一个读事务里）
 * @param context - 解析上下文（生效窗口 / 类型 / 组织；多备选未裁决拒绝）
 * @param target - 展开目标（按时点选父修订，或显式修订）
 * @param options - 计划量、公式参数、预算与取消信号
 * @returns 需求行 + manifest（换算率 / 公式参数 / 语法版本 / 算法版本）+ 截断标记
 */
export const explodeBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options: ExplosionOptions
): Promise<ExplosionResult> => {
  assertContext(context);
  if (target.parentItemId === undefined && target.parentRevisionId === undefined) {
    throw new BomResolutionError('parent', '需要 parentItemId 或 parentRevisionId 之一');
  }
  const dialect = bomSqlDialectFor(adapter.name);
  const budget = { ...DEFAULT_BUDGETS, ...options.budgets };

  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);

    // 1. 父修订与根头（与 resolveBom 同口径；多备选未裁决拒绝）
    const parentSql = buildParentRevisionSql(dialect, {
      itemId: target.parentItemId ?? '',
      asOfDate: context.asOfDate,
      explicitRevisionId: target.parentRevisionId
    });
    const parentResult = await query(parentSql.sql, parentSql.params);
    const parentRow = parentResult.rows[0];
    if (!parentRow) {
      throw new BomResolutionError('parentRevisionId', target.parentRevisionId !== undefined ? '父修订不存在' : '评估日前没有已发布的最新修订');
    }
    const parentRevisionId = readString(parentRow, parentResult.columns, 'revisionId');
    const parentItemId = readString(parentRow, parentResult.columns, 'itemId');
    if (parentRow[columnIndexOf(parentResult.columns, 'state')] !== 'released') {
      throw new BomResolutionError('parentRevisionId', '父修订未发布，草稿不入数量展开');
    }
    const rootHeadersSql = buildAlternativeHeadersSql(dialect, {
      parentRevisionId,
      bomType: context.bomType,
      orgId: context.orgId
    });
    const rootHeadersResult = await query(rootHeadersSql.sql, rootHeadersSql.params);
    const rootHeaders = rootHeadersResult.rows;
    if (rootHeaders.length > 1 && context.alternativeNo === undefined) {
      throw new BomResolutionError('alternativeNo', '根头存在多个备选，数量展开需要裁决');
    }
    const selectedRootHeaders =
      context.alternativeNo !== undefined ?
        rootHeaders.filter(row => Number(row[columnIndexOf(rootHeadersResult.columns, 'alternativeNo')]) === context.alternativeNo)
      : rootHeaders;
    if (selectedRootHeaders.length === 0) {
      throw new BomResolutionError('parentRevisionId', '根修订在上下文下没有已发布头');
    }

    // 2. BFS 七步
    const conversions: ExplosionManifest['conversions'] = [];
    // 第 5 步的工序损耗与分摊数据（全量加载，按 routing / occurrence 分组）
    const opsByRouting = new Map<string, { operationSeq: number; operationScrap: string; scrapConvention: 'additive' | 'yield' }[]>();
    const opsResult = await query(
      `SELECT "routingId", "operationSeq", "operationScrap", "scrapConvention" FROM ${dialect.table('routing_operation')} ORDER BY "operationSeq"`
    );
    for (const row of opsResult.rows) {
      const routingId = readString(row, opsResult.columns, 'routingId');
      const list = opsByRouting.get(routingId) ?? [];
      list.push({
        operationSeq: Number(row[columnIndexOf(opsResult.columns, 'operationSeq')]),
        operationScrap: readString(row, opsResult.columns, 'operationScrap'),
        scrapConvention: readString(row, opsResult.columns, 'scrapConvention') as 'additive' | 'yield'
      });
      opsByRouting.set(routingId, list);
    }
    const splitsByOccurrence = new Map<string, { operationSeq: number; ratio: string }[]>();
    const splitsResult = await query(`SELECT "occurrenceId", "operationSeq", "ratio" FROM ${dialect.table('bom_line_operation_split')}`);
    for (const row of splitsResult.rows) {
      const occurrenceId = readString(row, splitsResult.columns, 'occurrenceId');
      const list = splitsByOccurrence.get(occurrenceId) ?? [];
      list.push({
        operationSeq: Number(row[columnIndexOf(splitsResult.columns, 'operationSeq')]),
        ratio: readString(row, splitsResult.columns, 'ratio')
      });
      splitsByOccurrence.set(occurrenceId, list);
    }
    const recordConversion = (from: string, to: string, rate: string | null): void => {
      if (from !== to) conversions.push({ from, to, rate });
    };

    // 根节点：plannedQty 归一到根头基准单位（buildAlternativeHeadersSql 已带 baseUom 列）
    const rootHeader = selectedRootHeaders[0];
    const rootHeaderId = String(rootHeader[columnIndexOf(rootHeadersResult.columns, 'headerId')]);
    const rootBaseUom = readString(rootHeader, rootHeadersResult.columns, 'baseUom');
    const rootPlanned = convertUom(options.plannedQty.value, options.plannedQty.uom, rootBaseUom);
    recordConversion(options.plannedQty.uom, rootBaseUom, null);

    const nodeRoutingOps = new Map<string, LayerRoutingOp[]>();
    const nodes: ExplosionNode[] = [
      {
        path: [],
        depth: 0,
        headerId: rootHeaderId,
        itemId: parentItemId,
        revisionId: parentRevisionId,
        plannedQty: decimalFromCanonical(rootPlanned),
        baseUom: rootBaseUom
      }
    ];
    const requirementLines: RequirementLine[] = [];
    const outputs: OutputLine[] = [];
    const penetrations: PenetrationRecord[] = [];
    const unresolvedGroups: UnresolvedSubstituteGroup[] = [];
    const occurrenceIds: string[] = [];
    let truncated: ExplosionResult['truncated'] = null;
    let expansions = 0;
    let frontier = [0];

    while (frontier.length > 0) {
      if (options.signal?.aborted) {
        truncated = { reason: 'cancelled' };
        break;
      }
      const headerIds = [...new Set(frontier.map(index => nodes[index].headerId))];
      const byHeader = await fetchHeaderRows(query, dialect, context, headerIds);
      const nextFrontier: number[] = [];

      nodeLoop: for (const nodeIndex of frontier) {
        const node = nodes[nodeIndex];
        const rows = byHeader.get(node.headerId) ?? [];
        // 第 5 步：缓存头路由的工序链（行查询带 headerRoutingId）
        if (rows[0]?.headerRoutingId) {
          nodeRoutingOps.set(node.headerId, opsByRouting.get(rows[0].headerRoutingId) ?? []);
        }
        // 2. 装配损耗
        const plannedPrime = scrap(node.plannedQty, rows[0]?.headerAssemblyScrap ?? '0', rows[0]?.headerAssemblyScrapConvention ?? 'additive');
        // 3. 阶梯按损耗前 P 选行（普通行恒计入；共享实现，US-514 同源）
        let effectiveRows: ExplosionRow[];
        try {
          effectiveRows = selectTierRows(rows, node.plannedQty);
        } catch (error) {
          throw new BomQuantityError(error instanceof Error ? error.message : String(error), node.path);
        }

        // US-513：只有 consume 行进入七步需求链路；by_product / scrap_out 是反向物料流。
        // 「无投入」的头（有行但没有 consume 行）整次拒绝，不把空结果当成功。
        if (!effectiveRows.some(row => row.flowDirection === 'consume')) {
          throw new BomQuantityError('头没有 consume 行（无投入）：副产与废料行不能单独构成层级', node.path);
        }

        // 第 4~7 步的公共发射（闭包捕获本节点上下文）；返回触顶原因（调用方 break 外层循环）
        const emitConsumeLine = async (row: ExplosionRow, gross: Decimal): Promise<{ truncated: TruncationReason | null }> => {
          if (options.signal?.aborted) return { truncated: 'cancelled' };
          const depth = node.depth + 1;
          if (depth > budget.depth) return { truncated: 'depth' };
          if (requirementLines.length + 1 > budget.paths) return { truncated: 'paths' };
          if (expansions + 1 > budget.expansions) return { truncated: 'expansions' };
          expansions += 1;
          occurrenceIds.push(row.occurrenceId);
          // 4~5. 组件损耗 + 固定损耗 + 工序损耗链/分摊（共享实现，US-514 同源）
          const splits = splitsByOccurrence.get(row.occurrenceId) ?? [];
          const layer = computeLayerNet(gross, row, {
            plannedPrime,
            headerBaseQty: row.headerBaseQty,
            formulaParams: options.params,
            routingOps: nodeRoutingOps.get(node.headerId) ?? [],
            splits
          });
          const net = layer.net;
          const operationScrappedValue: Decimal = layer.net;
          const hasOperation = layer.hasOperation;
          // 6. 单位换算（行 UoM → 子件库存 UoM）
          const rates = rowRates(row);
          const demand = decimalFromCanonical(convertUom(decimalToCanonical(operationScrappedValue), row.occurrenceUom, row.childStockUom, rates));
          recordConversion(row.occurrenceUom, row.childStockUom, rates.lineRate ?? rates.itemRate ?? null);
          // 7. 穿透 / 产出需求行
          const phantomSource =
            row.phantomOverride !== null ? 'override' as const
            : row.childRevisionPhantom !== null ? 'revision' as const
            : 'fallback' as const;
          const phantom = row.phantomOverride ?? row.childRevisionPhantom ?? false;
          if (phantom) {
            if (row.resolvedChildRevisionId === null) {
              throw new BomQuantityError(`虚拟件 ${row.childItemId} 在评估日没有已发布修订，无法穿透`, [...node.path, row.occurrenceId]);
            }
            const childHeader = await resolveChildHeader(query, dialect, context, row.resolvedChildRevisionId);
            if (childHeader === null) {
              throw new BomQuantityError(`虚拟件 ${row.childItemId} 在当前上下文下没有已发布 BOM 头`, [...node.path, row.occurrenceId]);
            }
            const childPlanned = convertUom(decimalToCanonical(demand), row.childStockUom, childHeader.baseUom, rates);
            recordConversion(row.childStockUom, childHeader.baseUom, rates.lineRate ?? rates.itemRate ?? null);
            penetrations.push({
              path: [...node.path, row.occurrenceId],
              occurrenceId: row.occurrenceId,
              childItemId: row.childItemId,
              revisionId: row.resolvedChildRevisionId,
              source: phantomSource === 'override' ? 'override' : 'revision',
              converted: { value: decimalToCanonical(demand), uom: row.childStockUom },
              childPlanned: { value: childPlanned, uom: childHeader.baseUom }
            });
            nextFrontier.push(
              nodes.push({
                path: [...node.path, row.occurrenceId],
                depth,
                headerId: childHeader.headerId,
                itemId: row.childItemId,
                revisionId: row.resolvedChildRevisionId,
                plannedQty: decimalFromCanonical(childPlanned),
                baseUom: childHeader.baseUom
              }) - 1
            );
          } else {
            const rounded = ceilToDecimalPlaces(demand, row.childUomDecimals);
            requirementLines.push({
              path: [...node.path, row.occurrenceId],
              itemId: row.childItemId,
              revisionId: row.resolvedChildRevisionId,
              qty: decimalToCanonical(rounded),
              uom: row.childStockUom,
              steps: {
                planned: { value: decimalToCanonical(node.plannedQty), uom: node.baseUom },
                assemblyScrapped: { value: decimalToCanonical(plannedPrime), uom: node.baseUom },
                gross: { value: decimalToCanonical(gross), uom: row.occurrenceUom },
                componentScrapped: { value: decimalToCanonical(net), uom: row.occurrenceUom },
                operationScrapped: hasOperation ? { value: decimalToCanonical(operationScrappedValue), uom: row.occurrenceUom } : null,
                converted: { value: decimalToCanonical(demand), uom: row.childStockUom },
                phantom: { value: phantom, source: phantomSource, revisionId: row.resolvedChildRevisionId }
              }
            });
            if (row.resolvedChildRevisionId !== null) {
              const childHeader = await resolveChildHeader(query, dialect, context, row.resolvedChildRevisionId);
              if (childHeader !== null) {
                const childPlanned = convertUom(decimalToCanonical(rounded), row.childStockUom, childHeader.baseUom, rates);
                recordConversion(row.childStockUom, childHeader.baseUom, rates.lineRate ?? rates.itemRate ?? null);
                nextFrontier.push(
                  nodes.push({
                    path: [...node.path, row.occurrenceId],
                    depth,
                    headerId: childHeader.headerId,
                    itemId: row.childItemId,
                    revisionId: row.resolvedChildRevisionId,
                    plannedQty: decimalFromCanonical(childPlanned),
                    baseUom: childHeader.baseUom
                  }) - 1
                );
              }
            }
          }
          return { truncated: null };
        };

        // 第 3 步：行的组件毛需求（组 primary 与普通行共用）
        const grossOf = (row: ExplosionRow): Decimal =>
          computeGross(row, {
            plannedPrime,
            headerBaseQty: row.headerBaseQty,
            formulaParams: options.params,
            routingOps: [],
            splits: []
          });

        // US-512 替代组：组内成员整体分摊，不走各自行的 qty
        const substituteRows = effectiveRows.filter(row => row.substituteGroupId !== null);
        // 反向流（by_product / scrap_out）已在上面循环进 outputs，这里只剩 consume 行
        const plainRows = effectiveRows.filter(row => row.substituteGroupId === null && row.flowDirection === 'consume');
        const substituteGroups = new Map<string, ExplosionRow[]>();
        for (const row of substituteRows) {
          const list = substituteGroups.get(row.substituteGroupId as string);
          if (list) list.push(row);
          else substituteGroups.set(row.substituteGroupId as string, [row]);
        }

        // 反向物料流与普通 consume 行
        for (const row of effectiveRows) {
          if (row.flowDirection !== 'consume') {
            const outputQuantity = computeOutputQuantity(row.qty, row.isFixedQty, plannedPrime, row.headerBaseQty);
            outputs.push({
              path: [...node.path, row.occurrenceId],
              itemId: row.childItemId,
              direction: row.flowDirection,
              qty: decimalToCanonical(outputQuantity),
              uom: row.occurrenceUom
            });
            occurrenceIds.push(row.occurrenceId);
          }
        }
        for (const row of plainRows) {
          const emitted = await emitConsumeLine(row, grossOf(row));
          if (emitted.truncated !== null) {
            truncated = { reason: emitted.truncated };
            break nodeLoop;
          }
        }

        // 替代组分流（AC#1/#2/#4/#8；共享纯函数，US-514 同源）
        for (const [groupId, members] of substituteGroups) {
          const primary = members.find(member => member.substituteRole === 'primary');
          if (!primary) continue; // 发布转移已校验恰好一个 primary
          const primaryGross = grossOf(primary);
          const allocated = (() => {
            try {
              return allocateSubstituteShares(
                members.map(member => ({
                  childItemId: member.childItemId,
                  occurrenceId: member.occurrenceId,
                  substituteRole: member.substituteRole,
                  substitutePriority: member.substitutePriority,
                  usageProbability: member.usageProbability,
                  equivQty: member.equivQty,
                  substituteGroupCode: member.substituteGroupCode ?? groupId.slice(0, 8),
                  substituteStrategy: member.substituteStrategy ?? 'proportional',
                  substituteAllowMix: member.substituteAllowMix ?? true,
                  occurrenceUom: member.occurrenceUom
                } satisfies SubstituteMember)),
                primaryGross,
                context.substituteAvailabilities,
                context.substituteSelections
              );
            } catch (error) {
              throw new BomQuantityError(error instanceof Error ? error.message : String(error), [...node.path, primary.occurrenceId]);
            }
          })();
          if (allocated.unresolved) {
            unresolvedGroups.push({
              groupCode: allocated.unresolved.groupCode,
              candidates: allocated.unresolved.candidates
            });
            continue;
          }
          for (const { member, gross } of allocated.shares) {
            const source = members.find(candidate => candidate.occurrenceId === member.occurrenceId);
            if (!source) continue;
            const emitted = await emitConsumeLine(source, gross);
            if (emitted.truncated !== null) {
              truncated = { reason: emitted.truncated };
              break nodeLoop;
            }
          }
        }
      }
      if (truncated !== null) break;
      frontier = nextFrontier;
    }

    const manifest: ExplosionManifest = {
      context,
      parentItemId,
      parentRevisionId,
      headerIds: nodes.map(node => node.headerId),
      occurrenceIds,
      conversions,
      formulaParams: options.params,
      formulaGrammarVersion: FORMULA_GRAMMAR_VERSION,
      algorithmVersion: EXPLOSION_ALGORITHM_VERSION,
      unresolved: []
    };
    return { manifest, requirementLines, outputs, penetrations, unresolved: unresolvedGroups, truncated };
  }, false);
};

// readChildBaseUom 已并入 resolveChildHeader（头查询自带 baseUom 列）
