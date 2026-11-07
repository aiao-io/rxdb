import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { DeepSeekChatProvider } from './deepseek-chat.provider';

/**
 * DeepSeek chat provider factory（FR-002 / FR-011 / FR-042）
 *
 * 由 bootstrap 注入到 ProviderRegistry；factory 表 `id` 必须与 providers.yaml 中
 * 对应条目的 `id` 完全相同（registry 通过 id 做配对）。
 */
export const deepseekChatFactory: ProviderFactory = {
  id: 'deepseek',
  modality: 'chat',
  build(config: ProviderConfig) {
    return new DeepSeekChatProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default deepseekChatFactory;
