/**
 * @fileoverview 本层数量计算（US-511 第 3~5 步的共享实现，US-514 复用）
 *
 * `explodeBom` 与成本卷算共享同一份「本层局部需求」计算：第 3 步毛需求（qty /
 * qty_formula × P′ ÷ base_qty，定量行例外）、第 4 步组件损耗 + 固定损耗、第 5 步
 * 工序损耗链（投料工序含至末工序逐道累乘）与投料分摊（每份额从各自工序起算再求和）。
 * 卷算不重新实现数量逻辑——两处漂移的代价是成本与数量对不上账（US-514 技术笔记）。
 */

import { normalizeDecimalString } from '../decimal.utils.js';
import { BomQuantityError } from '../types.js';
import {
  decimalAdd,
  decimalCmp,
  decimalDiv,
  decimalFromCanonical,
  decimalIsZero,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';
import { evaluateFormula, FORMULA_GRAMMAR_VERSION } from './formula.js';

/** 损耗：加成制 x×(1+s)；良率制 x÷(1−s)（与爆炸引擎同定义，本模块持有避免循环依赖）。 */
export const scrap = (value: Decimal, rate: string, convention: 'additive' | 'yield'): Decimal => {
  const s = decimalFromCanonical(rate);
  if (decimalCmp(s, { coeff: 0n, exp: 0 }) === 0) return value;
  return convention === 'additive' ?
      decimalMul(value, decimalAdd({ coeff: 1n, exp: 0 }, s))
    : decimalDiv(value, decimalSub({ coeff: 1n, exp: 0 }, s));
};

/** 一道工序的损耗参数（与爆炸引擎的工序链同形状）。 */
export interface LayerRoutingOp {
  operationSeq: number;
  operationScrap: string;
  scrapConvention: 'additive' | 'yield';
}

/** 一行发生项参与本层计算的字段子集。 */
export interface LayerRow {
  occurrenceId: string;
  qty: string | null;
  qtyFormula: string | null;
  /** 公式行持久化的语法版本（qty 行为 null）。 */
  formulaGrammarVersion: string | null;
  isFixedQty: boolean;
  componentScrap: string;
  componentScrapConvention: 'additive' | 'yield';
  componentScrapFixed: string;
  operationSeq: number | null;
}

/** 本层计算的上下文（P′、头基准量、公式参数、头路由工序链与该行的分摊）。 */
export interface LayerContext {
  plannedPrime: Decimal;
  headerBaseQty: string;
  formulaParams?: Record<string, string>;
  routingOps: LayerRoutingOp[];
  splits: { operationSeq: number; ratio: string }[];
}

/** 行的基础用量 q 所需字段（消耗行与反向物料流行共用）。 */
type QuantityRow = Pick<LayerRow, 'occurrenceId' | 'qty' | 'qtyFormula' | 'formulaGrammarVersion' | 'isFixedQty'>;

/**
 * 行的基础用量 q：qty，或按持久化语法版本求值的 qty_formula（存储层保证二者恰好一项）。
 * 公式只认当前语法版本（formula.ts 头注：语法升级不改旧公式的含义）：导入通道写入的未知版本、
 * 语法升级前的旧版本都在求值前拒绝，不按当前语法静默解释。
 */
const rowQuantity = (row: QuantityRow, formulaParams: Record<string, string> | undefined): Decimal => {
  if (row.qty !== null) return decimalFromCanonical(row.qty);
  if (row.formulaGrammarVersion !== FORMULA_GRAMMAR_VERSION) {
    throw new BomQuantityError(
      `发生项 ${row.occurrenceId} 的公式语法版本「${row.formulaGrammarVersion}」不受支持（当前版本 ${FORMULA_GRAMMAR_VERSION}）`
    );
  }
  return decimalFromCanonical(evaluateFormula(row.qtyFormula as string, formulaParams ?? {}));
};

/**
 * q 按批缩放：定量行即 q；否则 q × 计划量 ÷ base_qty。base_qty 为 0 是写入期合法的规范串，
 * 但无从按批缩放：按数量违约拒绝，不让 kernel 的除零错误裸抛。
 */
const scaledQuantity = (row: QuantityRow, quantity: Decimal, planned: Decimal, headerBaseQty: string): Decimal => {
  if (row.isFixedQty) return quantity;
  const baseQty = decimalFromCanonical(headerBaseQty);
  if (decimalIsZero(baseQty)) {
    throw new BomQuantityError(`发生项 ${row.occurrenceId} 所在头的基准量 base_qty 为 0，无法按批缩放`);
  }
  return decimalMul(quantity, decimalDiv(planned, baseQty));
};

/** 第 3 步：行的组件毛需求 G（定量行即 qty；否则 qty × P′ ÷ base_qty；公式行先核对语法版本再求值）。 */
export const computeGross = (row: LayerRow, context: LayerContext): Decimal =>
  scaledQuantity(row, rowQuantity(row, context.formulaParams), context.plannedPrime, context.headerBaseQty);

/** 从给定工序（含）至末工序逐道累乘损耗（US-511 第 5 步方向，与爆炸引擎同定义）。 */
export const operationScrapChain = (value: Decimal, ops: LayerRoutingOp[], fromSeq: number): Decimal => {
  let result = value;
  for (const operation of ops) {
    if (operation.operationSeq < fromSeq) continue;
    result = scrap(result, operation.operationScrap, operation.scrapConvention);
  }
  return result;
};

/** 本层净需求（第 4~5 步）：G → G′（组件损耗 + 固定损耗）→ G″（工序损耗链 / 分摊）。 */
export interface LayerNetResult {
  net: Decimal;
  hasOperation: boolean;
}

export const computeLayerNet = (gross: Decimal, row: LayerRow, context: LayerContext): LayerNetResult => {
  // 4. 组件损耗 + 固定损耗（固定损耗按行 UoM 计，不再被良率放大）
  const afterComponent = decimalAdd(
    scrap(gross, row.componentScrap, row.componentScrapConvention),
    decimalFromCanonical(row.componentScrapFixed)
  );
  // 5. 工序损耗：从投料工序（含）至末工序逐道累乘；有分摊行时每份额从自己的工序起算再求和
  const { splits, routingOps } = context;
  if (row.operationSeq !== null || splits.length > 0) {
    if (splits.length > 0) {
      let total = { coeff: 0n, exp: 0 } as Decimal;
      for (const split of splits) {
        const share = decimalMul(afterComponent, decimalFromCanonical(split.ratio));
        total = decimalAdd(total, operationScrapChain(share, routingOps, split.operationSeq));
      }
      return { net: total, hasOperation: true };
    }
    return { net: operationScrapChain(afterComponent, routingOps, row.operationSeq as number), hasOperation: true };
  }
  return { net: afterComponent, hasOperation: false };
};

// -----------------------------------------------------[ 阶梯 / 替代组 / 副产（共享扩展） ]

/** 阶梯行的批次段（与爆炸引擎的选行判据同源）。 */
export interface TierRow {
  tierGroupNo: string | null;
  lotsizeFrom: string | null;
  lotsizeTo: string | null;
}

/**
 * 阶梯组选择（US-511 第 3 步前的按损耗前 P 选行）：每组恰好一条命中行，
 * 无命中即违约（与爆炸引擎同语义）；普通行（tierGroupNo 为 NULL）原样返回。
 */
export const selectTierRows = <T extends TierRow>(rows: readonly T[], plannedQty: Decimal): T[] => {
  const tiered = rows.filter(row => row.tierGroupNo !== null);
  const plain = rows.filter(row => row.tierGroupNo === null);
  const groups = new Map<string, T[]>();
  for (const row of tiered) {
    const list = groups.get(row.tierGroupNo as string);
    if (list) list.push(row);
    else groups.set(row.tierGroupNo as string, [row]);
  }
  const selected: T[] = [...plain];
  for (const [groupNo, groupRows] of groups) {
    const hit = groupRows.find(row => {
      if (row.lotsizeFrom !== null && decimalCmp(plannedQty, decimalFromCanonical(row.lotsizeFrom)) < 0) return false;
      if (row.lotsizeTo !== null && decimalCmp(plannedQty, decimalFromCanonical(row.lotsizeTo)) >= 0) return false;
      return true;
    });
    if (!hit) {
      throw new Error(`阶梯组 ${groupNo} 在计划量 ${decimalToCanonical(plannedQty)} 上没有命中行`);
    }
    selected.push(hit);
  }
  return selected;
};

/** 替代组成员参与分流的字段子集。 */
export interface SubstituteMember {
  childItemId: string;
  occurrenceId: string;
  substituteRole: 'primary' | 'substitute' | null;
  substitutePriority: number | null;
  usageProbability: string | null;
  equivQty: string | null;
  substituteGroupCode: string;
  substituteStrategy: 'priority' | 'proportional' | 'manual';
  substituteAllowMix: boolean;
  occurrenceUom: string;
}

/** manual 组未给出选择的候选（调用方裁决，与爆炸引擎同口径）。 */
export interface UnresolvedGroup {
  groupCode: string;
  candidates: { itemId: string; role: 'primary' | 'substitute'; occurrenceId: string }[];
}

/** 分流后每个成员的「本层份额毛需求」（equiv_qty 已乘，成员发生项单位）。 */
export interface SubstituteShare {
  member: SubstituteMember;
  gross: Decimal;
}

const ZERO: Decimal = { coeff: 0n, exp: 0 };

const ONE: Decimal = { coeff: 1n, exp: 0 };

/** 精确求和（不收敛到 34 位）：判「合计恰为 1」时 34 位舍入会把 0.(35 个 9) 误收成 1。 */
const exactSum = (values: readonly Decimal[]): Decimal =>
  values.reduce((sum, value) => {
    const exp = Math.min(sum.exp, value.exp);
    return { coeff: sum.coeff * 10n ** BigInt(sum.exp - exp) + value.coeff * 10n ** BigInt(value.exp - exp), exp };
  }, ZERO);

/**
 * manual 分配校验（与 US-512 AC#5「拒绝而不归一化」同一裁决）：键必须是组成员物料 id，份额走入口十进制
 * 规范化（拒负值与非法串），合计按定点精确等于 1；空分配、全 0 同样拒绝，不让 primary 需求静默消失。
 *
 * @returns 规范化后的分配（成员物料 id → 规范十进制串）
 */
const checkedAllocation = (
  code: string,
  members: readonly SubstituteMember[],
  allocation: Record<string, string>
): Record<string, string> => {
  const memberIds = new Set(members.map(member => member.childItemId));
  const strangers = Object.keys(allocation).filter(key => !memberIds.has(key));
  if (strangers.length > 0) {
    throw new Error(`manual 组 ${code} 的分配含非组成员：${strangers.join('、')}`);
  }
  const normalized = Object.fromEntries(
    Object.entries(allocation).map(([key, value]) => [
      key,
      normalizeDecimalString(value, `manual 组 ${code} 的分配 ${key}`)
    ])
  );
  const total = exactSum(Object.values(normalized).map(value => decimalFromCanonical(value)));
  if (decimalCmp(total, ONE) !== 0) {
    throw new Error(`manual 组 ${code} 的分配合计必须精确为 1（不归一化），实际 ${decimalToCanonical(total)}`);
  }
  return normalized;
};

/** 成员承担的份额毛需求（成员单位）：primary 即 primary 需求份额，替代成员再乘 equiv_qty。 */
const memberGross = (member: SubstituteMember, primaryShare: Decimal): Decimal =>
  member.substituteRole === 'primary' ?
    primaryShare
  : decimalMul(primaryShare, decimalFromCanonical(member.equivQty ?? '1'));

/**
 * 按比例分摊 primary 需求（proportional 的概率 / manual 的分配）：比例缺失或为 0 的成员不承担需求，
 * 不产出份额——不留 qty=0 的需求行占路径预算，卷算也不因未消耗成员缺成本数据而拒绝。
 */
const ratioShares = (
  members: readonly SubstituteMember[],
  primaryGross: Decimal,
  ratioOf: (member: SubstituteMember) => string | null | undefined
): SubstituteShare[] =>
  members.flatMap(member => {
    const ratio = ratioOf(member);
    if (ratio === null || ratio === undefined) return [];
    const value = decimalFromCanonical(ratio);
    if (decimalCmp(value, ZERO) <= 0) return [];
    return [{ member, gross: memberGross(member, decimalMul(primaryGross, value)) }];
  });

/**
 * 成员的可用量上限（成员发生项单位）：值走入口十进制规范化（非法串 / 负值拒绝，与 manual 份额同口径）；
 * 单位不同即拒绝——裸数值跨单位比较没有意义。
 */
const memberCapacity = (
  code: string,
  member: SubstituteMember,
  availabilities: Record<string, { value: string; uom: string }> | undefined
): Decimal | null => {
  const availability = availabilities?.[member.childItemId];
  if (availability === undefined) return null;
  if (availability.uom !== member.occurrenceUom) {
    throw new Error(
      `priority 组 ${code} 成员 ${member.childItemId} 的可用量单位 ${availability.uom} 与发生项单位 ${member.occurrenceUom} 不同`
    );
  }
  return decimalFromCanonical(
    normalizeDecimalString(availability.value, `priority 组 ${code} 成员 ${member.childItemId} 的可用量`)
  );
};

/**
 * priority 分流（US-512 技术笔记的策略表）：替代成员按 `substitute_priority` 降序择优，
 * 每个成员承担「剩余 primary 需求 × equiv_qty」（成员单位）；超出可用量上限时 allow_mix=false 拒绝、
 * allow_mix=true 取满上限并把剩余（换回 primary 单位）交给下一位。全部成员耗尽仍有剩余即拒绝，
 * 不让需求静默蒸发；零份额成员不产出份额。
 */
const allocatePriorityShares = (
  primary: SubstituteMember,
  members: readonly SubstituteMember[],
  primaryGross: Decimal,
  availabilities: Record<string, { value: string; uom: string }> | undefined
): SubstituteShare[] => {
  const code = primary.substituteGroupCode;
  const substitutes = members
    .filter(member => member.substituteRole !== 'primary')
    .sort((a, b) => (b.substitutePriority ?? 0) - (a.substitutePriority ?? 0));
  let remaining = primaryGross;
  const shares: SubstituteShare[] = [];
  for (const member of substitutes) {
    const equiv = decimalFromCanonical(member.equivQty ?? '1');
    const needed = decimalMul(remaining, equiv);
    const capacity = memberCapacity(code, member, availabilities);
    if (capacity === null || decimalCmp(needed, capacity) <= 0) {
      shares.push({ member, gross: needed });
      return shares;
    }
    if (!primary.substituteAllowMix) {
      throw new Error(
        `priority 组 ${code} 最高者可用量不足（需 ${decimalToCanonical(needed)} ${member.occurrenceUom}，上限 ${decimalToCanonical(capacity)} ${member.occurrenceUom}）`
      );
    }
    if (decimalCmp(capacity, ZERO) > 0) shares.push({ member, gross: capacity });
    remaining = decimalSub(remaining, decimalDiv(capacity, equiv));
    if (decimalCmp(remaining, ZERO) <= 0) return shares;
  }
  if (decimalCmp(remaining, ZERO) > 0) {
    throw new Error(
      `priority 组 ${code} 的替代成员可用量耗尽，仍短缺 ${decimalToCanonical(remaining)} ${primary.occurrenceUom}（primary 需求单位）`
    );
  }
  return shares;
};

/**
 * 替代组分流（US-512，与爆炸引擎同语义的纯函数）：proportional 按概率分摊、
 * priority 按序择优（可用量上限与 allow_mix 约束）、manual 按选择/分配；
 * 未给选择的 manual 组标 unresolved（返回 `unresolved`，不抛错）。
 */
export const allocateSubstituteShares = (
  members: readonly SubstituteMember[],
  primaryGross: Decimal,
  availabilities: Record<string, { value: string; uom: string }> | undefined,
  selections: Record<string, { memberKey?: string; allocation?: Record<string, string> }> | undefined
): { shares: SubstituteShare[]; unresolved?: UnresolvedGroup } => {
  const primary = members.find(member => member.substituteRole === 'primary');
  if (!primary) return { shares: [] }; // 发布转移已校验恰好一个 primary
  const code = primary.substituteGroupCode;
  const strategy = primary.substituteStrategy;
  const allowMix = primary.substituteAllowMix;
  if (strategy === 'priority') {
    return { shares: allocatePriorityShares(primary, members, primaryGross, availabilities) };
  }
  if (strategy === 'proportional') {
    return { shares: ratioShares(members, primaryGross, member => member.usageProbability) };
  }
  const selection = selections?.[code];
  if (selection === undefined) {
    return {
      shares: [],
      unresolved: {
        groupCode: code,
        candidates: members.map(member => ({
          itemId: member.childItemId,
          role: member.substituteRole ?? 'substitute',
          occurrenceId: member.occurrenceId
        }))
      }
    };
  }
  if (selection.memberKey !== undefined) {
    const member = members.find(candidate => candidate.childItemId === selection.memberKey);
    if (!member) {
      throw new Error(`manual 组 ${code} 的选择 ${selection.memberKey} 不是组成员`);
    }
    return { shares: [{ member, gross: memberGross(member, primaryGross) }] };
  }
  // 既无唯一选择也无分配 = 空分配：与全 0 一样按合计 0 拒绝
  const allocation = checkedAllocation(code, members, selection.allocation ?? {});
  const allocatedMembers = Object.values(allocation).filter(value => value !== '0');
  if (!allowMix && allocatedMembers.length > 1) {
    throw new Error(`manual 组 ${code}（allow_mix=false）的分配涉及 ${allocatedMembers.length} 个成员，须唯一选择`);
  }
  return { shares: ratioShares(members, primaryGross, member => allocation[member.childItemId]) };
};

/**
 * 反向物料流的产出量（US-513）：q × 计划量 ÷ base_qty（定量按批），与爆炸引擎的输出列表同口径；
 * 副产抵减的 `out(b, L)` 同源。by_product / scrap_out 行可以是公式行（存储层只保证 qty 与 qty_formula
 * 恰好一项），与消耗行同一套求值与语法版本断言，不以 0 兜底。
 *
 * @param row - 产出行（qty 或 qty_formula + 语法版本、定量标记）
 * @param planned - 计划量（produce 取损耗前 P，by_product / scrap_out 取 P′）
 * @param headerBaseQty - 头基准量
 * @param formulaParams - 公式参数
 */
export const computeOutputQuantity = (
  row: QuantityRow,
  planned: Decimal,
  headerBaseQty: string,
  formulaParams: Record<string, string> | undefined
): Decimal => scaledQuantity(row, rowQuantity(row, formulaParams), planned, headerBaseQty);
