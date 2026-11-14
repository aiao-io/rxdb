import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startStandinServer } from './network-standin.mjs';

const read = url =>
  new Promise((resolve, reject) => {
    get(url, { rejectUnauthorized: false }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        text += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
      response.on('error', reject);
    }).on('error', reject);
  });

test('真实跨源替身随当前模式生成文档，脚本正确托管并提供隔离头', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-network-standin-'));
  await writeFile(join(root, 'entry.js'), 'export const ready = true;');
  let mode = 'standard';
  let documents = 0;
  const server = await startStandinServer({
    scriptsRoot: root,
    document: () => `<title>${mode}:${++documents}</title>`
  });
  try {
    assert.match(server.origin, /^https:\/\/127\.0\.0\.1:/);
    const first = await read(server.origin);
    assert.equal(first.text, '<title>standard:1</title>');
    assert.equal(first.headers['cross-origin-embedder-policy'], 'require-corp');
    assert.equal(first.headers['cross-origin-resource-policy'], 'cross-origin');
    mode = 'transparent';
    assert.equal((await read(`${server.origin}/?channel=two`)).text, '<title>transparent:2</title>');
    const script = await read(`${server.origin}/__standin/orbit/entry.js`);
    assert.match(script.headers['content-type'], /javascript/);
    assert.equal(script.text, 'export const ready = true;');
    assert.equal((await read(`${server.origin}/__standin/orbit/missing.js`)).status, 404);
    assert.equal((await read(`${server.origin}/__standin/orbit/%2e%2e%2fprivate.js`)).status, 404);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
  await assert.rejects(read(server.origin));
});
