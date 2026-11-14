import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { ListTable } from '@visactor/vtable';
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
  const history = page.getByRole('dialog', { name: '版本历史', exact: true });
  await history.getByRole('button', { name: /^历史记录/ }).click();
  const tools = history.locator('details.snapshot-tools');
  if ((await tools.getAttribute('open')) === null) await tools.locator('summary').click();
  return history;
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
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: '提交说明', exact: true }).fill('设计基线');
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.app-footer')).toContainText('已提交到本地版本历史');
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
  await expect(restored.getByRole('combobox', { name: '目标版本' })).toContainText('设计 B');
  const commits = restored.getByRole('list', { name: '提交记录' });
  await expect(commits.getByRole('listitem')).toHaveCount(2);
  await commits
    .getByRole('listitem')
    .filter({ hasText: '确认底盘用量' })
    .getByRole('button', { name: '比较父版本' })
    .click();
  await expect(restored.getByTestId('revision-summary')).toContainText('改量 1');
  await commits
    .getByRole('listitem')
    .filter({ hasText: '设计基线' })
    .getByRole('button', { name: '恢复到工作树' })
    .click();
  await expect(restored.locator('.worktree-heading h3')).toContainText('未提交');
  await restored.getByRole('button', { name: /^历史记录/ }).click();
  await expect(commits.getByRole('listitem')).toHaveCount(2);
  await restored.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('ST-000001');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  const restoredBox = await grid.boundingBox();
  if (!restoredBox) throw new Error('恢复后的表格未渲染');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  await page.mouse.click(restoredBox.x + 150, restoredBox.y + 40 + 35 + 17);
  await expect(page.getByTestId('selected-summary')).toContainText('1 件');
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

async function selectFirstPart(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('ST-000001');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  const grid = page.getByTestId('bom-grid');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  const box = await grid.boundingBox();
  if (!box) throw new Error('表格未渲染');
  await page.mouse.click(box.x + 150, box.y + 40 + 35 + 17);
  await expect(page.getByTestId('selected-summary')).toContainText('ST-000001');
}
async function editQuantity(page: Page, quantity: string): Promise<void> {
  await selectFirstPart(page);
  await page.getByRole('button', { name: '编辑用量', exact: true }).click();
  await page.getByRole('textbox', { name: '直接用量', exact: true }).fill(quantity);
  await page.getByRole('button', { name: '确认', exact: true }).click();
}
async function commitBranch(page: Page, message: string): Promise<void> {
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '提交说明', exact: true }).fill(message);
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.app-footer')).toContainText('已提交到本地版本历史');
}

test('分支保存不同用量，切换和刷新后数据与提交历史仍隔离', async ({ page }) => {
  await open(page);
  await fork(page, '底盘校核');
  await editQuantity(page, '2.5');
  await commitBranch(page, '底盘基线');
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).clear();
  await fork(page, '电池校核');
  await editQuantity(page, '7');
  await commitBranch(page, '电池基线');
  const branchSelect = page.getByRole('combobox', { name: '当前工作分支', exact: true });
  const oldBranch = branchSelect.locator('option').filter({ hasText: '底盘校核' });
  await branchSelect.selectOption((await oldBranch.getAttribute('value')) ?? '');
  await expect(page.locator('.notice')).toContainText('已切换到 底盘校核');
  await expect(branchSelect.locator('option:checked')).toContainText('底盘校核');
  await selectFirstPart(page);
  await expect(page.getByTestId('selected-summary')).toContainText('2.5 件');
  await page.reload();
  await expect(branchSelect.locator('option:checked')).toContainText('底盘校核');
  await selectFirstPart(page);
  await expect(page.getByTestId('selected-summary')).toContainText('2.5 件');
  const history = await versions(page);
  await expect(history.getByRole('list', { name: '提交记录' })).toContainText('底盘基线');
  await expect(history.getByRole('list', { name: '提交记录' })).not.toContainText('电池基线');
});

async function cellPosition(page: Page, field: string, key: string): Promise<{ x: number; y: number }> {
  const grid = page.getByTestId('bom-grid');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  return grid
    .locator('canvas')
    .first()
    .evaluate(
      (canvas, target) => {
        const table = (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__;
        const col = table.getTableIndexByField(target.field);
        const row = Array.from({ length: table.rowCount - 1 }, (_, index) => index + 1).find(
          row => (table.getCellOriginRecord(col, row) as { key: string }).key === target.key
        );
        if (row === undefined) throw new Error(`表格未显示发生位置：${target.key}`);
        const { bounds } = table.getCellRelativeRect(col, row);
        const box = canvas.getBoundingClientRect();
        return { x: box.x + (bounds.x1 + bounds.x2) / 2, y: box.y + (bounds.y1 + bounds.y2) / 2 };
      },
      { field, key }
    );
}

async function inlineQuantity(page: Page, value: string): Promise<void> {
  const position = await cellPosition(page, 'quantityText', 'stress:1');
  await page.mouse.dblclick(position.x, position.y);
  await expect(page.locator('.vtable > input:visible').last()).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

test('单元格编辑、表内 U/M/D 与属性标记、当前改动提交和历史回退', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.getByRole('button', { name: '来源与口径', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '数据来源', exact: true })).toHaveCount(0);
  await fork(page);
  await page.getByLabel('展开层级').selectOption('1');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const history = page.getByRole('dialog', { name: '版本历史', exact: true });
  await history.getByRole('textbox', { name: '当前改动提交说明', exact: true }).fill('初始结构');
  await history.getByRole('button', { name: '提交当前改动', exact: true }).click();
  await expect(history).toContainText('工作树干净');
  await history.getByRole('button', { name: '关闭', exact: true }).click();
  await inlineQuantity(page, '2.5');
  await expect(page.getByTestId('selected-summary')).toContainText('2.5 件');
  await inlineQuantity(page, '-1');
  await expect(page.locator('.notice')).toContainText('用量必须是非负规范十进制字符串');
  await expect(page.getByTestId('selected-summary')).toContainText('2.5 件');
  const deleted = await cellPosition(page, 'name', 'stress:2');
  await page.mouse.click(deleted.x, deleted.y);
  await page.getByRole('button', { name: '删除所选发生项', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  const add = page.getByRole('dialog');
  await add.locator('[name=partId]').fill('NEW-001');
  await add.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '差异', exact: true }).click();
  const grid = page.getByTestId('bom-grid');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  const diffRows = () =>
    grid
      .locator('canvas')
      .first()
      .evaluate(canvas => {
        const table = (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__;
        return Array.from({ length: table.rowCount - 1 }, (_, index) => {
          const row = index + 1;
          const record = table.getCellOriginRecord(1, row) as {
            key: string;
            partId: string;
            name: string;
            diffStatus?: string;
          };
          const style = table.getCellStyle(4, row);
          return {
            key: record.key,
            partId: record.partId,
            name: record.name,
            diffStatus: record.diffStatus,
            quantityBackground: style.bgColor,
            strikeThrough: table.getCellStyle(1, row).lineThrough
          };
        });
      });
  await expect.poll(diffRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'stress:1',
        diffStatus: 'changed',
        name: expect.stringMatching(/^M/),
        quantityBackground: '#fff8d6'
      }),
      expect.objectContaining({ key: 'stress:2', diffStatus: 'removed', strikeThrough: true }),
      expect.objectContaining({ partId: 'NEW-001', diffStatus: 'added', name: expect.stringMatching(/^U/) })
    ])
  );
  await page.screenshot({ path: testInfo.outputPath('inline-diff.png') });
  await page.getByRole('button', { name: /^退出差异/ }).click();
  await expect(grid).toHaveAttribute('data-row-count', '12');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  await expect(history.getByRole('region', { name: '当前改动', exact: true })).toContainText('1 → 2.5');
  await history.getByRole('textbox', { name: '当前改动提交说明', exact: true }).fill('调整结构和用量');
  await history.getByRole('button', { name: '提交当前改动', exact: true }).click();
  await expect(history).toContainText('工作树干净');
  await history.getByRole('button', { name: /^历史记录/ }).click();
  await expect(history.getByRole('region', { name: '提交改动详情' })).toContainText('1 → 2.5');
  await history
    .getByRole('listitem')
    .filter({ hasText: '初始结构' })
    .getByRole('button', { name: '恢复到工作树' })
    .click();
  await expect(history.getByRole('region', { name: '当前改动', exact: true })).toContainText('2.5 → 1');
  await history.getByRole('textbox', { name: '当前改动提交说明', exact: true }).fill('恢复初始结构');
  await history.getByRole('button', { name: '提交当前改动', exact: true }).click();
  await history.getByRole('button', { name: /^历史记录/ }).click();
  await expect(history.getByRole('list', { name: '提交记录' }).getByRole('listitem')).toHaveCount(3);
  expect(errors).toEqual([]);
});
