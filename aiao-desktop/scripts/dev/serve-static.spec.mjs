import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createStaticServer, staticHeaders } from '../../apps/web/tools/serve-static.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../../apps/web/tools/serve-static.mjs');
const SITE = { 'index.html': '<app-root></app-root>', 'main.js': 'console.log(1)', 'assets/a.wasm': 'wasm' };

async function site(t, files = SITE) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-serve-static-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  return root;
}

/** 起在随机端口上，返回地址；用例结束自动关闭。 */
async function listen(t, options) {
  const server = createStaticServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('托管产物目录：文件原样返回并带托管响应头；无扩展名回退 index.html，缺失的文件 404，越出目录 403', async t => {
  const origin = await listen(t, { root: await site(t) });
  const main = await fetch(`${origin}/main.js`);
  assert.equal(main.status, 200);
  assert.match(main.headers.get('content-type') ?? '', /text\/javascript/);
  assert.equal(await main.text(), 'console.log(1)');
  assert.equal((await fetch(`${origin}/assets/a.wasm`)).headers.get('content-type'), 'application/wasm');
  for (const [name, value] of Object.entries(staticHeaders)) assert.equal(main.headers.get(name), value, name);

  assert.equal(await (await fetch(`${origin}/some/route`)).text(), '<app-root></app-root>');
  assert.equal((await fetch(`${origin}/missing.png`)).status, 404);
  assert.equal((await fetch(`${origin}/..%2f..%2fetc%2fpasswd`)).status, 403);
});

test('托管响应头与生产一致：跨源隔离加防嵌入（D-05、D-16）', () => {
  assert.deepEqual(staticHeaders, {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN'
  });
});

test('畸形地址（/%zz）回 400，服务器不退出，后面的请求照常处理', async t => {
  const origin = await listen(t, { root: await site(t) });
  const bad = await fetch(`${origin}/%zz`);
  assert.equal(bad.status, 400);
  for (const [name, value] of Object.entries(staticHeaders)) assert.equal(bad.headers.get(name), value, name);
  assert.equal((await fetch(`${origin}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${origin}/main.js`)).status, 200);
});

test('打开文件失败（还没写响应头）：回 500，服务器不退出，错误交给 onError', async t => {
  const errors = [];
  const origin = await listen(t, {
    root: await site(t),
    openFile: async file => {
      if (file.endsWith('main.js')) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      return open(file);
    },
    onError: error => errors.push(error.code)
  });
  assert.equal((await fetch(`${origin}/main.js`)).status, 500);
  assert.deepEqual(errors, ['EACCES']);
  assert.equal((await fetch(`${origin}/`)).status, 200);
});

test('读到一半出错（响应头已写）：销毁连接，客户端读不完正文，服务器不退出', async t => {
  const errors = [];
  const origin = await listen(t, {
    root: await site(t),
    openFile: async file => {
      if (!file.endsWith('main.js')) return open(file);
      const stream = new Readable({
        read() {
          this.push('partial');
          this.destroy(new Error('disk error'));
        }
      });
      return { createReadStream: () => stream };
    },
    onError: error => errors.push(error.message)
  });
  await assert.rejects(async () => (await fetch(`${origin}/main.js`)).text());
  assert.deepEqual(errors, ['disk error']);
  assert.equal(await (await fetch(`${origin}/`)).text(), '<app-root></app-root>');
});

test('作为脚本运行时校验端口；被 import 时不监听任何端口', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [SCRIPT, '--port=70000']), error => {
    assert.notEqual(error.code, 0);
    return /Invalid port: 70000/.test(error.stderr);
  });
});

test(
  '经符号链接启动同样作为脚本运行（不会因路径不同悄悄什么都不做）',
  { skip: process.platform === 'win32' },
  async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aiao-desktop-serve-static-link-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const link = path.join(directory, 'serve-static-link.mjs');
    await symlink(SCRIPT, link);
    await assert.rejects(promisify(execFile)(process.execPath, [link, '--port=70000']), error =>
      /Invalid port: 70000/.test(error.stderr)
    );
  }
);
