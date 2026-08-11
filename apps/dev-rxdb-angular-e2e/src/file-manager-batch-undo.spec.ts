import { expect, test } from '@playwright/test';
import { readCount, resetE2eState } from './e2e-utils.js';

test.describe('File Manager - Batch Add Single Undo', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/file-manager-simple');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('app-file-manager-simple-page')).toBeVisible();
  });

  test('batch add 100 should produce exactly 1 undo entry', async ({ page }) => {
    const undoButton = page.locator('button[aria-label="撤销"]');
    const redoButton = page.locator('button[aria-label="重做"]');
    const badge = page.getByTestId('file-count');

    // 确认初始状态：undo 按钮禁用，无 undo badge
    await expect(undoButton).toBeDisabled();

    // 获取初始文件数
    const textBefore = await badge.textContent();
    const countBefore = readCount(textBefore, '计数徽标');

    // 批量添加 100 条
    await page.getByTestId('file-batch-add').click();
    const option100 = page.getByTestId('file-batch-option-100');
    await expect(option100).toBeVisible({ timeout: 15000 });
    await option100.click();
    await expect(undoButton).toBeEnabled({ timeout: 30000 });

    // 等待批量添加完成：文件数增加
    await expect(async () => {
      const textAfter = await badge.textContent();
      const countAfter = readCount(textAfter, '计数徽标');
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 30000 });

    const textAfter = await badge.textContent();
    const countAfter = readCount(textAfter, '计数徽标');

    // 核心断言：undo badge 应该显示 1（不是 100）
    const undoBadge = page.getByTestId('file-undo-count');
    await expect(undoBadge).toHaveText('1', { timeout: 30000 });

    // 点击 undo → 所有文件一次性回滚
    await undoButton.click();

    await expect(async () => {
      const textUndo = await badge.textContent();
      const countUndo = readCount(textUndo, '计数徽标');
      expect(countUndo).toBe(countBefore);
    }).toPass({ timeout: 30000 });

    // undo 按钮应该禁用，redo 按钮应该启用
    await expect(undoButton).toBeDisabled({ timeout: 30000 });
    await expect(redoButton).toBeEnabled({ timeout: 30000 });

    // redo badge 应该显示 1
    const redoBadge = page.getByTestId('file-redo-count');
    await expect(redoBadge).toHaveText('1', { timeout: 30000 });

    // 点击 redo → 所有文件一次性恢复
    await redoButton.click();

    await expect(async () => {
      const textRedo = await badge.textContent();
      const countRedo = readCount(textRedo, '计数徽标');
      expect(countRedo).toBe(countAfter);
    }).toPass({ timeout: 30000 });
  });
});
