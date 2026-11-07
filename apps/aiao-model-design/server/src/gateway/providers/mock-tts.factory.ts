import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { MockTtsProvider } from './mock-tts.provider';

export const mockTtsFactory: ProviderFactory = {
  id: 'mock-tts',
  modality: 'tts',
  build(config: ProviderConfig) {
    return new MockTtsProvider({
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default mockTtsFactory;
