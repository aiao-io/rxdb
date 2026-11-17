import assert from 'node:assert/strict';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bindDomain, checkAssets, ensureProject, prepareAssets } from './cloudflare-pages.mjs';

const credentials = { accountId: 'test-account', apiToken: 'test-token' };
const project = { name: 'rxdb', production_branch: 'main', subdomain: 'rxdb-test.pages.dev' };

function apiMock(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    const { status = 200, success = true, result, errors = [] } = replies.shift();
    return Response.json({ success, result, errors }, { status });
  });
  return calls;
}

test('已有 Pages 项目复用实际子域，不写入生产分支配置', async t => {
  const calls = apiMock(t, [{ result: project }]);
  assert.deepEqual(await ensureProject(credentials), project);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
});

test('只在项目不存在时创建 main 生产项目', async t => {
  const calls = apiMock(t, [{ status: 404, success: false }, { result: project }]);
  assert.deepEqual(await ensureProject(credentials), project);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body), { name: 'rxdb', production_branch: 'main' });
});

test('鉴权失败不创建项目', async t => {
  const calls = apiMock(t, [{ status: 403, success: false, errors: [{ message: 'Forbidden' }] }]);
  await assert.rejects(ensureProject(credentials), /403.*Forbidden/);
  assert.equal(calls.length, 1);
});

test('HTTP 成功但 API 失败时阻止部署', async t => {
  apiMock(t, [{ success: false, errors: [{ message: 'API rejected' }] }]);
  await assert.rejects(ensureProject(credentials), /API rejected/);
});

test('生产分支不是 main 时拒绝发布', async t => {
  apiMock(t, [{ result: { ...project, production_branch: 'release' } }]);
  await assert.rejects(ensureProject(credentials), /production_branch.*main/);
});

test('已关联域名返回实际验证状态，不重复创建', async t => {
  const domain = { name: 'rxdb.aiao.io', status: 'pending' };
  const calls = apiMock(t, [{ result: domain }]);
  assert.deepEqual(await bindDomain(credentials), domain);
  assert.equal(calls.length, 1);
});

test('域名不存在时关联到 Pages 项目', async t => {
  const domain = { name: 'rxdb.aiao.io', status: 'pending' };
  const calls = apiMock(t, [{ status: 404, success: false }, { result: domain }]);
  assert.deepEqual(await bindDomain(credentials), domain);
  assert.ok(calls[1].url.endsWith('/pages/projects/rxdb/domains'));
  assert.deepEqual(JSON.parse(calls[1].body), { name: 'rxdb.aiao.io' });
});

async function assetFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'rxdb-pages-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of [
    'index.html',
    '404.html',
    '_headers',
    '_redirects',
    'demo/angular/index.html',
    'demo/react/index.html',
    'demo/vue/index.html',
    'demo/angular.html',
    'demo/react.html',
    'demo/vue.html',
    'benchmarks-app/index.html'
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'fixture');
  }
  return root;
}

test('检查完整静态站及三端演示产物', async t => {
  const root = await assetFixture(t);
  assert.equal((await checkAssets(root)).files, 11);
});

test('缺少演示产物时阻止上传', async t => {
  const root = await assetFixture(t);
  await rm(path.join(root, 'demo/vue/index.html'));
  await assert.rejects(checkAssets(root), /demo\/vue\/index.html/);
});

test('单文件超过 Pages 25 MiB 限制时阻止上传', async t => {
  const root = await assetFixture(t);
  const file = await open(path.join(root, 'search-index.json'), 'w');
  await file.truncate(25 * 1024 * 1024 + 1);
  await file.close();
  await assert.rejects(checkAssets(root), /search-index.json.*25 MiB/);
});

test('为 Pages 深链生成独立入口，并在 SPA 规则前保留 JS、WASM 和 service worker', async t => {
  const root = await assetFixture(t);
  const assets = ['demo/react/assets/app.js', 'demo/angular/runtime.wasm', 'demo/vue/sw.js'];
  for (const file of assets) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), file);
  }
  await prepareAssets(root);
  const redirects = await readFile(path.join(root, '_redirects'), 'utf8');
  for (const file of assets) {
    const rule = `/${file} /${file} 200`;
    assert.ok(redirects.includes(rule));
    assert.ok(redirects.indexOf(rule) < redirects.indexOf('/demo/angular/*'));
    assert.equal(await readFile(path.join(root, file), 'utf8'), file);
  }
  for (const framework of ['angular', 'react', 'vue']) {
    assert.equal(await readFile(path.join(root, `demo/${framework}.html`), 'utf8'), 'fixture');
    assert.match(redirects, new RegExp(`/demo/${framework}/\\*\\s+/demo/${framework}\\s+200`));
  }
  await prepareAssets(root);
  assert.equal(await readFile(path.join(root, '_redirects'), 'utf8'), redirects);
});

test('demo 资源超过 Pages 静态路由上限时阻止发布', async t => {
  const root = await assetFixture(t);
  await Promise.all(Array.from({ length: 2001 }, (_, i) => writeFile(path.join(root, `demo/react/${i}.js`), '')));
  await assert.rejects(prepareAssets(root), /2000/);
});
