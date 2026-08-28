import { expect, test } from '@playwright/test';

import { expectRowCount, openDemo, resetDemo, SEED_ROW_COUNT } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('probe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`);
  });

  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  await page.getByTestId('draft-title').fill('连建第一行');
  await page.getByTestId('create').click();
  await expectRowCount(page, SEED_ROW_COUNT + 1);
  console.log('=== AFTER FIRST ===\n' + (await page.getByTestId('recipe-rows').innerHTML()));

  await page.getByTestId('draft-title').fill('连建第二行');
  await page.getByTestId('create').click();
  await expectRowCount(page, SEED_ROW_COUNT + 2);
  await page.waitForTimeout(1500);
  console.log('=== AFTER SECOND ===\n' + (await page.getByTestId('recipe-rows').innerHTML()));
  console.log('=== ERRORS ===\n' + errors.join('\n---\n'));
  expect(true).toBe(true);
});
