export {
  BackendAdapterError,
  type BackendAdapter,
  type BackendAdapterDescriptor,
  type BackendAdapterErrorCode,
  type BackendCapability,
  type BackendDiffResult
} from './contracts';
export {
  createBackendAdapterRegistry,
  createModelDesignerBackendAdapterRegistry,
  runBackendAdapterCapability,
  type BackendAdapterRegistry,
  type ModelDesignerBackendRegistryOptions
} from './registry';
export { createSupabaseBackendAdapter, type SupabaseBackendAdapterOptions } from './supabase';
export { validationBackendAdapter } from './validation';
