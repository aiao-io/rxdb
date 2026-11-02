import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const packageRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const url =
  process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ??
  'http://localhost:4201/browser-workbench';
const host = process.argv.find(value => value.startsWith('--host='))?.slice('--host='.length) ?? 'react';
assert(['angular', 'react', 'vue'].includes(host), 'host 必须是 angular、react 或 vue');
const reportDirectory = resolve(workspaceRoot, 'benchmarks/reports');
const reportPath = resolve(reportDirectory, `browser-workbench-docking-${host}.json`);
const screenshotPath = resolve(reportDirectory, `browser-workbench-docking-${host}.png`);
const initialScreenshotPath = resolve(reportDirectory, `browser-workbench-docking-${host}-initial.png`);
const report = { format: 'aiao.browser-workbench.docking', version: 1, host, url, status: 'failed', checks: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
const pageErrors = [];
const fonts = [];
page.setDefaultTimeout(15000);
page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
page.on('response', response => {
  if (!/codicon[^/]*\.(?:ttf|woff2?)(?:[?#].*)?$/.test(response.url())) return;
  void response
    .body()
    .then(bytes =>
      fonts.push({
        url: response.url(),
        status: response.status(),
        sha256: createHash('sha256').update(bytes).digest('hex')
      })
    )
    .catch(() => undefined);
});

function fileEditor(root, path) {
  return root.locator(`[data-editor-path="${path}"]`).getByRole('textbox', { name: '项目源码', exact: true });
}

function tab(root, name) {
  return root.locator('.dv-tab').filter({ hasText: name });
}

function groupFor(root, name) {
  return root.locator('.dv-groupview').filter({ has: page.locator('.dv-tab').filter({ hasText: name }) });
}

async function rectangle(locator) {
  const value = await locator.boundingBox();
  assert(value, '停靠目标必须可见');
  return value;
}

async function dragTab(source, destination) {
  const start = await rectangle(source);
  const x = start.x + Math.min(start.width / 2, 48);
  const y = start.y + start.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 6, { steps: 4 });
  await page.mouse.move(destination.x, destination.y, { steps: 24 });
  await page.mouse.move(destination.x - 1, destination.y, { steps: 2 });
  await page.mouse.up();
}

async function openFile(root, path) {
  await root
    .locator('.wb-file')
    .and(page.getByTitle(path, { exact: true }))
    .click();
  await expect(fileEditor(root, path)).toBeVisible();
}

async function createProject(root) {
  await root.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`Dockview ${host}`);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('react');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.getByRole('combobox', { name: '当前项目' }).locator('option:checked')).toHaveText(
    `Dockview ${host}`,
    { timeout: 30000 }
  );
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
}

async function verifyCodicons(root) {
  await expect(root.locator('.codicon').first()).toBeVisible();
  const loadedFaces = await page.evaluate(async () => {
    await document.fonts.load('16px codicon');
    await document.fonts.ready;
    return [...document.fonts]
      .filter(face => face.family.replace(/["']/g, '') === 'codicon')
      .map(face => ({ family: face.family, status: face.status }));
  });
  assert(
    loadedFaces.some(face => face.status === 'loaded'),
    '官方 codicon FontFace 必须已加载'
  );
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('@vscode/codicons/package.json');
  const bytes = await readFile(resolve(dirname(manifest), 'dist/codicon.ttf'));
  const officialSHA256 = createHash('sha256').update(bytes).digest('hex');
  await expect.poll(() => fonts.some(font => font.status === 200 && font.sha256 === officialSHA256)).toBe(true);
  const icon = await root
    .locator('.codicon')
    .first()
    .evaluate(element => ({
      fontFamily: getComputedStyle(element, '::before').fontFamily,
      glyph: getComputedStyle(element, '::before').content
    }));
  assert.match(icon.fontFamily, /codicon/i);
  assert(!['none', 'normal', '""'].includes(icon.glyph), '图标必须渲染官方字体字形');
  report.font = { officialSHA256, loadedFaces, requests: fonts, icon };
  report.checks.push('official-codicons-font-loaded');
}

try {
  await mkdir(reportDirectory, { recursive: true });
  report.browser = browser.version();
  await page.goto(url);
  const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
  await expect(root).toBeVisible({ timeout: 30000 });
  const dock = root.locator('[data-slot="dockview"]');
  await expect(dock).toBeVisible();
  assert((await root.locator('.dv-dockview').count()) > 0, '必须使用真实 Dockview DOM');
  report.checks.push('dockview-dom');
  await verifyCodicons(root);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存', { timeout: 30000 });
  await createProject(root);
  await root.locator('.wb-title [data-action="run"]').click();
  const preview = page.frameLocator('iframe[title="项目隔离预览"]');
  await preview.getByRole('button', { name: '次数 0', exact: true }).click({ timeout: 30000 });
  await expect(preview.getByRole('button', { name: '次数 1', exact: true })).toBeVisible();
  const initialBottom = await rectangle(groupFor(root, '问题'));
  assert(Math.abs(initialBottom.height - 180) <= 1, '底部面板首次布局应为 180px');
  report.initialLayout = {
    bottomPanel: initialBottom,
    headerActions: await root
      .locator('.wb-dock-group-actions button:visible')
      .evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    screenshot: initialScreenshotPath
  };
  await page.screenshot({ path: initialScreenshotPath, fullPage: true });
  report.checks.push('initial-bottom-panel-height-180');

  const path = 'src/main.tsx';
  await openFile(root, path);
  const editor = fileEditor(root, path);
  const source = (await editor.locator('.cm-line').allTextContents()).join('\n');
  assert(source.includes('本地 React 模板'), 'fixture 必须包含可编辑的标题');
  const marker = 'Dockview unsaved buffer';
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source.replace('本地 React 模板', marker));
  await expect(editor).toContainText(marker);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  const retainedEditor = await root.locator(`[data-editor-path="${path}"] .cm-editor`).elementHandle();
  assert(retainedEditor);
  await openFile(root, 'src/Counter.tsx');
  const beforeSplit = await root.locator('.dv-groupview').count();
  const splitTarget = root.locator('[data-editor-path="src/Counter.tsx"]');
  const sourceBox = await rectangle(splitTarget);
  await dragTab(tab(root, 'main.tsx'), {
    x: sourceBox.x + sourceBox.width - 10,
    y: sourceBox.y + sourceBox.height * 0.5
  });
  await expect(root.locator('.dv-groupview')).toHaveCount(beforeSplit + 1);
  await expect(fileEditor(root, path)).toBeVisible();
  await expect(fileEditor(root, 'src/Counter.tsx')).toBeVisible();
  assert(await retainedEditor.evaluate(element => element.isConnected), '跨组移动不得销毁原编辑器 DOM');
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toContainText('本地 React 模板');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText(marker);
  report.checks.push(
    'editor-tab-drag-creates-group',
    'editor-dom-retained-on-move',
    'two-editor-groups-visible',
    'undo-redo-retained-on-move'
  );
  report.groups = { beforeSplit, afterSplit: await root.locator('.dv-groupview').count() };

  const beforePreview = await rectangle(groupFor(root, '预览'));
  const dockBox = await rectangle(dock);
  await dragTab(tab(root, '预览'), { x: dockBox.x + dockBox.width * 0.6, y: dockBox.y + dockBox.height - 8 });
  await expect
    .poll(async () => {
      const target = await rectangle(groupFor(root, '预览'));
      const main = await rectangle(groupFor(root, 'main.tsx'));
      return target.y >= main.y + main.height - 2;
    })
    .toBe(true);
  await expect(preview.getByRole('button', { name: '次数 1', exact: true })).toBeVisible();
  await preview.getByRole('button', { name: '次数 1', exact: true }).click();
  await expect(preview.getByRole('button', { name: '次数 2', exact: true })).toBeVisible();
  assert(await retainedEditor.evaluate(element => element.isConnected));
  report.preview = { before: beforePreview, after: await rectangle(groupFor(root, '预览')), counterRetained: true };
  report.checks.push('preview-docked-below-editors', 'preview-runtime-retained-on-move');

  await tab(root, 'main.tsx')
    .getByRole('button', { name: /^(关闭|Close)(\s|$)/i })
    .click();
  await expect(tab(root, 'main.tsx')).toHaveCount(0);
  await openFile(root, path);
  await expect(fileEditor(root, path)).toContainText(marker);
  await expect(root.locator('[data-slot="save-status"]')).toContainText('未保存');
  await expect(preview.getByRole('button', { name: '次数 2', exact: true })).toBeVisible();
  report.checks.push('closed-editor-reopens-with-unsaved-buffer', 'preview-layout-survives-editor-reopen');
  assert.deepEqual(pageErrors, []);
  report.pageErrors = pageErrors;
  report.status = 'passed';
  console.log(`Dockview and official Codicons verified for ${host}.`);
} catch (error) {
  report.error = error.stack ?? String(error);
  report.pageErrors = pageErrors;
  report.logs = await page
    .locator('.wb-panel-content')
    .allTextContents()
    .catch(() => []);
  console.error('Docking verification failed:', JSON.stringify({ pageErrors, logs: report.logs }));
  throw error;
} finally {
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await context.close();
  await browser.close();
}
