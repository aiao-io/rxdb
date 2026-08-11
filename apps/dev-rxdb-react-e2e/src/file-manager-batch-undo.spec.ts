import { expect, test } from '@playwright/test';
import { openPage, readCount } from './e2e-utils.js';

test.describe('File Manager Simple - Batch Add Single Undo', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
  });

  test('batch add 100 should produce exactly 1 undo entry', async ({ page }) => {
    const undoButton = page.getByTestId('file-undo');
    const redoButton = page.getByTestId('file-redo');
    const badge = page.getByTestId('file-count');

    // 确认初始状态：undo 按钮禁用
    await expect(undoButton).toBeDisabled();

    // 获取初始文件数
    const textBefore = await badge.textContent();
    const countBefore = readCount(textBefore, 'badge');

    // 批量添加 100 条
    await page.getByTestId('file-batch-add').click();
    const option100 = page.getByTestId('file-batch-option-100');
    await expect(option100).toBeVisible();
    await option100.click();
    await expect(undoButton).toBeEnabled({ timeout: 30000 });

    // 等待批量添加完成
    await expect(async () => {
      const textAfter = await badge.textContent();
      const countAfter = readCount(textAfter, 'badge');
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 30000 });

    const textAfter = await badge.textContent();
    const countAfter = readCount(textAfter, 'badge');

    // 核心断言：undo badge 应该显示 1（不是 100）
    const undoBadge = page.getByTestId('file-undo-count');
    await expect(undoBadge).toHaveText('1', { timeout: 30000 });

    // 点击 undo → 所有文件一次性回滚
    await undoButton.click();

    await expect(async () => {
      const textUndo = await badge.textContent();
      const countUndo = readCount(textUndo, 'badge');
      expect(countUndo).toBe(countBefore);
    }).toPass({ timeout: 30000 });

    // undo 禁用，redo 启用
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();

    // redo badge 应该显示 1
    const redoBadge = page.getByTestId('file-redo-count');
    await expect(redoBadge).toHaveText('1');

    // 点击 redo → 所有文件一次性恢复
    await redoButton.click();

    await expect(async () => {
      const textRedo = await badge.textContent();
      const countRedo = readCount(textRedo, 'badge');
      expect(countRedo).toBe(countAfter);
    }).toPass({ timeout: 30000 });
  });
});
