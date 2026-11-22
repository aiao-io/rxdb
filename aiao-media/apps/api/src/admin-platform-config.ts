import { mediaCapabilityCatalog } from './media-capabilities.ts';
import {
  platformConfigurationEnvironment,
  publicPlatformConfiguration,
  type PlatformConfigurationDocument
} from './platform-config.ts';
import { platformModels } from './platform-models.ts';
import { body, fields, reject, uuid, type BackendClient } from './product-http.ts';

interface PlatformConfigurationRow {
  revision: number;
  models: unknown;
  capabilities: unknown;
}

function arrays(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > (name === 'models' ? 20 : 200)) reject(400, `平台配置 ${name} 无效。`);
  return value;
}

function validatePrivateEntries(values: readonly unknown[], name: string): void {
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, `平台配置 ${name} 无效。`);
    const row = value as Record<string, unknown>;
    if (
      typeof row['baseUrl'] !== 'string' ||
      typeof row['model'] !== 'string' ||
      typeof row['apiKey'] !== 'string' ||
      !row['apiKey'].trim() ||
      Object.keys(row).includes('secret')
    )
      reject(400, `平台配置 ${name} 必须填写供应商地址、上游模型和 API Key。`);
  }
}

export function validatePlatformConfiguration(models: unknown, capabilities: unknown): PlatformConfigurationDocument {
  const document = {
    revision: 1,
    models: arrays(models, 'models'),
    capabilities: arrays(capabilities, 'capabilities')
  } satisfies PlatformConfigurationDocument;
  validatePrivateEntries(document.models, 'models');
  validatePrivateEntries(document.capabilities, 'capabilities');
  const runtime = platformConfigurationEnvironment({}, document);
  try {
    if (document.models.length) platformModels(runtime);
    mediaCapabilityCatalog(runtime);
  } catch {
    reject(400, '平台配置校验失败，请检查协议、模型能力和供应商参数。');
  }
  return document;
}

export async function readAdminPlatformConfiguration(client: BackendClient) {
  const rows = await client.call<PlatformConfigurationRow[]>(
    '/rest/v1/media_platform_configuration?select=revision,models,capabilities&id=eq.default&limit=1',
    { privileged: true }
  );
  if (!Array.isArray(rows) || rows.length > 1) reject(502, '平台配置不可读。');
  const document = rows.length ? rows[0] : { revision: 0, models: [], capabilities: [] };
  return publicPlatformConfiguration({
    revision: document.revision,
    models: Array.isArray(document.models) ? document.models : [],
    capabilities: Array.isArray(document.capabilities) ? document.capabilities : []
  });
}

export async function manageAdminPlatformConfiguration(request: Request, client: BackendClient, actorId: string) {
  if (request.method === 'GET') return readAdminPlatformConfiguration(client);
  if (request.method !== 'PUT') reject(405, '平台配置只支持读取或保存。');
  const value = fields<{
    revision: number;
    requestId: string;
    models: unknown;
    capabilities: unknown;
  }>(await body(request, 524288), ['revision', 'requestId', 'models', 'capabilities']);
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !uuid(value.requestId))
    reject(400, '平台配置版本无效。');
  const document = validatePlatformConfiguration(value.models, value.capabilities);
  return client.call('/rest/v1/rpc/media_admin_platform_configuration', {
    method: 'POST',
    payload: {
      p_actor: actorId,
      p_revision: value.revision,
      p_request_id: value.requestId,
      p_models: document.models,
      p_capabilities: document.capabilities
    }
  });
}
