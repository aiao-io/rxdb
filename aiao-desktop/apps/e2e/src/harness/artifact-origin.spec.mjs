import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { firefox } from 'playwright';

import { startArtifactServer } from '../fixtures/artifact-server.mjs';
import { installArtifactOrigin } from './artifact-origin.mjs';

const APP_ORIGIN = 'https://code.aiao.invalid';

test('Firefox 同站 HTTPS 夹具保留跨源隔离、键盘输入、独立存储和刷新后的数据', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-artifact-origin-'));
  await writeFile(
    join(root, 'index.html'),
    `<div id="host"></div><script src="/asset.js?check=relative"></script><script>
      document.querySelector('#host').attachShadow({mode:'open'}).innerHTML =
        '<iframe src="${APP_ORIGIN}" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" allow="cross-origin-isolated"></iframe>';
    </script>`
  );
  await writeFile(join(root, 'asset.js'), 'window.assetLoaded = true;');
  const server = await startArtifactServer({ root });
  const browser = await firefox.launch();
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.abort());
    const artifact = await installArtifactOrigin(context, server.origin, APP_ORIGIN);
    await context.route(`${APP_ORIGIN}/**`, route =>
      route.fulfill({
        headers: {
          'Content-Type': 'text/html',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        },
        body: '<textarea id="input"></textarea>'
      })
    );
    const page = await context.newPage();
    await page.goto(artifact.origin);
    const input = page.frameLocator('iframe').locator('#input');
    await input.click();
    await page.keyboard.type('cross-origin');
    assert.equal(await input.inputValue(), 'cross-origin');
    assert.equal(await page.evaluate(() => crossOriginIsolated && window.assetLoaded), true);
    const child = page.frames().find(frame => frame.url().startsWith(APP_ORIGIN));
    assert.equal(await child.evaluate(() => crossOriginIsolated), true);
    await page.evaluate(() => localStorage.setItem('artifact-origin-check', 'parent'));
    assert.equal(await child.evaluate(() => localStorage.getItem('artifact-origin-check')), null);
    assert.notEqual(artifact.origin, APP_ORIGIN);
    assert.equal(artifact.resourceUrl(`${artifact.origin}/asset.js?check=relative`), `${server.origin}/asset.js?check=relative`);
    assert.throws(() => artifact.resourceUrl('https://external.invalid/'), /请求不属于被测桌面/);
    await page.reload({ timeout: 5_000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('artifact-origin-check')), 'parent');
  } finally {
    await browser.close();
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});
