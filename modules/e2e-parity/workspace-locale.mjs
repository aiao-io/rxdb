import { expect } from '@playwright/test';

export async function checkWorkspaceLocale(page) {
  const createdAt = '2026-10-28T12:34:56Z';
  const title = 'Review workspace translations';
  await page.clock.setFixedTime(new Date(createdAt));
  await page.goto('/workspace');

  await expect(page.getByRole('heading', { name: 'Workspace draft recovery' })).toBeVisible();
  const titleInput = page.getByRole('textbox', { name: 'Draft title' });
  await expect(titleInput).toHaveValue('Organize the requirements');
  await titleInput.fill(title);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  const notice = page.getByRole('alert');
  await expect(notice).toHaveText(`Created unsaved draft: ${title}`);
  await expect(page.getByText('1 draft', { exact: true })).toHaveCount(2);

  const draft = page.locator('article').filter({ hasText: title });
  const englishDate = await page.evaluate(value => new Date(value).toLocaleString('en'), createdAt);
  await expect(draft).toContainText(englishDate);
  await page.getByRole('button', { name: 'Reload to verify recovery', exact: true }).click();
  await expect(draft.getByText('Recovered', { exact: true })).toBeVisible();

  const locale = page.getByTestId('i18n-locale');
  await locale.selectOption('zh-Hans');
  await expect(page.getByRole('heading', { name: 'Workspace 草稿恢复' })).toBeVisible();
  await expect(draft.getByText('已恢复', { exact: true })).toBeVisible();
  const chineseDate = await page.evaluate(value => new Date(value).toLocaleString('zh-Hans'), createdAt);
  await expect(draft).toContainText(chineseDate);
  await draft.getByRole('button', { name: '保存', exact: true }).click();
  await expect(notice).toHaveText(`已保存 Todo：${title}`);
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row.getByRole('cell', { name: '未完成', exact: true })).toBeVisible();
  await locale.selectOption('en');
  await expect(notice).toHaveText(`Saved Todo: ${title}`);
  await expect(row.getByRole('cell', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByText('1 record · Page 1 / 1', { exact: true })).toBeVisible();
}
