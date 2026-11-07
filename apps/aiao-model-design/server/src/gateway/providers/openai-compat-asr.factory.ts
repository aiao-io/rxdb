import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { OpenAiCompatAsrProvider } from './openai-compat-asr.provider';

/**
 * OpenAI 兼容 ASR provider 工厂（FR-002 / FR-042 / T061）
 *
 * 由 bootstrap 注入 DEFAULT_FACTORIES，对应 providers.yaml 中
 * `id: openai-compat-asr` 一项。
 */
export const openAiCompatAsrFactory: ProviderFactory = {
  id: 'openai-compat-asr',
  modality: 'asr',
  build(config: ProviderConfig) {
    return new OpenAiCompatAsrProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default openAiCompatAsrFactory;
