import { expect, it } from 'vitest';
import { BomMapError, DEFAULT_COST_ROLLUP_BUDGETS, assertCompleteResolution } from '../index.js';
import { DEFAULT_COST_ROLLUP_BUDGETS as engineBudgets } from '../quantity/cost.js';
import { BomMapError as implementationError } from '../resolve/bom-map.js';
import { assertCompleteResolution as engineGuard } from '../resolve/expansion.js';

it('公共入口与按需引擎共享默认预算对象和映射错误类', () => {
  expect(DEFAULT_COST_ROLLUP_BUDGETS).toBe(engineBudgets);
  expect(DEFAULT_COST_ROLLUP_BUDGETS).toEqual({ depth: 128, nodes: 100_000 });
  expect(BomMapError).toBe(implementationError);
  expect(assertCompleteResolution).toBe(engineGuard);
  expect(new implementationError('scopeId', '不存在')).toBeInstanceOf(BomMapError);
});
