/**
 * Playwright Firefox 跨站隔离 iframe 的最小诊断：静态 HTTP 桌面嵌入 HTTPS 替身时，
 * `page.reload` / `page.goto` 超时。问题与桌面代码无关，但不能推广为所有跨源 iframe 都不可操作。
 * 当前冒烟按生产部署使用同站、不同源的 HTTPS 桌面与 Aiao Code，原生输入、焦点和刷新均可验证。
 * 该脚本保留跨站反例，不属于正常冒烟的限制豁免；以后驱动修复时可重测。
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
    console.log(`reload ok（${Date.now() - startedAt} 毫秒）：跨站驱动缺口已不再复现，可重新评估夹具来源关系`);
  } catch (error) {
    console.log(`reload 失败（${error.message.split('\n')[0]}）：限制仍然存在`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.close();
  await rm(root, { recursive: true, force: true });
}
