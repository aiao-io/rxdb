import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import type { ResolutionContext } from '../resolve/resolution.js';
import type { ResolveTarget } from '../resolve/resolver.js';
import type { ExplosionOptions, ExplosionResult } from './explosion.js';

/**
 * 按需装载数量引擎，保留单快照、预算与部分结果合同。
 * @param adapter - 显式本地适配器
 * @param context - 完整解析上下文
 * @param target - 根物料或修订
 * @param options - 计划量、公式参数、预算与取消信号
 * @returns 带manifest的数量结果
 */
export const explodeBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options: ExplosionOptions
): Promise<ExplosionResult> => (await import('./explosion.js')).explodeBom(adapter, context, target, options);
