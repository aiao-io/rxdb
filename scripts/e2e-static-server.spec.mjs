import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { assertStaticRoot, closeStaticServer, parseArgs, safeJoin, startStaticServer } from './e2e-static-server.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./e2e-static-server.mjs', import.meta.url));

const listen = (server, options) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options, () => resolve(server));
  });

const rawGet = (port, path) =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'e2e-static-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>spa</title>');
  await writeFile(join(root, 'app.js'), 'window.app = true;');
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'ok.txt'), 'ok');
  return root;
}

test('parseArgs 读取 --root / --port / --host', () => {
  assert.deepEqual(parseArgs(['--root', 'dist/app', '--port', '8200', '--host', '127.0.0.1']), {
    root: 'dist/app',
    port: 8200,
    host: '127.0.0.1'
  });
  assert.deepEqual(parseArgs(['--root=dist/app', '--port=8313']), {
    root: 'dist/app',
    port: 8313,
    host: undefined
  });
});

test('parseArgs 拒绝缺失参数与非法端口', () => {
  assert.throws(() => parseArgs(['--port', '8200']), /Missing --root/);
  assert.throws(() => parseArgs(['--root', 'dist/app']), /Missing --port/);
  assert.throws(() => parseArgs(['--root', 'dist/app', '--port', 'nope']), /Invalid port/);
  assert.throws(() => parseArgs(['--root', 'dist/app', '--port', '8200', '--unknown']), /Unknown option/);
});

test('assertStaticRoot 在目录或 index.html 缺失时抛 ENOENT', async () => {
  const missing = join(tmpdir(), `e2e-static-missing-${Date.now()}`);
  assert.throws(() => assertStaticRoot(missing), { code: 'ENOENT' });

  const empty = await mkdtemp(join(tmpdir(), 'e2e-static-empty-'));
  assert.throws(() => assertStaticRoot(empty), { code: 'ENOENT' });
});

test('CLI 在 root 不存在时立刻以非零退出', async () => {
  await assert.rejects(
    () =>
      execFileAsync(process.execPath, [scriptPath, '--root', join(tmpdir(), 'does-not-exist'), '--port', '8200'], {
        timeout: 5000
      }),
    error => {
      assert.notEqual(error.code, 0);
      assert.match(String(error.stderr), /Static root not found/);
      return true;
    }
  );
});

test('端口被占时立刻失败，不换端口', async () => {
  const root = await createFixture();
  const blocker = await listen(createServer(), { port: 0, exclusive: true, host: '127.0.0.1' });
  const port = blocker.address().port;
  try {
    await assert.rejects(() => startStaticServer({ root, port, host: '127.0.0.1' }), { code: 'EADDRINUSE' });
  } finally {
    await closeStaticServer(blocker);
  }
});

test('已有文件按原路径返回，缺失路径回退 index.html', async () => {
  const root = await createFixture();
  const server = await startStaticServer({ root, port: 0, host: '127.0.0.1' });
  const { port } = server.address();
  try {
    const asset = await fetch(`http://127.0.0.1:${port}/assets/ok.txt`);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), 'ok');

    const script = await fetch(`http://127.0.0.1:${port}/app.js`);
    assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await script.text(), 'window.app = true;');

    const spa = await fetch(`http://127.0.0.1:${port}/todos/42`);
    assert.equal(spa.status, 200);
    assert.match(spa.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await spa.text(), /<title>spa<\/title>/);
  } finally {
    await closeStaticServer(server);
  }
});

test('路径穿越返回 403，不会读出根目录外的文件', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'e2e-static-parent-'));
  const secret = join(parent, 'secret.txt');
  const root = join(parent, 'site');
  await mkdir(root);
  await writeFile(secret, 'top-secret');
  await writeFile(join(root, 'index.html'), '<!doctype html><title>spa</title>');

  assert.equal(safeJoin(root, '/../secret.txt'), null);
  assert.equal(safeJoin(root, '/%2e%2e/secret.txt'), null);

  const server = await startStaticServer({ root, port: 0, host: '127.0.0.1' });
  const { port } = server.address();
  try {
    const escapedPath = await rawGet(port, '/../secret.txt');
    assert.equal(escapedPath.status, 403);
    assert.notEqual(escapedPath.body, 'top-secret');

    const encoded = await rawGet(port, '/%2e%2e/secret.txt');
    assert.equal(encoded.status, 403);
    assert.notEqual(encoded.body, 'top-secret');
  } finally {
    await closeStaticServer(server);
  }
});
