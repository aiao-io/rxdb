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
