import { expect, test } from '@playwright/test';

test('US-909 AC#2 探针：首次尝试失败、重试通过', async ({ page }, testInfo) => {
  await page.goto('/');
  expect(testInfo.retry, 'US-909 AC#2 探针：首次尝试故意失败').toBeGreaterThan(0);
});
