import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startArtifactServer } from './artifact-server.mjs';

async function site(body) {
  const root = await mkdtemp(join(tmpdir(), 'artifact-server-spec-'));
  await writeFile(join(root, 'index.html'), body);
  await writeFile(join(root, 'data.json'), '{"ok":true}');
  return root;
}

test('托管产物并带跨源隔离响应头；不存在的路径是 404，目录穿越被拒', async () => {
  const root = await site('A');
  const server = await startArtifactServer({ root });
  try {
    const index = await fetch(`${server.origin}/`);
    assert.equal(index.status, 200);
    assert.equal(await index.text(), 'A');
    assert.equal(index.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(index.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.match(index.headers.get('content-type') ?? '', /text\/html/);
    assert.match((await fetch(`${server.origin}/data.json`)).headers.get('content-type') ?? '', /application\/json/);
    assert.equal((await fetch(`${server.origin}/missing.js`)).status, 404);
    const escape = await fetch(`${server.origin}/%2e%2e/%2e%2e/etc/hosts`);
    assert.equal(escape.status, 404);
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('switchTo 换一份产物而不换来源', async () => {
  const first = await site('A');
  const second = await site('B');
  const server = await startArtifactServer({ root: first });
  try {
    const origin = server.origin;
    assert.equal(await (await fetch(`${origin}/`)).text(), 'A');
    server.switchTo(second);
    assert.equal(server.origin, origin);
    assert.equal(await (await fetch(`${origin}/`)).text(), 'B');
    assert.equal(server.root(), second);
  } finally {
    server.close();
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});

test('可以沿用上一次的端口重启，来源因此不变', async () => {
  const root = await site('A');
  const first = await startArtifactServer({ root });
  const { port, origin } = first;
  first.close();
  const second = await startArtifactServer({ root, port });
  try {
    assert.equal(second.origin, origin);
    assert.equal(await (await fetch(`${origin}/`)).text(), 'A');
  } finally {
    second.close();
    await rm(root, { recursive: true, force: true });
  }
});
