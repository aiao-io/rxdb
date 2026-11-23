import { expect } from '@playwright/test';

const timestamp = '2026-10-28T12:34:56.789Z';
const fileName = 'locale-sample.txt';
const fileContents = 'Sample file for localization';

async function uploadSample(page, browser, name = fileName) {
  await page.getByTestId(`${browser}-file-input`).setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(fileContents)
  });
}

function fileDate(page, value, locale) {
  return page.evaluate(
    ({ value, locale }) =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(value)),
    { value, locale }
  );
}

export async function checkStorageLocale(page) {
  await page.clock.setFixedTime(new Date(timestamp));
  await page.goto('/storage');
  const storage = page.getByTestId('storage-page');
  await expect(storage.getByTestId('storage-upload-btn')).toHaveText('Upload File');
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await uploadSample(page, 'storage');
  await expect(storage.getByRole('columnheader', { name: 'Modified' })).toBeVisible();
  const row = storage.getByTestId('storage-file-row').filter({ hasText: fileName });
  await expect(row).toContainText(await fileDate(page, timestamp, 'en'));
  const toast = page.getByTestId('storage-success-toast');
  await expect(toast).toContainText('File uploaded successfully');

  await page.getByTestId('i18n-locale').selectOption('zh-Hans');
  await expect(storage.getByTestId('storage-upload-btn')).toHaveText('上传文件');
  await expect(storage.getByRole('columnheader', { name: '修改时间' })).toBeVisible();
  await expect(row).toContainText(await fileDate(page, timestamp, 'zh-Hans'));
  await expect(toast).toContainText('文件上传成功');
  await row.getByTestId('storage-preview-btn').click();
  await expect(storage.getByTestId('storage-preview-modal')).toContainText(fileContents);
  await expect(storage.getByTestId('storage-preview-close')).toHaveAccessibleName('关闭预览');
}

export async function checkOpfsLocale(page) {
  await page.goto('/opfs');
  await expect(page.getByRole('button', { name: 'Upload File', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await uploadSample(page, 'opfs');
  await expect(page.getByRole('columnheader', { name: 'Modified' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: fileName });
  await expect(row).toBeVisible();
  const modifiedAt = await page.evaluate(async name => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name);
    return (await handle.getFile()).lastModified;
  }, fileName);
  await expect(row).toContainText(await fileDate(page, modifiedAt, 'en'));
  const names = ['阿.txt', '中.txt'];
  for (const name of names) await uploadSample(page, 'opfs', name);
  const fileRows = page.getByRole('row').filter({ hasText: /\.txt/ });
  await expect(fileRows).toHaveText([/locale-sample\.txt/, /中\.txt/, /阿\.txt/]);
  await row.getByTitle('Preview', { exact: true }).click();
  await expect(page.getByText(fileContents, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await row.getByTitle('Delete', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm delete' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.getByTestId('i18n-locale').selectOption('zh-Hans');
  await expect(page.getByRole('columnheader', { name: '修改时间' })).toBeVisible();
  await expect(row).toContainText(await fileDate(page, modifiedAt, 'zh-Hans'));
  await expect(fileRows).toHaveText([/阿\.txt/, /中\.txt/, /locale-sample\.txt/]);
  await row.getByTitle('删除', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '确认删除' })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(row).toBeVisible();
}

export async function checkHistoryLocale(page) {
  await page.goto('/todo');
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  const sidebar = page.getByTestId('history-sidebar');
  const sidebarWidth = () => sidebar.evaluate(node => node.clientWidth);
  await expect(sidebar.getByRole('heading', { name: 'Activity history' })).toBeVisible();
  await expect(sidebar.getByText('No activity yet', { exact: true })).toBeVisible();
  const title = 'Check history localization';
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  const historyTime = sidebar.locator('time').first();
  await expect(historyTime).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
  const recordedAt = await historyTime.getAttribute('datetime');
  const historyDate = locale =>
    page.evaluate(
      ({ value, locale }) =>
        new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          fractionalSecondDigits: 3
        }).format(new Date(value)),
      { value: recordedAt, locale }
    );
  await expect(historyTime).toHaveText(await historyDate('en'));
  await expect(sidebar.getByText('Created Task', { exact: false })).toBeVisible();
  await page.getByTestId('todo-undo').click();
  await expect(sidebar.getByText('Undone', { exact: true })).toBeVisible();
  await page.getByTestId('i18n-locale').selectOption('zh-Hans');
  await expect(sidebar.getByRole('heading', { name: '操作历史' })).toBeVisible();
  await expect(sidebar.getByText('已撤销', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('创建 Task', { exact: false })).toBeVisible();
  await expect(historyTime).toHaveText(await historyDate('zh-Hans'));
  await expect(historyTime).toHaveAttribute('datetime', recordedAt);
  await sidebar.getByRole('button', { name: '关闭历史', exact: true }).click();
  await expect.poll(sidebarWidth).toBe(0);
}

export async function checkHistoryEntrypointsLocale(page) {
  const paths = [
    '/file-manager-simple',
    '/file-manager-lazy',
    '/file-manager-virtual',
    '/menu-simple',
    '/menu-lazy',
    '/menu-virtual'
  ];
  const language = page.getByTestId('i18n-locale');
  const sidebar = page.getByTestId('history-sidebar');
  const sidebarWidth = () => sidebar.evaluate(node => node.clientWidth);
  for (const path of paths) {
    await page.goto(path);
    const historyButton = page.getByRole('button', { name: 'History', exact: true });
    await expect(historyButton).toBeVisible();
    await expect(sidebar.getByRole('heading', { name: 'Activity history' })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Close history', exact: true }).click();
    await expect.poll(sidebarWidth).toBe(0);
    await historyButton.click();
    await expect.poll(sidebarWidth).toBeGreaterThan(0);
    await language.selectOption('zh-Hans');
    await expect(page.getByRole('button', { name: '历史记录', exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: '关闭历史', exact: true }).click();
    await expect.poll(sidebarWidth).toBe(0);
    await language.selectOption('en');
  }
}
