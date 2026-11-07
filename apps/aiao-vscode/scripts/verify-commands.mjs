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
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(`Commands ${host}`, { timeout: 30000 });
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

  const center = root.getByRole('button', { name: '搜索文件和命令', exact: true });
  await center.click();
  await expect(quick()).toBeFocused();
  await expect(root.locator('[data-quick-mode]')).toHaveCount(5);
  await root.locator('[data-quick-mode="commands"]').click();
  const commandsInput = root.getByRole('combobox', { name: '命令面板', exact: true });
  await expect(commandsInput).toBeFocused();
  await expect(commandsInput).toHaveValue('>');
  await commandsInput.press('Escape');
  await expect(center).toBeFocused();
  report.checks.push('command-center-modes-switch-and-escape-focus');

  await center.click();
  await root.locator('[data-quick-mode="recent"]').click();
  const recent = root.getByRole('combobox', { name: '打开最近项目', exact: true });
  await expect(recent).toBeFocused();
  await recent.fill('Commands');
  await expect(root.locator('.wb-quick-input [role="option"]')).toHaveCount(1);
  await recent.fill('no-such-workspace');
  await expect(root.locator('.wb-quick-input [role="option"]')).toHaveCount(0);
  await recent.press('Escape');
  await expect(center).toBeFocused();
  const workspace = root.getByRole('button', { name: '工作区', exact: true });
  await workspace.click();
  await root.locator('[data-menu-id="open-recent"]').click();
  await expect(recent).toBeFocused();
  await recent.press('Escape');
  await expect(workspace).toBeFocused();
  await editor(path).focus();
  await page.keyboard.press('Control+r');
  await expect(recent).toBeFocused();
  await recent.press('Enter');
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(`Commands ${host}`);
  await expect(root.locator('.wb-quick-input')).toHaveCount(0);
  report.checks.push('recent-project-mode-search-and-keyboard-shortcut');

  await quickOpen('src/main.tsx');
  await center.click();
  await quick().fill(path);
  await expect(root.locator('[data-quick-mode]')).toHaveCount(0);
  await quick().press('Enter');
  await expect(editor(path)).toBeFocused();
  await root.getByRole('button', { name: '后退', exact: true }).click();
  await expect(editor('src/main.tsx')).toBeFocused();
  await root.getByRole('button', { name: '前进', exact: true }).click();
  await expect(editor(path)).toBeFocused();
  report.checks.push('command-center-file-search-and-editor-navigation');

  await page.setViewportSize({ width: 390, height: 844 });
  const titleBounds = await root.locator('.wb-title').evaluate(title => {
    const search = title.querySelector('.wb-command-search').getBoundingClientRect();
    const actions = title.querySelector('.wb-title-actions').getBoundingClientRect();
    return { searchWidth: search.width, searchRight: search.right, actionsLeft: actions.left };
  });
  assert(titleBounds.searchWidth > 50, '窄屏命令中心应保持可点击宽度');
  assert(titleBounds.searchRight <= titleBounds.actionsLeft, '窄屏命令中心不能遮挡标题栏动作');
  await center.click();
  await expect(quick()).toBeFocused();
  await page.screenshot({ path: resolve(directory, `browser-workbench-command-center-mobile-${host}.png`) });
  await quick().press('Escape');
  await page.setViewportSize({ width: 1680, height: 1050 });
  await editor(path).focus();
  report.checks.push('command-center-mobile-layout-and-quick-input');

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touchPage = await touchContext.newPage();
  touchPage.on('pageerror', error => errors.push(error.stack ?? error.message));
  await touchPage.goto(url);
  const touchRoot = touchPage.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await expect(touchRoot).toBeVisible({ timeout: 30000 });
  for (const width of [390, 320]) {
    await touchPage.setViewportSize({ width, height: 844 });
    const bounds = await touchRoot.locator('.wb-title').evaluate(title => {
      const search = title.querySelector('.wb-command-search').getBoundingClientRect();
      const workspace = title.querySelector('[data-action="workspace"]').getBoundingClientRect();
      const actions = title.querySelector('.wb-title-actions').getBoundingClientRect();
      return {
        searchWidth: search.width,
        workspaceWidth: workspace.width,
        searchRight: search.right,
        actionsLeft: actions.left
      };
    });
    assert(bounds.searchWidth >= 64, `${width}px 触屏应保留命令中心宽度`);
    assert(bounds.workspaceWidth >= 25, `${width}px 触屏应保留工作区切换入口`);
    assert(bounds.searchRight <= bounds.actionsLeft, `${width}px 触屏标题操作不能重叠`);
    await touchRoot.getByRole('button', { name: '搜索文件和命令', exact: true }).click();
    const touchQuick = touchRoot.getByRole('combobox', { name: '快速打开文件', exact: true });
    await expect(touchQuick).toBeFocused();
    await touchQuick.press('Escape');
  }
  await touchPage.screenshot({ path: resolve(directory, `browser-workbench-command-center-touch-${host}.png`) });
  await touchContext.close();
  report.checks.push('command-center-320-and-390-touch-layout');

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
