import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * 已部署目标上的邮箱验证码（ADMIN-US-217 AC#4 预演）：在部署出的工作台上请求验证码，GoTrue 经 SMTP 发信，测试从**本地收件服务**
 * （inbucket，不是真实邮箱）的 API 读邮件里的验证码并登录；另取一码等它按调短的有效期过期，提交被拒，重新请求后可用。
 * 只在预演脚本调短验证码有效期时运行：需要 `ADMIN_E2E_MAIL_URL`（收件服务）与 `ADMIN_E2E_OTP_EXPIRY_SECONDS`（与 Auth 的
 * `GOTRUE_MAILER_OTP_EXP` 一致），否则跳过。项目 `otp-<端>` 各对一个部署出的前端跑一遍。
 */
const mail = process.env['ADMIN_E2E_MAIL_URL'];
const expiry = Number(process.env['ADMIN_E2E_OTP_EXPIRY_SECONDS']);

interface Mail {
  id: string;
  subject: string;
  date: string;
}
/** 等收件箱里出现一封比 `seen` 都新的验证码邮件，返回它的 6 位验证码与邮件 ID。 */
async function nextCode(request: APIRequestContext, mailbox: string, seen: Set<string>) {
  let found: { id: string; code: string } | undefined;
  await expect(async () => {
    const list = (await (await request.get(`${mail}/api/v1/mailbox/${mailbox}`)).json()) as Mail[];
    const fresh = list.filter(item => !seen.has(item.id) && item.subject === 'Admin 模板登录验证码');
    expect(fresh, '验证码邮件已送达').not.toHaveLength(0);
    const message = (await (await request.get(`${mail}/api/v1/mailbox/${mailbox}/${fresh.at(-1)!.id}`)).json()) as {
      body: { html: string };
    };
    const code = /\b(\d{6})\b/.exec(message.body.html)?.[1];
    expect(code, '邮件里有 6 位验证码').toBeTruthy();
    found = { id: fresh.at(-1)!.id, code: code! };
  }).toPass({ timeout: 20_000 });
  seen.add(found!.id);
  return found!.code;
}
async function requestCode(page: Page, email: string) {
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.getByText('验证码已发送，请检查邮箱', { exact: true })).toBeVisible();
}
async function submit(page: Page, code: string) {
  await page.getByLabel('验证码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

test('邮箱验证码：真实发信后登录成功；过期的验证码被拒绝，重新请求后可用（ADMIN-US-217 AC#4，本地收件服务）', async ({
  page,
  request
}) => {
  test.skip(
    !mail || !Number.isInteger(expiry) || expiry <= 0,
    '只在 AC#4 预演里运行（调短的验证码有效期与本地收件服务）'
  );
  test.setTimeout((expiry + 120) * 1000);
  const local = `otp-${crypto.randomUUID().slice(0, 12)}`;
  const email = `${local}@admin-template.test`;
  const seen = new Set<string>();
  // 全站都要登录：未登录打开团队协作，被带到全局登录页
  await page.goto('/collaboration');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  // 第一次：请求验证码，从收件服务读出后登录
  await requestCode(page, email);
  await submit(page, await nextCode(request, local, seen));
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await page.getByTestId('account-menu').locator('summary').click();
  await page.getByRole('button', { name: '退出账号' }).click();
  await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
  // 第二次：另取一码，等它自然过期再提交，被 Auth 拒绝，页面不进入登录状态
  await requestCode(page, email);
  const stale = await nextCode(request, local, seen);
  await page.waitForTimeout((expiry + 5) * 1000);
  await submit(page, stale);
  await expect(page.getByText(/expired|invalid|过期|无效/i)).toBeVisible();
  await expect(page.getByTestId('account-menu')).toHaveCount(0);
  // 重新请求：新码可用
  await requestCode(page, email);
  const fresh = await nextCode(request, local, seen);
  expect(fresh).not.toBe(stale);
  await submit(page, fresh);
  await expect(page.getByTestId('account-menu')).toBeVisible();
});
