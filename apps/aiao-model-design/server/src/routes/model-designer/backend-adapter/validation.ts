import type { BackendAdapter } from './contracts';

/** 零副作用验证 adapter；用于证明注册、选择与显式能力拒绝。 */
export const validationBackendAdapter: BackendAdapter = {
  descriptor: { id: 'validation', label: 'Validation', capabilities: [] }
};
