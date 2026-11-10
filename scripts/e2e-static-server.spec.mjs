import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertCompatibleBaseHref,
  assertStaticRoot,
  closeStaticServer,
  parseArgs,
  readDocumentBaseHref,
  safeJoin,
  startStaticServer
} from './e2e-static-server.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./e2e-static-server.mjs', import.meta.url));

const listen = (server, options) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options, () => resolve(server));
  });

const rawRequest = (port, path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
      );
    });
    req.on('error', reject);
    req.end();
  });

const rawGet = (port, path) => rawRequest(port, path);

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

// `-h` 是 --help，不是 --host 的短写。此前 readFlag 会给每个长选项凭空造一个首字母短写
// （-r / -p / -h），既没写进 usage，`-h` 那个还被 --help 抢在前面判掉——永远走不到。
test('parseArgs 不认没写进 usage 的首字母短写', () => {
  assert.throws(() => parseArgs(['-r', 'dist/app', '--port', '8200']), /Unknown option/);
  assert.throws(() => parseArgs(['--root', 'dist/app', '-p', '8200']), /Unknown option/);
});

test('assertCompatibleBaseHref 拒绝网站演示用的非根 base href', async () => {
  const root = await mkdtemp(join(tmpdir(), 'e2e-static-base-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><base href="/demo/angular/"><title>demo</title>');

  assert.equal(readDocumentBaseHref('<base href="/demo/angular/">'), '/demo/angular/');
  assert.throws(() => assertCompatibleBaseHref(root), { code: 'EBASEHREF' });
  assert.throws(() => assertStaticRoot(root), { code: 'EBASEHREF' });
});

test('assertCompatibleBaseHref 接受 / 与缺失 base 标签', async () => {
  const root = await createFixture();
  assert.equal(readDocumentBaseHref('<base href="/" />'), '/');
  assert.doesNotThrow(() => assertCompatibleBaseHref(root));

  await writeFile(join(root, 'index.html'), '<!doctype html><base href="/"><title>spa</title>');
  assert.doesNotThrow(() => assertCompatibleBaseHref(root));
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

// 这是 Playwright webServer 场景下最要命的一类失败：请求处理器里同步抛出的异常会冒到
// 'request' 事件外，整个 node 进程退出，webServer 随之消失，剩下的用例全部连不上。
// 读文件必须自己兜住——stat 与 read 之间文件被并发构建换掉（ENOENT）或权限变了（EACCES）都会走到这。
test('文件读失败返回 500，不会把进程带崩', async t => {
  if (process.getuid?.() === 0) {
    t.skip('root 无视文件权限位，造不出 EACCES');
    return;
  }
  const root = await createFixture();
  const locked = join(root, 'locked.txt');
  await writeFile(locked, 'nope');
  await chmod(locked, 0o000);

  const server = await startStaticServer({ root, port: 0, host: '127.0.0.1' });
  const { port } = server.address();
  try {
    const denied = await rawGet(port, '/locked.txt');
    assert.equal(denied.status, 500);

    // 进程还活着：后续请求照常
    const ok = await rawGet(port, '/assets/ok.txt');
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'ok');
  } finally {
    await chmod(locked, 0o600);
    await closeStaticServer(server);
  }
});

// 构建进程在「已确认文件存在」之后删掉或替换它时，stat 阶段同样会抛错；那一步若不在任何 try 里，
// 异常冒出 'request' 事件，整个 webServer 进程退出（与上一条读文件失败是同一类后果）。
// 服务放在子进程里跑：修复前进程会直接崩，放在本进程里会把整个测试文件一起带走。
const startFaultyStatServer = async (t, root, { target, failure }) => {
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { startStaticServer } from ${JSON.stringify(scriptPath)};
    const original = fs.statSync;
    fs.statSync = (path, options) => {
      if (String(path) !== ${JSON.stringify(target)}) return original(path, options);
      if (${JSON.stringify(failure)} === 'ENOENT' && options?.throwIfNoEntry === false) return undefined;
      throw Object.assign(new Error(${JSON.stringify(failure)} + ': injected stat failure'), { code: ${JSON.stringify(failure)} });
    };
    syncBuiltinESMExports();
    const server = await startStaticServer({ root: ${JSON.stringify(root)}, port: 0, host: '127.0.0.1' });
    process.stdout.write(String(server.address().port) + '\\n');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.stdout.once('data', chunk => resolve(Number(String(chunk).trim())));
    child.once('exit', code => reject(new Error(`static server exited early (code ${code})`)));
  });
  return { port, child };
};

test('stat 阶段发现文件已被删除时按缺失路径回退 index.html，进程不退出', async t => {
  const root = await createFixture();
  const realRoot = await realpath(root);
  const { port } = await startFaultyStatServer(t, root, { target: join(realRoot, 'app.js'), failure: 'ENOENT' });

  const vanished = await rawGet(port, '/app.js');
  assert.equal(vanished.status, 200);
  assert.match(vanished.body, /<title>spa<\/title>/);

  const ok = await rawGet(port, '/assets/ok.txt');
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 'ok');
});

test('stat 阶段的其他错误返回 500，后续请求照常', async t => {
  const root = await createFixture();
  const realRoot = await realpath(root);
  const { port } = await startFaultyStatServer(t, root, { target: join(realRoot, 'app.js'), failure: 'EIO' });

  const failed = await rawGet(port, '/app.js');
  assert.equal(failed.status, 500);

  const ok = await rawGet(port, '/assets/ok.txt');
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 'ok');
});

test('HEAD 只回响应头，写操作一律 405', async () => {
  const root = await createFixture();
  const server = await startStaticServer({ root, port: 0, host: '127.0.0.1' });
  const { port } = server.address();
  try {
    const head = await rawRequest(port, '/app.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal(head.body, '');

    const post = await rawRequest(port, '/app.js', 'POST');
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, HEAD');
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
