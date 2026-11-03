import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

// 对 Angular 生产构建做断网重开验证：ngsw 预取应用外壳与自托管资产，
// 首次加载后切离线重载，四类模板仍可编辑、运行与预览。
const root = resolve(import.meta.dirname, '..');
const servedDirectory = join(root, 'dist/browser');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm'
};
const walk = async directory =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(entry =>
        entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]
      )
    )
  ).flat();
const files = new Map((await walk(servedDirectory)).map(path => [path.slice(servedDirectory.length + 1), path]));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const target = files.get(pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!target) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Content-Type', mime[extname(target)] ?? 'application/octet-stream');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') console.error('Browser:', message.text());
});
page.on('requestfailed', request => console.error('Request failed:', request.url(), request.failure()?.errorText));
try {
  const traversal = await fetch(`http://127.0.0.1:${address.port}/%2e%2e%2fpackage.json`);
  assert.equal(traversal.status, 404);
  await page.goto(`http://127.0.0.1:${address.port}/?workbench-verify=1`);
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 90000 });
  const ids = {};
  for (const template of ['vanilla', 'react', 'vue', 'angular']) {
    console.log('Template:', template);
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`离线 ${template}`);
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill(template);
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.waitForFunction(
      template =>
        JSON.parse(window.workbench.session.state.files['workbench.project.json'] ?? '{}').template === template,
      template
    );
    await page.waitForFunction(() => !document.querySelector('[data-action=run]').disabled);
    await page.getByRole('button', { name: '运行', exact: true }).click();
    const frame = page.frameLocator('iframe[title="项目隔离预览"]');
    await frame.getByRole('button').click({ timeout: 60000 });
    await frame.getByRole('button').filter({ hasText: /1/ }).waitFor();
    ids[template] = await page.getByLabel('当前项目').inputValue();
  }
  await page.screenshot({ path: join(root, 'benchmarks/browser-workbench-ui.png'), fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  for (const template of ['vanilla', 'react', 'vue', 'angular']) {
    await page.getByLabel('当前项目').selectOption(ids[template]);
    await page.waitForFunction(id => window.workbench.session.state.projectId === id, ids[template]);
    await page.getByRole('button', { name: '运行', exact: true }).click();
    const frame = page.frameLocator('iframe[title="项目隔离预览"]');
    await frame.getByRole('button').click({ timeout: 60000 });
    await frame.getByRole('button').filter({ hasText: /1/ }).waitFor();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  const report = {
    browser: browser.version(),
    templates: Object.keys(ids),
    offlineReload: true,
    consoleErrors: errors
  };
  await mkdir(join(root, 'benchmarks'), { recursive: true });
  await writeFile(join(root, 'benchmarks/browser-workbench-offline.json'), JSON.stringify(report, null, 2));
  console.log('Offline reload and all four project previews passed');
} catch (cause) {
  console.error(
    await page
      .locator('.wb-panel-content')
      .innerText()
      .catch(() => '')
  );
  console.error(
    await page
      .locator('.wb-status')
      .innerText()
      .catch(() => '')
  );
  await page.screenshot({ path: join(root, 'benchmarks/browser-workbench-failure.png'), fullPage: true });
  throw cause;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
