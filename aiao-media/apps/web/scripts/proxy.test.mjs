import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the Angular proxy config sends only /api/relay to a live relay', async () => {
  const { default: proxy } = await import('../proxy.conf.mjs');
  assert.deepEqual(Object.keys(proxy), ['/api/relay']);
  const response = await fetch(new URL('/api/relay', proxy['/api/relay'].target));
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: 'POST required' });
});
