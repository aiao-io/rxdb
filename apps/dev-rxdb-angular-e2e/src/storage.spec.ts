import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

const T = {
  PAGE: 'storage-page',
  UPLOAD_BTN: 'storage-upload-btn',
  FILE_INPUT: 'storage-file-input',
  FILE_LIST: 'storage-file-list',
  FILE_ROW: 'storage-file-row',
  FILE_NAME: 'storage-file-name',
  PREVIEW_BTN: 'storage-preview-btn',
  PREVIEW_MODAL: 'storage-preview-modal',
  PREVIEW_CLOSE: 'storage-preview-close',
  DELETE_BTN: 'storage-delete-btn',
  CONFIRM_DIALOG: 'storage-confirm-dialog',
  CONFIRM_YES: 'storage-confirm-yes',
  EMPTY_STATE: 'storage-empty-state',
  SUCCESS_TOAST: 'storage-success-toast'
};

test.describe('Storage Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/storage');
    await expect(page.getByTestId(T.PAGE)).toBeVisible({ timeout: 15000 });
  });

  test('should show empty state when no files', async ({ page }) => {
    await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible();
  });

  test('upload → list → preview → delete → empty', async ({ page }) => {
    // Create a test file in memory
    const buffer = Buffer.from('hello world');
    const fileInput = page.getByTestId(T.FILE_INPUT);

    // Upload file
    await fileInput.setInputFiles({
      name: 'test-file.txt',
      mimeType: 'text/plain',
      buffer
    });

    // Verify file appears in list
    await expect(page.getByTestId(T.FILE_LIST)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(T.FILE_ROW)).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByTestId(T.FILE_NAME).first()).toContainText('test-file.txt', { timeout: 10000 });

    // Preview the file
    await page.getByTestId(T.PREVIEW_BTN).first().click();
    await expect(page.getByTestId(T.PREVIEW_MODAL)).toBeVisible();
    await page.getByTestId(T.PREVIEW_CLOSE).click();
    await expect(page.getByTestId(T.PREVIEW_MODAL)).toBeHidden();

    // Delete the file
    await page.getByTestId(T.DELETE_BTN).first().click();
    await expect(page.getByTestId(T.CONFIRM_DIALOG)).toBeVisible();
    await page.getByTestId(T.CONFIRM_YES).click();

    // Verify file is gone
    await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible({ timeout: 10000 });
  });
});
