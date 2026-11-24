import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manageAdminPlatformConfiguration } from './admin-platform-config.ts';
import {
  platformConfigurationEnvironment,
  publicPlatformConfiguration,
  readPlatformConfiguration,
  type PlatformConfigurationDocument
} from './platform-config.ts';
import type { BackendClient, BackendOptions } from './product-http.ts';
import type { WorkerEnv } from './worker-env.ts';

const document: PlatformConfigurationDocument = {
  revision: 7,
  models: [
    {
      id: 'image-default',
      name: '平台图片',
      baseUrl: 'https://images.example.test/v1',
      model: 'image-upstream',
      apiKey: 'image-secret',
      credits: 2
    }
  ],
  capabilities: [
    {
      providerInstanceId: '10000000-0000-4000-8000-000000000001',
      providerRevision: 1,
      kind: 'audio',
      operation: 'text-to-speech',
      modelId: 'tts-default',
      protocol: 'openai',
      baseUrl: 'https://audio.example.test/v1',
      model: 'tts-upstream',
      apiKey: 'tts-secret',
      input: { textMaxLength: 4000 },
      parameters: { languages: ['zh-CN'], voices: [{ id: 'alloy', label: 'Alloy' }], speeds: [1] },
      output: { mediaTypes: ['audio/wav'], maxBytes: 8388608, maxDurationMs: 120000 }
    }
  ]
};

test('后台配置转换为 Worker 私有运行时环境并覆盖旧允许列表', () => {
  const environment = platformConfigurationEnvironment(
    { ALLOWED_PROVIDER_BASE_URLS: '["https://old.example.test"]' },
    document
  );
  const models = JSON.parse(environment.MEDIA_PLATFORM_MODELS ?? 'null');
  const capabilities = JSON.parse(environment.MEDIA_PLATFORM_CAPABILITIES ?? 'null');
  assert.equal(environment.MEDIA_RUNTIME_MODEL_0, 'image-secret');
  assert.equal(environment.MEDIA_RUNTIME_CAPABILITY_0, 'tts-secret');
  assert.equal(models[0].secret, 'MEDIA_RUNTIME_MODEL_0');
  assert.equal(models[0].apiKey, undefined);
  assert.equal(capabilities.capabilities[0].secret, 'MEDIA_RUNTIME_CAPABILITY_0');
  assert.equal(capabilities.capabilities[0].apiKey, undefined);
  assert.deepEqual(JSON.parse(environment.ALLOWED_PROVIDER_BASE_URLS ?? 'null'), [
    'https://images.example.test/v1',
    'https://audio.example.test/v1'
  ]);
});

test('公开平台摘要移除地址、上游型号、路径和凭据', () => {
  const value = publicPlatformConfiguration(document);
  const text = JSON.stringify(value);
  assert.equal(value.revision, 7);
  assert.equal(value.models[0].credentialsConfigured, true);
  assert.equal(value.capabilities[0].credentialsConfigured, true);
  for (const privateValue of [
    'images.example.test',
    'audio.example.test',
    'image-upstream',
    'tts-upstream',
    'image-secret',
    'tts-secret'
  ])
    assert.equal(text.includes(privateValue), false, privateValue);
});

test('Supabase 已配置时缺少 service role 不回退本地平台环境', async () => {
  const environment: WorkerEnv = {
    MEDIA_SUPABASE_URL: 'https://account.example.test',
    MEDIA_SUPABASE_ANON_KEY: 'fixture-anon',
    MEDIA_PLATFORM_MODELS: JSON.stringify([{ id: 'local-only' }])
  };
  await assert.rejects(readPlatformConfiguration(environment), /平台配置服务未配置/);
});

test('从 Supabase 服务端表读取平台配置', async context => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    assert.equal(new URL(input).pathname, '/rest/v1/media_platform_configuration');
    return Response.json([
      { revision: document.revision, models: document.models, capabilities: document.capabilities }
    ]);
  });
  const value = await readPlatformConfiguration({
    MEDIA_SUPABASE_URL: 'https://account.example.test',
    MEDIA_SUPABASE_ANON_KEY: 'fixture-anon',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service'
  });
  assert.deepEqual(value, document);
});

test('后台保存通过 Supabase REST RPC 路径提交', async () => {
  let call: { path: string; options: BackendOptions } | undefined;
  const client: BackendClient = {
    call: async <T>(path: string, options: BackendOptions = {}) => {
      call = { path, options };
      return { revision: 1, modelCount: 0, capabilityCount: 0 } as T;
    }
  };
  await manageAdminPlatformConfiguration(
    new Request('https://app.example.test/api/admin/platform-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: 0, requestId: crypto.randomUUID(), models: [], capabilities: [] })
    }),
    client,
    '10000000-0000-4000-8000-000000000001'
  );
  assert.equal(call?.path, '/rest/v1/rpc/media_admin_platform_configuration');
  assert.equal(call?.options['method'], 'POST');
});
