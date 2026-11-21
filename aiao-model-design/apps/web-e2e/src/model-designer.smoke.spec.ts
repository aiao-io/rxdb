import { expect, test } from '@playwright/test';

test.describe('模型设计器入口', () => {
  test('创建实体、刷新后恢复并切换到表格视图', async ({ page }) => {
    await page.goto('/model-designer/canvas');

    await expect(page.getByRole('button', { name: '+ 实体' })).toBeVisible();
    await expect(page.getByText('无实体，点击右上角添加')).toBeVisible();

    await page.getByRole('button', { name: '+ 实体' }).click();
    await expect(page.getByRole('button', { name: 'NewEntity', exact: true })).toBeVisible();
    await expect(page.getByText('1 个实体')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'NewEntity', exact: true })).toBeVisible();
    await expect(page.getByText('1 个实体')).toBeVisible();

    await page.getByRole('button', { name: '表格', exact: true }).click();
    await expect(page).toHaveURL(/\/model-designer\/table\/[^/]+\/properties$/);
    await expect(page.getByRole('textbox', { name: '名称' })).toHaveValue('NewEntity');
    await expect(page.getByRole('textbox', { name: '表名' })).toBeVisible();
  });
});
