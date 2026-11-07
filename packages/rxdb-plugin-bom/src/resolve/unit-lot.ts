/**
 * @fileoverview 序列 / 批次有效性（US-518）的纯函数判定面
 *
 * 有效域 = 日期 × 序列 × 批次三维的积，三维**同时**满足才入选：
 * - 日期：`[effectiveFrom, effectiveTo)` 半开，`effectiveTo` 为 NULL 表示无上界（同 US-508）；
 * - 序列：整数闭区间 `[unitFrom, unitTo]`；`unitFrom` NULL 表示从 1 起、`unitTo` NULL 表示无上界；
 * - 批次：批次号精确匹配的集合；NULL 即对全部批次有效。
 *
 * 重叠约束是有效域交集：同一逻辑行的两个发生项只有三维同时相交才算重叠（AC#5），
 * 任一维不相交即可并存（AC#7/#8/#9/#10）。本模块是解析侧（{@link ResolutionContext} 的
 * `unit` / `lot`）与存储侧三维触发器（`backend/unit-lot-trigger-ddl.ts`）共用的判定口径，
 * 与 US-508 的区间重叠判定同源，不写两份。
 */

import { BomResolutionError } from './resolution.js';

/**
 * 有效域（US-518）：日期 × 序列 × 批次三维的积。
 *
 * @remarks
 * `lotCodes` 是已解析的批次集合（存储列是 JSON 数组文本，解析见 {@link parseLotCodes}）；
 * 序列与批次的 NULL 语义见文件头。
 */
export interface EffectiveDomain {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  unitFrom: number | null;
  unitTo: number | null;
  lotCodes: string[] | null;
}

/** 序列区间的紧凑中文文本（候选清单用）：NULL 侧按边界语义折叠。 */
const unitIntervalText = (candidate: { unitFrom: number | null; unitTo: number | null }): string => {
  if (candidate.unitFrom === null && candidate.unitTo === null) return '全部序列';
  if (candidate.unitFrom === null) return `unit ≤ ${candidate.unitTo}`;
  if (candidate.unitTo === null) return `unit ≥ ${candidate.unitFrom}`;
  return `unit ∈ [${candidate.unitFrom}, ${candidate.unitTo}]`;
};

/** 日期区间文本：`[from, to)`，无上界记 `+∞`（ISO 日期串，与存储形态一致）。 */
const dateText = (domain: EffectiveDomain): string =>
  `[${domain.effectiveFrom.toISOString().slice(0, 10)}, ${domain.effectiveTo === null ? '+∞' : domain.effectiveTo.toISOString().slice(0, 10)})`;

/** 序列区间文本：闭区间，NULL 侧按 1 / `+∞` 展开。 */
const unitText = (domain: EffectiveDomain): string => `[${domain.unitFrom ?? 1}, ${domain.unitTo ?? '+∞'}]`;

/** 批次集合文本：NULL = 全部批次。 */
const lotText = (domain: EffectiveDomain): string =>
  domain.lotCodes === null ? '全部' : `{${domain.lotCodes.join(',')}}`;

/**
 * 解析批次集合存储文本（JSON 字符串数组）。
 *
 * @param raw - 存储列原文；NULL = 全部批次
 * @returns 批次集合；NULL 原样返回
 * @throws {@link BomResolutionError} 坏 JSON 或非字符串数组
 */
export const parseLotCodes = (raw: string | null): string[] | null => {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BomResolutionError('lotCodes', `批次集合不是合法 JSON 数组：${raw}`);
  }
  if (!Array.isArray(parsed) || parsed.some(code => typeof code !== 'string')) {
    throw new BomResolutionError('lotCodes', `批次集合必须是字符串数组：${raw}`);
  }
  return parsed as string[];
};

/**
 * 序列号是否落在闭区间 `[unitFrom, unitTo]` 内（NULL 侧无界）。
 *
 * @param unitFrom - 区间下界；NULL = 从 1 起
 * @param unitTo - 区间上界；NULL = 无上界
 * @param unit - 查询序列号；未给 = 不按序列过滤（恒真，交给候选判定）
 * @returns unit 未给恒 true；否则按闭区间判定
 */
export const unitIntervalMatches = (
  unitFrom: number | null,
  unitTo: number | null,
  unit: number | undefined
): boolean => {
  if (unit === undefined) return true;
  if (unit < (unitFrom ?? 1)) return false;
  if (unitTo !== null && unit > unitTo) return false;
  return true;
};

/**
 * 批次号是否命中批次集合（精确匹配）。
 *
 * @param lotCodes - 批次集合；NULL = 全部批次
 * @param lot - 查询批次；未给 = 全部批次（恒真）
 */
export const lotMatches = (lotCodes: string[] | null, lot: string | undefined): boolean => {
  if (lotCodes?.length === 0) return false;
  if (lot === undefined) return true;
  if (lotCodes === null) return true;
  return lotCodes.includes(lot);
};

/**
 * 两个序列闭区间是否相交（NULL 侧视作 1 / 无上界）。
 *
 * @remarks
 * 闭区间相交：`aFrom ≤ bTo 且 bFrom ≤ aTo`；#136 / #137 恰好相邻不相交（AC#1）。
 */
export const unitIntervalOverlaps = (a: [number | null, number | null], b: [number | null, number | null]): boolean => {
  const aFrom = a[0] ?? 1;
  const aTo = a[1] ?? Infinity;
  const bFrom = b[0] ?? 1;
  const bTo = b[1] ?? Infinity;
  return aFrom <= bTo && bFrom <= aTo;
};

/**
 * 两个批次集合是否相交（NULL = 全部批次，与任何集合相交）。
 */
export const lotSetsOverlap = (a: string[] | null, b: string[] | null): boolean => {
  if (a?.length === 0 || b?.length === 0) return false;
  if (a === null || b === null) return true;
  return a.some(code => b.includes(code));
};

/**
 * 两个有效域是否重叠（三维**同时**相交才算重叠，AC#5）。
 *
 * @remarks
 * 日期按半开 `[from, to)` 比较（ISO 文本语义），序列按闭区间、批次按集合相交。
 * `detail` 恒给出三维的两侧区间描述（相交与否都如实描述两侧），供错误消息与
 * 触发器消息拼装：`日期 [A) ∩ [B)、序列 [A] ∩ [B]、批次 {A} ∩ 全部` 形态。
 */
export const effectiveDomainsOverlap = (
  a: EffectiveDomain,
  b: EffectiveDomain
): { overlap: boolean; detail: string } => {
  const aTo = a.effectiveTo?.getTime() ?? Infinity;
  const bTo = b.effectiveTo?.getTime() ?? Infinity;
  const dateOverlap = a.effectiveFrom.getTime() < bTo && b.effectiveFrom.getTime() < aTo;
  const unitOverlap = unitIntervalOverlaps([a.unitFrom, a.unitTo], [b.unitFrom, b.unitTo]);
  const lotOverlap = lotSetsOverlap(a.lotCodes, b.lotCodes);
  return {
    overlap: dateOverlap && unitOverlap && lotOverlap,
    detail: `日期 ${dateText(a)} ∩ ${dateText(b)}、序列 ${unitText(a)} ∩ ${unitText(b)}、批次 ${lotText(a)} ∩ ${lotText(b)}`
  };
};

/**
 * 候选清单文本（AC#6 的 `unresolved` 列候选用）：「#1 候选：unit ≤ 136」形态，
 * 每条候选按自己的序列区间折叠描述。
 */
export const describeCandidates = (candidates: { unitFrom: number | null; unitTo: number | null }[]): string =>
  candidates.map((candidate, index) => `#${index + 1} 候选：${unitIntervalText(candidate)}`).join('；');

/**
 * 按序列号选出命中的候选下标（AC#6 判定）：`unit` 给定时返回命中的候选下标；
 * 未给时返回**全部**候选下标——消费方按「多于一个候选」标 `unresolved` 并列候选，
 * 需要完整结构的消费方（MRP 导出 / 成本卷算）一律拒绝，不得擅自挑。
 */
export const selectCandidatesByUnit = (
  candidates: { unitFrom: number | null; unitTo: number | null }[],
  unit: number | undefined
): number[] =>
  candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => unitIntervalMatches(candidate.unitFrom, candidate.unitTo, unit))
    .map(({ index }) => index);
