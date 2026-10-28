import type { BomLocalAdapter } from './bom-adapter.js';
import type { EcnDiffResult, EcnImpactResult } from './ecn.js';

/**
 * 按需读取ECN影响范围，沿用既有解析与错误合同。
 * @param adapter - 显式本地适配器
 * @param ecnId - 变更单标识
 * @returns 同一快照中按消耗关系和修订身份匹配的影响范围；同一整机的不同路径分别列出
 * @throws {@link import('./resolution.js').BomResolutionError} 使用方候选未裁决
 * @throws {@link import('../types.js').BomTruncationError} 命中路径超出 where-used 默认预算（深度 128 / 路径 100,000）
 */
export const ecnImpact = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnImpactResult> =>
  (await import('./ecn.js')).ecnImpact(adapter, ecnId);

/**
 * 按需读取ECN生效前后的发生项差异。
 * @param adapter - 显式本地适配器
 * @param ecnId - 变更单标识
 * @returns 同一快照中按逻辑行对齐的差异；前后发生项携带单位、换算、损耗及投料规则
 */
export const ecnDiff = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnDiffResult> =>
  (await import('./ecn.js')).ecnDiff(adapter, ecnId);
