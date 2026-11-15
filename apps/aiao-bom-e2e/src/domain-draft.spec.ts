import { expect, test } from '@playwright/test';

async function createBranch(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: '建立工作草稿', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '分支名称', exact: true }).fill('领域核对');
  await dialog.getByRole('button', { name: '建立分支', exact: true }).click();
}

test('工作草稿通过本地分支提交管理，工作台取消文件交换入口', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0);
  await createBranch(page);
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  const commit = page.getByRole('dialog');
  await commit.getByRole('textbox', { name: '提交说明', exact: true }).fill('建立领域核对基线');
  await commit.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.app-footer')).toContainText('已提交到本地版本历史');
  await page.getByRole('button', { name: '版本历史', exact: true }).click();
  const history = page.getByRole('dialog', { name: '版本历史', exact: true });
  await history.getByRole('button', { name: /^历史记录/ }).click();
  await expect(history).toContainText('领域核对');
  await expect(history).toContainText('建立领域核对基线');
  await expect(history).toContainText('HEAD');
});
