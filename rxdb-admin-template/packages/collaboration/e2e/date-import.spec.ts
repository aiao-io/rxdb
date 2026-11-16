import { expect, test, type Page } from '@playwright/test';
async function openCreateDialog(page: Page) {
  await page.getByRole('button', { name: '+ 新增', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
}
async function fillField(page: Page, name: string, value: string) {
  await page.getByRole('group', { name }).getByRole('textbox').fill(value);
}
async function selectRelationOption(page: Page, name: string, label: string) {
  const control = page.getByRole('group', { name }).getByRole('combobox');
  await expect.poll(() => control.locator('option').count()).toBeGreaterThan(1);
  await control.selectOption({ label });
}
async function createCategory(page: Page, name: string) {
  await openCreateDialog(page);
  await fillField(page, '分类名', name);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
}
async function createAsset(page: Page, name: string, category: string) {
  await openCreateDialog(page);
  await fillField(page, '名称', name);
  await selectRelationOption(page, '分类', category);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
}

test('review-date-import: anonymous records with persisted dates can be previewed', async ({ page, request }) => {
  const fixture = await (await request.get('http://127.0.0.1:8309/__fixture')).json() as { name: string; admin: { email: string; otp: string } };
  await page.goto('/entities/assets/AssetCategory');
  await createCategory(page, '日期导入分类');
  await page.goto('/entities/assets/Asset');
  await createAsset(page, '日期导入资产', '日期导入分类');
  await page.goto('/entities/assets/AssetEvent');
  await openCreateDialog(page);
  await fillField(page, '事项', '日期导入维护');
  await page.getByRole('group', { name: '日期' }).locator('input[type="date"]').fill('2026-11-16');
  await selectRelationOption(page, '所属资产', '日期导入资产');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
  await expect(page.getByTestId('entity-empty-state')).toHaveCount(0);
  await page.goto('/collaboration');
  await page.getByLabel('邮箱', { exact: true }).fill(fixture.admin.email);
  await page.getByLabel('验证码', { exact: true }).fill(fixture.admin.otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByRole('button', { name: '预览匿名数据导入', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('3 条本机记录');
});
