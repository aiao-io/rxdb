import { expect, test, type Page } from '@playwright/test';

const prepare = async (page: Page): Promise<void> => {
  await page.goto('/');
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('prepare-data').click();
  await expect(page.getByTestId('overview-data-status')).toContainText('已有 41 项物料', { timeout: 30000 });
};

test('已有数据重开后直接可用，取消重置不丢失数据，场景入口与筛选清晰', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepare(page);
  await page.reload();
  await expect(page.getByTestId('overview-data-status')).toContainText('已有 41 项物料', { timeout: 30000 });
  await expect(page.getByText('尚未装载种子', { exact: false })).toHaveCount(0);
  await expect(page.getByTestId('workflow-card')).toHaveCount(6);
  await page.getByTestId('item-filter').fill(' pcba ');
  await expect(page.getByTestId('item-inventory-row')).toHaveCount(1);
  await expect(page.getByTestId('overview-item-count')).toHaveText('41');
  await expect(page.getByTestId('item-inventory-row')).toContainText('控制板');
  await page.getByTestId('item-filter').fill('电池');
  await expect(page.getByTestId('item-inventory-row')).toHaveCount(4);
  await expect(page.getByTestId('item-inventory-row').filter({ hasText: 'BATT' })).toContainText('电池组');
  await page.getByTestId('item-filter').fill('');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click();
  await expect(page.getByTestId('overview-item-count')).toHaveText('41');
  await expect(page.getByTestId('overview-data-status')).toContainText('数据可用');
  await page.reload();
  await expect(page.getByTestId('overview-data-status')).toContainText('已有 41 项物料', { timeout: 30000 });
  await page.screenshot({ path: 'test-output/bom-redesign-overview-desktop.png', animations: 'disabled' });
});

test('成本按业务精度展示，原值可展开核对，构成不重复汇总子件', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepare(page);
  await page.getByRole('link', { name: '成本卷算', exact: true }).click();
  await page.getByTestId('as-of-date').fill('2026-10-15');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-summary-total')).toHaveText('CNY 39.12', { timeout: 30000 });
  await expect(page.getByTestId('cost-summary-unit')).toHaveText('CNY 39.120408 / pcs');
  await expect(page.getByTestId('cost-root-select').locator('option:checked')).toHaveText('电动滑板车（SC-100）');
  const pcba = page.locator('.cost-row[data-kind="material"][data-item="PCBA"]');
  await expect(pcba).toContainText('控制板（PCBA）');
  await expect(pcba.locator('[data-amount]')).toHaveAttribute('data-amount', '8.020408163265306122448979591836735');
  await expect(pcba.locator('[data-amount]')).toHaveText('8.02');
  await expect(page.getByText('子件成本已计入材料', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-output/bom-redesign-cost-desktop.png', animations: 'disabled' });
  await pcba.locator('summary').click();
  await expect(pcba.locator('code').filter({ hasText: '8.020408163265306122448979591836735' }).first()).toBeVisible();
});

test('窄屏导航可关闭，查询和成本结果不造成页面横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  const open = page.getByRole('button', { name: '打开导航', exact: true });
  await open.click();
  await expect(page.getByRole('button', { name: '关闭导航', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: '成本卷算', exact: true }).click();
  await expect(page.getByRole('heading', { name: '成本卷算', exact: true })).toBeVisible();
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('as-of-date').fill('2026-10-15');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-summary-total')).toHaveText('CNY 39.12', { timeout: 30000 });
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({ path: 'test-output/bom-redesign-cost-mobile.png', animations: 'disabled' });
});

test('物料反查按使用关系成树，分支支持鼠标键盘折叠与窄屏查看', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepare(page);
  await page
    .getByRole('navigation', { name: '主导航', exact: true })
    .getByRole('link', { name: '反查', exact: true })
    .click();
  await page.getByRole('button', { name: '反查 M3 螺钉（M3）', exact: true }).click();
  const tree = page.getByLabel('物料使用关系树', { exact: true });
  const lines = tree.getByTestId('where-used-line');
  const nestedScooter = tree.locator('[data-testid="where-used-line"][data-item="SC-100"][data-depth="2"]');
  const directScooter = tree.locator('[data-testid="where-used-line"][data-item="SC-100"][data-depth="1"]');
  await expect(lines).toHaveCount(3, { timeout: 30000 });
  const collapseHarness = tree.getByRole('button', { name: '收起 线束组件（WH-01）', exact: true });
  await expect(collapseHarness).toHaveAttribute('aria-expanded', 'true');
  await collapseHarness.click();
  await expect(lines).toHaveCount(2);
  await expect(nestedScooter).toHaveCount(0);
  await expect(directScooter).toBeVisible();
  const expandHarness = tree.getByRole('button', { name: '展开 线束组件（WH-01）', exact: true });
  await expect(expandHarness).toHaveAttribute('aria-expanded', 'false');
  await expandHarness.focus();
  await expandHarness.press('Enter');
  await expect(lines).toHaveCount(3);
  await expect(nestedScooter).toBeVisible();
  await expect(collapseHarness).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: '全部收起', exact: true }).click();
  await expect(lines).toHaveCount(2);
  await expect(expandHarness).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.getByText('M3 螺钉（M3）', { exact: true })).toBeVisible();
  await expect(directScooter).toBeVisible();
  await page.getByRole('button', { name: '全部展开', exact: true }).click();
  await expect(lines).toHaveCount(3);
  await expect(collapseHarness).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: 'test-output/bom-where-used-tree-desktop.png', animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tree).toBeVisible();
  await expect(nestedScooter).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.width);
  await page.screenshot({ path: 'test-output/bom-where-used-tree-mobile.png', animations: 'disabled' });
});
