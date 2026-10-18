import type { BomLocalAdapter } from './bom-adapter.js';
import type { EcnDiffResult, EcnImpactResult } from './ecn.js';

/**
 * 按需读取ECN影响范围，沿用既有解析与错误合同。
 * @param adapter - 显式本地适配器
 * @param ecnId - 变更单标识
 * @returns 真实影响范围
 */
export const ecnImpact = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnImpactResult> =>
  (await import('./ecn.js')).ecnImpact(adapter, ecnId);

/**
 * 按需读取ECN生效前后的发生项差异。
 * @param adapter - 显式本地适配器
 * @param ecnId - 变更单标识
 * @returns 按逻辑行对齐的差异
 */
export const ecnDiff = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnDiffResult> =>
  (await import('./ecn.js')).ecnDiff(adapter, ecnId);
