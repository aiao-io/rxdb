import { expect, type Page } from '@playwright/test';
import type { ListTable } from '@visactor/vtable';

export async function showAllColumns(page: Page): Promise<void> {
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  const editable = page.locator('.column-menu label input[type=checkbox]:enabled');
  await expect(editable).toHaveCount(19);
  await expect(page.locator('.column-menu label input[type=checkbox]:checked')).toHaveCount(20);
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
