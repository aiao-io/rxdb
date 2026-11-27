import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, request } from 'playwright';
import { expect } from 'playwright/test';

const url = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ?? 'http://localhost:8788/';
const origin = new URL(url).origin;
const appUrl = new URL('/?workbench-verify=1', origin).href;
const redirectUri = new URL('/redirect', origin).href;
const requireServiceWorker = new URL(url).protocol === 'https:';
const directory = resolve(import.meta.dirname, '../benchmarks');
const reportPath = resolve(directory, 'browser-workbench-github-oauth-vscode.json');
const report = {
  format: 'aiao.browser-workbench.github-oauth',
  version: 1,
  host: 'vscode',
  url: origin,
  status: 'failed',
  checks: []
};
let browser;
let context;
let api;
let clientId;
let proxy;
let cleanupError;

function redact(message) {
  return [proxy?.username, proxy?.password]
    .filter(Boolean)
    .reduce((value, credential) => value.replaceAll(credential, '[redacted]'), message);
}

function environmentProxy() {
  const address =
    (new URL(url).protocol === 'https:' ? (process.env.HTTPS_PROXY ?? process.env.https_proxy) : undefined) ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy;
  if (!address) return undefined;
  try {
    const parsed = new URL(address);
    return {
      server: `${parsed.protocol}//${parsed.host}`,
      username: decodeURIComponent(parsed.username) || undefined,
      password: decodeURIComponent(parsed.password) || undefined,
      bypass: ['localhost', '127.0.0.1', '[::1]', process.env.NO_PROXY ?? process.env.no_proxy]
        .filter(Boolean)
        .join(',')
    };
  } catch {
    throw new Error('代理环境变量必须包含合法代理 URL');
  }
}

async function step(name, operation) {
  process.stdout.write(`GitHub OAuth: ${name}\n`);
  const start = performance.now();
  await operation();
  report.checks.push({ name, milliseconds: Math.round(performance.now() - start) });
}

await mkdir(directory, { recursive: true });
try {
  proxy = environmentProxy();
  api = await request.newContext({
    baseURL: origin,
    proxy,
    timeout: 30000,
    extraHTTPHeaders: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
  });
  await step('公开配置返回真实 Client ID，响应不含 secret', async () => {
    const response = await api.get('/api/github-token');
    assert.equal(response.status(), 200, '公开配置接口应返回 200');
    assert.match(response.headers()['content-type'] ?? '', /application\/json/i, '公开配置接口应返回 JSON');
    const config = await response.json();
    assert.ok(config && typeof config === 'object', '公开配置应为对象');
    assert.deepEqual(Object.keys(config), ['clientId'], '公开配置只能包含 clientId');
    assert.equal(typeof config.clientId, 'string', 'Client ID 应为字符串');
    assert.ok(config.clientId.trim(), 'Client ID 不能为空');
    assert.notEqual(config.clientId, 'pending-aiao-vscode-oauth-app', 'Client ID 不能是占位值');
    clientId = config.clientId;
  });

  await step('HTTP 回调端点缺少参数时返回 400', async () => {
    const response = await api.get(redirectUri);
    assert.equal(response.status(), 400, '回调端点不能返回 SPA 页面');
  });

  browser = await chromium.launch({ headless: true, proxy });
  context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, serviceWorkers: 'allow' });
  context.setDefaultTimeout(30000);
  report.browser = browser.version();
  await context.route('https://github.com/login/oauth/authorize**', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>OAuth navigation verified</title><p>OAuth navigation verified</p>'
    })
  );
  const page = await context.newPage();

  await step('工作台就绪，生产 Service Worker 已接管页面', async () => {
    await page.goto(appUrl);
    await page.waitForFunction(() => window.ready === true, undefined, { timeout: 60000 });
    if (requireServiceWorker) {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 90000 });
    }
    report.serviceWorkerControlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
    report.serviceWorkerRequired = requireServiceWorker;
  });

  await step('点击账户登录，授权 URL 使用服务端 Client ID 与同源回调', async () => {
    await page.getByRole('button', { name: 'GitHub 帐户', exact: true }).click();
    const dialog = page.locator('dialog.wb-github-login');
    await expect(dialog).toBeVisible();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      dialog.getByRole('button', { name: '使用 GitHub 账号登录', exact: true }).click()
    ]);
    await popup.waitForURL('https://github.com/login/oauth/authorize**');
    const authorization = new URL(popup.url());
    assert.equal(authorization.searchParams.get('client_id'), clientId, '授权 URL 的 Client ID 应与公开配置一致');
    assert.equal(authorization.searchParams.get('redirect_uri'), redirectUri, '授权回调应为同源 /redirect');
    await popup.close();
  });

  await step('仓库列表正确聚合两页，绝对 Link 地址保持 GitHub API origin', async () => {
    const requests = [];
    const apiRoute = /^https:\/\/api\.github\.com(?:\/|$)/;
    await context.route(apiRoute, async route => {
      const current = route.request();
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Link',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      };
      if (current.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      requests.push({ url: current.url(), hasAuthorization: Boolean(current.headers()['authorization']) });
      const number = new URL(current.url()).searchParams.get('page') === '2' ? 2 : 1;
      if (number === 1) headers.Link = '<https://api.github.com/user/repos?page=2>; rel="next"';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify([{ full_name: `probe/page-${number}`, private: false }])
      });
    });
    try {
      const names = await page.evaluate(async () =>
        (await window.github.api.listMyRepositories()).map(repo => repo.fullName)
      );
      assert.deepEqual(names, ['probe/page-1', 'probe/page-2'], '仓库列表应聚合两页');
      assert.equal(requests.length, 2, '仓库列表应恰好请求两页');
      assert.ok(
        requests.every(item => new URL(item.url).origin === 'https://api.github.com'),
        '两页请求都应使用正确 API origin'
      );
      assert.ok(
        requests.every(item => !item.hasAuthorization),
        '分页探针不能使用真实 token'
      );
    } finally {
      await context.unroute(apiRoute);
    }
  });

  await step('同一浏览器上下文导航回调，Service Worker 不吞请求', async () => {
    const callbackPage = await context.newPage();
    const response = await callbackPage.goto(redirectUri);
    assert.ok(response, '回调导航应返回 HTTP 响应');
    assert.equal(response.status(), 400, 'Service Worker 不能把回调请求替换成 SPA 页面');
    await callbackPage.close();
  });
  report.status = 'passed';
  console.log(`通过：${report.checks.length} 步；报告 ${reportPath}`);
} catch (cause) {
  report.error = redact(cause instanceof Error ? cause.message : String(cause));
  if (cause instanceof Error) {
    cause.message = report.error;
    if (cause.stack) cause.stack = redact(cause.stack);
  }
  throw cause;
} finally {
  const cleanup = await Promise.allSettled([context?.close(), api?.dispose()]);
  cleanupError = cleanup.find(result => result.status === 'rejected')?.reason;
  await browser?.close();
  report.generatedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
}
if (cleanupError) throw cleanupError;
