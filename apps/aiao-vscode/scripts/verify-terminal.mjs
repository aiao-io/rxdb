import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

async function serveProduction() {
  const directory = resolve(import.meta.dirname, '../dist/browser');
  const files = new Map();
  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else files.set(file.slice(directory.length), file);
    }
  };
  await walk(directory);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = files.get(path === '/' ? '/index.html' : path);
      if (!file) return void response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/?workbench-verify=1` };
}

const production = process.argv.includes('--production') ? await serveProduction() : undefined;
const url =
  production?.url ?? process.argv.find(value => value.startsWith('--url='))?.slice(6) ?? 'http://localhost:4320/';
const reportPath = resolve(import.meta.dirname, '../benchmarks/browser-workbench-terminal.json');
const report = { format: 'aiao.workbench.terminal', version: 1, url, status: 'failed', checks: [], errors: [] };
report.cancelledRequests = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
report.consoleErrors = [];
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000));
});
page.on('requestfailed', request => {
  const failure = request.failure()?.errorText;
  const entry = `${request.url()}: ${failure}`;
  if (failure === 'net::ERR_ABORTED') report.cancelledRequests.push(entry);
  else report.errors.push(entry);
});
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const terminal = root.locator('[data-log="terminal"]');
const screen = terminal.locator('.xterm-rows');
const input = terminal.getByRole('textbox', { name: '终端输入', exact: true });
const command = async text => {
  await input.focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const checked = name => {
  report.checks.push(name);
  console.log(`Passed: ${name}`);
};

async function createProject(name) {
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('vanilla');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(name);
}

try {
  report.browser = browser.version();
  await page.goto(url);
  await expect(root).toBeVisible();
  const overlay = page.locator('vite-error-overlay');
  if (await overlay.count())
    throw new Error(
      await overlay.evaluate(
        element => element.shadowRoot?.querySelector('.message')?.textContent ?? element.textContent
      )
    );
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await createProject('Terminal verification');
  await root.locator('.wb-title-actions [data-action="terminal"]').click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120000 });
  await command('node -e "console.log(\'AIAO_NODE_OK\',process.version)"');
  await expect(screen).toContainText(/AIAO_NODE_OK\s+v\d+/);
  await command('npm --version && echo AIAO_NPM_OK');
  await expect
    .poll(async () =>
      (await screen.locator(':scope > div').allTextContents()).some(line => line.trim() === 'AIAO_NPM_OK')
    )
    .toBe(true);
  await command('pnpm --version && echo AIAO_PNPM_OK');
  await expect
    .poll(async () =>
      (await screen.locator(':scope > div').allTextContents()).some(line => line.trim() === 'AIAO_PNPM_OK')
    )
    .toBe(true);
  checked('node-shell-and-package-managers');

  await command("node -e \"require('node:fs').writeFileSync('terminal-created.txt','from shell')\"");
  const file = root.locator('.wb-file[title="terminal-created.txt"]');
  await expect(file).toBeVisible();
  await file.click();
  const editor = root
    .locator('[data-editor-path="terminal-created.txt"]')
    .getByRole('textbox', { name: '项目源码', exact: true });
  await expect(editor).toContainText('from shell');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('from editor');
  await page.keyboard.press('ControlOrMeta+S');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await command("node -p \"require('node:fs').readFileSync('terminal-created.txt','utf8')\"");
  await expect(screen).toContainText('from editor');
  await command('rm terminal-created.txt');
  await expect(file).toHaveCount(0);
  checked('bidirectional-files-and-terminal-deletion');

  await command(
    "npm install is-number@7.0.0 --ignore-scripts --no-audit --no-fund && node -e \"console.log('AIAO_NPM_INSTALLED_'+require('is-number')('42'))\""
  );
  await expect(screen).toContainText('AIAO_NPM_INSTALLED_true', { timeout: 120000 });
  await command(
    "pnpm add is-odd@3.0.1 --ignore-scripts && node -e \"console.log('AIAO_PNPM_INSTALLED_'+require('is-odd')(3))\""
  );
  await expect(screen).toContainText('AIAO_PNPM_INSTALLED_true', { timeout: 120000 });
  await page.screenshot({ path: '/tmp/aiao-terminal-installation.png' });
  checked('npm-and-pnpm-installation-output');

  await command(
    "node -e \"require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>AIAO_SERVER_OK</h1>')}).listen(5173)\""
  );
  const preview = page.frameLocator('iframe[title="项目服务 :5173"]');
  await expect(preview.locator('body')).toHaveText('AIAO_SERVER_OK', { timeout: 60000 });
  await page.screenshot({ path: '/tmp/aiao-terminal-verification.png' });
  await input.press('Control+c');
  await command("node -e \"console.log('AIAO_AFTER_'+'INTERRUPT')\"");
  await expect(screen).toContainText('AIAO_AFTER_INTERRUPT');
  checked('server-preview-and-control-c');
  await createProject('Terminal isolated verification');
  await expect(root.locator('.wb-server-preview')).toHaveCount(0);
  await root.locator('.wb-title-actions [data-action="terminal"]').click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120000 });
  await command("node -e \"console.log('AIAO_NEW_PROJECT_'+!require('node:fs').existsSync('node_modules/is-odd'))\"");
  await expect(screen).toContainText('AIAO_NEW_PROJECT_true');
  checked('project-switch-process-and-filesystem-isolation');
  await terminal.getByRole('button', { name: '停止终端', exact: true }).click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('尚未启动');
  await expect(root.locator('.wb-server-preview')).toHaveCount(0);
  checked('process-and-preview-cleanup');
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.status = 'passed';
} catch (cause) {
  report.failure = cause instanceof Error ? cause.message : String(cause);
  report.terminal = await screen.innerText().catch(() => terminal.locator('[data-terminal-status]').textContent());
  await page.screenshot({ path: '/tmp/aiao-terminal-verification.png' }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  if (production) await new Promise(resolve => production.server.close(resolve));
  console.log(JSON.stringify(report, null, 2));
}
