import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import sharp from 'sharp';
import { importBackup, profile, verifyImageDownload } from '../src/local-first.helpers.ts';

const cachePrefix = 'aiao-media-shell-v1-';
const requireCheck = (condition, code) => {
  if (!condition) throw new Error(code);
};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function readFiles(root, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(resolve(root, `.${prefix}`), { withFileTypes: true })) {
    requireCheck(!entry.isSymbolicLink(), 'RELEASE_SYMLINK_FORBIDDEN');
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      const nested = await readFiles(root, path);
      for (const [name, bytes] of nested) files.set(name, bytes);
    } else if (entry.isFile()) files.set(path, await readFile(resolve(root, path.slice(1))));
  }
  return files;
}

function validAsset(asset) {
  return (
    asset &&
    typeof asset.path === 'string' &&
    /^\/[A-Za-z0-9_./-]+$/.test(asset.path) &&
    !asset.path.split('/').some(part => part === '..' || part === '.') &&
    !asset.path.startsWith('/api/') &&
    !asset.path.endsWith('.map') &&
    Number.isSafeInteger(asset.size) &&
    asset.size > 0 &&
    asset.size <= 16 * 1024 * 1024 &&
    /^[a-f0-9]{64}$/.test(asset.sha256)
  );
}

export async function readReleaseArtifact(directory) {
  const root = resolve(directory),
    files = await readFiles(root);
  const worker = files.get('/offline-worker.js')?.toString(),
    match = /^const MANIFEST = (.+);\n/.exec(worker ?? '');
  requireCheck(match, 'MISSING_RELEASE_MANIFEST');
  const manifest = JSON.parse(match[1]);
  requireCheck(Array.isArray(manifest.assets) && manifest.assets.length > 1, 'INVALID_RELEASE_MANIFEST');
  requireCheck(manifest.assets.every(validAsset), 'INVALID_RELEASE_ASSET');
  requireCheck(
    new Set(manifest.assets.map(asset => asset.path)).size === manifest.assets.length,
    'DUPLICATE_RELEASE_ASSET'
  );
  const template = worker.slice(match[0].length),
    version = sha256(Buffer.from(JSON.stringify(manifest.assets) + template));
  requireCheck(manifest.version === version, 'RELEASE_VERSION_MISMATCH');
  const publicManifest = files.get('/offline-manifest.json');
  requireCheck(publicManifest && JSON.parse(publicManifest.toString()).version === version, 'PUBLIC_MANIFEST_MISMATCH');
  requireCheck(
    /^globalThis\.__AIAO_SUPABASE_CONFIG__ = null;\s*$/.test(files.get('/app-config.js')?.toString() ?? ''),
    'LOCAL_ONLY_RELEASE_REQUIRED'
  );
  for (const asset of manifest.assets) {
    const bytes = files.get(asset.path);
    requireCheck(bytes && bytes.length === asset.size && sha256(bytes) === asset.sha256, 'RELEASE_RESOURCE_MISMATCH');
  }
  const shell = files.get('/offline-shell.html'),
    index = files.get('/index.html');
  requireCheck(shell && index && shell.equals(index), 'RELEASE_SHELL_MISMATCH');
  const entryScripts = [...shell.toString().matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => {
    const url = new URL(match[1], 'https://artifact.example.test');
    requireCheck(url.origin === 'https://artifact.example.test' && !url.search, 'INVALID_RELEASE_ENTRY_SCRIPT');
    return url.pathname;
  });
  requireCheck(entryScripts.length > 0 && entryScripts.every(path => files.has(path)), 'MISSING_RELEASE_ENTRY_SCRIPT');
  return { root, files, manifest, version, manifestSha256: sha256(publicManifest), entryScripts };
}

export function artifactPair(a, b) {
  requireCheck(a.version !== b.version && a.manifestSha256 !== b.manifestSha256, 'DISTINCT_STATIC_RELEASES_REQUIRED');
  requireCheck(JSON.stringify(a.entryScripts) !== JSON.stringify(b.entryScripts), 'DISTINCT_ENTRY_SCRIPTS_REQUIRED');
  return { a, b };
}

const contentTypes = {
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function globalHeaders(artifact) {
  return Object.fromEntries(
    (artifact.files.get('/_headers')?.toString() ?? '')
      .split('\n')
      .slice(1)
      .filter(line => line.startsWith('  '))
      .map(line => {
        const colon = line.indexOf(':');
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      })
  );
}

export async function createArtifactServer(releases) {
  let current = 'a';
  const headers = { a: globalHeaders(releases.a), b: globalHeaders(releases.b) };
  const server = createServer((request, response) => {
    if (request.method !== 'GET') return response.writeHead(405).end();
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = ['/', '/create', '/images', '/providers'].includes(path) ? '/index.html' : path;
    const bytes = releases[current].files.get(file);
    if (!bytes) return response.writeHead(404).end();
    response.writeHead(200, {
      ...headers[current],
      'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(bytes);
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    select(name) {
      requireCheck(name === 'a' || name === 'b', 'INVALID_RELEASE_SELECTION');
      current = name;
    },
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

export function createUpdateSeed(png) {
  const provider = {
    id: '00000000-0000-4000-8000-000000000011',
    name: '真实产物验收供应商',
    baseUrl: 'https://release-update.example.test/v1',
    model: 'artifact-fixture',
    mode: 'direct',
    rememberKey: false
  };
  const text = '真实产物更新前的草稿',
    timestamp = '2026-10-25T00:00:00.000Z';
  const job = {
    id: '00000000-0000-4000-8000-000000000012',
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerRevision: 1,
      providerInstanceId: provider.id,
      modelId: provider.model,
      prompt: '通过备份导入的合法 PNG'
    },
    status: 'completed',
    createdAt: timestamp,
    updatedAt: timestamp,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
  const backup = Buffer.from(
    JSON.stringify({
      format: 'aiao-local-backup',
      version: 1,
      createdAt: timestamp,
      providers: [provider],
      defaultId: provider.id,
      draft: {
        fields: [],
        values: {},
        document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
      },
      tasks: [],
      images: [{ job, base64: png.toString('base64'), sha256: sha256(png) }]
    })
  );
  return { backup, png, text, provider };
}

export async function defaultUpdateSeed() {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#8a9c62' } })
    .png()
    .toBuffer();
  return createUpdateSeed(png);
}

export function knownBlockedTelemetry(value) {
  const url = new URL(value);
  return (
    url.protocol === 'https:' &&
    url.host === 'static.cloudflareinsights.com' &&
    /^\/beacon\.min\.js(?:\/[a-zA-Z0-9]+)?$/.test(url.pathname) &&
    !url.username &&
    !url.password
  );
}

export function classifyEntryScripts(values, origin, artifact) {
  const local = [],
    telemetry = [];
  for (const value of values) {
    const url = new URL(value, origin);
    if (url.origin === origin && !url.search && !url.hash) {
      const runtime =
        ['/prompt-runtime/editor.js', '/prompt-runtime/catalog.js'].includes(url.pathname) &&
        artifact.manifest?.assets.some(asset => asset.path === url.pathname);
      if (artifact.entryScripts.includes(url.pathname)) local.push(url.pathname);
      else requireCheck(runtime, 'UNEXPECTED_RELEASE_SCRIPT');
    } else if (knownBlockedTelemetry(url.href)) telemetry.push(url.pathname);
    else throw new Error('UNEXPECTED_RELEASE_SCRIPT');
  }
  if (JSON.stringify(local) !== JSON.stringify(artifact.entryScripts))
    throw new Error('LOADED_RELEASE_MISMATCH', { cause: { observed: local, expected: artifact.entryScripts } });
  return telemetry.length;
}

async function assertEntryScripts(page, artifact, network) {
  const actual = await page.locator('script[src]').evaluateAll(scripts => scripts.map(script => script.src));
  const telemetry = classifyEntryScripts(actual, new URL(page.url()).origin, artifact);
  if (network) network.telemetryScriptElements += telemetry;
}

async function cacheState(page, artifact) {
  return page.evaluate(
    async ({ version, assets, prefix }) => {
      const names = (await caches.keys()).filter(name => name.startsWith(prefix));
      const registration = await navigator.serviceWorker.getRegistration();
      if (!names.includes(prefix + version)) return { matching: 0, names, waiting: Boolean(registration?.waiting) };
      const cache = await caches.open(prefix + version);
      let matching = 0;
      for (const asset of assets) {
        const response = await cache.match(asset.path);
        if (!response) continue;
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');
        if (bytes.byteLength === asset.size && digest === asset.sha256) matching++;
      }
      const paths = (await cache.keys()).map(request => new URL(request.url).pathname);
      return {
        matching,
        names,
        waiting: Boolean(registration?.waiting),
        controlled: Boolean(navigator.serviceWorker.controller),
        onlyPublicAssets: paths.every(path => assets.some(asset => asset.path === path))
      };
    },
    { version: artifact.version, assets: artifact.manifest.assets, prefix: cachePrefix }
  );
}

async function ready(page, artifact, network) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(
      async () => {
        const state = await cacheState(page, artifact);
        return (
          state.controlled &&
          !state.waiting &&
          state.names.length === 1 &&
          state.matching === artifact.manifest.assets.length &&
          state.onlyPublicAssets
        );
      },
      { timeout: 60000 }
    )
    .toBe(true);
  await assertEntryScripts(page, artifact, network);
}

async function verifyOffline(context, page, artifact, seed, id, network) {
  await context.setOffline(true);
  try {
    const unavailable = await page.evaluate(async () => {
      try {
        await fetch(`/offline-manifest.json?actual-update-uncached=${crypto.randomUUID()}`, { cache: 'no-store' });
        return false;
      } catch {
        return true;
      }
    });
    requireCheck(unavailable, 'BROWSER_NOT_ACTUALLY_OFFLINE');
    for (const path of ['/', '/providers', '/create', '/images']) {
      const response = await page.goto(path);
      requireCheck(response?.status() === 200 && response.fromServiceWorker(), 'OFFLINE_SHELL_NOT_USED');
      await assertEntryScripts(page, artifact, network);
      await expect(page.getByRole('link', { name: 'Aiao Images 首页' })).toBeVisible();
      requireCheck((await profile(page)) === id, 'WORKSPACE_CHANGED');
      if (path === '/providers') {
        await expect(page.getByRole('heading', { name: `${seed.provider.name} · 默认`, exact: true })).toBeVisible();
        await page.getByRole('button', { name: '编辑 / 填写 Key', exact: true }).click();
        await expect(page.getByLabel('HTTPS Base URL')).toHaveValue(seed.provider.baseUrl);
        await expect(page.getByLabel('图片模型 ID')).toHaveValue(seed.provider.model);
        await expect(page.getByLabel('请求通道')).toHaveValue(seed.provider.mode);
        await expect(page.getByLabel('在此设备记住 Key')).not.toBeChecked();
        await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
      }
      if (path === '/create') await expect(page.locator('[contenteditable=true]')).toContainText(seed.text);
      if (path === '/images') await verifyImageDownload(page, page.locator('.library-card'), seed.png);
    }
    const marker = await page.evaluate(id => localStorage.getItem(`aiao-local-schema-${id}`), id);
    requireCheck(marker === '1', 'SCHEMA_MARKER_CHANGED');
  } finally {
    await context.setOffline(false);
  }
}

export async function verifyPublishedBuild(origin, artifact, signal) {
  for (const path of ['/offline-manifest.json', '/offline-worker.js', '/app-config.js']) {
    const response = await fetch(new URL(path, origin), {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])])
    });
    requireCheck(response.ok, 'PUBLIC_RELEASE_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer());
    requireCheck(bytes.length < 1024 * 1024 && bytes.equals(artifact.files.get(path)), 'PUBLIC_RELEASE_MISMATCH');
  }
}

async function transition(context, page, previous, next, switchRelease, origin, network, signal) {
  await switchRelease();
  await verifyPublishedBuild(origin, next, signal);
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await expect.poll(async () => (await cacheState(page, next)).waiting, { timeout: 60000 }).toBe(true);
  await assertEntryScripts(page, previous, network);
  const waiting = await cacheState(page, next);
  requireCheck(waiting.matching === next.manifest.assets.length, 'WAITING_RELEASE_INCOMPLETE');
  let installing;
  for (const worker of context.serviceWorkers()) {
    if ((await worker.evaluate('typeof MANIFEST === "object" && MANIFEST.version').catch(() => null)) === next.version)
      installing = worker;
  }
  requireCheck(installing, 'WAITING_WORKER_NOT_FOUND');
  for (const openPage of context.pages()) await openPage.close();
  await expect
    .poll(
      () =>
        installing.evaluate('self.registration.active?.state === "activated" && self.registration.waiting === null'),
      { timeout: 30000 }
    )
    .toBe(true);
  const opened = await context.newPage();
  await opened.goto('/create', { waitUntil: 'domcontentloaded' });
  await ready(opened, next, network);
  return opened;
}

export async function runActualReleaseUpdate({ origin, buildA, buildB, switchBuild, seed, signal }) {
  const releases = artifactPair(buildA, buildB);
  seed ??= await defaultUpdateSeed();
  requireCheck(!signal?.aborted, 'FORMAL_UPDATE_TIMEOUT');
  await verifyPublishedBuild(origin, buildA, signal);
  const browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'allow', acceptDownloads: true });
  const abortBrowser = () => {
    void browser.close().catch(() => undefined);
  };
  signal?.addEventListener('abort', abortBrowser, { once: true });
  const forbidden = [];
  const network = { telemetryScriptElements: 0, blockedTelemetry: 0 };
  await context.route('**/*', route => {
    const request = route.request(),
      url = new URL(request.url());
    const allowed =
      url.origin === origin &&
      ['GET', 'HEAD'].includes(request.method()) &&
      !/^\/(?:api\/(?:relay|provider-probe)|auth\/)/.test(url.pathname);
    if (allowed) return route.continue();
    if (request.method() === 'GET' && knownBlockedTelemetry(url.href)) {
      network.blockedTelemetry++;
      return route.abort('blockedbyclient');
    }
    forbidden.push('NON_LOCAL_READ_REQUEST');
    return route.abort('blockedbyclient');
  });
  try {
    requireCheck(!signal?.aborted, 'FORMAL_UPDATE_TIMEOUT');
    let page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('/providers');
    await ready(page, releases.a, network);
    const loaded = page.waitForEvent('load');
    await importBackup(page, seed.backup);
    await loaded;
    await expect(page.getByRole('heading', { name: `${seed.provider.name} · 默认`, exact: true })).toBeVisible();
    const id = await profile(page);
    requireCheck(typeof id === 'string', 'MISSING_IMPORTED_WORKSPACE');
    await verifyOffline(context, page, releases.a, seed, id, network);
    page = await transition(context, page, releases.a, releases.b, () => switchBuild('b'), origin, network, signal);
    await verifyOffline(context, page, releases.b, seed, id, network);
    page = await transition(context, page, releases.b, releases.a, () => switchBuild('a'), origin, network, signal);
    await verifyOffline(context, page, releases.a, seed, id, network);
    requireCheck(forbidden.length === 0, 'UNEXPECTED_NETWORK_REQUEST');
    return {
      scope: origin === 'https://media.aiao.io' ? 'formal-real-artifact-update' : 'local-real-artifact-preflight',
      releases: Object.fromEntries(
        Object.entries(releases).map(([name, release]) => [
          name,
          {
            version: release.version,
            manifestSha256: release.manifestSha256,
            entryScripts: release.entryScripts
          }
        ])
      ),
      sequence: ['a', 'b', 'a'],
      sameWorkspace: true,
      marker: '1',
      imageSha256: sha256(seed.png),
      exactDownloadAfterEachTransition: true,
      offlineRoutesAfterEachTransition: 4,
      generationRequests: 0,
      seedImage: 'legal-png-imported-through-product-backup',
      network,
      injectedBuildMarkers: false
    };
  } finally {
    signal?.removeEventListener('abort', abortBrowser);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
