import { expect, Page, test } from '@playwright/test';

const requestCounts = new WeakMap<Page, number>();

test.describe('Remote Cache Page (US-502 fetch + OPFS cache)', () => {
  // 与 vue 端同样串行：OPFS 是同源持久化的，上一条用例落盘的文件会被下一条看见，
  // 并行跑时「已缓存（N）」的断言互相打架。beforeEach 里的清理是同一个原因。
  test.describe.configure({ mode: 'serial' });

  /*
   * Angular demo 独有：生产构建注册了 ngsw-worker.js（`provideServiceWorker(..., { enabled: !isDevMode() })`），
   * 而 e2e 跑的正是生产产物。走 SW 发出的请求 **不经过 `page.route`** —— 于是
   * `requestCounts` 永远是 0，「命中缓存时不发网络请求」这条断言会退化成恒真。
   * 这里把 SW 关掉，让 picsum 的请求回到页面上下文，stub 才真的拦得住。
   * react / vue demo 没有注册 SW，所以它们的同名 spec 不需要这一行。
   */
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await stubPicsumFetch(page);
    await page.goto('/remote-cache');
    await expect(page.getByRole('heading', { level: 2, name: 'Remote Cache' })).toBeVisible();
    const count = page.getByTestId('remote-cache-count');
    if (!(await count.innerText()).includes('（0）')) {
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expect(count).toContainText('已缓存（0）');
    }
  });

  test('should render preset resource buttons and start with no cached items', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Picsum #237/u })).toBeVisible();
    await expect(page.getByRole('button', { name: /Picsum #433/u })).toBeVisible();
    await expect(page.getByRole('button', { name: /Picsum #1015/u })).toBeVisible();
    await expect(page.getByTestId('remote-cache-count')).toContainText('已缓存（0）');
    await expect(page.getByTestId('remote-cache-empty')).toBeVisible();
    await expect(page.getByTestId('remote-cache-log-empty')).toBeVisible();
  });

  test('should fetch a preset resource, populate cache and log a download event', async ({ page }) => {
    await page.getByRole('button', { name: /Picsum #237/u }).click();

    await expect(page.getByTestId('remote-cache-count')).toContainText('已缓存（1）', { timeout: 10000 });

    const downloadLog = page.getByTestId('remote-cache-log-entry').filter({ hasText: 'Downloaded:' });
    await expect(downloadLog).toBeVisible();
    await expect(downloadLog).toContainText('remote/picsum-237.jpg');
  });

  test('should serve a second fetch from OPFS cache (hit, no network)', async ({ page }) => {
    const button = page.getByRole('button', { name: /Picsum #237/u });

    await button.click();
    await expect(page.getByTestId('remote-cache-count')).toContainText('已缓存（1）', { timeout: 10000 });
    expect(requestCounts.get(page)).toBe(1);

    await button.click();
    const hitLog = page.getByTestId('remote-cache-log-entry').filter({ hasText: 'OPFS hit:' });
    await expect(hitLog).toBeVisible({ timeout: 5000 });
    await expect(hitLog).toContainText('no network');
    // 这一条才是本页存在的意义：命中缓存时**一个网络请求都不能发**。
    expect(requestCounts.get(page)).toBe(1);
  });

  test('should clear all cached entries with the Clear all button', async ({ page }) => {
    await page.getByRole('button', { name: /Picsum #237/u }).click();
    await expect(page.getByTestId('remote-cache-count')).toContainText('已缓存（1）', { timeout: 10000 });

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByTestId('remote-cache-count')).toContainText('已缓存（0）', { timeout: 5000 });
    await expect(
      page.getByTestId('remote-cache-log-entry').filter({ hasText: 'Cleared cache directory' })
    ).toBeVisible();
  });
});

async function stubPicsumFetch(page: Page): Promise<void> {
  // 1x1 transparent PNG (smallest valid PNG)
  const PNG_BYTES = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
      '0a49444154789c6300010000000500010d0a2db40000000049454e44ae426082',
    'hex'
  );

  requestCounts.set(page, 0);
  await page.route('https://picsum.photos/**', async route => {
    requestCounts.set(page, (requestCounts.get(page) ?? 0) + 1);
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_BYTES
    });
  });
}
