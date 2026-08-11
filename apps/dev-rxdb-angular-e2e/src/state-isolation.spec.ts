import { expect, test, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

const DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';

async function readDbName(page: Page): Promise<string> {
  const value = await page.evaluate(storageKey => window.localStorage.getItem(storageKey), DB_NAME_STORAGE_KEY);
  if (value === null) {
    throw new Error(`localStorage 缺少 ${DB_NAME_STORAGE_KEY}`);
  }
  return value;
}

function todoRow(page: Page, title: string) {
  return page.getByTestId('todo-row').filter({ hasText: title }).first();
}

test('browser contexts use isolated databases while reload reuses the current database', async ({ browser, page }) => {
  const title = `隔离契约-${Date.now()}`;
  await resetE2eState(page);
  await page.goto('/todo');
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  const firstDbName = await readDbName(page);

  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(todoRow(page, title)).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  await expect(todoRow(page, title)).toBeVisible({ timeout: 15000 });
  expect(await readDbName(page)).toBe(firstDbName);

  const secondContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const secondPage = await secondContext.newPage();
    await resetE2eState(secondPage);
    await secondPage.goto('/todo');
    await expect(secondPage.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });

    const secondDbName = await readDbName(secondPage);
    expect(secondDbName).not.toBe(firstDbName);
    await expect(todoRow(secondPage, title)).toHaveCount(0);
  } finally {
    await secondContext.close();
  }
});
