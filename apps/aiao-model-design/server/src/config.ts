import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';
import YAML from 'yaml';

export interface Config {
  NODE_ENV: 'development' | 'production' | 'test';
  CORS_ORIGINS: string[] | true;
  PORT: number;
}

/**
 * 网关模态枚举
 *
 * Reference: specs/006-model-gateway/spec.md FR-001
 */
export type Modality = 'chat' | 'asr' | 'tts';

/**
 * MVP 阶段合法 capability 白名单（穷尽集合）
 *
 * 新增 capability 必须先扩此枚举并更新 contracts/provider-interfaces.md。
 *
 * Reference: specs/006-model-gateway/spec.md FR-002
 */
export const ALLOWED_CAPABILITIES = ['stream', 'reference_voice', 'timestamps'] as const;
export type Capability = (typeof ALLOWED_CAPABILITIES)[number];

/**
 * 单条 provider 配置（providers.yaml 中的一项，env 占位已插值）
 *
 * 注意：capability 白名单 / isDefault 唯一性 / model id 冲突等校验放 registry 层。
 * 本结构仅做最基本的 YAML 解析与必填字段校验。
 */
export interface ProviderConfig {
  id: string;
  modality: Modality;
  modelIds: string[];
  baseUrl: string;
  apiKey: string;
  capabilities: string[];
  isDefault: boolean;
}

/**
 * Gateway 启动期一次性装配的全量配置
 */
export interface GatewayConfig {
  providers: ProviderConfig[];
}

/**
 * 获取允许来源
 */
const get_cors_origins = (): string[] | true => {
  const envOrigins = process.env.CORS_ORIGIN;
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim());
  }
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  return [];
};

/**
 * 应用配置
 */
export const config = {
  NODE_ENV: env.NODE_ENV || 'development',
  PORT: parseInt(env.PORT || '3200', 10),
  CORS_ORIGINS: get_cors_origins()
} as Config;

const ENV_PLACEHOLDER = /\$\{env:([A-Z0-9_]+)(?::-([^}]*))?\}/g;
const MODALITIES: ReadonlySet<Modality> = new Set(['chat', 'asr', 'tts']);

const interpolateEnv = (raw: string): string =>
  raw.replace(ENV_PLACEHOLDER, (_, name: string, fallback?: string) => {
    const value = process.env[name];
    if (value !== undefined && value !== '') return value;
    return fallback ?? '';
  });

const interpolateValue = (value: unknown): unknown => {
  if (typeof value === 'string') return interpolateEnv(value);
  if (Array.isArray(value)) return value.map(interpolateValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateValue(v);
    }
    return out;
  }
  return value;
};

const parseProvider = (raw: unknown, index: number): ProviderConfig => {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`providers.yaml: providers[${index}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? '').trim();
  if (!id) throw new Error(`providers.yaml: providers[${index}].id missing`);
  const modality = r.modality as Modality;
  if (!MODALITIES.has(modality)) {
    throw new Error(`providers.yaml: providers[${index}].modality invalid (${String(modality)})`);
  }
  const modelIds = Array.isArray(r.modelIds) ? r.modelIds.map(String) : [];
  if (modelIds.length === 0) {
    throw new Error(`providers.yaml: providers[${index}].modelIds must be non-empty array`);
  }
  const capabilities = Array.isArray(r.capabilities) ? r.capabilities.map(String) : [];
  return {
    id,
    modality,
    modelIds,
    baseUrl: String(r.baseUrl ?? ''),
    apiKey: String(r.apiKey ?? ''),
    capabilities,
    isDefault: Boolean(r.isDefault)
  };
};

/**
 * 从 YAML 装配网关配置
 *
 * 启动期一次性调用：读 YAML → 做 `${env:VAR}` / `${env:VAR:-default}` 插值
 * → 解析为类型化结构。深层校验（capability 白名单、isDefault 唯一性、
 * model id 冲突）由 registry 层负责。
 *
 * @param configPath 可选路径覆盖（测试用，默认相对 `process.cwd()`）
 * @returns 已插值的 GatewayConfig；解析失败时抛错带原因
 */
export function loadGatewayConfig(configPath?: string): GatewayConfig {
  const candidates =
    configPath ?
      [configPath]
    : [join(process.cwd(), 'apps/aiao-model-design/server/config/providers.yaml'), join(process.cwd(), 'config/providers.yaml')];
  let yamlText: string | null = null;
  let lastError: Error | null = null;
  let usedPath = candidates[0];
  for (const p of candidates) {
    try {
      yamlText = readFileSync(p, 'utf-8');
      usedPath = p;
      break;
    } catch (cause) {
      lastError = cause as Error;
    }
  }
  if (yamlText === null) {
    throw new Error(
      `Failed to read gateway config; tried [${candidates.join(', ')}]: ${lastError?.message ?? 'unknown'}`
    );
  }
  const parsed = YAML.parse(yamlText) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`providers.yaml at ${usedPath}: root must be an object`);
  }
  const root = interpolateValue(parsed) as { providers?: unknown };
  if (!Array.isArray(root.providers)) {
    throw new Error(`providers.yaml at ${usedPath}: 'providers' must be an array`);
  }
  return {
    providers: root.providers.map((raw, i) => parseProvider(raw, i))
  };
}
