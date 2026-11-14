import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

test.use({ actionTimeout: 15000 });

const dataset: unknown = JSON.parse(readFileSync('src/fixtures/revision-dataset.json', 'utf8'));
async function open(page: Page): Promise<void> {
  await page.route('**/data/windrose.json', route => route.fulfill({ json: dataset }));
  await page.goto('/');
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '关闭模型与详情' }).click();
}
async function versions(page: Page) {
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  return page.getByRole('dialog', { name: '版本快照与日期比较' });
}
async function fork(page: Page, name = '版本校核'): Promise<void> {
  await page.getByRole('button', { name: '建立工作草稿', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '分支名称', exact: true }).fill(name);
  await dialog.getByRole('button', { name: '建立分支', exact: true }).click();
}
async function capture(page: Page, name: string, date: string): Promise<void> {
  const dialog = await versions(page);
  await dialog.getByRole('textbox', { name: '快照名称', exact: true }).fill(name);
  await dialog.getByLabel('评估日期', { exact: true }).fill(date);
  await dialog.getByRole('button', { name: '保存完整结构快照' }).click();
  await expect(dialog.getByRole('combobox', { name: '目标版本', exact: true })).toContainText(name);
  await expect(dialog.getByRole('button', { name: '保存完整结构快照' })).toBeEnabled();
  await expect(dialog.getByRole('combobox', { name: '目标版本', exact: true }).locator('option:checked')).toContainText(
    name
  );
}

test('完整结构版本保存、改量差异、提交链和刷新恢复', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await fork(page, '底盘校核');
  await capture(page, '设计 A', '2026-11-13');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('ST-000001');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  const grid = page.getByTestId('bom-grid');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  const box = await grid.boundingBox();
  if (!box) throw new Error('表格未渲染');
  await page.mouse.click(box.x + 150, box.y + 40 + 35 + 17);
  await expect(page.getByTestId('selected-summary')).toContainText('ST-000001');
  await page.getByRole('button', { name: '编辑用量', exact: true }).click();
  await page.getByRole('textbox', { name: '直接用量', exact: true }).fill('2.5');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await capture(page, '设计 B', '2026-11-14');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('revision-summary')).toContainText('改量 1');
  await expect(dialog.getByRole('table')).toContainText('1.5');
  await expect(dialog.getByRole('combobox', { name: '目标版本', exact: true })).toContainText('12 项');
  await dialog.getByLabel('差异类型', { exact: true }).selectOption('removed');
  await expect(dialog.getByRole('table')).toContainText('当前条件没有匹配差异');
  await dialog.getByLabel('差异类型', { exact: true }).selectOption('all');
  const accessibility = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await mkdir('../aiao-bom-2/requirements/evidence', { recursive: true });
  await page.screenshot({ path: '../aiao-bom-2/requirements/evidence/versions-2026-11-14.png' });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  const commit = page.getByRole('dialog');
  await commit.getByRole('textbox', { name: '提交说明', exact: true }).fill('确认底盘用量');
  await commit.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.app-footer')).toContainText('已提交到本地版本历史');
  const history = await versions(page);
  await expect(history).toContainText('底盘校核');
  await expect(history).toContainText('确认底盘用量');
  await expect(history).toContainText('HEAD');
  await expect(history.getByRole('button', { name: '导入', exact: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: '导出', exact: true })).toHaveCount(0);
  await expect(history.locator('input[type=file]')).toHaveCount(0);
  await history.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  const restored = await versions(page);
  await expect(restored).toContainText('确认底盘用量');
  await expect(restored.getByTestId('revision-summary')).toContainText('改量 1');
  expect(errors).toEqual([]);
});

test('窄屏版本对话框不溢出，跨结构选择显示错误且不损坏主表', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await capture(page, '来源版本', '2026-11-13');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await fork(page);
  await capture(page, '草稿版本', '2026-11-14');
  const dialog = page.getByRole('dialog');
  const option = dialog
    .getByRole('combobox', { name: '基准版本', exact: true })
    .locator('option')
    .filter({ hasText: '来源版本' });
  await dialog
    .getByRole('combobox', { name: '基准版本', exact: true })
    .selectOption((await option.getAttribute('value')) ?? '');
  await expect(dialog.getByRole('alert')).toContainText('同一结构来源');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toBeVisible();
});

test('新建分支不会丢失既有提交，切换后历史仍可见', async ({ page }) => {
  await open(page);
  await fork(page, '底盘校核');
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '提交说明', exact: true }).fill('底盘基线');
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '当前工作分支', exact: true })).toContainText('底盘校核');
  await fork(page, '电池校核');
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '提交说明', exact: true }).fill('电池基线');
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const branchSelect = page.getByRole('combobox', { name: '当前工作分支', exact: true });
  const oldBranch = branchSelect.locator('option').filter({ hasText: '底盘校核' });
  await branchSelect.selectOption((await oldBranch.getAttribute('value')) ?? '');
  await expect(branchSelect).toContainText('底盘校核');
  const history = await versions(page);
  await expect(history).toContainText('底盘基线');
  await expect(history).not.toContainText('电池基线');
});
