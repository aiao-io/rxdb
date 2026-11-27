import { expect, test } from '@playwright/test';

test.describe('aiao-media 图片工作台', () => {
  test('不展示已下线的媒体工具入口', async ({ page }) => {
    await page.goto('/images');
    await expect(page.locator('.media-nav')).toHaveCount(0);
    await expect(page.locator('.media-creation-section')).toHaveCount(0);
    await expect(page.getByText('媒体工具', { exact: true })).toHaveCount(0);
    for (const path of ['/tts', '/asr', '/music', '/video']) {
      await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
    }
  });
});
