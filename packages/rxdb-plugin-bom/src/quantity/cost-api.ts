import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import type { ResolveTarget } from '../resolve/resolver.js';
import type { CostRollupContext, CostRollupOptions, CostRollupResult } from './cost.js';

/** 按需加载成本引擎，保持原单快照卷算、缺失与错误合同。 */
export const rollupCost = async (
  adapter: BomLocalAdapter,
  context: CostRollupContext,
  target: ResolveTarget,
  batchQty?: { value: string; uom: string },
  options?: CostRollupOptions
): Promise<CostRollupResult> => (await import('./cost.js')).rollupCost(adapter, context, target, batchQty, options);
