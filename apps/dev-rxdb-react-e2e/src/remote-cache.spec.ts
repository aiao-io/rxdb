import { expect, Page, test } from '@playwright/test';

const requestCounts = new WeakMap<Page, number>();

test.describe('Remote Cache Page (US-502 fetch + OPFS cache)', () => {
  test.beforeEach(async ({ page }) => {
    await stubPicsumFetch(page);
    await page.goto('/remote-cache');
    await expect(page.getByRole('heading', { level: 2, name: 'Remote Cache' })).toBeVisible();
  });

  test('should render preset resource buttons and start with no cached items', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Picsum #237/u })).toBeVisible();
    await expect(page.getByRole('button', { name: /Picsum #433/u })).toBeVisible();
    await expect(page.getByRole('button', { name: /Picsum #1015/u })).toBeVisible();
    await expect(page.getByTestId('remote-cache-count')).toHaveText('已缓存（0）');
    await expect(page.getByTestId('remote-cache-empty')).toBeVisible();
    await expect(page.getByTestId('remote-cache-log-empty')).toBeVisible();
  });

  test('should fetch a preset resource, populate cache and log a download event', async ({ page }) => {
    const button = page.getByRole('button', { name: /Picsum #237/u });
    await button.click();

    await expect(page.getByTestId('remote-cache-count')).toHaveText('已缓存（1）', { timeout: 10000 });

    const downloadLog = page.getByTestId('remote-cache-log-entry').filter({ hasText: 'Downloaded:' });
    await expect(downloadLog).toBeVisible();
    await expect(downloadLog).toContainText('remote/picsum-237.jpg');
  });

  test('should serve a second fetch from OPFS cache (hit, no network)', async ({ page }) => {
    const button = page.getByRole('button', { name: /Picsum #237/u });

    await button.click();
    await expect(page.getByTestId('remote-cache-count')).toHaveText('已缓存（1）', { timeout: 10000 });
    expect(requestCounts.get(page)).toBe(1);

    await button.click();
    const hitLog = page.getByTestId('remote-cache-log-entry').filter({ hasText: 'OPFS hit:' });
    await expect(hitLog).toBeVisible({ timeout: 5000 });
    await expect(hitLog).toContainText('no network');
    expect(requestCounts.get(page)).toBe(1);
  });

  test('should clear all cached entries with the Clear all button', async ({ page }) => {
    await page.getByRole('button', { name: /Picsum #237/u }).click();
    await expect(page.getByTestId('remote-cache-count')).toHaveText('已缓存（1）', { timeout: 10000 });

    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByTestId('remote-cache-count')).toHaveText('已缓存（0）', { timeout: 5000 });
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
