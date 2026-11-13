/**
 * Playwright 的 Firefox 限制的最小复现（ADESK-US-005）：页面里有一个由 `route.fulfill` 供应文档的跨源 iframe 时，
 * 这个页面无法刷新或导航（`page.reload` / `page.goto` 超时），与桌面代码无关——只有一个静态页面、一个 iframe。
 * `baseline/limitations-firefox.json` 里「带替身 iframe 的检查组」的限制引用它；Playwright 修好之后这个脚本会打印
 * `reload ok`，说明那些限制已经过期，要从清单里删掉。
 *
 *   node src/fixtures/limitation-firefox-iframe.mjs
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startArtifactServer } from './artifact-server.mjs';
import { engineOf } from './engines.mjs';

const root = await mkdtemp(join(tmpdir(), 'limitation-firefox-iframe-'));
await writeFile(
  join(root, 'index.html'),
  '<!doctype html><title>host</title><iframe src="https://child.invalid/app" style="width:300px;height:200px"></iframe>'
);
const server = await startArtifactServer({ root });
const browser = await engineOf('firefox').launch();
try {
  const context = await browser.newContext();
  await context.route('https://child.invalid/**', route =>
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      body: '<!doctype html><title>child</title><p>hello</p>'
    })
  );
  const page = await context.newPage();
  await page.goto(server.origin, { waitUntil: 'load' });
  const startedAt = Date.now();
  try {
    await page.reload({ waitUntil: 'load', timeout: 15_000 });
    console.log(
      `reload ok（${Date.now() - startedAt} 毫秒）：这个限制已经不存在，请更新 baseline/limitations-firefox.json`
    );
  } catch (error) {
    console.log(`reload 失败（${error.message.split('\n')[0]}）：限制仍然存在`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
  await rm(root, { recursive: true, force: true });
}
