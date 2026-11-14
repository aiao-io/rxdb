import { expect, type Page } from '@playwright/test';
import type { ListTable } from '@visactor/vtable';

export async function showAllColumns(page: Page): Promise<void> {
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  const editable = page.locator('.column-menu label:not(.catalog-toggle) input[type=checkbox]:enabled');
  await expect(editable).toHaveCount(19);
  for (const checkbox of await editable.all()) await checkbox.check();
  await expect(page.locator('.column-menu label:not(.catalog-toggle) input[type=checkbox]:checked')).toHaveCount(20);
  const saved = await page.evaluate(() => {
    const columns = JSON.parse(localStorage.getItem('bom2:columns') ?? '[]') as { visible: boolean }[];
    return columns.filter(column => column.visible).length;
  });
  expect(saved).toBe(20);
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  const grid = page.getByTestId('bom-grid');
  await expect(grid).toHaveAttribute('aria-busy', 'false');
  await expect
    .poll(() =>
      grid
        .locator('canvas')
        .first()
        .evaluate(canvas => (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__.colCount)
    )
    .toBe(21);
}
