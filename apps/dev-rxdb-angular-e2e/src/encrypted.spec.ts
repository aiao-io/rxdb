import { expect, test, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

const PASSPHRASE = 'test-passphrase-e2e';

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function userRow(page: Page, name: string) {
  return page.getByTestId('encryption-user-row').filter({ hasText: name });
}

async function unlockDatabase(page: Page): Promise<void> {
  await page.getByTestId('encryption-passphrase').fill(PASSPHRASE);
  const unlockButton = page.getByTestId('encryption-unlock');
  await expect(unlockButton).toBeEnabled({ timeout: 30000 });
  await unlockButton.click();
  await expect(page.getByTestId('encryption-status')).toContainText('已解锁', { timeout: 15000 });
}

test.describe('@encryption Encrypted Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/encrypted');
    await expect(page.locator('h1')).toContainText('本地字段加密演示', { timeout: 15000 });
  });

  test('should display locked state by default', async ({ page }) => {
    await expect(page.getByTestId('encryption-status')).toContainText('已锁定');
    await expect(page.getByTestId('encryption-passphrase')).toBeVisible();
  });

  test('should unlock with correct passphrase', async ({ page }) => {
    await unlockDatabase(page);
    await expect(page.getByTestId('encryption-status')).toContainText('已解锁');
  });

  test('should create an encrypted user after unlock', async ({ page }) => {
    const name = uniqueName('E2E User');
    const card = '4111 1111 1111 1111';
    const secret = `sk_test_e2e_${Date.now()}`;
    await unlockDatabase(page);

    await page.getByTestId('encryption-name').fill(name);
    await page.getByTestId('encryption-card').fill(card);
    await page.getByTestId('encryption-secret').fill(secret);
    await page.getByTestId('encryption-save-user').click();

    const row = userRow(page, name);
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText(card);
    await expect(row).toContainText(secret);
  });

  test('should persist encrypted user after page reload', async ({ page }) => {
    const name = uniqueName('Persistent User');
    await unlockDatabase(page);

    await page.getByTestId('encryption-name').fill(name);
    await page.getByTestId('encryption-save-user').click();
    await expect(userRow(page, name)).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByTestId('encryption-status')).toContainText('已锁定', { timeout: 15000 });
    await unlockDatabase(page);

    await expect(userRow(page, name)).toBeVisible({ timeout: 10000 });
  });

  test('should lock database and clear displayed data', async ({ page }) => {
    await unlockDatabase(page);

    await page.getByTestId('encryption-lock').click();
    await expect(page.getByTestId('encryption-status')).toContainText('已锁定', { timeout: 10000 });
    await expect(page.getByTestId('encryption-passphrase')).toBeVisible();
    await expect(page.getByTestId('encryption-user-row')).toHaveCount(0);
  });

  test('should delete a user', async ({ page }) => {
    const name = uniqueName('To Delete');
    await unlockDatabase(page);

    await page.getByTestId('encryption-name').fill(name);
    await page.getByTestId('encryption-save-user').click();
    const row = userRow(page, name);
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByTestId('encryption-delete-user').click();

    await expect(row).toHaveCount(0, { timeout: 10000 });
  });
});
