import { backend } from './product-http.ts';
import type { WorkerEnv } from './worker-env.ts';

export interface PlatformConfigurationDocument {
  revision: number;
  models: unknown[];
  capabilities: unknown[];
}

interface PlatformConfigurationRow {
  revision: number;
  models: unknown;
  capabilities: unknown;
}

const privateModelKeys = ['baseUrl', 'model', 'apiKey', 'secret'] as const;
const privateCapabilityKeys = ['protocol', 'baseUrl', 'model', 'apiKey', 'secret', 'path'] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function json(value: string | undefined, fallback: unknown): unknown {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function array(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(`平台配置 ${key} 必须是数组。`);
}

function storedRow(row: unknown): PlatformConfigurationDocument {
  const value = record(row);
  if (!value) throw new Error('平台配置记录无效。');
  const revision = value['revision'];
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('平台配置修订号无效。');
  return {
    revision: revision as number,
    models: array(value['models'], 'models'),
    capabilities: array(value['capabilities'], 'capabilities')
  };
}

function runtimeRow(value: unknown, index: number, kind: 'model' | 'capability') {
  const row = record(value);
  if (!row || typeof row['apiKey'] !== 'string') return { value };
  const secret = `MEDIA_RUNTIME_${kind.toUpperCase()}_${index}`;
  const runtime = { ...row };
  delete runtime['apiKey'];
  return { value: { ...runtime, secret }, secret, apiKey: row['apiKey'] };
}

function baseUrls(document: PlatformConfigurationDocument): string[] {
  return [...document.models, ...document.capabilities]
    .map(value => record(value)?.['baseUrl'])
    .filter((value): value is string => typeof value === 'string');
}

/** 将后台保存的私密配置转换为仅供 Worker 内部使用的兼容环境形状。 */
export function platformConfigurationEnvironment(
  env: WorkerEnv,
  document: PlatformConfigurationDocument
): WorkerEnv {
  const modelEntries = document.models.map((value, index) => runtimeRow(value, index, 'model'));
  const capabilityEntries = document.capabilities.map((value, index) => runtimeRow(value, index, 'capability'));
  const models = modelEntries.map(entry => entry.value);
  const capabilities = capabilityEntries.map(entry => entry.value);
  const configuredBases = baseUrls(document);
  return {
    ...env,
    ...Object.fromEntries(
      [...modelEntries, ...capabilityEntries]
        .filter((entry): entry is typeof entry & { secret: string; apiKey: string } =>
          typeof entry.secret === 'string' && typeof entry.apiKey === 'string'
        )
        .map(entry => [entry.secret, entry.apiKey])
    ),
    MEDIA_PLATFORM_MODELS: JSON.stringify(models),
    MEDIA_PLATFORM_CAPABILITIES: JSON.stringify({ revision: document.revision || 1, capabilities }),
    ALLOWED_PROVIDER_BASE_URLS: JSON.stringify(configuredBases)
  };
}

/** 读取服务端媒体配置。没有 Supabase 时只保留测试夹具的兼容环境输入。 */
export async function readPlatformConfiguration(env: WorkerEnv): Promise<PlatformConfigurationDocument> {
  if (env.MEDIA_SUPABASE_URL) {
    if (!env.MEDIA_SUPABASE_SERVICE_ROLE_KEY) throw new Error('平台配置服务未配置。');
    const rows = await backend(env).call<PlatformConfigurationRow[]>(
      '/rest/v1/media_platform_configuration?select=revision,models,capabilities&id=eq.default&limit=1',
      { privileged: true }
    );
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('平台配置不可读。');
    return rows.length ? storedRow(rows[0]) : { revision: 0, models: [], capabilities: [] };
  }
  const capabilities = json(env.MEDIA_PLATFORM_CAPABILITIES, []);
  return {
    revision: 1,
    models: array(json(env.MEDIA_PLATFORM_MODELS, []), 'models'),
    capabilities: Array.isArray(capabilities) ? capabilities : array(record(capabilities)?.['capabilities'], 'capabilities')
  };
}

function removeKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const row = record(value);
  if (!row) return {};
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
}

/** 返回给后台界面的目录摘要，不携带地址、上游型号、凭据或路径。 */
export function publicPlatformConfiguration(document: PlatformConfigurationDocument) {
  return {
    revision: document.revision,
    models: document.models.map(value => ({
      ...removeKeys(value, privateModelKeys),
      credentialsConfigured: typeof record(value)?.['apiKey'] === 'string' || typeof record(value)?.['secret'] === 'string'
    })),
    capabilities: document.capabilities.map(value => ({
      ...removeKeys(value, privateCapabilityKeys),
      credentialsConfigured: typeof record(value)?.['apiKey'] === 'string' || typeof record(value)?.['secret'] === 'string'
    }))
  };
}
