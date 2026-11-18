import assert from 'node:assert/strict';
import { mkdir, mkdtemp, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  bindDomain,
  checkAssets,
  cleanPreviewDeployments,
  createClosedPreview,
  ensureProject,
  prepareAssets
} from './cloudflare-pages.mjs';

const credentials = { accountId: 'test-account', apiToken: 'test-token' };
const apiBase = 'https://api.cloudflare.com/client/v4/accounts/test-account/pages/projects';
const project = { name: 'rxdb', production_branch: 'main', subdomain: 'rxdb-test.pages.dev' };

function apiMock(t, replies) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    const { status = 200, success = true, result, errors = [], result_info, endpoint = '/rxdb' } = replies.shift();
    assert.equal(url, `${apiBase}${endpoint}`);
    return Response.json({ success, result, errors, result_info }, { status });
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
  const calls = apiMock(t, [
    { status: 404, success: false },
    { result: project, endpoint: '' }
  ]);
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
  const calls = apiMock(t, [{ result: domain, endpoint: '/rxdb/domains/rxdb.aiao.io' }]);
  assert.deepEqual(await bindDomain(credentials), domain);
  assert.equal(calls.length, 1);
});

test('域名不存在时关联到 Pages 项目', async t => {
  const domain = { name: 'rxdb.aiao.io', status: 'pending' };
  const calls = apiMock(t, [
    { status: 404, success: false, endpoint: '/rxdb/domains/rxdb.aiao.io' },
    { result: domain, endpoint: '/rxdb/domains' }
  ]);
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

test('并发创建项目冲突后重新读取并校验项目', async t => {
  const calls = apiMock(t, [
    { status: 404, success: false },
    { status: 409, success: false, endpoint: '' },
    { result: project }
  ]);
  assert.deepEqual(await ensureProject(credentials), project);
  assert.deepEqual(
    calls.map(call => call.method),
    ['GET', 'POST', 'GET']
  );
});

test('Cloudflare 重名错误也重新读取项目，不能接受错误生产分支', async t => {
  apiMock(t, [
    { status: 404, success: false },
    { status: 400, success: false, endpoint: '', errors: [{ code: 8000002 }] },
    { result: { ...project, production_branch: 'release' } }
  ]);
  await assert.rejects(ensureProject(credentials), /production_branch.*main/);
});

test('创建项目鉴权失败不吞错误也不重试', async t => {
  const calls = apiMock(t, [
    { status: 404, success: false },
    { status: 403, success: false, endpoint: '', errors: [{ message: 'Forbidden' }] }
  ]);
  await assert.rejects(ensureProject(credentials), /403.*Forbidden/);
  assert.equal(calls.length, 2);
});

test('项目子域包含换行时拒绝写入工作流输出', async t => {
  apiMock(t, [{ result: { ...project, subdomain: 'rxdb.pages.dev\ninjected=true' } }]);
  await assert.rejects(ensureProject(credentials), /subdomain/);
});

function deployment(n, { branch = 'pr-224', environment = 'preview', status = 'success' } = {}) {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    environment,
    deployment_trigger: { metadata: { branch } },
    created_on: new Date(2026, 10, n).toISOString(),
    latest_stage: { status },
    url: `https://build-${n}.rxdb.pages.dev`
  };
}

const listEndpoint = page => `/rxdb/deployments?env=preview&per_page=25&page=${page}`;
const deleteEndpoint = n => `/rxdb/deployments/${deployment(n).id}?force=true`;

test('发布后保留本次与上次成功预览，先收集所有分页再删除', async t => {
  const calls = apiMock(t, [
    {
      endpoint: listEndpoint(1),
      result: [deployment(4), deployment(3, { status: 'failure' })],
      result_info: { total_pages: 2 }
    },
    {
      endpoint: listEndpoint(2),
      result: [
        deployment(2),
        deployment(1),
        deployment(5, { branch: 'pr-225' }),
        deployment(6, { environment: 'production' })
      ],
      result_info: { total_pages: 2 }
    },
    { endpoint: deleteEndpoint(3), result: null },
    { endpoint: deleteEndpoint(1), result: null }
  ]);
  assert.deepEqual(await cleanPreviewDeployments(credentials, { branch: 'pr-224', keepUrl: deployment(4).url }), [
    deployment(3).id,
    deployment(1).id
  ]);
  assert.deepEqual(
    calls.map(call => call.method),
    ['GET', 'GET', 'DELETE', 'DELETE']
  );
});

test('关闭 PR 保留关闭提示页，只删除该分支旧预览，已删除部署可重试', async t => {
  const calls = apiMock(t, [
    {
      endpoint: listEndpoint(1),
      result: [
        deployment(6),
        deployment(2),
        deployment(1),
        deployment(3, { branch: 'pr-225' }),
        deployment(4, { branch: 'main' }),
        deployment(5, { environment: 'production' })
      ]
    },
    { endpoint: deleteEndpoint(2), result: null },
    { endpoint: deleteEndpoint(1), status: 404, success: false }
  ]);
  assert.equal(
    (await cleanPreviewDeployments(credentials, { branch: 'pr-224', keepUrl: deployment(6).url, keepPrevious: false }))
      .length,
    2
  );
  assert.equal(calls.length, 3);
});

test('找不到本次成功部署时不删除任何预览', async t => {
  const calls = apiMock(t, [{ endpoint: listEndpoint(1), result: [deployment(1)] }]);
  await assert.rejects(
    cleanPreviewDeployments(credentials, { branch: 'pr-224', keepUrl: deployment(2).url }),
    /本次成功部署/
  );
  assert.equal(calls.length, 1);
});

test('清理拒绝 main 和畸形 PR 分支', async () => {
  for (const branch of ['main', 'pr-0', 'pr-224/../main', 'pr-224\n']) {
    await assert.rejects(cleanPreviewDeployments(credentials, { branch }), /pr-/);
  }
});

test('删除失败明确报错', async t => {
  apiMock(t, [
    { endpoint: listEndpoint(1), result: [deployment(2), deployment(1)] },
    { endpoint: deleteEndpoint(1), status: 403, success: false, errors: [{ message: 'Forbidden' }] }
  ]);
  await assert.rejects(
    cleanPreviewDeployments(credentials, { branch: 'pr-224', keepUrl: deployment(2).url, keepPrevious: false }),
    /403.*Forbidden/
  );
});

test('没有要保留的部署时不允许清理', async () => {
  await assert.rejects(cleanPreviewDeployments(credentials, { branch: 'pr-224' }), /必须指定/);
});

test('关闭提示页只包含 404 和禁止缓存、索引的响应头', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'rxdb-closed-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createClosedPreview(root, '224');
  assert.deepEqual((await readdir(root)).sort(), ['404.html', '_headers']);
  assert.match(await readFile(path.join(root, '404.html'), 'utf8'), /PR #224 预览已关闭/);
  const headers = await readFile(path.join(root, '_headers'), 'utf8');
  assert.match(headers, /Cache-Control: no-store/);
  assert.match(headers, /X-Robots-Tag: noindex/);
  await assert.rejects(createClosedPreview(root, '<script>'), /PR 编号/);
});

test('Pages 每页请求 25 条，无分页元数据时读完满页后继续下一页', async t => {
  const calls = apiMock(t, [
    {
      endpoint: listEndpoint(1),
      result: Array.from({ length: 25 }, (_, i) => deployment(i + 3, { branch: 'pr-225' }))
    },
    { endpoint: listEndpoint(2), result: [deployment(2), deployment(1)] },
    { endpoint: deleteEndpoint(1), result: null }
  ]);
  assert.deepEqual(
    await cleanPreviewDeployments(credentials, { branch: 'pr-224', keepUrl: deployment(2).url, keepPrevious: false }),
    [deployment(1).id]
  );
  assert.deepEqual(
    calls.map(call => call.method),
    ['GET', 'GET', 'DELETE']
  );
});
