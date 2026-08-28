/** 临时诊断，跑完即删。 */
import { expect, test } from '@playwright/test';

import { expectRowCount, openDemo, readServerLog, resetDemo, SEED_ROW_COUNT } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('diagnose-delete', async ({ page, request }) => {
  page.on('console', message => console.log(`[console:${message.type()}] ${message.text()}`));
  page.on('pageerror', error => console.log(`[pageerror] ${error.message}`));

  const mark = async (label: string): Promise<void> => {
    await page.evaluate(text => console.log(text), `MARKER ${label}`);
  };

  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  await mark('before-create');
  await page.getByTestId('draft-title').fill('跨源新建');
  await page.getByTestId('draft-price').fill('12.5');
  await page.getByTestId('create').click();
  await expectRowCount(page, SEED_ROW_COUNT + 1);

  await mark('after-create');
  const created = page.locator('[data-row-id]').filter({ hasText: '跨源新建' });
  await expect(created).toHaveCount(1);
  const rowId = await created.getAttribute('data-row-id');
  console.log('--- rowId:', rowId);

  await mark('before-edit');
  await created.getByRole('button', { name: '改' }).click();
  await expect(page.getByTestId('draft-title')).toHaveValue('跨源新建');
  await page.getByTestId('draft-title').fill('跨源改名');
  await page.getByTestId('save-edit').click();
  const renamed = page.locator('[data-row-id]').filter({ has: page.locator('td', { hasText: /^跨源改名$/ }) });
  await expect(renamed).toHaveCount(1);
  console.log('--- renamed rowId:', await renamed.getAttribute('data-row-id'));

  await mark('before-delete');
  await renamed.getByRole('button', { name: '删' }).click();
  await page.waitForTimeout(8000);
  await mark('after-delete-wait');

  console.log('--- row-count:', await page.getByTestId('row-count').textContent());
  console.log('--- still in list (before reload):', await page.locator(`[data-row-id="${rowId}"]`).count());

  await page.reload();
  await page.waitForTimeout(4000);
  console.log('--- row-count after reload:', await page.getByTestId('row-count').textContent());
  console.log('--- still in list after reload:', await page.locator(`[data-row-id="${rowId}"]`).count());

  console.log('--- write-error count:', await page.getByTestId('write-error').count());
  if ((await page.getByTestId('write-error').count()) > 0) {
    console.log('--- write-error text:', await page.getByTestId('write-error').textContent());
  }
  console.log('--- still in list:', await page.locator(`[data-row-id="${rowId}"]`).count());

  const backend = await request.post(`http://127.0.0.1:8317/v1/recipes/by-ids`, { data: { ids: [rowId] } });
  console.log('--- backend has row:', JSON.stringify(await backend.json()));

  const log = await readServerLog(request);
  console.log(
    '--- server log tail:\n' +
      log
        .slice(-25)
        .map(entry => `${entry.method} ${entry.path} → ${entry.status}`)
        .join('\n')
  );
});
