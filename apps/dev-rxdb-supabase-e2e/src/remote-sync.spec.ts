import { expect, test } from '@playwright/test';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

function uniqueTitle(): string {
  return `remote-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

if (isRemoteE2E) {
  test.describe('Supabase remote sync', () => {
    test('pushes a Todo through Supabase and pulls it into another browser context', async ({ browser, page }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
        }
      });

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      const securityNotice = page.getByRole('alert');
      await expect(securityNotice).toContainText('未启用身份认证', { timeout: 60_000 });
      await expect(securityNotice).toContainText('createdBy');

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();

      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      const push = page.getByRole('button', { name: 'Push' });
      await expect(push).toBeEnabled();
      await push.click();

      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        await pull.click();

        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      await item.getByRole('button', { name: '删除' }).click();
      await expect(item).toHaveCount(0);
      await expect(push).toBeEnabled();
      await push.click();
      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(1);
    });

    test('does not pull a locally created Todo that was never pushed', async ({ browser, page }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
          // eslint-disable-next-line no-console
          console.log('[diag] rxdb_mutations payload:', request.postData());
        }
      });

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      const securityNotice = page.getByRole('alert');
      await expect(securityNotice).toContainText('未启用身份认证', { timeout: 60_000 });

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        await pull.click();

        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toHaveCount(0);
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      expect(mutationRequests).toHaveLength(0);
    });
  });
}
