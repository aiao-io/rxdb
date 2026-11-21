import {
  validateMediaCapabilityCatalog,
  type MediaCapability,
  type MediaCapabilityCatalog,
  type MediaCapabilityOperation
} from '@aiao-media/api-contracts';
import { reject } from './product-http.ts';
import { base, providerAllowlist } from './relay-input.ts';
import type { WorkerEnv } from './worker-env.ts';

export type PrivateMediaCapability = MediaCapability & {
  protocol: 'openai' | 'minimax';
  baseUrl: string;
  model: string;
  secret: string;
  path?: string;
};
interface MediaCapabilityConfig {
  revision: number;
  capabilities: PrivateMediaCapability[];
}
export interface MediaCapabilitySelection {
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  operation: MediaCapabilityOperation;
}
const privateKeys = new Set(['protocol', 'baseUrl', 'model', 'secret', 'path']);
const upstreamModel = /^[a-zA-Z0-9._:-]{1,128}$/;
const secretName = /^[A-Z][A-Z0-9_]{0,79}$/;
const pathValue = /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]{1,180}$/;

function publicCapability(value: PrivateMediaCapability): MediaCapability {
  const publicValue = { ...value } as Record<string, unknown>;
  for (const key of privateKeys) Reflect.deleteProperty(publicValue, key);
  return publicValue as unknown as MediaCapability;
}
function parseConfig(env: WorkerEnv): MediaCapabilityConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(env.MEDIA_PLATFORM_CAPABILITIES ?? '{"revision":1,"capabilities":[]}');
  } catch {
    reject(503, '媒体能力目录配置无效。');
  }
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const revision = input?.['revision'] ?? 1;
  const values = Array.isArray(raw) ? raw : input?.['capabilities'];
  if (!Number.isSafeInteger(revision) || (revision as number) <= 0 || !Array.isArray(values) || values.length > 200)
    reject(503, '媒体能力目录配置无效。');
  let allowlist: Set<string>;
  try {
    allowlist = providerAllowlist(env);
  } catch {
    reject(503, '媒体能力供应商允许列表无效。');
  }
  const privateCapabilities: PrivateMediaCapability[] = [];
  const publicCapabilities: MediaCapability[] = [];
  for (const rawValue of values) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) reject(503, '媒体能力目录配置无效。');
    const value = rawValue as Record<string, unknown>;
    if (
      typeof value['protocol'] !== 'string' ||
      !['openai', 'minimax'].includes(value['protocol']) ||
      typeof value['baseUrl'] !== 'string' ||
      typeof value['model'] !== 'string' ||
      !upstreamModel.test(value['model']) ||
      typeof value['secret'] !== 'string' ||
      !secretName.test(value['secret']) ||
      (value['path'] !== undefined && (typeof value['path'] !== 'string' || !pathValue.test(value['path'])))
    )
      reject(503, '媒体能力目录配置无效。');
    let baseUrl: string;
    try {
      baseUrl = base(value['baseUrl']);
    } catch {
      reject(503, '媒体能力目录配置无效。');
    }
    if (!allowlist.has(baseUrl) || typeof env[value['secret']] !== 'string' || !(env[value['secret']] as string).length)
      reject(503, '媒体能力供应商或凭据尚未就绪。');
    const publicValue = { ...value } as Record<string, unknown>;
    for (const key of privateKeys) delete publicValue[key];
    let capability: MediaCapability;
    try {
      capability = validateMediaCapabilityCatalog({ revision: revision as number, capabilities: [publicValue] })
        .capabilities[0];
    } catch {
      reject(503, '媒体能力目录配置无效。');
    }
    const privateValue = {
      ...capability,
      protocol: value['protocol'] as 'openai' | 'minimax',
      baseUrl,
      model: value['model'],
      secret: value['secret'],
      ...(value['path'] !== undefined ? { path: value['path'] } : {})
    } as PrivateMediaCapability;
    privateCapabilities.push(privateValue);
    publicCapabilities.push(publicCapability(privateValue));
  }
  try {
    validateMediaCapabilityCatalog({ revision: revision as number, capabilities: publicCapabilities });
  } catch {
    reject(503, '媒体能力目录配置无效。');
  }
  return { revision: revision as number, capabilities: privateCapabilities };
}

/** 返回经过服务端策略裁剪的公开媒体能力目录。 */
export function mediaCapabilityCatalog(env: WorkerEnv): MediaCapabilityCatalog {
  const config = parseConfig(env);
  return validateMediaCapabilityCatalog({
    revision: config.revision,
    capabilities: config.capabilities.map(publicCapability)
  });
}

/** 只返回服务端内部使用的能力配置，调用方不得把私有字段写入响应或任务快照。 */
export function mediaCapability(env: WorkerEnv, selection: MediaCapabilitySelection): PrivateMediaCapability {
  const config = parseConfig(env);
  const value = config.capabilities.find(
    capability =>
      capability.providerInstanceId === selection.providerInstanceId &&
      capability.providerRevision === selection.providerRevision &&
      capability.modelId === selection.modelId &&
      capability.operation === selection.operation
  );
  if (!value) reject(400, '媒体能力不存在或已停用。');
  return value;
}
