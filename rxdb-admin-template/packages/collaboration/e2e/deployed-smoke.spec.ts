import { expect, test } from '@playwright/test';
import { fixtures } from './fixtures.js';

/**
 * 回滚后的冒烟（ADMIN-US-217 AC#8 预演）：回滚脚本把三端与函数切回上一个发布之后，在每个部署出的前端上以团队管理员登录、
 * 打开回滚演练的团队，共享数据里同时有回滚前、新版本在线期间与回滚之后合并的记录——共享数据不因回滚丢失，旧版本照常读写。
 * 团队与期望的记录由 `deploy/scripts/rollback-drill.mjs` 经环境变量给出（`ADMIN_E2E_SMOKE_TEAM`、`ADMIN_E2E_SMOKE_EMAIL`、
 * `ADMIN_E2E_SMOKE_EXPECT`，后者以逗号分隔），验证码经夹具服务签出；没有这些变量时跳过。项目 `smoke-<端>`。
 */
const team = process.env['ADMIN_E2E_SMOKE_TEAM'];
const email = process.env['ADMIN_E2E_SMOKE_EMAIL'];
const expected = (process.env['ADMIN_E2E_SMOKE_EXPECT'] ?? '').split(',').filter(Boolean);

test('回滚之后：登录、打开团队，共享数据里回滚前后合并的记录都在（ADMIN-US-217 AC#8）', async ({ page, request }) => {
  test.skip(!team || !email || expected.length === 0, '只在回滚演练里运行');
  const { otp } = (await (await request.get(`${fixtures}/__otp?email=${encodeURIComponent(email!)}`)).json()) as {
    otp: string;
  };
  await page.goto(`/login?redirect=${encodeURIComponent('/collaboration')}`);
  await page.getByLabel('邮箱', { exact: true }).fill(email!);
  await page.getByLabel('验证码', { exact: true }).fill(otp);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await page.getByRole('button', { name: team!, exact: true }).click();
  const shared = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: `共享数据 · ${team}`, exact: true }) })
    .first();
  for (const text of expected) await expect(shared).toContainText(text);
});
