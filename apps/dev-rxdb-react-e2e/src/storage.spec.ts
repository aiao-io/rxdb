import { expect, test } from '@playwright/test';

const T = {
  PAGE: 'storage-page',
  UPLOAD_BTN: 'storage-upload-btn',
  UPLOAD_FOLDER_BTN: 'storage-upload-folder-btn',
  FILE_INPUT: 'storage-file-input',
  FOLDER_INPUT: 'storage-folder-input',
  FILE_LIST: 'storage-file-list',
  FILE_ROW: 'storage-file-row',
  FILE_NAME: 'storage-file-name',
  NEW_FOLDER_BTN: 'storage-new-folder-btn',
  NEW_FOLDER_DIALOG: 'storage-new-folder-dialog',
  NEW_FOLDER_INPUT: 'storage-new-folder-input',
  NEW_FOLDER_CONFIRM: 'storage-new-folder-confirm',
  PREVIEW_BTN: 'storage-preview-btn',
  PREVIEW_MODAL: 'storage-preview-modal',
  PREVIEW_CLOSE: 'storage-preview-close',
  DELETE_BTN: 'storage-delete-btn',
  CLEAR_BTN: 'storage-clear-btn',
  CONFIRM_DIALOG: 'storage-confirm-dialog',
  CONFIRM_YES: 'storage-confirm-yes',
  CONTEXT_MENU: 'storage-context-menu',
  CONTEXT_DOWNLOAD: 'storage-context-download',
  CONTEXT_RENAME: 'storage-context-rename',
  CONTEXT_DELETE: 'storage-context-delete',
  RENAME_DIALOG: 'storage-rename-dialog',
  RENAME_INPUT: 'storage-rename-input',
  RENAME_CONFIRM: 'storage-rename-confirm',
  EMPTY_STATE: 'storage-empty-state',
  SUCCESS_TOAST: 'storage-success-toast'
};

async function disableSavePicker(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      writable: true,
      value: undefined
    });

    window.localStorage.setItem('storage-view-mode', 'list');
  });
}

async function clearStorageIfNeeded(page: import('@playwright/test').Page) {
  const clearButton = page.getByTestId(T.CLEAR_BTN);

  // P1-6：原先这里是 isVisible() 后面挂一个吞掉一切的 catch。
  // Playwright 的 isVisible() 对“元素不存在”本来就返回 false，
  // **它只在 strict-mode 违规（选择器命中多个）或 frame 已分离时才抛** ——
  // 那个 catch 专门吞掉的正是“选择器写错了”这类信号，把它伪装成“没有这个按钮”。
  if (await clearButton.isVisible()) {
    await clearButton.click();
    await expect(page.getByTestId(T.CONFIRM_DIALOG)).toBeVisible();
    await page.getByTestId(T.CONFIRM_YES).click();
  }

  await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible({ timeout: 5000 });

  const successToast = page.getByTestId(T.SUCCESS_TOAST);
  if (await successToast.isVisible()) {
    await successToast.getByRole('button').click();
    await expect(successToast).toBeHidden({ timeout: 5000 });
  }
}

async function openRenameDialogFromName(page: import('@playwright/test').Page, name: string) {
  await page.getByText(name, { exact: true }).click({ button: 'right' });
  await expect(page.getByTestId(T.CONTEXT_MENU)).toBeVisible();
  await page.getByTestId(T.CONTEXT_RENAME).click();
  await expect(page.getByTestId(T.RENAME_DIALOG)).toBeVisible();
}

async function waitForUploadedEntry(page: import('@playwright/test').Page, name: string) {
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
}

async function waitForListedEntry(page: import('@playwright/test').Page, name: string) {
  await expect(page.getByTestId(T.EMPTY_STATE)).toBeHidden({ timeout: 15000 });
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15000 });
}

function getFileRow(page: import('@playwright/test').Page, name: string) {
  return page.getByTestId(T.FILE_ROW).filter({ hasText: name });
}

test.describe('Storage Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await disableSavePicker(page);
    await page.goto('/storage');
    await expect(page.getByTestId(T.PAGE)).toBeVisible({ timeout: 15000 });
    await page.getByRole('tab', { name: 'List' }).click();
    await clearStorageIfNeeded(page);
  });

  test('should show empty state when no files', async ({ page }) => {
    await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible();
  });

  test('upload → preview → rename → delete → empty', async ({ page }) => {
    const buffer = Buffer.from('hello world');
    const fileInput = page.getByTestId(T.FILE_INPUT);
    const originalName = 'test-file.txt';
    const renamedName = 'renamed-file.txt';

    await fileInput.setInputFiles({
      name: originalName,
      mimeType: 'text/plain',
      buffer
    });

    await waitForUploadedEntry(page, originalName);
    const originalRow = getFileRow(page, originalName);
    await expect(originalRow.getByTestId(T.PREVIEW_BTN)).toBeVisible();
    await expect(originalRow.getByTestId(T.DELETE_BTN)).toBeVisible();

    await originalRow.getByTestId(T.PREVIEW_BTN).click();
    await expect(page.getByTestId(T.PREVIEW_MODAL)).toBeVisible();
    await page.getByTestId(T.PREVIEW_CLOSE).click();
    await expect(page.getByTestId(T.PREVIEW_MODAL)).toBeHidden();

    await openRenameDialogFromName(page, originalName);
    await page.getByTestId(T.RENAME_INPUT).fill(renamedName);
    await page.getByTestId(T.RENAME_CONFIRM).click();
    await expect(page.getByText(renamedName, { exact: true })).toBeVisible({ timeout: 5000 });

    await getFileRow(page, renamedName).getByTestId(T.DELETE_BTN).click();
    await expect(page.getByTestId(T.CONFIRM_DIALOG)).toBeVisible();
    await page.getByTestId(T.CONFIRM_YES).click();

    await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible({ timeout: 5000 });
  });

  test('create folder → rename → download zip → delete → empty', async ({ page }) => {
    const originalFolderName = 'demo-folder';
    const renamedFolderName = 'renamed-folder';

    await page.getByTestId(T.NEW_FOLDER_BTN).click();
    await expect(page.getByTestId(T.NEW_FOLDER_DIALOG)).toBeVisible();
    await page.getByTestId(T.NEW_FOLDER_INPUT).fill(originalFolderName);
    await page.getByTestId(T.NEW_FOLDER_CONFIRM).click();
    await expect(page.getByTestId(T.NEW_FOLDER_DIALOG)).toBeHidden({ timeout: 10000 });
    await waitForListedEntry(page, originalFolderName);

    await openRenameDialogFromName(page, originalFolderName);
    await page.getByTestId(T.RENAME_INPUT).fill(renamedFolderName);
    await page.getByTestId(T.RENAME_CONFIRM).click();
    await expect(page.getByText(renamedFolderName, { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByText(renamedFolderName, { exact: true }).click({ button: 'right' });
    await expect(page.getByTestId(T.CONTEXT_MENU)).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId(T.CONTEXT_DOWNLOAD).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${renamedFolderName}.zip`);

    await page.getByText(renamedFolderName, { exact: true }).click({ button: 'right' });
    await expect(page.getByTestId(T.CONTEXT_MENU)).toBeVisible();
    await page.getByTestId(T.CONTEXT_DELETE).click();
    await expect(page.getByTestId(T.CONFIRM_DIALOG)).toBeVisible();
    await page.getByTestId(T.CONFIRM_YES).click();
    await expect(page.getByTestId(T.EMPTY_STATE)).toBeVisible({ timeout: 10000 });
  });
});
