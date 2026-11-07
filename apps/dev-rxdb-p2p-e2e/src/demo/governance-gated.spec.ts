/**
 * POOL-US-102 邀请制门禁：只在 `POOL_REQUIRE_ACTIVATION=true` 的独立运行里执行
 * （playwright.demo.gated.chrome.mts），验证未激活账号被挡、邀请码激活后放行、管理员豁免。
 */
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_ACCOUNT, newAccount, openDevice } from './fixtures.ts';

/** 在页面里以登录身份调 Worker 接口。 */
const api = async (
  page: Page,
  method: string,
  path: string,
  body?: unknown
): Promise<{ readonly status: number; readonly body: unknown }> =>
  page.evaluate(
    async ([m, p, b]) => {
      let token: string | null = null;
      for (const key of Object.keys(localStorage)) {
        let candidate: { access_token?: unknown } | null = null;
        try {
          candidate = JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: unknown } | null;
        } catch {
          // 跳过非 JSON 的值
        }
        if (candidate && typeof candidate.access_token === 'string') token = candidate.access_token;
      }
      if (!token) throw new Error('no supabase session in localStorage');
      const response = await fetch(p, {
        method: m,
        headers: {
          authorization: `Bearer ${token}`,
          ...(b === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(b === undefined ? {} : { body: JSON.stringify(b) })
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [method, path, body] as const
  );

test.describe('邀请制门禁', () => {
  test('AC#6 未激活账号：界面只有邀请码入口，信令与回退被拒；激活后放行', async ({ browser }) => {
    // 未激活：设备不上线，页面给出邀请码入口
    const member = await openDevice(browser, newAccount('gated'), 'sign-up', undefined, { waitOnline: false });
    await expect(member.page.getByTestId('invite-gate')).toBeVisible();
    await expect(member.page.getByTestId('signaling-state')).not.toHaveAttribute('data-state', 'online');
    expect((await api(member.page, 'GET', '/api/me')).body).toEqual({ activated: false, activationRequired: true });
    // 服务器回退被 403 挡下
    const denied = await api(member.page, 'PUT', `/api/files/enc/${'e'.repeat(64)}`);
    expect(denied.status).toBe(403);

    // 管理员（豁免）发一个码
    const admin = await openDevice(browser, ADMIN_ACCOUNT.email, 'sign-in', ADMIN_ACCOUNT.password);
    await admin.page.getByTestId('admin-entry').click();
    await admin.page.getByTestId('admin-tab-invites').click();
    await admin.page.getByTestId('invite-issue').click();
    const issued = admin.page.getByTestId('invite-issued');
    await expect(issued).toBeVisible();
    const code = ((await issued.textContent()) ?? '').replace('新码：', '').trim();

    // 错误码被拒，门禁仍在
    expect((await api(member.page, 'POST', '/api/invite', { code: 'WRONG-CODE-123' })).status).toBe(409);
    await expect(member.page.getByTestId('invite-gate')).toBeVisible();

    // 正确码激活：门禁消失，设备上线，回退放行
    await member.page.getByTestId('invite-code').fill(code);
    await member.page.getByTestId('invite-submit').click();
    await expect(member.page.getByTestId('invite-gate')).toHaveCount(0);
    await expect(member.page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'online');
    expect((await api(member.page, 'GET', '/api/me')).body).toEqual({ activated: true, activationRequired: true });
  });
});
