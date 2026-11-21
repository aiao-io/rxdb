import assert from 'node:assert/strict';
import { test } from 'node:test';

test('独立开发入口代理全部产品 API，避免返回前端 HTML', async () => {
  const { default: proxy } = await import('../proxy.conf.mjs');
  assert.deepEqual(Object.keys(proxy), ['/api/**']);
  for (const path of ['/api/models', '/api/installation', '/api/templates', '/api/relay/tasks/missing']) {
    const response = await fetch(new URL(path, proxy['/api/**'].target));
    assert.match(response.headers.get('content-type') ?? '', /application\/json/, path);
    await response.json();
  }
});

test('独立开发入口保持下线的无状态代理返回 JSON 404', async () => {
  const { default: proxy } = await import('../proxy.conf.mjs');
  const response = await fetch(new URL('/api/relay', proxy['/api/**'].target));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Unknown API' });
});
