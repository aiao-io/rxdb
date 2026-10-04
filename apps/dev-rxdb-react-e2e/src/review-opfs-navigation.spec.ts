import { expect, test, type Page } from '@playwright/test';

const FILE_NAME = 'review-navigation.txt';
const CONTENT = 'review-navigation-content';

type NavigationGate = { pending: boolean; release: () => void };
type ReviewWindow = Window & { reviewOpfsGate?: NavigationGate };

async function prepareDirectory(page: Page, folder: string): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('opfs-view-mode', 'list'));
  await page.goto('/opfs');
  await expect(page.getByText('已连接')).toBeVisible();
  await page.evaluate(async name => {
    const root = await navigator.storage.getDirectory();
    await root.getDirectoryHandle(name, { create: true });
    let release = (): void => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const state: NavigationGate = { pending: false, release };
    (window as ReviewWindow).reviewOpfsGate = state;
    const original = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = async function (name, options) {
      if (name === folderName && !options?.create) {
        state.pending = true;
        await gate;
      }
      return original.call(this, name, options);
    };
    const folderName = name;
  }, folder);
  await page.getByTitle('刷新', { exact: true }).click();
  const row = page.locator('[data-entry-path]').filter({ hasText: folder });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: folder, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/opfs/${folder}$`));
  await expect.poll(() => page.evaluate(() => (window as ReviewWindow).reviewOpfsGate?.pending)).toBe(true);
}

async function releaseNavigation(page: Page): Promise<void> {
  await page.evaluate(() => (window as ReviewWindow).reviewOpfsGate?.release());
}

async function readDisk(page: Page, folder: string): Promise<{ root: string | null; target: string | null }> {
  return page.evaluate(
    async ({ folder, fileName }) => {
      const root = await navigator.storage.getDirectory();
      const target = await root.getDirectoryHandle(folder);
      const read = async (directory: FileSystemDirectoryHandle): Promise<string | null> => {
        try {
          return await (await (await directory.getFileHandle(fileName)).getFile()).text();
        } catch (error) {
          if (error instanceof DOMException && error.name === 'NotFoundError') return null;
          throw error;
        }
      };
      return { root: await read(root), target: await read(target) };
    },
    { folder, fileName: FILE_NAME }
  );
}

async function upload(page: Page): Promise<void> {
  const chooserPending = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const chooser = await chooserPending;
  await chooser.setFiles({
    name: FILE_NAME,
    mimeType: 'text/plain',
    buffer: Buffer.from(CONTENT)
  });
}

test('评审：切换目录尚未完成时，上传不能静默写入旧目录', async ({ page }) => {
  const folder = `review-race-${Date.now()}`;
  await prepareDirectory(page, folder);
  try {
    await upload(page);
  } finally {
    await releaseNavigation(page);
  }
  await expect
    .poll(async () => {
      const disk = await readDisk(page, folder);
      return disk.root !== null || disk.target !== null;
    })
    .toBe(true);
  const actual = await readDisk(page, folder);
  await test.info().attach('disk-after-pending-navigation', {
    body: JSON.stringify({ folder, actual, url: page.url() }, null, 2),
    contentType: 'application/json'
  });
  expect(actual.root).toBeNull();
  expect(actual.target).toBe(CONTENT);
});

test('评审对照：等待目录加载后，上传写入目标目录', async ({ page }) => {
  const folder = `review-control-${Date.now()}`;
  await prepareDirectory(page, folder);
  await releaseNavigation(page);
  await expect(page.locator(`[data-entry-path="/${folder}/"]`)).toHaveCount(0);
  await upload(page);
  await expect(page.locator(`[data-entry-path="/${folder}/${FILE_NAME}"]`)).toBeVisible();
  expect(await readDisk(page, folder)).toEqual({ root: null, target: CONTENT });
});
