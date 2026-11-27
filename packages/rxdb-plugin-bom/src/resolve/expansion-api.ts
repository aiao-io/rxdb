import { BomTruncationError } from '../types.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import type { ExpansionBudgets, ExpansionOptions, ExpansionResult, WhereUsedTarget } from './expansion.js';
import { BomResolutionError, type ResolutionContext, type ResolutionResult } from './resolution.js';
import type { ResolveTarget } from './resolver.js';

export type {
  ExpansionBudgets,
  ExpansionNode,
  ExpansionOptions,
  ExpansionResult,
  WhereUsedTarget
} from './expansion.js';

/** 预算默认值：深度 128（与判环硬上限同阶），展开数与路径数沿用 graph 插件的 100,000 先例（ECN 影响面同口径）。 */
export const DEFAULT_EXPANSION_BUDGETS: Readonly<Required<ExpansionBudgets>> = {
  depth: 128,
  expansions: 100_000,
  paths: 100_000
};

/**
 * 完整性守卫（US-510 AC#11）：截断结果与未裁决备选不是完整结果，
 * 数量 / 成本 / 导出等消费方必须先过此守卫，不得把部分结果当完整结构。
 *
 * @param result - 解析或展开 / 反查结果
 */
export const assertCompleteResolution = (result: ResolutionResult | ExpansionResult): void => {
  if ('truncated' in result && result.truncated !== null) {
    throw new BomTruncationError(result.truncated.reason);
  }
  const unresolved = 'manifest' in result ? result.manifest.unresolved : (result.unresolved ?? []);
  if (unresolved.length > 0) {
    const reason = unresolved.find(entry => entry.reason !== undefined)?.reason;
    if (reason !== undefined) throw new BomResolutionError(reason, `存在未解析的序列 / 批次候选：请先指定 ${reason}`);
    throw new BomResolutionError(
      'alternativeNo',
      '存在未裁决的备选：根头先指定 alternativeNo（只裁决根头），子装配多备选先消除歧义，再交给数量 / 成本 / 导出消费方'
    );
  }
};

/** 按需加载下钻引擎，保持显式上下文、单快照与预算合同。 */
export const expandBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options?: ExpansionOptions
): Promise<ExpansionResult> => (await import('./expansion.js')).expandBom(adapter, context, target, options);

/** 按需加载反查引擎，保留每条使用方路径及截断标记。 */
export const whereUsed = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: WhereUsedTarget,
  options?: ExpansionOptions
): Promise<ExpansionResult> => (await import('./expansion.js')).whereUsed(adapter, context, target, options);
