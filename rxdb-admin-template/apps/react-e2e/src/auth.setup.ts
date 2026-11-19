import { expect, test as setup } from '@playwright/test';

/**
 * 全站都要登录：所有用例开始之前先经全局登录页登录一次（模拟认证服务的固定账号与验证码，见 `auth/e2e-auth-server.mjs`），
 * 把登录后的浏览器状态存到 `ADMIN_E2E_AUTH_STATE`，各用例的浏览器上下文从它启动。
 */
function authState(): string {
  const state = process.env['ADMIN_E2E_AUTH_STATE'];
  if (!state) throw new Error('ADMIN_E2E_AUTH_STATE is not set: run the specs through the e2e config');
  return state;
}
const state = authState();

setup('登录 e2e 测试账号', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel('邮箱', { exact: true }).fill('e2e@admin-template.test');
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.getByLabel('验证码', { exact: true }).fill('000000');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await page.context().storageState({ path: state });
});
