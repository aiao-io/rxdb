import { expect, type Locator, type Page, test } from '@playwright/test';

const FILE_NAME = 'opfs-e2e.txt';
const FILE_CONTENT = 'original-content';

function fileRow(page: Page, name: string): Locator {
  return page.locator('[data-entry-path]').filter({ hasText: name });
}

async function uploadTextFile(page: Page, name: string, content: string): Promise<void> {
  await page.getByTestId('opfs-file-input').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(content)
  });
}

async function openIsolatedFolder(page: Page): Promise<void> {
  const name = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.getByRole('button', { name: '新建文件夹' }).click();
  await page.getByPlaceholder('文件夹名称').fill(name);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  const folder = fileRow(page, name);
  await expect(folder).toBeVisible({ timeout: 10000 });
  await folder.getByRole('button', { name }).click();
  await expect(page.getByRole('button', { name: '上传文件', exact: true })).toBeVisible();
}

test.describe('OPFS Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('opfs-view-mode', 'list');
    });
    await page.goto('/opfs');
    await expect(page.getByRole('button', { name: '上传文件', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('已连接')).toBeVisible({ timeout: 20000 });
    await page.getByRole('tab', { name: 'List' }).click();
    await openIsolatedFolder(page);
  });

  test('should keep the original file when overwrite is cancelled', async ({ page }) => {
    await uploadTextFile(page, FILE_NAME, FILE_CONTENT);
    await expect(fileRow(page, FILE_NAME)).toBeVisible({ timeout: 10000 });

    await uploadTextFile(page, FILE_NAME, 'replacement-content');
    const overwriteDialog = page.getByRole('heading', { name: '文件已存在' });
    await expect(overwriteDialog).toBeVisible();

    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(overwriteDialog).toHaveCount(0);
    await expect(fileRow(page, FILE_NAME)).toBeVisible();
    await expect(fileRow(page, FILE_NAME)).toHaveCount(1);
  });

  test('should keep the file when delete confirmation is cancelled', async ({ page }) => {
    await uploadTextFile(page, FILE_NAME, FILE_CONTENT);
    const row = fileRow(page, FILE_NAME);
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByTitle('删除').click();
    const deleteDialog = page.getByRole('heading', { name: '确认删除' });
    await expect(deleteDialog).toBeVisible();

    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(deleteDialog).toHaveCount(0);
    await expect(row).toBeVisible();
  });

  test('should keep the rename dialog open when rename fails', async ({ page }) => {
    await uploadTextFile(page, FILE_NAME, FILE_CONTENT);
    const row = fileRow(page, FILE_NAME);
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.click({ button: 'right' });
    await page.locator('.menu').getByText('重命名', { exact: true }).click();

    const renameHeading = page.getByRole('heading', { name: '重命名文件' });
    await expect(renameHeading).toBeVisible();

    await page.getByPlaceholder('文件名').fill('renamed-opfs-e2e.txt');
    await page.getByRole('button', { name: '确定', exact: true }).click();

    await expect(page.getByTestId('opfs-error')).toContainText('重命名失败', { timeout: 10000 });
    await expect(renameHeading).toBeVisible();
    await expect(fileRow(page, FILE_NAME)).toBeVisible();
    await expect(fileRow(page, 'renamed-opfs-e2e.txt')).toHaveCount(0);
  });
});
