import { expect, test } from '@playwright/test';
import { openPage, readCount } from './e2e-utils.js';

test.describe('File Manager Simple - Batch Add Single Undo', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
  });

  test('batch add 100 should produce exactly 1 undo entry', async ({ page }) => {
    const undoButton = page.getByTestId('file-undo');
    const redoButton = page.getByTestId('file-redo');
    const count = page.getByTestId('file-count');

    await expect(undoButton).toBeDisabled();

    const countBefore = readCount(await count.textContent(), '文件计数');

    await page.getByTestId('file-batch-add').click();
    await page.getByTestId('file-batch-option-100').click();
    await expect(undoButton).toBeEnabled({ timeout: 30000 });

    await expect(async () => {
      expect(readCount(await count.textContent(), '文件计数')).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 30000 });

    const countAfter = readCount(await count.textContent(), '文件计数');
    await expect(undoButton.getByTestId('file-undo-count')).toHaveText('1', { timeout: 30000 });

    await undoButton.click();

    await expect(async () => {
      expect(readCount(await count.textContent(), '文件计数')).toBe(countBefore);
    }).toPass({ timeout: 30000 });

    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeEnabled();
    await expect(redoButton.getByTestId('file-redo-count')).toHaveText('1');

    await redoButton.click();

    await expect(async () => {
      expect(readCount(await count.textContent(), '文件计数')).toBe(countAfter);
    }).toPass({ timeout: 30000 });
  });
});
