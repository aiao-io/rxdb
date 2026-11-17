import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readUserData, userDataIntact, writeUserData } from '../harness/user-data.mjs';

async function updatedBuild(distRoot) {
  const root = await mkdtemp(join(tmpdir(), 'aiao-desktop-pwa-'));
  const index = (await readFile(join(distRoot, 'index.html'), 'utf8')).replace(
    '</head>',
    '<meta name="pwa-test-version" content="updated" /></head>'
  );
  const config = JSON.parse(await readFile(join(distRoot, 'ngsw.json'), 'utf8'));
  config.hashTable['/index.html'] = createHash('sha1').update(index).digest('hex');
  for (const name of await readdir(distRoot)) {
    if (name === 'index.html' || name === 'ngsw.json') continue;
    await symlink(join(distRoot, name), join(root, name));
  }
  await writeFile(join(root, 'index.html'), index);
  await writeFile(join(root, 'ngsw.json'), JSON.stringify(config));
  return root;
}

async function waitForWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 60_000 });
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return new URL(registration.active.scriptURL).pathname === '/ngsw-worker.js';
  });
}

async function cachedPaths(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async name => (await caches.open(name)).keys()));
    return requests.flat().map(request => new URL(request.url).pathname);
  });
}

/** 正式构建上的 PWA 验收（ADESK-US-009）：真实 Service Worker、断网与同源版本切换。 */
export const pwa = {
  name: 'pwa',
  engines: ['chromium'],
  description: 'PWA：安装条件、离线启动与本地数据、按需缓存大资源、版本更新不打断当前桌面',
  context: { serviceWorkers: 'allow' },
  keys: [
    'pwa.manifest',
    'pwa.installable',
    'pwa.workerControlsDesktop',
    'pwa.desktopPrecached',
    'pwa.wallpapersPrecached',
    'pwa.wallpapersOffline',
    'pwa.noWallpaperNetwork',
    'pwa.largeResourcesLazy',
    'pwa.lazyResourceOffline',
    'pwa.offlineReload',
    'pwa.offlineFirstAppLaunch',
    'pwa.offlineDataIntact',
    'pwa.offlineIsolation',
    'pwa.onlineRecovery',
    'pwa.updateWaitsForReload',
    'pwa.updatedAfterReload',
    'pwa.dataSurvivesUpdate'
  ],
  async run(session, server) {
    const { page, context, origin, distRoot, helpers } = session;
    const response = await context.request.get(`${origin}/manifest.webmanifest`);
    assert.equal(response.status(), 200, '正式构建缺少 PWA manifest');
    assert.match(response.headers()['content-type'], /application\/manifest\+json/);
    const manifest = await response.json();
    const requests = [];
    const remoteWallpapers = [];
    context.on('request', request => {
      if (new URL(request.url()).hostname === 'images.unsplash.com') remoteWallpapers.push(request.url());
    });
    context.on('request', request => requests.push(new URL(request.url()).pathname));
    await session.openDesktop();
    const linkedManifest = await page.locator('link[rel="manifest"]').getAttribute('href');
    const icons = await page.evaluate(
      async icons =>
        Promise.all(
          icons.map(async icon => {
            const image = new Image();
            image.src = icon.src;
            await image.decode();
            return `${image.naturalWidth}x${image.naturalHeight}` === icon.sizes;
          })
        ),
      manifest.icons
    );
    const result = {
      manifest:
        manifest.name === 'Aiao Desktop' &&
        manifest.display === 'standalone' &&
        manifest.id === '/' &&
        manifest.start_url === '/' &&
        manifest.scope === '/' &&
        linkedManifest === 'manifest.webmanifest' &&
        icons.every(Boolean) &&
        manifest.icons.some(icon => icon.sizes === '192x192') &&
        manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'),
      workerControlsDesktop: await waitForWorker(page)
    };
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    result.installable = installabilityErrors.length === 0;
    assert.deepEqual(installabilityErrors, [], '浏览器判定 PWA 不可安装');
    await cdp.detach();
    const config = JSON.parse(await readFile(join(distRoot, 'ngsw.json'), 'utf8'));
    const paths = await cachedPaths(page);
    const shell = config.assetGroups.find(group => group.name === 'desktop');
    result.desktopPrecached =
      shell.urls.every(url => paths.includes(url)) &&
      paths.includes('/sqlite-wasm/wa-sqlite.wasm') &&
      paths.includes('/sqlite-wasm/wa-sqlite-async.wasm');
    const wallpapers = config.assetGroups.find(group => group.name === 'wallpapers');
    result.wallpapersPrecached = wallpapers.urls.length === 13 && wallpapers.urls.every(url => paths.includes(url));
    result.largeResourcesLazy = ![...paths, ...requests].some(
      path => path.startsWith('/vendor/') || path.startsWith('/assets/')
    );
    const lazyResource = config.assetGroups
      .find(group => group.name === 'on-demand')
      .urls.find(url => url.startsWith('/assets/') && url.endsWith('.js'));
    assert.ok(lazyResource, '缺少可验证的按需资源');
    const onlineAsset = await page.evaluate(async url => (await fetch(url)).text(), lazyResource);

    await writeUserData(page, helpers);
    await context.setOffline(true);
    result.lazyResourceOffline = await page.evaluate(
      async ({ url, expected }) => (await (await fetch(url)).text()) === expected,
      { url: lazyResource, expected: onlineAsset }
    );
    const offlineResponse = await page.reload({ waitUntil: 'load' });
    await helpers.restored();
    result.offlineReload = offlineResponse.fromServiceWorker() && (await page.locator('#dock').isVisible());
    result.offlineIsolation = await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer === 'function');
    await helpers.closeAll();
    await page.locator('#dock .di[data-app="calculator"]').click();
    const calculator = helpers.win('calculator');
    for (const key of ['ac', 'n1', 'add', 'n2', 'eq']) await calculator.locator(`.ck[data-k="${key}"]`).click();
    result.offlineFirstAppLaunch = await helpers.appears(
      calculator.locator('.calc-out').filter({ hasText: /^\s*3\s*$/ }),
      5_000
    );
    result.offlineDataIntact = userDataIntact(await readUserData(page, helpers));
    await helpers.launch('System Settings');
    const settings = helpers.win('settings');
    await settings.locator('[data-sec="wallpaper"]').click();
    const choices = settings.locator('[data-wp]');
    await choices.first().waitFor();
    assert.equal(await choices.count(), 6);
    const keys = await choices.evaluateAll(nodes => nodes.map(node => node.dataset.wp));
    for (const key of keys) {
      await settings.locator(`[data-wp="${key}"]`).click();
      await page.waitForFunction(key => {
        const layer = document.querySelector(`#wall .photo.on[data-full][data-key="${key}"]`);
        return (
          layer &&
          getComputedStyle(layer).opacity === '1' &&
          getComputedStyle(layer).backgroundImage.includes(`/wallpapers/${key}.jpg`)
        );
      }, key);
    }
    result.wallpapersOffline = await choices.evaluateAll(async nodes => {
      const decoded = await Promise.all(
        nodes.map(async node => {
          const url = getComputedStyle(node).backgroundImage.slice(5, -2);
          const image = new Image();
          image.src = url;
          await image.decode();
          return image.naturalWidth === 640;
        })
      );
      return decoded.every(Boolean);
    });
    result.noWallpaperNetwork = remoteWallpapers.length === 0;
    await page.screenshot({ path: '/tmp/aiao-wallpapers-offline.png' });
    await context.setOffline(false);
    result.onlineRecovery = await page.evaluate(
      async () => (await fetch('manifest.webmanifest?ngsw-bypass=true', { cache: 'no-store' })).ok
    );

    const updated = await updatedBuild(distRoot);
    try {
      server.switchTo(updated);
      await page.evaluate(() => {
        window.pwaPageIdentity = 'original';
        window.pwaUpdateReady = false;
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data.type === 'VERSION_READY') window.pwaUpdateReady = true;
        });
      });
      const probe = await session.openPage();
      await probe.goto(`${origin}/?boot=0`);
      await page.waitForFunction(() => window.pwaUpdateReady, undefined, { timeout: 60_000 });
      await probe.close();
      result.updateWaitsForReload = await page.evaluate(
        () => window.pwaPageIdentity === 'original' && !document.querySelector('meta[name="pwa-test-version"]')
      );
      await page.reload({ waitUntil: 'load' });
      await helpers.restored();
      result.updatedAfterReload =
        (await page.locator('meta[name="pwa-test-version"]').getAttribute('content')) === 'updated';
      result.dataSurvivesUpdate = userDataIntact(await readUserData(page, helpers));
    } finally {
      server.switchTo(distRoot);
      await rm(updated, { recursive: true, force: true });
    }
    return { pwa: result };
  }
};
