import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './local-first-worker.ts';
import type { WorkerEnv } from './worker-env.ts';

const origin = 'https://app.example.test';
const env = {
  ALLOWED_PROVIDER_BASE_URLS: '[]',
  ASSETS: { fetch: () => new Response('static application') }
} as unknown as WorkerEnv;

test('公开 OpenAPI 文档包含稳定的产品接口', async () => {
  const response = await worker.fetch(new Request(`${origin}/api/openapi.json`), env);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);

  const document = (await response.json()) as {
    openapi: string;
    info: { title: string; version: string };
    paths: Record<string, Record<string, unknown>>;
  };
  assert.equal(document.openapi, '3.1.0');
  assert.equal(document.info.title, 'Aiao Media API');
  assert.equal(document.info.version, '1.0.0');
  for (const path of [
    '/api/installation',
    '/api/credits',
    '/api/admin/users/{userId}/credits',
    '/api/templates',
    '/api/models',
    '/api/relay/tasks/{taskId}',
    '/api/relay/tasks/{taskId}/result',
    '/api/relay/tasks/{taskId}/abandon',
    '/api/relay/tasks/{taskId}/confirm',
    '/api/relay/tasks/{taskId}/discard'
  ])
    assert.ok(document.paths[path], `缺少 OpenAPI 路径 ${path}`);
  assert.equal(document.paths['/api/relay'], undefined);
  const serialized = JSON.stringify(document);
  assert.ok(!serialized.includes('provider-api-key'));
  assert.ok(!serialized.includes('x-provider-base'));
  assert.deepEqual(Object.keys(document.paths['/api/relay/tasks/{taskId}']).sort(), ['delete', 'get', 'put']);
});

test('Swagger UI 可从 API 文档端点打开', async () => {
  const response = await worker.fetch(new Request(`${origin}/api/docs`), env);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await response.text(), /swagger-ui/);
});

test('后台文档允许连接安装配置中的本地账号服务及对应 Realtime', async () => {
  const response = await worker.fetch(new Request(`${origin}/admin/templates`), {
    ...env,
    MEDIA_SUPABASE_URL: 'http://127.0.0.1:54321'
  });
  const policy = response.headers.get('content-security-policy') ?? '';
  assert.match(policy, /connect-src[^;]*http:\/\/127\.0\.0\.1:54321[^;]*ws:\/\/127\.0\.0\.1:54321;/);
  assert.ok(!policy.includes('http:;'));
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval';/);
});

test('后台 CSP 采用安装服务的公开账号地址，保持静态资源路径与密钥隔离', async () => {
  const assets: string[] = [];
  const installationRequests: string[] = [];
  const configured: WorkerEnv = {
    ...env,
    ASSETS: {
      fetch: async input => {
        assets.push(new URL(String(input instanceof Request ? input.url : input)).pathname);
        return new Response('admin');
      }
    },
    MEDIA_SUPABASE_URL: 'http://127.0.0.1:11111',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'private-configuration-sentinel',
    MEDIA_INSTALLATION: {
      idFromName: () => 'installation',
      get: () => ({
        fetch: async input => {
          installationRequests.push(new URL(String(input instanceof Request ? input.url : input)).pathname);
          return Response.json({ initialized: true, auth: { url: 'http://localhost:54321' } });
        }
      })
    }
  };
  const response = await worker.fetch(new Request(`${origin}/admin/tasks`), configured);
  const policy = response.headers.get('content-security-policy') ?? '';
  assert.match(policy, /connect-src[^;]*http:\/\/localhost:54321[^;]*ws:\/\/localhost:54321;/);
  assert.ok(!policy.includes('11111'));
  assert.ok(!policy.includes('private-configuration-sentinel'));
  assert.deepEqual(assets, ['/admin/index.html']);
  assert.deepEqual(installationRequests, ['/api/installation']);
});
