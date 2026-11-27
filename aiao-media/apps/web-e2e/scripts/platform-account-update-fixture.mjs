import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildOfflineAssets } from '../../web/scripts/build-offline-assets.mjs';
import { importBackup, profile, verifyImageDownload } from '../src/local-first.helpers.ts';
import {
  createArtifactServer,
  defaultUpdateSeed,
  readReleaseArtifact,
  sha256,
  verifySavedSettings
} from './actual-release-update.mjs';

const application = resolve(import.meta.dirname, '../../web');
const config = { url: 'https://account-update.example.test', anonKey: 'sb_publishable_update_fixture' };
const configScript = value => `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify(value)};\n`;
const fingerprintPattern = /^app-config-[a-f0-9]{16}\.js$/;

async function resetConfigInput(root, value) {
  for (const name of await readdir(root)) if (fingerprintPattern.test(name)) await rm(resolve(root, name));
  const html = (await readFile(resolve(root, 'index.html'), 'utf8')).replace(
    /src="\/app-config(?:-[a-f0-9]{16})?\.js"/g,
    'src="/app-config.js"'
  );
  await writeFile(resolve(root, 'index.html'), html);
  await writeFile(resolve(root, 'app-config.js'), configScript(value));
  return Buffer.from(html);
}

async function legacyRelease(root) {
  const shell = await resetConfigInput(root, null);
  await writeFile(resolve(root, 'offline-shell.html'), shell);
  const worker = await readFile(resolve(root, 'offline-worker.js'), 'utf8');
  const match = /^const MANIFEST = (.+);\n/.exec(worker);
  assert.ok(match, '生产构建必须包含离线清单');
  const template = worker.slice(match[0].length);
  const assets = JSON.parse(match[1]).assets.filter(asset => !fingerprintPattern.test(asset.path.slice(1)));
  for (const asset of assets) {
    const bytes = await readFile(resolve(root, asset.path.slice(1)));
    asset.size = bytes.length;
    asset.sha256 = sha256(bytes);
  }
  const version = sha256(Buffer.from(JSON.stringify(assets) + template));
  await writeFile(
    resolve(root, 'offline-worker.js'),
    `const MANIFEST = ${JSON.stringify({ version, assets })};\n${template}`
  );
  await writeFile(resolve(root, 'offline-manifest.json'), JSON.stringify({ version }));
}

async function installed(page, artifact) {
  await page.evaluate(async () => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30000 })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          async version => (await caches.keys()).includes(`aiao-media-shell-v1-${version}`),
          artifact.version
        ),
      { timeout: 60000 }
    )
    .toBe(true);
}

async function releaseWorker(context, version) {
  for (const worker of context.serviceWorkers())
    if ((await worker.evaluate('typeof MANIFEST === "object" && MANIFEST.version').catch(() => null)) === version)
      return worker;
  throw new Error(`离线版本未找到：${version}`);
}

async function activated(worker) {
  await expect
    .poll(
      () =>
        worker.evaluate(async () => ({
          active: self.registration.active?.state,
          waiting: self.registration.waiting?.state ?? null,
          clients: (await self.clients.matchAll({ includeUncontrolled: true })).map(client => ({
            type: client.type,
            url: client.url
          }))
        })),
      { timeout: 30000 }
    )
    .toEqual({ active: 'activated', waiting: null, clients: [] });
}

async function storedContent(page, seed, id) {
  await verifySavedSettings(page, seed);
  await page.goto('/create');
  await expect(page.locator('[contenteditable=true]')).toContainText(seed.text);
  assert.equal(await profile(page), id);
  await page.goto('/images');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await verifyImageDownload(page, page.locator('.library-card'), seed.png);
  assert.equal(await page.evaluate(id => localStorage.getItem(`aiao-local-schema-${id}`), id), '1');
}

async function signupEntry(page) {
  await page.goto('/providers#sync');
  await expect(page.getByText('平台账号服务暂不可用', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: '注册 / 登录与同步设置', exact: true }).click();
  await page.getByRole('button', { name: '还没有账号？注册', exact: true }).click();
  await expect(page.getByRole('heading', { name: '注册账号', exact: true })).toBeVisible();
  await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
  await expect(page.getByLabel('密码', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '注册', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口', exact: true }).click();
}

async function verifyUpgrade(releases, server) {
  const browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: server.origin, serviceWorkers: 'allow', acceptDownloads: true });
  const blocked = [];
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === server.origin && ['GET', 'HEAD'].includes(request.method()))
      return route.continue();
    blocked.push({ origin: new URL(request.url()).origin, method: request.method() });
    return route.abort('blockedbyclient');
  });
  try {
    const seed = await defaultUpdateSeed();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto('/providers#sync');
    await installed(page, releases.a);
    await expect(page.getByText('平台账号服务暂不可用', { exact: false })).toBeVisible();
    const loaded = page.waitForEvent('load');
    await importBackup(page, seed.backup);
    await loaded;
    const id = await profile(page);
    assert.ok(id);
    await storedContent(page, seed, id);
    await page.goto('/providers#sync');
    const keeper = await context.newPage();
    await keeper.goto('/providers#sync');
    await installed(keeper, releases.a);
    const previous = await releaseWorker(context, releases.a.version);
    server.select('b');
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await expect
      .poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), {
        timeout: 60000
      })
      .toBe(true);
    const next = await releaseWorker(context, releases.b.version);
    const responses = new Map();
    page.on('response', response => responses.set(new URL(response.url()).pathname, response.fromServiceWorker()));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => page.evaluate(() => globalThis.__AIAO_SUPABASE_CONFIG__), { timeout: 10000 })
      .toEqual(config);
    const configPath = releases.b.entryScripts.find(path => fingerprintPattern.test(path.slice(1)));
    assert.ok(configPath, '新 HTML 必须引用带内容指纹的配置');
    assert.ok(!releases.a.manifest.assets.some(asset => asset.path === configPath));
    assert.equal(responses.get(configPath), false, '旧 Worker 未缓存的新配置必须来自网络');
    assert.equal(await page.evaluate(async () => (await fetch('/app-config.js')).text()), configScript(null));
    assert.equal(await keeper.evaluate(() => globalThis.__AIAO_SUPABASE_CONFIG__), null);
    assert.equal(await previous.evaluate('self.registration.active.state'), 'activated');
    assert.equal(await previous.evaluate('MANIFEST.version'), releases.a.version);
    assert.equal(await next.evaluate('self.registration.waiting.state'), 'installed');
    await signupEntry(page);
    await storedContent(page, seed, id);
    for (const opened of context.pages()) await opened.close();
    await activated(next);
    await context.setOffline(true);
    const offline = await context.newPage();
    offline.setDefaultTimeout(10000);
    const response = await offline.goto('/providers#sync');
    assert.equal(response?.fromServiceWorker(), true);
    assert.equal(
      await offline.evaluate(async () =>
        fetch(`/uncached-${crypto.randomUUID()}`).then(
          () => false,
          () => true
        )
      ),
      true
    );
    assert.deepEqual(await offline.evaluate(() => globalThis.__AIAO_SUPABASE_CONFIG__), config);
    const cached = await offline.evaluate(
      async ({ version, path }) => {
        const cache = await caches.open(`aiao-media-shell-v1-${version}`);
        return (await cache.match(path))?.text();
      },
      { version: releases.b.version, path: configPath }
    );
    assert.equal(sha256(Buffer.from(cached)), sha256(releases.b.files.get(configPath)));
    await signupEntry(offline);
    await storedContent(offline, seed, id);
    assert.deepEqual(blocked, [], '账号表单不应发起真实远端请求或写入');
    return {
      scope: 'local-platform-account-upgrade',
      oldWorkerRetainedDuringRefresh: true,
      stableConfigStillNullDuringRefresh: true,
      signupAvailableBeforeActivation: true,
      offlineSignupAvailableAfterActivation: true,
      sameWorkspace: true,
      exactImageBytesPreserved: true,
      imageSha256: sha256(seed.png),
      configPath,
      remoteRequests: blocked.length
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

const directory = await mkdtemp(resolve(tmpdir(), 'aiao-platform-account-update-'));
let server;
try {
  const source = process.env.AIAO_MEDIA_ACCOUNT_UPDATE_SOURCE || resolve(application, 'dist/browser');
  for (const name of ['a', 'b']) await cp(source, resolve(directory, name), { recursive: true });
  await legacyRelease(resolve(directory, 'a'));
  await resetConfigInput(resolve(directory, 'b'), config);
  await buildOfflineAssets(resolve(directory, 'b'));
  const releases = {
    a: await readReleaseArtifact(resolve(directory, 'a')),
    b: await readReleaseArtifact(resolve(directory, 'b'))
  };
  server = await createArtifactServer(releases);
  console.log(JSON.stringify(await verifyUpgrade(releases, server)));
} finally {
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}
