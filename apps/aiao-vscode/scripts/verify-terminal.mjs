import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const url = process.argv.find(value => value.startsWith('--url='))?.slice(6) ?? 'http://localhost:4320/';
const reportPath = resolve(import.meta.dirname, '../benchmarks/browser-workbench-terminal.json');
const report = { format: 'aiao.workbench.terminal', version: 1, url, status: 'failed', checks: [], errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const terminal = root.locator('[data-log="terminal"]');
const screen = terminal.locator('.xterm-rows');
const input = terminal.getByRole('textbox', { name: '终端输入', exact: true });
const command = async text => {
  await input.focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};

try {
  report.browser = browser.version();
  await page.goto(url);
  await expect(root).toBeVisible();
  const overlay = page.locator('vite-error-overlay');
  if (await overlay.count()) throw new Error(await overlay.evaluate(element => element.shadowRoot?.textContent ?? element.textContent));
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Terminal verification');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('vanilla');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText('Terminal verification');
  await root.locator('.wb-title-actions [data-action="terminal"]').click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120000 });
  await command('node -e "console.log(\'AIAO_NODE_OK\',process.version)"');
  await expect(screen).toContainText(/AIAO_NODE_OK\s+v\d+/);
  await command('npm --version');
  await command('pnpm --version');
  report.checks.push('node-shell-and-package-managers');

  await command('node -e "require(\'node:fs\').writeFileSync(\'terminal-created.txt\',\'from shell\')"');
  const file = root.locator('.wb-file[title="terminal-created.txt"]');
  await expect(file).toBeVisible();
  await file.click();
  const editor = root.locator('[data-editor-path="terminal-created.txt"]').getByRole('textbox', { name: '项目源码', exact: true });
  await expect(editor).toContainText('from shell');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('from editor');
  await page.keyboard.press('ControlOrMeta+S');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await command('node -p "require(\'node:fs\').readFileSync(\'terminal-created.txt\',\'utf8\')"');
  await expect(screen).toContainText('from editor');
  await command('rm terminal-created.txt');
  await expect(file).toHaveCount(0);
  report.checks.push('bidirectional-files-and-terminal-deletion');

  await command('node -e "require(\'node:http\').createServer((req,res)=>res.end(\'AIAO_SERVER_OK\')).listen(5173)"');
  const preview = page.frameLocator('iframe[title="项目服务 :5173"]');
  await expect(preview.locator('body')).toHaveText('AIAO_SERVER_OK', { timeout: 60000 });
  await command('');
  await input.press('Control+c');
  await command('node -e "console.log(\'AIAO_AFTER_INTERRUPT\')"');
  await expect(screen).toContainText('AIAO_AFTER_INTERRUPT');
  report.checks.push('server-preview-and-control-c');
  await terminal.getByRole('button', { name: '停止终端', exact: true }).click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('尚未启动');
  await expect(root.locator('.wb-server-preview')).toHaveCount(0);
  report.checks.push('process-and-preview-cleanup');
  report.status = 'passed';
} catch (cause) {
  report.failure = cause instanceof Error ? cause.message : String(cause);
  report.terminal = await terminal.textContent().catch(() => null);
  await page.screenshot({ path: '/tmp/aiao-terminal-verification.png' }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
