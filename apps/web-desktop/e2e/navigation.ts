import type { Page } from '@playwright/test';

export async function openWindowOverview(page: Page): Promise<void> {
  const overview = page.getByRole('button', { name: '窗口概览', exact: true });
  if (!(await overview.isVisible())) await page.getByText('Window', { exact: true }).click();
  await overview.click();
}
