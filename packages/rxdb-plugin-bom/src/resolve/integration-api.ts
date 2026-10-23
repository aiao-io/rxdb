import type { ExplosionOptions } from '../quantity/explosion.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import type { BomExportPayload } from './export-contract.js';
import type { BomImportResult } from './integration.js';
import type { ResolutionContext } from './resolution.js';
import type { ResolveTarget } from './resolver.js';

/**
 * 按需装载同快照导出，完整性与原始错误仍由共享实现验证。
 * @param adapter - 显式本地适配器
 * @param context - 完整解析上下文
 * @param target - 根物料或修订
 * @param options - 数量、公式参数及预算
 * @returns 同一事务快照的版本化导出
 */
export const exportBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options?: ExplosionOptions
): Promise<BomExportPayload> => (await import('./integration.js')).exportBom(adapter, context, target, options);

/**
 * 按需装载原子草稿导入，发布仍由调用方显式执行。
 * @param adapter - 显式本地适配器
 * @param payload - 待校验的版本化数据
 * @returns 草稿头或原子回滚的诊断
 */
export const importBomDraft = async (adapter: BomLocalAdapter, payload: unknown): Promise<BomImportResult> =>
  (await import('./integration.js')).importBomDraft(adapter, payload);
