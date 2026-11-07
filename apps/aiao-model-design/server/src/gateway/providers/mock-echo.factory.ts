import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { MockEchoProvider } from './mock-echo.provider';

/**
 * Mock Echo provider factory（FR-002 / FR-042）
 *
 * 由 bootstrap 注入到 ProviderRegistry；测试 fixture 也可直接使用。
 */
export const mockEchoFactory: ProviderFactory = {
  id: 'mock-echo',
  modality: 'chat',
  build(config: ProviderConfig) {
    return new MockEchoProvider({
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default mockEchoFactory;
