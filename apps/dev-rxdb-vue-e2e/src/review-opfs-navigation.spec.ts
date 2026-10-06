import { expect, test, type Page } from '@playwright/test';

const FILE_NAME = 'review-navigation.txt';
const CONTENT = 'review-navigation-content';

type NavigationGate = { pending: boolean; release: () => void };
type ReviewWindow = Window & { reviewOpfsGate?: NavigationGate };

/**
 * 打开 OPFS 页面并等待连接完成。
 */
async function connect(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('opfs-view-mode', 'list'));
  await page.goto('/opfs');
  await expect(page.getByText('已连接')).toBeVisible();
}

async function createFolder(page: Page, folder: string): Promise<void> {
  await page.getByRole('button', { name: '新建文件夹' }).click();
  await page.getByPlaceholder('文件夹名称').fill(folder);
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.locator('[data-entry-path]').filter({ hasText: folder })).toBeVisible();
}

/**
 * 点击目录行进入子目录——Vue 页面里这一步直接调 `opfs.navigateTo`，
 * 目录读取完成后才会反向把 URL 同步过去（见 OpfsPage.vue 的两个 watch）。
 * 这里未打栓所以会正常走完，用来在浏览器历史里留一条 `/opfs/<folder>` 记录。
 */
async function enterFolder(page: Page, folder: string): Promise<void> {
  const row = page.locator('[data-entry-path]').filter({ hasText: folder });
  await row.getByRole('button', { name: folder, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/opfs/${folder}$`));
}

async function goHome(page: Page): Promise<void> {
  await page.getByTitle('根目录', { exact: true }).click();
  await expect(page).toHaveURL(/\/opfs$/);
}

/**
 * 给原生 `getDirectoryHandle` 打一个可控的栓——命中目标文件夹名、且不是
 * `{create:true}` 的调用会卡在这里，直到 {@link releaseNavigation}。
 *
 * @remarks
 * 浏览器「后退」把地址栏改回 `/opfs/<folder>` 是同步的（History API），
 * 而 Vue 这边的 `watch(() => route.params.opfsPath, ...)` 之后才异步触发
 * `navigateTo` 重新解析目录句柄——地址栏已经是目标目录，内容还没追上，
 * 这才是 RV-037 描述的那条竞态窗口；直接点目录行走的是相反方向（内容先于 URL），
 * 复现不出同一症状。
 */
async function installGate(page: Page, folder: string): Promise<void> {
  await page.evaluate(name => {
    let release = (): void => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const state: NavigationGate = { pending: false, release };
    (window as ReviewWindow).reviewOpfsGate = state;
    const original = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
    FileSystemDirectoryHandle.prototype.getDirectoryHandle = async function (entryName, options) {
      if (entryName === name && !options?.create) {
        state.pending = true;
        await gate;
      }
      return original.call(this, entryName, options);
    };
  }, folder);
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
  // Vue 的上传 input 带 data-testid，不必像 React 端那样走原生 file chooser 事件。
  await page.getByTestId('opfs-file-input').setInputFiles({
    name: FILE_NAME,
    mimeType: 'text/plain',
    buffer: Buffer.from(CONTENT)
  });
}

/**
 * 两次访问都未打栓，先进目标目录再回根目录，在浏览器历史里留下
 * `/opfs -> /opfs/<folder> -> /opfs` 三条记录；随后安装栓并 `goBack()`
 * 复现「地址栏已到目标目录、内容还在异步追」的窗口。
 */
async function prepareBackNavigationRace(page: Page, folder: string): Promise<void> {
  await connect(page);
  await createFolder(page, folder);
  await enterFolder(page, folder);
  await goHome(page);
  await installGate(page, folder);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/opfs/${folder}$`));
  await expect.poll(() => page.evaluate(() => (window as ReviewWindow).reviewOpfsGate?.pending)).toBe(true);
}

test('评审：浏览器后退到目标目录尚未完成加载时，上传不能静默写入旧目录', async ({ page }) => {
  const folder = `review-race-${Date.now()}`;
  await prepareBackNavigationRace(page, folder);
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
  await test.info().attach('disk-after-pending-back-navigation', {
    body: JSON.stringify({ folder, actual, url: page.url() }, null, 2),
    contentType: 'application/json'
  });
  expect(actual.root).toBeNull();
  expect(actual.target).toBe(CONTENT);
});

test('评审对照：等待后退导航的目录加载完成后，上传写入目标目录', async ({ page }) => {
  const folder = `review-control-${Date.now()}`;
  await prepareBackNavigationRace(page, folder);
  await releaseNavigation(page);
  await expect(page.getByText('0 项 (0 个文件夹, 0 个文件)')).toBeVisible();
  await upload(page);
  await expect(page.locator(`[data-entry-path="/${folder}/${FILE_NAME}"]`)).toBeVisible();
  expect(await readDisk(page, folder)).toEqual({ root: null, target: CONTENT });
});
