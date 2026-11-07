import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { OpenAiCompatTtsProvider } from './openai-compat-tts.provider';

/**
 * OpenAI 兼容 TTS provider 工厂（FR-002 / FR-042 / T077）
 *
 * 对应 providers.yaml 中 `id: openai-compat-tts` 一项。
 */
export const openAiCompatTtsFactory: ProviderFactory = {
  id: 'openai-compat-tts',
  modality: 'tts',
  build(config: ProviderConfig) {
    return new OpenAiCompatTtsProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default openAiCompatTtsFactory;
