import { expect, test } from '@playwright/test';

test('explore team editor', async ({ page, request }) => {
  const fixture = (await (await request.get('http://127.0.0.1:8309/__fixture')).json()) as {
    name: string;
    admin: { email: string; otp: string; id: string };
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/collaboration');
  await page.getByLabel('邮箱', { exact: true }).fill(fixture.admin.email);
  await page.getByLabel('验证码', { exact: true }).fill(fixture.admin.otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出账号' })).toBeVisible();
  await page.getByRole('button', { name: fixture.name, exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('探索任务');
  await page.getByRole('button', { name: '开始修改', exact: true }).click();
  await expect(page.getByRole('heading', { name: '任务：探索任务', exact: true })).toBeVisible();
  await expect(page.getByTestId('team-editor')).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: '/tmp/claude-admin-fix/explore-1.png', fullPage: true });
  await page.getByTestId('team-editor').getByRole('tab', { name: '资产分类', exact: true }).click();
  await page.getByTestId('team-editor').getByRole('button', { name: '+ 新增', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/claude-admin-fix/explore-2.png', fullPage: true });
  await page.getByRole('group', { name: '分类名' }).getByRole('textbox').fill('电脑');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toHaveCount(0);
  await expect(page.getByText(/已保存未提交：有/)).toBeVisible();
  await page.screenshot({ path: '/tmp/claude-admin-fix/explore-3.png', fullPage: true });
  await page.getByRole('button', { name: '同步', exact: true }).click();
  await expect(page.getByText('当前提交已同步；后续编辑仍需另行同步', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/claude-admin-fix/explore-4.png', fullPage: true });
  console.log('errors', JSON.stringify(errors));
});
