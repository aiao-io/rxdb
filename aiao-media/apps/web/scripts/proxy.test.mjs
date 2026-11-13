import assert from 'node:assert/strict';
import { test } from 'node:test';

test('旧开发代理配置保持同源任务路径，已下线的无状态入口返回 404', async () => {
  const { default: proxy } = await import('../proxy.conf.mjs');
  assert.deepEqual(Object.keys(proxy), ['/api/relay']);
  const response = await fetch(new URL('/api/relay', proxy['/api/relay'].target));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Unknown API' });
});
