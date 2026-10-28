import { DEFAULT_EXPANSION_BUDGETS } from '../resolve/expansion-api.js';
import type { CostRollupBudgets } from './cost.js';

/** 成本明细默认预算，与数量展开保持同一安全量级。 */
export const DEFAULT_COST_ROLLUP_BUDGETS: Readonly<Required<CostRollupBudgets>> = {
  depth: DEFAULT_EXPANSION_BUDGETS.depth,
  nodes: DEFAULT_EXPANSION_BUDGETS.paths
};
