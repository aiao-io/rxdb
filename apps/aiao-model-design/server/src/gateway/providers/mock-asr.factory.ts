import type { ProviderConfig } from '../../config';
import type { ProviderFactory } from '../registry/provider-registry';
import { MockAsrProvider } from './mock-asr.provider';

export const mockAsrFactory: ProviderFactory = {
  id: 'mock-asr',
  modality: 'asr',
  build(config: ProviderConfig) {
    return new MockAsrProvider({
      modelIds: config.modelIds,
      capabilities: config.capabilities
    });
  }
};

export default mockAsrFactory;
