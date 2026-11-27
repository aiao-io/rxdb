import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { assertPortAvailable } from './check-ports.mjs';

test('固定端口被占用时报出服务名与地址，不换端口，也不停掉占用者', async () => {
  const owner = createServer();
  owner.listen(0, '127.0.0.1');
  await once(owner, 'listening');
  const { port } = owner.address();
  try {
    await assert.rejects(assertPortAvailable('Worker', port, '127.0.0.1'), error => {
      assert.match(error.message, new RegExp(`Worker.*127\\.0\\.0\\.1:${port}`));
      assert.equal(error.cause.code, 'EADDRINUSE');
      return true;
    });
    assert.ok(owner.listening);
  } finally {
    await new Promise((resolve, reject) => owner.close(error => (error ? reject(error) : resolve())));
  }
  await assertPortAvailable('Worker', port, '127.0.0.1');
});
