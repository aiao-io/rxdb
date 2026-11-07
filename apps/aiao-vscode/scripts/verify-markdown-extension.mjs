import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';

const url = process.argv.find(value => value.startsWith('--url='))?.slice('--url='.length) ?? 'http://localhost:4320/';
const directory = resolve(import.meta.dirname, '../benchmarks');
const report = { format: 'aiao.workbench.markdown-extension', version: 1, extension: 'shd101wyy.markdown-preview-enhanced@0.8.40', url, status: 'failed', checks: [], limitations: [], errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const host = () => page.locator('iframe[data-markdown-extension-host]');
const source = path => root.locator(`[data-editor-path="${path}"]`).getByRole('textbox', { name: '项目源码', exact: true });
const preview = () => page.frames().find(frame => frame.name() === 'pending-frame');
const heading = async () => {
  try { return await preview()?.locator('[data-for="preview"] h1').textContent({ timeout: 1000 }); }
  catch { return undefined; }
};
page.on('pageerror', error => report.errors.push(error.stack ?? error.message));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = `${message.text()} ${message.location().url}`;
  if (text.includes('tikzjax.com')) { if (!report.limitations.includes('TikZ 在线资源受 COEP 限制')) report.limitations.push('TikZ 在线资源受 COEP 限制'); }
  else report.errors.push(text);
});
page.on('response', response => {
  if (response.status() >= 400 && /extension-host|extensions\/shd101wyy|vscode-resource/.test(response.url())) report.errors.push(`HTTP ${response.status()} ${response.url()}`);
});
function check(name) { report.checks.push(name); console.log(`通过：${name}`); }
async function settlePreview() {
  await preview().evaluate(() => new Promise(resolve => {
    let previous = window.scrollY;
    let stable = 0;
    const sample = () => { stable = window.scrollY === previous ? stable + 1 : 0; previous = window.scrollY; if (stable >= 12) resolve(); else requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  }));
}
async function open(path) {
  await root.getByRole('button', { name: '搜索文件和命令', exact: true }).click();
  const input = root.getByRole('combobox', { name: '快速打开文件', exact: true });
  await input.fill(path);
  await input.press('Enter');
  await expect(source(path)).toBeVisible();
}
async function replace(path, content) {
  await source(path).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(content);
}
async function palette(command) {
  await root.getByRole('button', { name: '命令面板', exact: true }).click();
  const input = root.getByRole('combobox', { name: '命令面板', exact: true });
  await input.fill(`>${command}`);
  await expect(root.locator('.wb-quick-input').getByRole('option').first()).toBeVisible();
  await input.press('Enter');
}
async function engine(value) {
  await root.getByRole('button', { name: '设置', exact: true }).click();
  await root.locator('select[name="editor-engine"]').selectOption(value);
  await root.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator(`[data-editor-path="README.md"] ${value === 'monaco' ? '.monaco-editor' : '.cm-editor'}`)).toBeVisible();
}
async function closePreview() {
  await root.getByRole('button', { name: '关闭 Markdown Preview Enhanced', exact: true }).click();
  await expect(host()).toHaveCount(0);
}
async function createProject(name) {
  if (await root.locator('[data-editor-path]').count()) await expect(root.locator('[data-action="run"]')).toBeEnabled({ timeout: 30000 });
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill('vanilla');
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(name, { timeout: 30000 });
}
try {
  await mkdir(directory, { recursive: true });
  report.browser = browser.version();
  await page.goto(url);
  await expect(root).toBeVisible({ timeout: 30000 });
  await createProject('Markdown Extension 验收');
  await open('README.md');
  const long = Array.from({ length: 90 }, (_, index) => `## 章节 ${index}\n\n第 ${index} 章，滚动同步测试。\n`).join('\n');
  const sample = '# 正式插件草稿\n\n<div data-html-test="passed">HTML 结构</div>\n\n- 列表\n\n```ts\nconst x = 1;\n```\n\n![相对图片](./src/icon.svg)\n\n公式 $x^2+y^2=z^2$\n\n```mermaid\ngraph TD\nA[开始] --> B[结束]\n```\n\n' + long;
  await replace('README.md', sample);
  await page.keyboard.press('ControlOrMeta+Home');
  await root.getByRole('button', { name: '打开 Markdown 侧边预览', exact: true }).filter({ visible: true }).first().click();
  await expect.poll(heading, { timeout: 60000 }).toContain('正式插件草稿');
  const frame = preview();
  await expect(frame.locator('[data-html-test="passed"]')).toHaveText('HTML 结构');
  await expect(frame.locator('[data-for="preview"] li').first()).toHaveText('列表');
  await expect(frame.locator('[data-for="preview"] pre').first()).toContainText('const x = 1');
  await expect(frame.locator('[data-for="preview"] .katex')).toHaveCount(1);
  await expect(frame.locator('[data-for="preview"] svg[id^="mermaid"]')).toHaveCount(1);
  await expect.poll(() => frame.locator('[data-for="preview"] img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(root.locator('[data-editor-tab-path="README.md"] .wb-dirty-marker')).toBeVisible();
  await frame.locator('[data-for="preview"] img').click();
  await expect(frame.locator('.mpe-lightbox-overlay')).toHaveClass(/mpe-lightbox-visible/);
  await frame.locator('.mpe-lightbox-overlay').click();
  check('formal-extension-html-list-code-image-katex-mermaid-from-unsaved-codemirror');
  await page.screenshot({ path: resolve(directory, 'browser-workbench-markdown-extension.png') });
  const originalHost = await host().elementHandle();
  await engine('monaco');
  assert(await originalHost.evaluate(element => element.isConnected));
  await replace('README.md', sample.replace('正式插件草稿', 'Monaco 实时草稿'));
  await expect.poll(heading).toContain('Monaco 实时草稿');
  await expect(source('README.md')).toBeFocused();
  await expect(host()).toHaveCount(1);
  check('monaco-switch-keeps-host-draft-and-live-update');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await root.locator('[data-editor-path="README.md"]').hover();
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => preview().evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await settlePreview();
  await preview().evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => root.locator('[data-editor-path="README.md"] .line-numbers').first().textContent()).toBe('1');
  await expect(source('README.md')).toBeFocused();
  await page.waitForTimeout(550);
  check('monaco-bidirectional-scroll-keeps-focus');
  await engine('codemirror');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await expect(source('README.md')).toContainText('Monaco 实时草稿');
  assert(await originalHost.evaluate(element => element.isConnected));
  check('codemirror-switch-keeps-draft-and-host');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await root.locator('[data-editor-path="README.md"]').hover();
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => preview().locator('[data-for="preview"]').evaluate(element => element.scrollTop || window.scrollY)).toBeGreaterThan(100);
  await settlePreview();
  const selection = await source('README.md').evaluate(() => window.getSelection()?.anchorOffset);
  const sourceTop = () => root.locator('[data-editor-path="README.md"] .cm-scroller').evaluate(element => element.scrollTop);
  await preview().locator('[data-for="preview"]').evaluate(element => { element.scrollTop = 0; window.scrollTo(0, 0); });
  await expect.poll(sourceTop).toBeLessThan(500);
  assert.equal(await source('README.md').evaluate(() => window.getSelection()?.anchorOffset), selection);
  check('bidirectional-scroll-without-moving-source-selection');
  const explorer = root.getByRole('button', { name: '切换资源管理器', exact: true });
  if (await explorer.getAttribute('aria-pressed') !== 'true') await explorer.click();
  await root.locator('[data-tree-section="workspace"]').hover();
  await root.getByRole('button', { name: '新建文件...', exact: true }).click();
  const filename = root.getByRole('textbox', { name: '新建文件', exact: true });
  await filename.fill('notes.md');
  await filename.press('Enter');
  await replace('notes.md', '# 第二个文档\n\n活动文档跟随');
  await expect.poll(heading).toContain('第二个文档');
  await expect(source('notes.md')).toBeFocused();
  check('preview-follows-active-markdown-without-stealing-focus');
  await palette('markdown-preview-enhanced.togglePreviewLock');
  await open('README.md');
  await expect.poll(heading).toContain('第二个文档');
  await replace('README.md', '# 锁定期间的源码\n');
  await expect.poll(heading).toContain('第二个文档');
  check('locked-preview-keeps-original-document');
  await palette('markdown-preview-enhanced.togglePreviewLock');
  await open('notes.md');
  await open('README.md');
  await expect.poll(heading).toContain('锁定期间的源码');
  await palette('markdown-preview-enhanced.insertPagebreak');
  await expect(source('README.md')).toContainText('pagebreak');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(source('README.md')).not.toContainText('pagebreak');
  check('plugin-edit-enters-undoable-unsaved-buffer');
  await palette('markdown-preview-enhanced.openCurrentSourceInEditorAndClosePreview');
  await expect(host()).toHaveCount(0);
  await expect(root.locator('[data-auxiliary-id="markdown-extension"]')).toHaveCount(0);
  check('native-preview-close-removes-outer-panel');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.press('v');
  await expect.poll(heading, { timeout: 60000 }).toContain('锁定期间的源码');
  check('chord-opens-side-preview');
  await closePreview();
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+Shift+v');
  await expect.poll(heading, { timeout: 60000 }).toContain('锁定期间的源码');
  check('shortcut-opens-current-group-preview');
  await closePreview();
  await source('README.md').click({ button: 'right' });
  await root.getByRole('menuitem', { name: 'Markdown Preview Enhanced: 打开侧边预览', exact: true }).click();
  await expect.poll(heading, { timeout: 60000 }).toContain('锁定期间的源码');
  check('context-menu-opens-preview');
  await root.getByRole('button', { name: '扩展', exact: true }).click();
  await root.getByRole('button', { name: '禁用 Markdown Preview Enhanced', exact: true }).click();
  await expect(host()).toHaveCount(0);
  await expect(root.locator('[data-extension-status]')).toHaveText('已禁用');
  await page.reload();
  await root.getByRole('button', { name: '扩展', exact: true }).click();
  await expect(root.getByRole('button', { name: '启用 Markdown Preview Enhanced', exact: true })).toBeVisible();
  await expect(host()).toHaveCount(0);
  await root.getByRole('button', { name: '启用 Markdown Preview Enhanced', exact: true }).click();
  await open('README.md');
  await palette('markdown-preview-enhanced.openPreviewToTheSide');
  await expect.poll(heading, { timeout: 60000 }).toContain('锁定期间的源码');
  await expect(root.locator('[data-editor-tab-path="README.md"] .wb-dirty-marker')).toBeVisible();
  check('disable-reload-enable-keeps-unsaved-draft');
  await source('README.md').focus();
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect(root.locator('[data-editor-tab-path] .wb-dirty-marker:visible')).toHaveCount(0, { timeout: 30000 });
  check('explicit-save-keeps-preview-and-cleans-only-on-request');
  await createProject('Markdown Extension 第二项目');
  await expect(host()).toHaveCount(0);
  await open('README.md');
  await palette('markdown-preview-enhanced.openPreviewToTheSide');
  await expect.poll(heading, { timeout: 60000 }).toContain('浏览器工作台项目');
  check('project-switch-disposes-and-reopens-new-runtime');
  await palette('showExtensions');
  const search = root.getByRole('searchbox', { name: '搜索扩展', exact: true });
  await search.fill('@installed markdown');
  await expect(root.getByRole('button', { name: '卸载 Markdown Preview Enhanced', exact: true })).toBeVisible();
  await search.fill('@disabled');
  await expect(root.locator('[data-extension-empty]')).toBeVisible();
  await root.getByRole('button', { name: '清除扩展搜索', exact: true }).click();
  check('extension-search-filters-installation-and-enabled-state');
  await root.getByRole('button', { name: '卸载 Markdown Preview Enhanced', exact: true }).click();
  await expect(host()).toHaveCount(0);
  await expect(root.locator('[data-extension-status]')).toHaveText('未安装');
  await expect(root.getByRole('button', { name: '打开 Markdown 侧边预览', exact: true }).filter({ visible: true }).first()).toBeDisabled();
  check('uninstall-disposes-active-host-and-disables-preview');
  await page.reload();
  await root.getByRole('button', { name: '扩展', exact: true }).click();
  await expect(root.locator('[data-extension-status]')).toHaveText('未安装');
  await expect(host()).toHaveCount(0);
  check('uninstall-persists-across-reload');
  await root.getByRole('button', { name: '安装 Markdown Preview Enhanced', exact: true }).click();
  await expect(root.locator('[data-extension-status]')).toContainText('已启用');
  await expect(host()).toHaveCount(0);
  check('reinstall-verifies-real-package-and-stays-lazy');
  await open('README.md');
  await palette('markdown-preview-enhanced.openPreviewToTheSide');
  await expect.poll(heading, { timeout: 60000 }).toContain('浏览器工作台项目');
  check('reinstalled-extension-opens-real-preview');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.failure = error.stack ?? String(error);
  report.frames = await Promise.all(page.frames().map(async frame => ({ url: frame.url(), scroll: await frame.evaluate(() => ({ window: window.scrollY, active: document.activeElement?.tagName, scrollbars: [...document.querySelectorAll('.monaco-scrollable-element, .cm-scroller')].map(element => element.scrollTop) })).catch(() => null) })));
  await page.screenshot({ path: resolve(directory, 'browser-workbench-markdown-extension-failure.png') }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(directory, 'browser-workbench-markdown-extension.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
