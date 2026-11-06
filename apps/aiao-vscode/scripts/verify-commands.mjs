import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const url = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ?? 'http://localhost:4320/';
const host = 'vscode';

const directory = resolve(import.meta.dirname, '../benchmarks');
const reportPath = resolve(directory, `browser-workbench-commands-${host}.json`);
const report = { format: 'aiao.workbench.commands', version: 1, host, url, status: 'failed', checks: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
let compilerWorkers = 0;
page.on('pageerror', error => errors.push(error.stack ?? error.message));
page.on('worker', worker => {
  if (worker.url().includes('compiler-worker')) compilerWorkers++;
});
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const editor = path =>
  root.locator(`[data-editor-path="${path}"]`).getByRole('textbox', { name: '项目源码', exact: true });
const content = async locator => (await locator.locator('.cm-line').allTextContents()).join('\n');
const quick = () => root.getByRole('combobox', { name: '快速打开文件', exact: true });

async function quickOpen(path) {
  await page.keyboard.press('ControlOrMeta+p');
  await expect(quick()).toBeFocused();
  await quick().fill(path);
  await quick().press('Enter');
  await expect(editor(path)).toBeVisible();
  await expect(editor(path)).toBeFocused();
}

async function palette(command) {
  await page.keyboard.press('ControlOrMeta+Shift+p');
  const input = root.getByRole('combobox', { name: '命令面板', exact: true });
  await expect(input).toBeFocused();
  await input.fill(`>${command}`);
  await expect(root.locator('.wb-quick-input').getByRole('option')).toHaveCount(1);
  await input.press('Enter');
}

try {
  await mkdir(directory, { recursive: true });
  report.browser = browser.version();
  await page.goto(url);
  await expect(root).toBeVisible({ timeout: 30000 });
  await expect(root.getByRole('button', { name: '应用程序菜单', exact: true })).toBeEnabled({ timeout: 30000 });
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`Commands ${host}`);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('react');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.getByRole('combobox', { name: '当前项目' }).locator('option:checked')).toHaveText(
    `Commands ${host}`,
    { timeout: 30000 }
  );
  await expect(
    page.frameLocator('iframe[title="项目隔离预览"]').getByRole('button', { name: '次数 0', exact: true })
  ).toBeVisible({ timeout: 30000 });
  const path = 'src/Counter.tsx';
  await editor('src/main.tsx').focus();
  await page.keyboard.press('ControlOrMeta+p');
  await quick().fill('src/');
  const first = await root.locator('.wb-quick-input').getByRole('option', { selected: true }).textContent();
  await quick().press('ArrowDown');
  assert.notEqual(await root.locator('.wb-quick-input').getByRole('option', { selected: true }).textContent(), first);
  await quick().fill(path);
  await quick().press('Enter');
  await expect(editor(path)).toBeFocused();
  report.checks.push('quick-open-path-filter-arrow-enter');

  const before = await content(editor(path));
  await page.keyboard.press('ControlOrMeta+p');
  await quick().fill('main');
  await quick().press('Escape');
  await expect(root.locator('.wb-quick-input')).toHaveCount(0);
  await expect(editor(path)).toBeFocused();
  assert.equal(await content(editor(path)), before);
  report.checks.push('quick-open-escape-restores-focus-and-buffer');

  await palette('togglePanel');
  await expect(root.locator('[data-dock-panel="problems"]')).not.toBeVisible();
  await palette('togglePanel');
  await expect(root.locator('[data-dock-panel="problems"]')).toBeVisible();
  report.checks.push('command-palette-executes-real-layout-command');

  await editor(path).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Tab');
  await expect.poll(() => content(editor(path))).toBe(`  ${before}`);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => content(editor(path))).toBe(before);
  report.checks.push('tab-indents-and-undo-restores-source');

  const workersBeforeEnter = compilerWorkers;
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect.poll(async () => (await content(editor(path))).split('\n').length).toBe(before.split('\n').length + 1);
  assert.equal(compilerWorkers, workersBeforeEnter, '源码 Mod+Enter 不能启动全局运行');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => content(editor(path))).toBe(before);
  report.checks.push('source-mod-enter-inserts-line-without-running-project');

  const unformatted = `export const  counter=()=>{return(  <div className="x">次数 0</div>)};`;
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(unformatted);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  await page.keyboard.press('Shift+Alt+F');
  await expect.poll(async () => await content(editor(path))).toContain(`className='x'`);
  await expect.poll(async () => (await content(editor(path))).split('\n').length).toBeGreaterThan(1);
  await expect(root.locator('[data-log="output"]')).toContainText(`已格式化 ${path}`);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => content(editor(path))).toBe(unformatted);
  report.checks.push('shift-alt-f-formats-active-file-undoable-unsaved');

  await palette('format');
  await expect.poll(async () => await content(editor(path))).toContain(`className='x'`);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  report.checks.push('command-palette-format-formats-file');

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(before);
  await expect.poll(() => content(editor(path))).toBe(before);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');

  const marker = `// commands retained buffer ${host}`;
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(`${before}\n${marker}`);
  await page.keyboard.press('ControlOrMeta+w');
  await expect(root.locator(`[data-editor-path="${path}"]`)).toHaveCount(0);
  await quickOpen(path);
  await expect(editor(path)).toContainText(marker);
  const reopened = await content(editor(path));
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(`${reopened}\n// temporary edit`);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => content(editor(path))).toBe(reopened);
  report.checks.push('close-reopen-retains-buffer-and-new-editor-undo');

  await page.keyboard.press('ControlOrMeta+s');
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
  await expect(root.locator('[data-action="run"]')).toBeEnabled();
  assert(
    await root
      .locator(`[data-editor-tab-path="${path}"]`)
      .evaluate(element => element.closest('.dv-tab')?.classList.contains('dv-active-tab')),
    '保存后仍应激活源码标签'
  );
  await page.keyboard.press('ControlOrMeta+w');
  await expect(root.locator(`[data-editor-path="${path}"]`)).toHaveCount(0);
  await expect(root.locator('.wb-preview')).toBeVisible();
  await quickOpen(path);
  await expect(editor(path)).toContainText(marker);
  report.checks.push('save-preserves-editor-active-and-close-keeps-preview');
  assert.equal(errors.length, 0, errors.join('\n'));
  report.status = 'passed';
  await page.screenshot({ path: resolve(directory, `browser-workbench-commands-${host}.png`), fullPage: true });
  console.log(`Verified ${report.checks.length} real keyboard/editor checks for ${host}`);
} catch (cause) {
  report.error = cause.stack ?? String(cause);
  report.focus = await page.evaluate(() => ({
    active: document.activeElement?.outerHTML.slice(0, 1200),
    path: document.activeElement?.closest('[data-editor-path]')?.getAttribute('data-editor-path'),
    activeTabs: [...document.querySelectorAll('.dv-active-tab')].map(element => element.textContent)
  }));
  report.problems = await root
    .locator('[data-log="problems"]')
    .innerText()
    .catch(() => '');
  await page.screenshot({ path: resolve(directory, `browser-workbench-commands-${host}-failure.png`), fullPage: true });
  throw cause;
} finally {
  report.pageErrors = errors;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
