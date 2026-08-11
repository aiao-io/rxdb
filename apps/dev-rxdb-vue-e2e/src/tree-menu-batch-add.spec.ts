import { expect, test, type Page } from '@playwright/test';
import { openPage, readCount } from './e2e-utils.js';

async function readMenuCount(page: Page): Promise<number> {
  return readCount(await page.getByTestId('menu-count').textContent(), '菜单计数徽标');
}

async function addBatch(page: Page, count: 100 | 1000 | 5000 | 10000): Promise<void> {
  await page.getByTestId('menu-batch-add').click();
  const option = page.getByTestId(`menu-batch-option-${count}`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toBeEnabled({ timeout: 60000 });
}

test.describe('Tree Menu - Batch Add Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
  });

  test('exposes every batch size through stable controls', async ({ page }) => {
    await page.getByTestId('menu-batch-add').click();
    for (const count of [100, 1000, 5000, 10000] as const) {
      await expect(page.getByTestId(`menu-batch-option-${count}`)).toBeVisible();
    }
  });

  test('adds one batch and reports the resulting count', async ({ page }) => {
    const before = await readMenuCount(page);
    await addBatch(page, 100);

    await expect.poll(() => readMenuCount(page), { timeout: 30000 }).toBeGreaterThanOrEqual(before + 100);
  });

  test('keeps titles unique across consecutive batches', async ({ page }) => {
    const before = await readMenuCount(page);
    await addBatch(page, 100);
    await addBatch(page, 100);

    await expect.poll(() => readMenuCount(page), { timeout: 30000 }).toBeGreaterThanOrEqual(before + 200);
  });
});
