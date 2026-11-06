import { expect, test } from '@playwright/test';
import { SCOOTER_SEED_ROWS, acceptDialog } from './support';

test('联产场景按需追加，展示220→132/88并显式选择下游成本来源', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '概览', exact: true }).click();
  await acceptDialog(page, () => page.getByRole('button', { name: /准备演示数据/ }).click());
  await page.getByText('数据版本与记录统计', { exact: true }).click();
  await expect(page.getByTestId('row-counts')).toContainText(`item=${SCOOTER_SEED_ROWS.item}`, { timeout: 30000 });
  await page.getByRole('link', { name: '成本卷算', exact: true }).click();
  await page.getByRole('button', { name: '装载联产演示', exact: true }).click();
  await expect(page.getByTestId('coproduct-load-status')).toContainText('联产演示已装载', { timeout: 30000 });
  await page.getByTestId('cost-root-select').selectOption('JOINT-MAIN');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-joint-net')).toContainText('220');
  await expect(page.locator('.cost-row[data-kind="joint-output"][data-item="JOINT-MAIN"]')).toContainText('132');
  await expect(page.locator('.cost-row[data-kind="joint-output"][data-item="JOINT-CO"]')).toContainText('88');
  await expect(page.locator('.cost-row[data-kind="joint-output"][data-item="JOINT-CO"]')).toContainText('1.76');
  await page.getByTestId('cost-root-select').selectOption('JOINT-CONSUMER');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-error')).toContainText('来源未解析');
  await page.getByTestId('joint-source-select').selectOption('JOINT-MAIN');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-error')).toHaveCount(0);
  await expect(
    page.locator('.cost-row[data-kind="head"][data-item="JOINT-CONSUMER"] [data-amount="17.6"]')
  ).toBeVisible();
  await expect(page.getByTestId('cost-summary-total')).toHaveText('CNY 17.60');
  await page.reload();
  await page.getByRole('link', { name: '成本卷算', exact: true }).click();
  await page.getByTestId('cost-root-select').selectOption('JOINT-MAIN');
  await page.getByRole('button', { name: '卷算', exact: true }).click();
  await expect(page.getByTestId('cost-joint-net')).toContainText('220');
});
