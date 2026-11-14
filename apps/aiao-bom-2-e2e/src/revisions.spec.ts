import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeStressDataset } from '../../aiao-bom-2/src/app/core/stress-data';

const dataset = makeStressDataset(12);
async function open(page: Page): Promise<void> {
  await page.route('**/data/windrose.json', route => route.fulfill({ json: dataset }));
  await page.goto('/');
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '关闭模型与详情' }).click();
}
async function versions(page: Page) {
  await page.getByRole('button', { name: '版本 / 差异', exact: true }).click();
  return page.getByRole('dialog', { name: '版本快照与日期比较' });
}
async function capture(page: Page, name: string, date: string): Promise<void> {
  const dialog = await versions(page);
  await dialog.getByRole('textbox', { name: '快照名称', exact: true }).fill(name);
  await dialog.getByLabel('评估日期', { exact: true }).fill(date);
  await dialog.getByRole('button', { name: '保存完整结构快照' }).click();
  await expect(dialog.getByRole('combobox', { name: '目标版本', exact: true })).toContainText(name);
  await expect(dialog.getByRole('button', { name: '保存完整结构快照' })).toBeEnabled();
}

test('完整结构版本保存、改量差异、重开恢复、导出与独立工作区重入', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.getByRole('button', { name: '建立工作草稿', exact: true }).click();
  await page.getByRole('button', { name: '建立草稿', exact: true }).click();
  await capture(page, '设计 A', '2026-11-13');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('ST-000001');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  const grid = page.getByTestId('bom-grid'); await expect(grid).toHaveAttribute('aria-busy', 'false');
  const box = await grid.boundingBox(); if (!box) throw new Error('表格未渲染');
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
  const diffDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出完整差异 JSON' }).click();
  const diffPath = await (await diffDownload).path(); if (!diffPath) throw new Error('没有差异导出文件');
  const diff = JSON.parse(await readFile(diffPath, 'utf8'));
  expect(diff.summary.quantityChanges).toBe(1); expect(diff.changes[0].quantityDelta).toBe('1.5');
  expect(diff.before.nodeCount).toBe(12); expect(diff.after.nodeCount).toBe(12);
  const snapshotDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出目标快照 JSON' }).click();
  const snapshotPath = await (await snapshotDownload).path(); if (!snapshotPath) throw new Error('没有快照导出文件');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  expect(snapshot.nodes).toHaveLength(12); expect(snapshot.evaluationDate).toBe('2026-11-14');
  expect(snapshot.observedOn).toBe('2026-11-13'); expect(snapshot.nodes.find((node: { key: string }) => node.key === 'stress:1').quantity).toBe('2.5');
  await page.reload(); await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
  await versions(page); await expect(page.getByTestId('revision-summary')).toContainText('改量 1');
  const isolated = await browser.newContext();
  try {
    const fresh = await isolated.newPage(); await open(fresh); const importing = await versions(fresh);
    await importing.getByLabel('导入版本快照 JSON', { exact: true }).setInputFiles(snapshotPath);
    await expect(importing).toContainText('待导入：设计 B');
    await importing.getByRole('button', { name: '确认导入版本快照' }).click();
    await expect(importing.getByRole('combobox', { name: '目标版本', exact: true })).toContainText('设计 B');
    await importing.getByLabel('导入版本快照 JSON', { exact: true }).setInputFiles(snapshotPath);
    await importing.getByRole('button', { name: '确认导入版本快照' }).click();
    await expect(importing.getByRole('alert')).toContainText('存在');
  } finally { await isolated.close(); }
  expect(errors).toEqual([]);
});

test('窄屏版本对话框不溢出，跨结构选择显示错误且不损坏主表', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await open(page);
  await capture(page, '来源版本', '2026-11-13');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '建立工作草稿', exact: true }).click();
  await page.getByRole('button', { name: '建立草稿', exact: true }).click();
  await capture(page, '草稿版本', '2026-11-14');
  const dialog = page.getByRole('dialog');
  const option = dialog.getByRole('combobox', { name: '基准版本', exact: true }).locator('option').filter({ hasText: '来源版本' });
  await dialog.getByRole('combobox', { name: '基准版本', exact: true }).selectOption(await option.getAttribute('value') ?? '');
  await expect(dialog.getByRole('alert')).toContainText('同一结构来源');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toBeVisible();
});
