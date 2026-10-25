import { chromium, expect, request } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const formalOrigin = 'https://media.aiao.io';
const routes = ['/', '/create', '/images', '/providers'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => {
  if (!condition) throw new Error(code);
};

export function publicSmokeSettings(env) {
  check(!env.DEBUG && !env.PWDEBUG, 'SMOKE_DEBUG_DISABLED_REQUIRED');
  check((env.AIAO_MEDIA_SMOKE_ORIGIN ?? formalOrigin) === formalOrigin, 'SMOKE_FORMAL_ORIGIN_REQUIRED');
  check(
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.AIAO_MEDIA_SMOKE_RELEASE ?? ''),
    'SMOKE_RELEASE_REQUIRED'
  );
  check(/^[a-f0-9]{64}$/.test(env.AIAO_MEDIA_SMOKE_MANIFEST_SHA256 ?? ''), 'SMOKE_MANIFEST_REQUIRED');
  return {
    origin: formalOrigin,
    release: env.AIAO_MEDIA_SMOKE_RELEASE,
    manifestSha256: env.AIAO_MEDIA_SMOKE_MANIFEST_SHA256,
    fixture: false
  };
}

export function allowedPublicRequest(origin, address, method) {
  try {
    const url = new URL(address);
    if (url.origin !== origin || !['GET', 'HEAD'].includes(method)) return false;
    if (/^\/api\//.test(url.pathname)) return ['/api/templates', '/api/provider-policies'].includes(url.pathname);
    return !/\/(?:images\/generations|auth\/v1)(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

function validAsset(asset) {
  if (!asset || typeof asset.path !== 'string' || !asset.path.startsWith('/') || asset.path.startsWith('//'))
    return false;
  const url = new URL(asset.path, formalOrigin);
  return (
    url.origin === formalOrigin &&
    url.pathname === asset.path &&
    !url.search &&
    !url.hash &&
    !asset.path.startsWith('/api/') &&
    allowedPublicRequest(formalOrigin, url.href, 'GET') &&
    Number.isSafeInteger(asset.size) &&
    asset.size > 0 &&
    asset.size <= 16 * 1024 * 1024 &&
    /^[a-f0-9]{64}$/.test(asset.sha256 ?? '')
  );
}

export function parsePublicBuild(manifestBytes, workerBytes, expectedSha256) {
  check(manifestBytes.length < 1024 * 1024 && workerBytes.length < 1024 * 1024, 'SMOKE_MANIFEST_INVALID');
  check(digest(manifestBytes) === expectedSha256, 'SMOKE_MANIFEST_CHANGED');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const embedded = /^const MANIFEST = (.+);\n/.exec(workerBytes.toString('utf8'));
  check(embedded, 'SMOKE_WORKER_MANIFEST_MISSING');
  const build = JSON.parse(embedded[1]);
  check(/^[a-f0-9]{64}$/.test(build.version) && build.version === manifest.version, 'SMOKE_WORKER_MANIFEST_CHANGED');
  check(Array.isArray(build.assets) && build.assets.length > 0 && build.assets.length <= 20000, 'SMOKE_ASSETS_INVALID');
  check(build.assets.every(validAsset), 'SMOKE_ASSETS_INVALID');
  check(new Set(build.assets.map(asset => asset.path)).size === build.assets.length, 'SMOKE_ASSETS_INVALID');
  const workerTemplate = workerBytes.toString('utf8').slice(embedded[0].length);
  check(digest(JSON.stringify(build.assets) + workerTemplate) === build.version, 'SMOKE_WORKER_CONTENT_CHANGED');
  check(
    build.assets.some(asset => asset.path === '/offline-shell.html'),
    'SMOKE_OFFLINE_SHELL_MISSING'
  );
  return build;
}

async function readPublicBuild(settings) {
  const client = await request.newContext({ baseURL: settings.origin });
  try {
    const responses = await Promise.all(
      ['/offline-manifest.json', '/offline-worker.js', '/app-config.js'].map(path =>
        client.get(path, { maxRedirects: 0, timeout: 30000 })
      )
    );
    check(
      responses.every(response => response.ok()),
      'SMOKE_PUBLIC_ARTIFACT_UNAVAILABLE'
    );
    const [manifest, worker, config] = await Promise.all(responses.map(response => response.body()));
    check(
      config.toString('utf8').trim() === 'globalThis.__AIAO_SUPABASE_CONFIG__ = null;',
      'SMOKE_ACCOUNTS_NOT_DISABLED'
    );
    return parsePublicBuild(manifest, worker, settings.manifestSha256);
  } finally {
    await client.dispose();
  }
}

async function inspectCache(page, build) {
  return page.evaluate(async manifest => {
    const cacheName = `aiao-media-shell-v1-${manifest.version}`;
    const names = (await caches.keys()).filter(name => name.startsWith('aiao-media-shell-v1-'));
    const registration = await navigator.serviceWorker.getRegistration();
    if (!names.includes(cacheName)) return { matching: 0, expected: manifest.assets.length, active: false };
    const cache = await caches.open(cacheName);
    let matching = 0;
    for (const asset of manifest.assets) {
      const response = await cache.match(asset.path);
      if (!response?.ok) continue;
      const bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
      if (bytes.byteLength === asset.size && hash === asset.sha256) matching++;
    }
    return {
      matching,
      expected: manifest.assets.length,
      active: registration?.active?.state === 'activated' && Boolean(navigator.serviceWorker.controller),
      expectedScript: new URL(registration.active.scriptURL).pathname === '/offline-worker.js',
      waiting: Boolean(registration.waiting),
      cacheVersions: names.length
    };
  }, build);
}

async function visibleShell(page) {
  await expect(page.getByRole('link', { name: 'Aiao Images 首页', exact: true })).toBeVisible({ timeout: 30000 });
  check(await page.evaluate(() => globalThis.__AIAO_SUPABASE_CONFIG__ === null), 'SMOKE_ACCOUNTS_NOT_DISABLED');
}

async function navigateOnline(page, path) {
  const direct = await page.request.get(path, { maxRedirects: 0, timeout: 30000 });
  check(direct.status() === 200, 'SMOKE_ROUTE_HTTP_UNAVAILABLE');
  const directCsp = direct.headers()['content-security-policy'];
  check(directCsp?.includes("default-src 'self'") && directCsp.includes("script-src 'self'"), 'SMOKE_CSP_MISSING');
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  check(response?.status() === 200, 'SMOKE_ROUTE_UNAVAILABLE');
  const csp = await response.headerValue('content-security-policy');
  check(csp?.includes("default-src 'self'") && csp.includes("script-src 'self'"), 'SMOKE_CSP_MISSING');
  await visibleShell(page);
  return { path, status: response.status(), directHttpStatus: direct.status(), csp: true };
}

async function verifyBrowser(settings, build, evidence) {
  const browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({
    baseURL: settings.origin,
    serviceWorkers: 'allow',
    viewport: { width: 1440, height: 1100 }
  });
  const network = { unsafeRequests: 0, blockedTelemetry: 0, pageErrors: 0, generationRequests: 0, mutationRequests: 0 };
  evidence.network = network;
  context.on('page', page => page.on('pageerror', () => network.pageErrors++));
  context.on('request', outgoing => {
    if (!['GET', 'HEAD'].includes(outgoing.method())) network.mutationRequests++;
    if (/\/(?:api\/relay|images\/generations)(?:\/|$)/.test(new URL(outgoing.url()).pathname))
      network.generationRequests++;
  });
  await context.route('**/*', async route => {
    const outgoing = route.request();
    if (allowedPublicRequest(settings.origin, outgoing.url(), outgoing.method())) return route.continue();
    if (new URL(outgoing.url()).hostname === 'static.cloudflareinsights.com' && outgoing.method() === 'GET')
      network.blockedTelemetry++;
    else network.unsafeRequests++;
    return route.abort('blockedbyclient');
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    evidence.stage = 'online-routes';
    evidence.onlineRoutes = [];
    for (const path of routes) evidence.onlineRoutes.push(await navigateOnline(page, path));
    evidence.stage = 'draft-refresh';
    await navigateOnline(page, '/create');
    const draft = `正式隔离烟测草稿 ${randomUUID()}`;
    await page.locator('[contenteditable=true]').fill(draft);
    await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible({ timeout: 30000 });
    const profile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
    check(Boolean(profile), 'SMOKE_PROFILE_MISSING');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[contenteditable=true]')).toContainText(draft, { timeout: 30000 });
    evidence.draftSurvivesRefresh = true;
    evidence.stage = 'service-worker-install';
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return registration?.active?.state === 'activated' && Boolean(navigator.serviceWorker.controller);
          }),
        { timeout: 90000 }
      )
      .toBe(true);
    evidence.cache = await inspectCache(page, build);
    check(
      evidence.cache.active && evidence.cache.expectedScript && !evidence.cache.waiting,
      'SMOKE_SERVICE_WORKER_INCOHERENT'
    );
    check(
      evidence.cache.matching === evidence.cache.expected && evidence.cache.cacheVersions === 1,
      'SMOKE_CACHE_INTEGRITY_FAILED'
    );
    evidence.stage = 'offline-network-proof';
    await context.setOffline(true);
    evidence.offlineNetworkFails = await page.evaluate(async () => {
      try {
        await fetch(`/offline-manifest.json?smoke-uncached=${crypto.randomUUID()}`, {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error'
        });
        return false;
      } catch {
        return true;
      }
    });
    check(evidence.offlineNetworkFails, 'SMOKE_NETWORK_NOT_OFFLINE');
    for (const previous of context.pages()) await previous.close();
    evidence.stage = 'offline-cold-pages';
    evidence.offlineColdRoutes = [];
    for (const path of ['/create', '/providers', '/images', '/']) {
      const cold = await context.newPage();
      const response = await cold.goto(path, { waitUntil: 'domcontentloaded' });
      check(response?.status() === 200 && response.fromServiceWorker(), 'SMOKE_COLD_START_NOT_FROM_CACHE');
      await visibleShell(cold);
      check(
        (await cold.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))) === profile,
        'SMOKE_PROFILE_CHANGED'
      );
      if (path === '/create')
        await expect(cold.locator('[contenteditable=true]')).toContainText(draft, { timeout: 30000 });
      evidence.offlineColdRoutes.push({
        path,
        status: response.status(),
        fromServiceWorker: true,
        profilePreserved: true
      });
      await cold.close();
    }
    check(
      network.unsafeRequests === 0 &&
        network.pageErrors === 0 &&
        network.generationRequests === 0 &&
        network.mutationRequests === 0,
      'SMOKE_UNEXPECTED_ACTIVITY'
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

export async function runPublicSmoke(settings) {
  const evidence = {
    origin: settings.origin,
    release: settings.release,
    manifestSha256: settings.manifestSha256,
    fixture: settings.fixture,
    releaseSource: 'caller-reviewed-deployment-receipt',
    coldStartScope: 'new-documents-in-one-isolated-browser-context',
    checkedAt: new Date().toISOString(),
    stage: 'public-artifacts',
    upgradeVerified: false,
    rollbackVerified: false,
    generatedImages: 0
  };
  try {
    const build = await readPublicBuild(settings);
    evidence.offlineVersion = build.version;
    await verifyBrowser(settings, build, evidence);
    evidence.stage = 'final-manifest';
    await readPublicBuild(settings);
    return { ...evidence, stage: 'verified', passed: true, finishedAt: new Date().toISOString() };
  } catch (error) {
    const code =
      /^SMOKE_[A-Z_]+$/.test(error?.message) ? error.message
      : error?.name === 'TimeoutError' ? 'SMOKE_TIMEOUT'
      : 'SMOKE_BROWSER_FAILED';
    return { ...evidence, passed: false, code, finishedAt: new Date().toISOString() };
  }
}

async function fixture() {
  const source = resolve(import.meta.dirname, '../../aiao-media/dist/browser');
  const parent = resolve(import.meta.dirname, '../tmp');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(resolve(parent, 'public-origin-static-'));
  await cp(source, root, { recursive: true });
  const config = Buffer.from('globalThis.__AIAO_SUPABASE_CONFIG__ = null;\n');
  await writeFile(resolve(root, 'app-config.js'), config);
  const original = parsePublicBuild(
    await readFile(resolve(source, 'offline-manifest.json')),
    await readFile(resolve(source, 'offline-worker.js')),
    digest(await readFile(resolve(source, 'offline-manifest.json')))
  );
  const assets = original.assets.map(asset =>
    asset.path === '/app-config.js' ? { ...asset, size: config.length, sha256: digest(config) } : asset
  );
  const workerTemplate = await readFile(
    resolve(import.meta.dirname, '../../aiao-media/scripts/offline-worker.js'),
    'utf8'
  );
  const version = digest(JSON.stringify(assets) + workerTemplate);
  await writeFile(
    resolve(root, 'offline-worker.js'),
    `const MANIFEST = ${JSON.stringify({ version, assets })};\n${workerTemplate}`
  );
  await writeFile(resolve(root, 'offline-manifest.json'), JSON.stringify({ version }));
  const { default: worker } = await import('../../aiao-media/deploy/local-first-worker.mjs');
  const template = await readFile(resolve(root, '_headers'), 'utf8');
  const headersFor = path => {
    let matches = false;
    const headers = {};
    for (const line of template.split('\n')) {
      if (!line.startsWith('  ')) matches = line === '/*' || line === path;
      if (!matches || !line.startsWith('  ')) continue;
      const colon = line.indexOf(':');
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    return headers;
  };
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp'
  };
  const env = {
    ASSETS: {
      async fetch(incoming) {
        const path = new URL(incoming.url).pathname;
        const file = resolve(root, `.${extname(path) ? path : '/index.html'}`);
        if (relative(root, file).startsWith('..')) return new Response(null, { status: 404 });
        try {
          return new Response(await readFile(file), {
            headers: { ...headersFor(path), 'content-type': mime[extname(file)] ?? 'application/octet-stream' }
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      }
    }
  };
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (!['GET', 'HEAD'].includes(incoming.method)) return outgoing.writeHead(405).end();
      const response = await worker.fetch(
        new Request(new URL(incoming.url, origin), { method: incoming.method, headers: incoming.headers }),
        env
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end();
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    settings: {
      origin,
      release: 'local-production-worker-fixture',
      manifestSha256: digest(await readFile(resolve(root, 'offline-manifest.json'))),
      fixture: true
    },
    close: async () => {
      await new Promise(resolveClose => server.close(resolveClose));
      await rm(root, { recursive: true, force: true });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let local;
  try {
    check(
      process.argv.slice(2).every(argument => argument === '--fixture'),
      'SMOKE_ARGUMENT_INVALID'
    );
    if (process.argv.includes('--fixture')) local = await fixture();
    const settings = local?.settings ?? publicSmokeSettings(process.env);
    const evidence = await runPublicSmoke(settings);
    const directory = resolve(import.meta.dirname, '../tmp/public-origin-smoke');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const file = resolve(directory, `${Date.now()}-${settings.fixture ? 'fixture' : settings.release}.json`);
    await writeFile(file, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(
      JSON.stringify({
        passed: evidence.passed,
        fixture: settings.fixture,
        stage: evidence.stage,
        code: evidence.code,
        generatedImages: 0,
        upgradeVerified: false,
        rollbackVerified: false,
        evidence: file
      })
    );
    if (!evidence.passed) process.exitCode = 1;
  } catch (error) {
    const code = /^SMOKE_[A-Z_]+$/.test(error?.message) ? error.message : 'SMOKE_SETUP_FAILED';
    console.error(JSON.stringify({ passed: false, code, generatedImages: 0 }));
    process.exitCode = 1;
  } finally {
    await local?.close();
  }
}
