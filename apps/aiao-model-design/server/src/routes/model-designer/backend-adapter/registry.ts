import type { SchemaReader } from '../schema-reader';
import type { SqlExecutor } from '../sql-executor';
import {
  BackendAdapterError,
  type BackendAdapter,
  type BackendAdapterDescriptor,
  type BackendCapability
} from './contracts';
import { createSupabaseBackendAdapter } from './supabase';
import { validationBackendAdapter } from './validation';

const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const CAPABILITIES = new Set<BackendCapability>(['schema.read', 'schema.diff', 'ddl.dry-run', 'ddl.execute']);

/** 已校验且选中项不可变的 adapter registry。 */
export interface BackendAdapterRegistry {
  readonly selected: BackendAdapter;
  get(id: string): BackendAdapter | undefined;
}

/** 内置 adapter registry 的装配参数。 */
export interface ModelDesignerBackendRegistryOptions {
  readonly selectedId: string;
  readonly schemaReader: SchemaReader | null;
  readonly executor: SqlExecutor;
  readonly additionalAdapters?: readonly BackendAdapter[];
}

function invalid(message: string): never {
  throw new BackendAdapterError('invalid_adapter', 500, message);
}

function hasDdlCapability(capabilities: ReadonlySet<BackendCapability>): boolean {
  return capabilities.has('ddl.dry-run') || capabilities.has('ddl.execute');
}

function validateAdapter(adapter: BackendAdapter): BackendAdapter {
  const { id, label } = adapter.descriptor;
  if (!ADAPTER_ID_PATTERN.test(id) || !label.trim()) invalid(`Invalid backend adapter descriptor: ${id}`);
  const capabilities = new Set(adapter.descriptor.capabilities);
  if (capabilities.size !== adapter.descriptor.capabilities.length) invalid(`Duplicate capability on adapter ${id}`);
  if ([...capabilities].some(capability => !CAPABILITIES.has(capability)))
    invalid(`Invalid capability on adapter ${id}`);

  if (capabilities.has('schema.read') !== Boolean(adapter.readSchema)) invalid(`schema.read mismatch on adapter ${id}`);
  if (capabilities.has('schema.diff') !== Boolean(adapter.diffSchema)) invalid(`schema.diff mismatch on adapter ${id}`);
  if (hasDdlCapability(capabilities) !== Boolean(adapter.executeDdl))
    invalid(`ddl capability mismatch on adapter ${id}`);

  const descriptor: BackendAdapterDescriptor = Object.freeze({
    id,
    label,
    capabilities: Object.freeze([...capabilities])
  });
  return Object.freeze({ ...adapter, descriptor });
}

/** 注册 adapter 并一次性选择当前服务进程的实现。 */
export function createBackendAdapterRegistry(
  adapters: readonly BackendAdapter[],
  selectedId: string
): BackendAdapterRegistry {
  const registry = new Map<string, BackendAdapter>();
  for (const candidate of adapters) {
    const adapter = validateAdapter(candidate);
    if (registry.has(adapter.descriptor.id)) invalid(`Duplicate backend adapter ID: ${adapter.descriptor.id}`);
    registry.set(adapter.descriptor.id, adapter);
  }
  const selected = registry.get(selectedId);
  if (!selected) {
    throw new BackendAdapterError('unknown_adapter', 400, `Unknown backend adapter: ${selectedId}`);
  }
  return Object.freeze({ selected, get: (id: string) => registry.get(id) });
}

/** 装配 Supabase、validation 和可选扩展 adapter，并选择唯一活动实现。 */
export function createModelDesignerBackendAdapterRegistry(
  options: ModelDesignerBackendRegistryOptions
): BackendAdapterRegistry {
  return createBackendAdapterRegistry(
    [
      createSupabaseBackendAdapter({ schemaReader: options.schemaReader, executor: options.executor }),
      validationBackendAdapter,
      ...(options.additionalAdapters ?? [])
    ],
    options.selectedId
  );
}

/**
 * 校验能力后执行 adapter 操作，并把未知驱动错误收敛成安全错误。
 */
export async function runBackendAdapterCapability<T>(
  adapter: BackendAdapter,
  capability: BackendCapability,
  operation: (adapter: BackendAdapter) => Promise<T> | T
): Promise<T> {
  if (!adapter.descriptor.capabilities.includes(capability)) {
    throw new BackendAdapterError(
      'capability_unavailable',
      501,
      `Backend adapter ${adapter.descriptor.id} does not support ${capability}`
    );
  }
  try {
    return await operation(adapter);
  } catch (error) {
    if (error instanceof BackendAdapterError) throw error;
    throw new BackendAdapterError(
      'adapter_operation_failed',
      502,
      `Backend adapter ${adapter.descriptor.id} operation failed`
    );
  }
}
