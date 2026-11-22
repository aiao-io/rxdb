import { expect } from '@playwright/test';

export async function checkAgGridLocale(page) {
  const createdAt = '2026-10-28T12:34:56Z';
  const title = 'Review grid translations';
  await page.clock.setFixedTime(new Date(createdAt));
  await page.goto('/entities/public/Todo');
  await page.getByRole('button', { name: '+ New', exact: true }).click();
  await page.getByRole('group', { name: 'title', exact: true }).getByRole('textbox').fill(title);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Basic information', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'AG Grid', exact: true }).click();

  const grid = page.getByTestId('ag-grid');
  const row = grid.getByRole('row').filter({ hasText: title });
  const completed = grid.locator('[role="columnheader"][col-id="completed"]');
  for (const [locale, yes, no] of [['en', 'Yes', 'No'], ['zh-Hans', '是', '否']]) {
    await expect(page.getByTestId('i18n-locale')).toHaveValue(locale);
    await expect(grid.getByRole('columnheader', { name: locale === 'en' ? 'Created at' : '创建时间', exact: true })).toBeVisible();
    const date = await page.evaluate(({ locale, createdAt }) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(createdAt)),
      { locale, createdAt }
    );
    await expect(row.locator('[col-id="createdAt"]')).toHaveText(date);
    await completed.press('Control+Enter');
    await expect(grid.getByText(yes, { exact: true })).toBeVisible();
    await expect(grid.getByText(no, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    if (locale === 'en') await page.getByTestId('i18n-locale').selectOption('zh-Hans');
  }
}
