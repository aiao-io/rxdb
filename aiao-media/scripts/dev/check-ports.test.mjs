import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { assertPortAvailable, checkPorts } from './check-ports.mjs';

const lsofMissing = spawnSync('lsof', ['-v']).error !== undefined && 'lsof is not installed';

async function occupy() {
  const owner = createServer();
  owner.listen(0, '127.0.0.1');
  await once(owner, 'listening');
  return { owner, port: owner.address().port };
}

const release = owner => new Promise((resolve, reject) => owner.close(error => (error ? reject(error) : resolve())));

test('an occupied fixed port names the process that holds it', { skip: lsofMissing }, async () => {
  const { owner, port } = await occupy();
  try {
    await assert.rejects(assertPortAvailable('API', port, '127.0.0.1'), error => {
      assert.match(error.message, new RegExp(`pid ${process.pid}\\b`));
      assert.ok(error.message.includes(process.cwd()));
      return true;
    });
  } finally {
    await release(owner);
  }
});

test('every occupied fixed port is reported in a single check', async () => {
  const [web, api, spare] = [await occupy(), await occupy(), await occupy()];
  await release(spare.owner);
  try {
    const failures = await checkPorts([
      ['Web', web.port, '127.0.0.1'],
      ['Admin', spare.port, '127.0.0.1'],
      ['API', api.port, '127.0.0.1']
    ]);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /Web/);
    assert.match(failures[1], /API/);
  } finally {
    await Promise.all([release(web.owner), release(api.owner)]);
  }
});

test('an occupied fixed port fails without selecting another port or stopping its owner', async () => {
  const owner = createServer();
  owner.listen(0, '127.0.0.1');
  await once(owner, 'listening');
  const { port } = owner.address();
  try {
    await assert.rejects(assertPortAvailable('Web', port, '127.0.0.1'), error => {
      assert.match(error.message, new RegExp(`Web.*127\\.0\\.0\\.1:${port}`));
      assert.equal(error.cause.code, 'EADDRINUSE');
      return true;
    });
    assert.ok(owner.listening);
  } finally {
    await new Promise((resolve, reject) => owner.close(error => (error ? reject(error) : resolve())));
  }
  await assertPortAvailable('Web', port, '127.0.0.1');
});
