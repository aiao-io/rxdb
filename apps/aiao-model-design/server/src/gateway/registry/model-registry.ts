import type { ProviderConfig } from '../../config';
import type { Modality } from '../core/types';
import type { AnyProvider } from '../providers/types';

export interface ModelEntry {
  modelId: string;
  modality: Modality;
  providerId: string;
  ownedBy: string;
  capabilities: readonly string[];
  registeredAt: number;
}

export interface ModelRegistry {
  /** modelId → ModelEntry，全局唯一 */
  byId: Map<string, ModelEntry>;
  /** modality → 该模态全部 enabled model（供 GET /v1/models 输出） */
  byModality: Map<Modality, ModelEntry[]>;
}

export interface ModelRegistryBootstrapOptions {
  providers: Map<string, AnyProvider>;
  configs: ProviderConfig[];
  /** 致命错误回调钩子（默认 `process.exit(1)`） */
  onFatal?: (msg: string) => never;
}

const defaultFatal = (msg: string): never => {
  console.error(`[gateway] ${msg}`);
  process.exit(1);
};

/**
 * 启动期装配 ModelRegistry（FR-056）
 *
 * - 遍历 enabled provider 的 modelIds
 * - skipped provider 的 model id 不进 registry（avoid discover-then-404）
 * - model id 全局唯一：同名冲突（同模态 / 跨模态）→ 致命退出
 *
 * @returns 装配完成的 ModelRegistry
 */
export function bootstrapModelRegistry(opts: ModelRegistryBootstrapOptions): ModelRegistry {
  const fatal = opts.onFatal ?? defaultFatal;
  const byId = new Map<string, ModelEntry>();
  const byModality = new Map<Modality, ModelEntry[]>();
  const registeredAt = Math.floor(Date.now() / 1000);

  for (const config of opts.configs) {
    const provider = opts.providers.get(config.id);
    if (!provider) continue;

    for (const modelId of provider.modelIds) {
      const existing = byId.get(modelId);
      if (existing) {
        if (existing.modality === config.modality) {
          fatal(
            `model id conflict: "${modelId}" registered by both providers "${existing.providerId}" and "${config.id}" (modality=${config.modality}); split into distinct model ids`
          );
        }
        fatal(
          `model id "${modelId}" registered across multiple modalities (${existing.modality}, ${config.modality}); model ids MUST be globally unique`
        );
      }
      const entry: ModelEntry = {
        modelId,
        modality: config.modality,
        providerId: config.id,
        ownedBy: config.id,
        capabilities: provider.capabilities,
        registeredAt
      };
      byId.set(modelId, entry);
      if (!byModality.has(config.modality)) byModality.set(config.modality, []);
      byModality.get(config.modality)!.push(entry);
    }
  }

  return { byId, byModality };
}
