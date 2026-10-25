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
import { filterResolutionRows } from '../resolve/config-validate.js';
import { checkBudgets, DEFAULT_EXPANSION_BUDGETS, type ExpansionBudgets } from '../resolve/expansion.js';
import { BomResolutionError, type ResolutionContext, type UnresolvedAlternative } from '../resolve/resolution.js';
import {
  assertContext,
  columnIndexOf,
  selectRootAlternatives,
  type BomQueryExecutor,
  type ResolveTarget
} from '../resolve/resolver.js';
import { BomQuantityError, type TruncationReason } from '../types.js';
import { ceilToDecimalPlaces, decimalFromCanonical, decimalToCanonical, type Decimal } from './decimal.js';
import { FORMULA_GRAMMAR_VERSION } from './formula.js';
import {
  allocateSubstituteShares,
  computeGross,
  computeLayerNet,
  computeOutputQuantity,
  scrap,
  selectTierRows,
  substitutePrimaryOf,
  type LayerNetResult,
  type LayerRoutingOp,
  type SubstituteMember
} from './layer.js';
import { normalizePlannedQuantity } from './planned-quantity.js';
import { findMissingOperation, routingUncoveredReason } from './routing-effectivity.js';
import { appliedUomRate, convertUom, splitHopRates, type HopConversionRates } from './uom.js';

import { EXPLOSION_ALGORITHM_VERSION } from './versions.js';
export { EXPLOSION_ALGORITHM_VERSION } from './versions.js';

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
  /**
   * 预算，与 `expandBom` 同一结算（取消 → 深度 → 返回路径数 → 展开数），触顶标 truncated：路径节点是需求行与
   * 虚拟件穿透，返回路径数含根。产出行（副产 / 废料 / 联产品）、未命中的阶梯行、未分摊的替代成员及其下的子树
   * 不是数量遍历的路径节点、不计预算，这类结构上展开可能先于数量展开截断。
   */
  budgets?: ExpansionBudgets;
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
  /** 组的全局身份；同名组通过此 ID 独立裁决。 */
  groupId: string;
  groupCode: string;
  candidates: { itemId: string; role: 'primary' | 'substitute'; occurrenceId: string }[];
}

/** 一条产出量（副产、废料与联产品均不进入投入需求行）。 */
export interface OutputLine {
  path: string[];
  itemId: string;
  direction: 'by_product' | 'scrap_out' | 'produce';
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
  parentItemId: string;
  parentRevisionId: string;
  alternativeNo: number;
  lineId: string;
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
  flowDirection: 'consume' | 'by_product' | 'scrap_out' | 'produce';
  substituteGroupId: string | null;
  substituteGroupCode: string | null;
  substituteStrategy: 'priority' | 'proportional' | 'manual' | null;
  substituteAllowMix: boolean | null;
  substituteRole: 'primary' | 'substitute' | null;
  substitutePriority: number | null;
  usageProbability: string | null;
  equivQty: string | null;
  operationSeq: number | null;
  unitFrom: number | null;
  unitTo: number | null;
  lotCodes: string | null;
  selectionConditionId: string | null;
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

const readNullableNumber = (row: unknown[], columns: string[], name: string): number | null =>
  row[columnIndexOf(columns, name)] === null ? null : Number(row[columnIndexOf(columns, name)]);

export const fetchHeaderRows = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  headerIds: string[],
  unresolved?: UnresolvedAlternative[]
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
    const mappedRows: ExplosionRow[] = [];
    for (const row of result.rows) {
      const mapped: ExplosionRow = {
        headerId: readString(row, result.columns, 'headerId'),
        parentItemId: readString(row, result.columns, 'parentItemId'),
        parentRevisionId: readString(row, result.columns, 'parentRevisionId'),
        alternativeNo: Number(row[columnIndexOf(result.columns, 'alternativeNo')]),
        lineId: readString(row, result.columns, 'lineId'),
        headerBaseUom: readString(row, result.columns, 'headerBaseUom'),
        headerBaseQty: readString(row, result.columns, 'headerBaseQty'),
        headerAssemblyScrap: readString(row, result.columns, 'headerAssemblyScrap'),
        headerAssemblyScrapConvention: readString(row, result.columns, 'headerAssemblyScrapConvention') as
          'additive' | 'yield',
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
        flowDirection: readString(row, result.columns, 'flowDirection') as
          'consume' | 'by_product' | 'scrap_out' | 'produce',
        substituteGroupId: readNullableString(row, result.columns, 'substituteGroupId'),
        substituteGroupCode: readNullableString(row, result.columns, 'substituteGroupCode'),
        substituteStrategy: readNullableString(row, result.columns, 'substituteStrategy') as
          'priority' | 'proportional' | 'manual' | null,
        substituteAllowMix: readNullableBool(row, result.columns, 'substituteAllowMix'),
        substituteRole: readNullableString(row, result.columns, 'substituteRole') as 'primary' | 'substitute' | null,
        substitutePriority:
          row[columnIndexOf(result.columns, 'substitutePriority')] === null ?
            null
          : Number(row[columnIndexOf(result.columns, 'substitutePriority')]),
        usageProbability: readNullableString(row, result.columns, 'usageProbability'),
        equivQty: readNullableString(row, result.columns, 'equivQty'),
        operationSeq:
          row[columnIndexOf(result.columns, 'operationSeq')] === null ?
            null
          : Number(row[columnIndexOf(result.columns, 'operationSeq')]),
        unitFrom: readNullableNumber(row, result.columns, 'unitFrom'),
        unitTo: readNullableNumber(row, result.columns, 'unitTo'),
        lotCodes: readNullableString(row, result.columns, 'lotCodes'),
        selectionConditionId: readNullableString(row, result.columns, 'selectionConditionId'),
        childRevisionPhantom: readNullableBool(row, result.columns, 'childRevisionPhantom'),
        childStockUom: readString(row, result.columns, 'childStockUom'),
        childUomDecimals: Number(row[columnIndexOf(result.columns, 'childUomDecimals')]),
        childItemUomConversion: readNullableString(row, result.columns, 'childItemUomConversion')
      };
      mappedRows.push(mapped);
      if (!byHeader.has(mapped.headerId)) byHeader.set(mapped.headerId, []);
    }
    const filtered = await filterResolutionRows(query, dialect, context, mappedRows, unresolved);
    for (const mapped of filtered) {
      const list = byHeader.get(mapped.headerId);
      if (list) list.push(mapped);
      else byHeader.set(mapped.headerId, [mapped]);
    }
  }
  return byHeader;
};

/** 行的两跳换算率（行级覆盖物料级；每个声明的率只服务一跳跨量纲换算，见 {@link splitHopRates}）。 */
export const rowHopRates = (row: ExplosionRow): HopConversionRates =>
  splitHopRates(row.occurrenceUom, row.childStockUom, row.occurrenceUomConversion, row.childItemUomConversion);

/**
 * 替代组成员的分流输入（数量与成本共用）。组字段来自 `bom_substitute_group` 的 LEFT JOIN：
 * 成员外键保证组存在、组的 code / strategy / allow_mix 非空，缺失即数据损坏，直接拒绝不猜默认值。
 */
export const substituteMemberOf = (row: ExplosionRow): SubstituteMember => {
  if (
    row.substituteGroupId === null ||
    row.substituteGroupCode === null ||
    row.substituteStrategy === null ||
    row.substituteAllowMix === null
  ) {
    throw new Error(`发生项 ${row.occurrenceId} 引用的替代组 ${row.substituteGroupId} 不存在或字段缺失`);
  }
  return {
    childItemId: row.childItemId,
    occurrenceId: row.occurrenceId,
    substituteRole: row.substituteRole,
    substitutePriority: row.substitutePriority,
    usageProbability: row.usageProbability,
    equivQty: row.equivQty,
    substituteGroupId: row.substituteGroupId,
    substituteGroupCode: row.substituteGroupCode,
    substituteStrategy: row.substituteStrategy,
    substituteAllowMix: row.substituteAllowMix,
    occurrenceUom: row.occurrenceUom
  };
};

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

/**
 * 子头选择：该修订在上下文下的 released 头（恰好一个）。`alternativeNo` 只裁决根头，
 * 子装配有多个已发布备选头即拒绝（不按根的编号去挑子头，也不擅自取一个）。
 */
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
    const alternatives = headers.map(row => Number(row[columnIndexOf(result.columns, 'alternativeNo')])).join('、');
    throw new BomResolutionError(
      'alternativeNo',
      `子装配修订 ${revisionId} 存在多个已发布备选头（${alternatives}）：alternativeNo 只裁决根头，子装配多备选需先消除歧义`
    );
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

/** 根：父修订（与 resolveBom 同口径，草稿不入展开）与根头（多备选未裁决拒绝）。 */
interface ExplosionRoot {
  parentItemId: string;
  parentRevisionId: string;
  headerId: string;
  baseUom: string;
}

const resolveExplosionRoot = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  target: ResolveTarget
): Promise<ExplosionRoot> => {
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
  const selectedRootHeaders = selectRootAlternatives(
    rootHeadersResult.rows.map(row => ({
      row,
      alternativeNo: Number(row[columnIndexOf(rootHeadersResult.columns, 'alternativeNo')])
    })),
    context,
    parentRevisionId
  );
  if (selectedRootHeaders.length > 1) {
    throw new BomResolutionError('alternativeNo', '根头存在多个备选，数量展开需要裁决（指定 alternativeNo）');
  }
  if (selectedRootHeaders.length === 0) {
    throw new BomResolutionError('parentRevisionId', '根修订在上下文下没有已发布头');
  }
  const rootHeader = selectedRootHeaders[0].row;
  return {
    parentItemId,
    parentRevisionId,
    headerId: String(rootHeader[columnIndexOf(rootHeadersResult.columns, 'headerId')]),
    baseUom: readString(rootHeader, rootHeadersResult.columns, 'baseUom')
  };
};

/** 第 5 步的路线数据（全量加载一次）：按路线分组的工序链、评估日不可用的路线、按发生项分组的分摊。 */
interface RoutingData {
  opsByRouting: Map<string, LayerRoutingOp[]>;
  routingUncovered: Map<string, string>;
  splitsByOccurrence: Map<string, { operationSeq: number; ratio: string }[]>;
}

const loadRoutingData = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  asOfDate: Date
): Promise<RoutingData> => {
  const opsByRouting = new Map<string, LayerRoutingOp[]>();
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
  const routingValidity = (
    await query(
      `SELECT "id" AS "id", "validFrom" AS "validFrom", "disabledAt" AS "disabledAt" FROM ${dialect.table('routing')}`
    )
  ).rows;
  const routingUncovered = new Map<string, string>();
  for (const row of routingValidity) {
    const reason = routingUncoveredReason({ validFrom: row[1], disabledAt: row[2] }, asOfDate);
    if (reason !== null) routingUncovered.set(String(row[0]), reason);
  }
  const splitsByOccurrence = new Map<string, { operationSeq: number; ratio: string }[]>();
  const splitsResult = await query(
    `SELECT "occurrenceId", "operationSeq", "ratio" FROM ${dialect.table('bom_line_operation_split')}`
  );
  for (const row of splitsResult.rows) {
    const occurrenceId = readString(row, splitsResult.columns, 'occurrenceId');
    const list = splitsByOccurrence.get(occurrenceId) ?? [];
    list.push({
      operationSeq: Number(row[columnIndexOf(splitsResult.columns, 'operationSeq')]),
      ratio: readString(row, splitsResult.columns, 'ratio')
    });
    splitsByOccurrence.set(occurrenceId, list);
  }
  return { opsByRouting, routingUncovered, splitsByOccurrence };
};

/** 一次展开的共享状态：读事务内的查询、BFS 节点表、结果集与预算计数（各层累积）。 */
interface ExplosionRun {
  query: BomQueryExecutor['query'];
  dialect: BomSqlDialect;
  context: ResolutionContext;
  options: ExplosionOptions;
  budget: Readonly<Required<ExpansionBudgets>>;
  routing: RoutingData;
  /** 子头按修订缓存（同一修订在多条路径上只解析一次）。 */
  childHeaders: Map<string, ResolvedChildHeader | null>;
  /** 解析域的 unresolved（配置 / 序列 / 批次候选未定），随行查询累积。 */
  domainUnresolved: UnresolvedAlternative[];
  nodes: ExplosionNode[];
  requirementLines: RequirementLine[];
  outputs: OutputLine[];
  penetrations: PenetrationRecord[];
  unresolvedGroups: UnresolvedSubstituteGroup[];
  occurrenceIds: string[];
  conversions: ExplosionManifest['conversions'];
  expansions: number;
}

/** 一个节点的本层上下文：第 2 步的 P′ 与头路由的工序链；下钻的子节点收进下一层前沿。 */
interface NodeLayer {
  node: ExplosionNode;
  plannedPrime: Decimal;
  routingOps: LayerRoutingOp[];
  nextFrontier: number[];
}

/** 一条消耗行第 3~6 步的中间值（第 7 步穿透与产出需求行共用）。 */
interface ConsumeValues {
  gross: Decimal;
  layerNet: LayerNetResult;
  /** 第 6 步 D（子件库存单位）。 */
  demand: Decimal;
  hops: HopConversionRates;
}

const recordConversion = (run: ExplosionRun, from: string, to: string, rate: string | null): void => {
  if (from !== to) run.conversions.push({ from, to, rate });
};

const readChildHeader = async (run: ExplosionRun, revisionId: string): Promise<ResolvedChildHeader | null> => {
  if (!run.childHeaders.has(revisionId)) {
    run.childHeaders.set(revisionId, await resolveChildHeader(run.query, run.dialect, run.context, revisionId));
  }
  return run.childHeaders.get(revisionId)!;
};

/** 第 3 步按损耗前 P 选阶梯行（普通行恒计入；共享实现，US-514 同源）；无命中按数量违约点名路径。 */
const selectNodeTierRows = (rows: readonly ExplosionRow[], node: ExplosionNode): ExplosionRow[] => {
  try {
    return selectTierRows(rows, node.plannedQty);
  } catch (error) {
    throw new BomQuantityError(error instanceof Error ? error.message : String(error), node.path);
  }
};

/**
 * 第 5 步的前提：声明了投料工序（operation_seq 或分摊行）的行，其头必须选了评估日可用的路线，
 * 且声明的工序号都在该路线的工序集内。头未选路线、路线未覆盖与工序缺失（事后改号 / 删除）同样拒绝整次计算，
 * 不按空工序链或剩余工序链静默少算工序损耗。
 */
const assertNodeRouting = (
  run: ExplosionRun,
  node: ExplosionNode,
  rows: readonly ExplosionRow[],
  headerRoutingId: string | null
): void => {
  const routed = rows.find(row => row.operationSeq !== null || run.routing.splitsByOccurrence.has(row.occurrenceId));
  if (routed === undefined) return;
  if (headerRoutingId === null) {
    throw new BomQuantityError(
      `路线未覆盖（头未选路线）：头 ${routed.headerId}、发生项 ${routed.occurrenceId} 声明了投料工序，工序损耗无从解析`,
      node.path
    );
  }
  const uncoveredReason = run.routing.routingUncovered.get(headerRoutingId);
  if (uncoveredReason !== undefined) {
    throw new BomQuantityError(
      `路线未覆盖（${uncoveredReason}）：路线 ${headerRoutingId}、发生项 ${routed.occurrenceId} 的投料工序在评估日不可用`,
      node.path
    );
  }
  // 路线没有工序时不在工序表里出现：空集让任何声明的工序都判缺失
  const missing = findMissingOperation(
    rows,
    occurrenceId => run.routing.splitsByOccurrence.get(occurrenceId) ?? [],
    run.routing.opsByRouting.get(headerRoutingId) ?? []
  );
  if (missing === null) return;
  throw new BomQuantityError(
    `路线未覆盖（工序 ${missing.operationSeq} 不在路线工序集内）：路线 ${headerRoutingId}、发生项 ${missing.row.occurrenceId} 的投料工序 ${missing.operationSeq} 无从解析`,
    node.path
  );
};

/** 第 3 步：行的组件毛需求（组 primary 与普通行共用；工序链与分摊只进第 5 步）。 */
const grossOf = (run: ExplosionRun, layer: NodeLayer, row: ExplosionRow): Decimal =>
  computeGross(row, {
    plannedPrime: layer.plannedPrime,
    headerBaseQty: row.headerBaseQty,
    formulaParams: run.options.params,
    routingOps: [],
    splits: []
  });

/**
 * 发射一条消耗行前的预算判定：复用 `expandBom` 的结算（取消 → 深度 → 返回路径数 → 展开数）。
 * 已生成的路径节点（需求行与穿透）即展开数，结果与下钻一样含根，同一预算下与展开在同一处截断。
 */
const budgetTruncation = (run: ExplosionRun, node: ExplosionNode): TruncationReason | null =>
  checkBudgets({ generated: run.expansions, withRoot: true }, node.depth, run.budget, run.options.signal);

/** 第 7 步的 phantom 判定：COALESCE(phantom_override, default_phantom)，两者皆空按非虚拟件。 */
const phantomOf = (row: ExplosionRow): Pick<ExplosionSteps['phantom'], 'value' | 'source'> => {
  if (row.phantomOverride !== null) return { value: row.phantomOverride, source: 'override' };
  if (row.childRevisionPhantom !== null) return { value: row.childRevisionPhantom, source: 'revision' };
  return { value: false, source: 'fallback' };
};

/** 第 7 步的第二跳：库存单位 → 子头基准单位，只用第一跳未消耗的率（见 {@link splitHopRates}）。 */
const toChildBase = (
  run: ExplosionRun,
  row: ExplosionRow,
  value: Decimal,
  childHeader: ResolvedChildHeader,
  hops: HopConversionRates
): string => {
  const childPlanned = convertUom(decimalToCanonical(value), row.childStockUom, childHeader.baseUom, hops.fromStock);
  recordConversion(
    run,
    row.childStockUom,
    childHeader.baseUom,
    appliedUomRate(row.childStockUom, childHeader.baseUom, hops.fromStock)
  );
  return childPlanned;
};

/** 子头作为下一层节点下钻（P 已归一到子头基准单位）。 */
const pushChildNode = (
  run: ExplosionRun,
  layer: NodeLayer,
  row: ExplosionRow,
  revisionId: string,
  childHeader: ResolvedChildHeader,
  childPlanned: string
): void => {
  layer.nextFrontier.push(
    run.nodes.push({
      path: [...layer.node.path, row.occurrenceId],
      depth: layer.node.depth + 1,
      headerId: childHeader.headerId,
      itemId: row.childItemId,
      revisionId,
      plannedQty: decimalFromCanonical(childPlanned),
      baseUom: childHeader.baseUom
    }) - 1
  );
};

/** 第 7 步（虚拟件）：不产需求行、不舍入，D 换算到子头基准单位作为 P 下钻；无已发布修订或头即拒绝。 */
const penetrate = async (
  run: ExplosionRun,
  layer: NodeLayer,
  row: ExplosionRow,
  values: ConsumeValues,
  source: 'override' | 'revision'
): Promise<void> => {
  if (row.resolvedChildRevisionId === null) {
    throw new BomQuantityError(`虚拟件 ${row.childItemId} 在评估日没有已发布修订，无法穿透`, [
      ...layer.node.path,
      row.occurrenceId
    ]);
  }
  const childHeader = await readChildHeader(run, row.resolvedChildRevisionId);
  if (childHeader === null) {
    throw new BomQuantityError(`虚拟件 ${row.childItemId} 在当前上下文下没有已发布 BOM 头`, [
      ...layer.node.path,
      row.occurrenceId
    ]);
  }
  const childPlanned = toChildBase(run, row, values.demand, childHeader, values.hops);
  run.penetrations.push({
    path: [...layer.node.path, row.occurrenceId],
    occurrenceId: row.occurrenceId,
    childItemId: row.childItemId,
    revisionId: row.resolvedChildRevisionId,
    source,
    converted: { value: decimalToCanonical(values.demand), uom: row.childStockUom },
    childPlanned: { value: childPlanned, uom: childHeader.baseUom }
  });
  pushChildNode(run, layer, row, row.resolvedChildRevisionId, childHeader, childPlanned);
};

/** 第 7 步（非虚拟件）：按库存单位小数位向上取整产出需求行；子件在上下文里有已发布头时取整值下传。 */
const emitRequirement = async (
  run: ExplosionRun,
  layer: NodeLayer,
  row: ExplosionRow,
  values: ConsumeValues,
  phantom: Pick<ExplosionSteps['phantom'], 'value' | 'source'>
): Promise<void> => {
  const { node, plannedPrime } = layer;
  const rounded = ceilToDecimalPlaces(values.demand, row.childUomDecimals);
  run.requirementLines.push({
    path: [...node.path, row.occurrenceId],
    itemId: row.childItemId,
    revisionId: row.resolvedChildRevisionId,
    qty: decimalToCanonical(rounded),
    uom: row.childStockUom,
    steps: {
      planned: { value: decimalToCanonical(node.plannedQty), uom: node.baseUom },
      assemblyScrapped: { value: decimalToCanonical(plannedPrime), uom: node.baseUom },
      gross: { value: decimalToCanonical(values.gross), uom: row.occurrenceUom },
      componentScrapped: { value: decimalToCanonical(values.layerNet.afterComponent), uom: row.occurrenceUom },
      operationScrapped:
        values.layerNet.hasOperation ?
          { value: decimalToCanonical(values.layerNet.net), uom: row.occurrenceUom }
        : null,
      converted: { value: decimalToCanonical(values.demand), uom: row.childStockUom },
      phantom: { ...phantom, revisionId: row.resolvedChildRevisionId }
    }
  });
  if (row.resolvedChildRevisionId === null) return;
  const childHeader = await readChildHeader(run, row.resolvedChildRevisionId);
  if (childHeader === null) return;
  const childPlanned = toChildBase(run, row, rounded, childHeader, values.hops);
  pushChildNode(run, layer, row, row.resolvedChildRevisionId, childHeader, childPlanned);
};

/**
 * 第 4~7 步：组件损耗 + 固定损耗 + 工序损耗链 / 分摊（共享实现，US-514 同源）→ 换算到子件库存单位
 * → 穿透或产出需求行。触顶返回截断原因（调用方终止整个展开），否则为 null。
 */
const emitConsumeLine = async (
  run: ExplosionRun,
  layer: NodeLayer,
  row: ExplosionRow,
  gross: Decimal
): Promise<TruncationReason | null> => {
  const truncation = budgetTruncation(run, layer.node);
  if (truncation !== null) return truncation;
  run.expansions += 1;
  run.occurrenceIds.push(row.occurrenceId);
  const layerNet = computeLayerNet(gross, row, {
    plannedPrime: layer.plannedPrime,
    headerBaseQty: row.headerBaseQty,
    formulaParams: run.options.params,
    routingOps: layer.routingOps,
    splits: run.routing.splitsByOccurrence.get(row.occurrenceId) ?? []
  });
  // 6. 单位换算（行 UoM → 子件库存 UoM）；第 7 步的库存 → 子头基准只用剩下未被消耗的率
  const hops = rowHopRates(row);
  const demand = decimalFromCanonical(
    convertUom(decimalToCanonical(layerNet.net), row.occurrenceUom, row.childStockUom, hops.toStock)
  );
  recordConversion(
    run,
    row.occurrenceUom,
    row.childStockUom,
    appliedUomRate(row.occurrenceUom, row.childStockUom, hops.toStock)
  );
  const values: ConsumeValues = { gross, layerNet, demand, hops };
  const phantom = phantomOf(row);
  if (phantom.value) await penetrate(run, layer, row, values, phantom.source === 'override' ? 'override' : 'revision');
  else await emitRequirement(run, layer, row, values, phantom);
  return null;
};

/** US-513：反向物料流（by_product / scrap_out / produce）只进产出量，不产需求行。 */
const collectOutputs = (run: ExplosionRun, layer: NodeLayer, rows: readonly ExplosionRow[]): void => {
  for (const row of rows) {
    if (row.flowDirection === 'consume') continue;
    const outputQuantity = computeOutputQuantity(
      row,
      row.flowDirection === 'produce' ? layer.node.plannedQty : layer.plannedPrime,
      row.headerBaseQty,
      run.options.params
    );
    run.outputs.push({
      path: [...layer.node.path, row.occurrenceId],
      itemId: row.childItemId,
      direction: row.flowDirection,
      qty: decimalToCanonical(outputQuantity),
      uom: row.occurrenceUom
    });
    run.occurrenceIds.push(row.occurrenceId);
  }
};

/** 不属替代组的 consume 行逐条发射。 */
const emitPlainRows = async (
  run: ExplosionRun,
  layer: NodeLayer,
  rows: readonly ExplosionRow[]
): Promise<TruncationReason | null> => {
  for (const row of rows) {
    if (row.substituteGroupId !== null || row.flowDirection !== 'consume') continue;
    const truncation = await emitConsumeLine(run, layer, row, grossOf(run, layer, row));
    if (truncation !== null) return truncation;
  }
  return null;
};

/** 替代组分流（AC#1/#2/#4/#8；共享纯函数，US-514 同源）：分摊违约按数量违约点名 primary 路径。 */
const allocateGroupShares = (
  run: ExplosionRun,
  layer: NodeLayer,
  members: readonly ExplosionRow[],
  primary: ExplosionRow
): ReturnType<typeof allocateSubstituteShares> => {
  const primaryGross = grossOf(run, layer, primary);
  try {
    return allocateSubstituteShares(
      members.map(substituteMemberOf),
      primaryGross,
      run.context.substituteAvailabilities,
      run.context.substituteSelections
    );
  } catch (error) {
    throw new BomQuantityError(error instanceof Error ? error.message : String(error), [
      ...layer.node.path,
      primary.occurrenceId
    ]);
  }
};

/** US-512 替代组：组内成员按 primary 毛需求整体分摊、不走各自行的 qty；manual 未给选择记 unresolved。 */
const emitSubstituteGroup = async (
  run: ExplosionRun,
  layer: NodeLayer,
  members: readonly ExplosionRow[]
): Promise<TruncationReason | null> => {
  const primary = substitutePrimaryOf(members);
  const allocated = allocateGroupShares(run, layer, members, primary);
  if (allocated.unresolved) {
    run.unresolvedGroups.push({
      groupId: allocated.unresolved.groupId,
      groupCode: allocated.unresolved.groupCode,
      candidates: allocated.unresolved.candidates
    });
    return null;
  }
  for (const { member, gross } of allocated.shares) {
    const source = members.find(candidate => candidate.occurrenceId === member.occurrenceId);
    if (!source) continue;
    const truncation = await emitConsumeLine(run, layer, source, gross);
    if (truncation !== null) return truncation;
  }
  return null;
};

const emitSubstituteGroups = async (
  run: ExplosionRun,
  layer: NodeLayer,
  rows: readonly ExplosionRow[]
): Promise<TruncationReason | null> => {
  const groups = new Map<string, ExplosionRow[]>();
  for (const row of rows) {
    if (row.substituteGroupId === null) continue;
    const list = groups.get(row.substituteGroupId) ?? [];
    list.push(row);
    groups.set(row.substituteGroupId, list);
  }
  for (const members of groups.values()) {
    const truncation = await emitSubstituteGroup(run, layer, members);
    if (truncation !== null) return truncation;
  }
  return null;
};

/** 一个节点的一层展开（第 2~7 步）：触顶返回截断原因（调用方终止整个展开），否则为 null。 */
const explodeNode = async (
  run: ExplosionRun,
  node: ExplosionNode,
  byHeader: Map<string, ExplosionRow[]>,
  nextFrontier: number[]
): Promise<TruncationReason | null> => {
  const rows = byHeader.get(node.headerId) ?? [];
  const headerRoutingId = rows[0]?.headerRoutingId ?? null;
  // 2. 装配损耗
  const plannedPrime = scrap(
    node.plannedQty,
    rows[0]?.headerAssemblyScrap ?? '0',
    rows[0]?.headerAssemblyScrapConvention ?? 'additive'
  );
  const effectiveRows = selectNodeTierRows(rows, node);
  assertNodeRouting(run, node, effectiveRows, headerRoutingId);
  // US-513：只有 consume 行进入七步需求链路；by_product / scrap_out 是反向物料流。
  // 「无投入」的头（有行但没有 consume 行）整次拒绝，不把空结果当成功。
  if (rows.length === 0 && byHeader.has(node.headerId)) return null;
  if (!effectiveRows.some(row => row.flowDirection === 'consume')) {
    throw new BomQuantityError('头没有 consume 行（无投入）：副产与废料行不能单独构成层级', node.path);
  }
  const layer: NodeLayer = {
    node,
    plannedPrime,
    routingOps: headerRoutingId === null ? [] : (run.routing.opsByRouting.get(headerRoutingId) ?? []),
    nextFrontier
  };
  collectOutputs(run, layer, effectiveRows);
  const truncation = await emitPlainRows(run, layer, effectiveRows);
  if (truncation !== null) return truncation;
  return emitSubstituteGroups(run, layer, effectiveRows);
};

/** BFS 逐层展开：每层一次批量取行；任一节点触顶即终止整个展开。 */
const explodeLevels = async (run: ExplosionRun): Promise<ExplosionResult['truncated']> => {
  let frontier = [0];
  while (frontier.length > 0) {
    if (run.options.signal?.aborted) return { reason: 'cancelled' };
    const headerIds = [...new Set(frontier.map(index => run.nodes[index].headerId))];
    const byHeader = await fetchHeaderRows(run.query, run.dialect, run.context, headerIds, run.domainUnresolved);
    const nextFrontier: number[] = [];
    for (const nodeIndex of frontier) {
      const reason = await explodeNode(run, run.nodes[nodeIndex], byHeader, nextFrontier);
      if (reason !== null) return { reason };
    }
    frontier = nextFrontier;
  }
  return null;
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
  const budget = { ...DEFAULT_EXPANSION_BUDGETS, ...options.budgets };
  const planned = normalizePlannedQuantity(options.plannedQty);

  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);
    // 1. 父修订与根头（与 resolveBom 同口径；多备选未裁决拒绝）
    const root = await resolveExplosionRoot(query, dialect, context, target);
    const run: ExplosionRun = {
      query,
      dialect,
      context,
      options,
      budget,
      routing: await loadRoutingData(query, dialect, context.asOfDate),
      childHeaders: new Map(),
      domainUnresolved: [],
      nodes: [],
      requirementLines: [],
      outputs: [],
      penetrations: [],
      unresolvedGroups: [],
      occurrenceIds: [],
      conversions: [],
      expansions: 0
    };
    // 2. 根节点：plannedQty 归一到根头基准单位，再 BFS 七步
    const rootPlanned = convertUom(planned.value, planned.uom, root.baseUom);
    recordConversion(run, options.plannedQty.uom, root.baseUom, null);
    run.nodes.push({
      path: [],
      depth: 0,
      headerId: root.headerId,
      itemId: root.parentItemId,
      revisionId: root.parentRevisionId,
      plannedQty: decimalFromCanonical(rootPlanned),
      baseUom: root.baseUom
    });
    const truncated = await explodeLevels(run);

    const manifest: ExplosionManifest = {
      context,
      parentItemId: root.parentItemId,
      parentRevisionId: root.parentRevisionId,
      headerIds: run.nodes.map(node => node.headerId),
      occurrenceIds: run.occurrenceIds,
      conversions: run.conversions,
      formulaParams: options.params,
      formulaGrammarVersion: FORMULA_GRAMMAR_VERSION,
      algorithmVersion: EXPLOSION_ALGORITHM_VERSION,
      unresolved: run.domainUnresolved
    };
    return {
      manifest,
      requirementLines: run.requirementLines,
      outputs: run.outputs,
      penetrations: run.penetrations,
      unresolved: run.unresolvedGroups,
      truncated
    };
  }, false);
};

// readChildBaseUom 已并入 resolveChildHeader（头查询自带 baseUom 列）
