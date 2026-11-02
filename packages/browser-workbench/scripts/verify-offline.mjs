import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
const root = resolve(import.meta.dirname, '..');
const fixtureDirectory = join(root, '.offline-fixture');
const fixture = await build({
  entryPoints: { index: join(root, 'dist/index.js') },
  absWorkingDir: root,
  bundle: true,
  write: false,
  format: 'esm',
  splitting: true,
  platform: 'browser',
  outdir: fixtureDirectory,
  logLevel: 'silent'
});
const modules = new Map(fixture.outputFiles.map(file => [file.path, file.contents]));
const mime = {
  '.js': 'text/javascript',
  '.html': 'text/html',
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
const urls = [...modules.keys()].map(path => `/module/${path.slice(fixtureDirectory.length + 1)}`);
const assets = (await walk(join(root, 'dist/assets')))
  .filter(path => /\.(js|wasm|json|css|ttf|woff2)$/.test(path))
  .map(path => `/browser-workbench-assets/${path.slice(join(root, 'dist/assets').length + 1)}`);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Aiao Code</title></head><body style="margin:0;height:100vh"><div id="root" style="height:100%"></div><script type="module">
import { mountWorkbench } from '/module/index.js';
await navigator.serviceWorker.register('/sw.js');
await navigator.serviceWorker.ready;
window.workbench = mountWorkbench(document.getElementById('root'), {}, (host, initial) => {
 const input = document.createElement('textarea');input.value=initial.value;input.style='width:100%;height:100%;background:#1f1f1f;color:#ddd;border:0;padding:15px;font:13px monospace';input.setAttribute('aria-label','项目源码');host.append(input);input.oninput=()=>initial.onChange(input.value);return {update(value){if(input.value!==value)input.value=value},dispose(){input.remove()}};
});
await window.workbench.ready;
window.ready = true;
</script></body></html>`;
const worker = `const name='workbench-verified-offline-v1';addEventListener('install',e=>{e.waitUntil(caches.open(name).then(c=>c.addAll(${JSON.stringify(['/', ...urls, ...assets])})).then(()=>skipWaiting()))});addEventListener('activate',e=>e.waitUntil(clients.claim()));addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)))});`;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', 'no-cache');
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
      return;
    }
    if (path === '/sw.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(worker);
      return;
    }
    const prefix =
      path.startsWith('/module/') ? '/module/'
      : path.startsWith('/browser-workbench-assets/') ? '/browser-workbench-assets/'
      : null;
    if (!prefix) {
      response.writeHead(404).end();
      return;
    }
    const directory = prefix === '/module/' ? fixtureDirectory : resolve(root, 'dist/assets');
    const target = resolve(directory, decodeURIComponent(path.slice(prefix.length)));
    if (!target.startsWith(directory + sep)) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Content-Type', mime[extname(target)] ?? 'text/plain');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.end(prefix === '/module/' ? modules.get(target) : await readFile(target));
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
  for (const prefix of ['/module/', '/browser-workbench-assets/']) {
    const denied = await fetch(`http://127.0.0.1:${address.port}${prefix}%2e%2e%2fpackage.json`);
    assert.equal(denied.status, 403);
  }
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.waitForFunction(() => window.ready === true, { timeout: 60000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
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
  await page.screenshot({ path: join(root, '../../benchmarks/reports/browser-workbench-ui.png'), fullPage: true });
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
  await mkdir(join(root, '../../benchmarks/reports'), { recursive: true });
  await writeFile(
    join(root, '../../benchmarks/reports/browser-workbench-offline.json'),
    JSON.stringify(report, null, 2)
  );
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
  await page.screenshot({ path: join(root, '../../benchmarks/reports/browser-workbench-failure.png'), fullPage: true });
  throw cause;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
