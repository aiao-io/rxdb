/**
 * @fileoverview 本层数量计算（US-511 第 3~5 步的共享实现，US-514 复用）
 *
 * `explodeBom` 与成本卷算共享同一份「本层局部需求」计算：第 3 步毛需求（qty /
 * qty_formula × P′ ÷ base_qty，定量行例外）、第 4 步组件损耗 + 固定损耗、第 5 步
 * 工序损耗链（投料工序含至末工序逐道累乘）与投料分摊（每份额从各自工序起算再求和）。
 * 卷算不重新实现数量逻辑——两处漂移的代价是成本与数量对不上账（US-514 技术笔记）。
 */

import {
  decimalAdd,
  decimalCmp,
  decimalDiv,
  decimalFromCanonical,
  decimalMul,
  decimalSub,
  decimalToCanonical,
  type Decimal
} from './decimal.js';
import { evaluateFormula } from './formula.js';

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
  qty: string | null;
  qtyFormula: string | null;
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

/** 第 3 步：行的组件毛需求 G（定量行即 qty；否则 qty × P′ ÷ base_qty；公式行先求值）。 */
export const computeGross = (row: LayerRow, context: LayerContext): Decimal => {
  const quantity =
    row.qty !== null ?
      decimalFromCanonical(row.qty)
    : decimalFromCanonical(evaluateFormula(row.qtyFormula as string, context.formulaParams ?? {}));
  return row.isFixedQty ? quantity : (
      decimalMul(quantity, decimalDiv(plannedPrime(context), decimalFromCanonical(context.headerBaseQty)))
    );
};

const plannedPrime = (context: LayerContext): Decimal => context.plannedPrime;

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

/** 分流后每个成员的「本层份额毛需求」（equiv_qty 已乘）。 */
export interface SubstituteShare {
  member: SubstituteMember;
  gross: Decimal;
}

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
  if (strategy === 'proportional') {
    return {
      shares: members.map(member => ({
        member,
        gross:
          member.substituteRole === 'primary' ?
            decimalMul(primaryGross, decimalFromCanonical(member.usageProbability ?? '0'))
          : decimalMul(
              decimalMul(primaryGross, decimalFromCanonical(member.usageProbability ?? '0')),
              decimalFromCanonical(member.equivQty ?? '1')
            )
      }))
    };
  }
  if (strategy === 'priority') {
    const substitutes = members
      .filter(member => member.substituteRole !== 'primary')
      .sort((a, b) => (b.substitutePriority ?? 0) - (a.substitutePriority ?? 0));
    let remaining = primaryGross;
    const shares: SubstituteShare[] = [];
    for (const member of substitutes) {
      const equiv = decimalFromCanonical(member.equivQty ?? '1');
      const needed = decimalMul(remaining, equiv);
      const availability = availabilities?.[member.childItemId];
      if (availability !== undefined && decimalCmp(needed, decimalFromCanonical(availability.value)) > 0) {
        if (!allowMix) {
          throw new Error(
            `priority 组 ${code} 最高者可用量不足（需 ${decimalToCanonical(needed)} ${member.occurrenceUom}，上限 ${availability.value} ${availability.uom}）`
          );
        }
        const taken = decimalDiv(decimalFromCanonical(availability.value), equiv);
        shares.push({ member, gross: taken });
        remaining = decimalSub(remaining, taken);
        continue;
      }
      shares.push({ member, gross: remaining });
      break;
    }
    return { shares };
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
    return {
      shares: [
        {
          member,
          gross:
            member.substituteRole === 'primary' ?
              primaryGross
            : decimalMul(primaryGross, decimalFromCanonical(member.equivQty ?? '1'))
        }
      ]
    };
  }
  const allocatedMembers = Object.entries(selection.allocation ?? {}).filter(([, value]) => value !== '0');
  if (!allowMix && allocatedMembers.length > 1) {
    throw new Error(`manual 组 ${code}（allow_mix=false）的分配涉及 ${allocatedMembers.length} 个成员，须唯一选择`);
  }
  return {
    shares: members.map(member => {
      const shareValue = selection.allocation?.[member.childItemId] ?? '0';
      const share = decimalMul(primaryGross, decimalFromCanonical(shareValue));
      return {
        member,
        gross:
          member.substituteRole === 'primary' ? share : decimalMul(share, decimalFromCanonical(member.equivQty ?? '1'))
      };
    })
  };
};

/**
 * 反向物料流的产出量（US-513）：qty × P′ ÷ base_qty（定量按批），
 * 与爆炸引擎的输出列表同口径；副产抵减的 `out(b, L)` 同源。
 */
export const computeOutputQuantity = (
  qty: string | null,
  isFixedQty: boolean,
  plannedPrime: Decimal,
  headerBaseQty: string
): Decimal =>
  isFixedQty ?
    decimalFromCanonical(qty ?? '0')
  : decimalMul(decimalFromCanonical(qty ?? '0'), decimalDiv(plannedPrime, decimalFromCanonical(headerBaseQty)));
