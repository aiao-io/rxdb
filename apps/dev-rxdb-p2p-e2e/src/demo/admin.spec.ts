/**
 * US-713 管理后台：管理员总览并处置账号与服务。
 *
 * 全部走真实的 Worker（静态资源、信令 Durable Object、本地 R2）与真实的 Supabase 栈。处置的结果以 service role
 * 直接读库、读 R2 为准，不只看界面上变了：封禁看旧令牌是否被信令与文件接口拒绝，删除看库里是否留下孤儿声明。
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import {
  accountExists,
  adminCall,
  callFunction,
  claimCount,
  devicesOf,
  helloReply,
  holderIdOf,
  ORIGIN,
  outwait,
  signIn,
  signUpWithClaim
} from './admin-fixtures.ts';
import { ADMIN_ACCOUNT, fileRow, generateFile, newAccount, openDevice } from './fixtures.ts';

const accountRow = (page: Page, email: string) =>
  page.locator(`[data-testid="admin-account-row"][data-email="${email}"]`);

/** 管理员登录并经导航入口进入 `/admin`：走站内导航，工作区保持在线，管理员自己的设备也在在线列表里。 */
const openAdmin = async (browser: Browser) => {
  const admin = await openDevice(browser, ADMIN_ACCOUNT.email, 'sign-in', ADMIN_ACCOUNT.password);
  await admin.page.getByTestId('admin-entry').click();
  await expect(admin.page).toHaveURL(/\/admin$/);
  await expect(admin.page.getByTestId('admin-summary')).toBeVisible();
  return admin;
};

/** 确认条上点确认，等处置完成的提示出现。 */
const confirmAction = async (page: Page, notice: string | RegExp): Promise<void> => {
  await page.getByTestId('admin-confirm-submit').click();
  await expect(page.getByTestId('admin-notice')).toContainText(notice);
};

/** 持有声明同步到库里再继续：同步是异步推送的，直接断言会赶在推送之前。 */
const claimedInDatabase = async (request: APIRequestContext, userId: string, expected: number): Promise<string> => {
  const [deviceId] = await devicesOf(request, userId);
  const holderId = await holderIdOf(userId, deviceId as string);
  await expect.poll(() => claimCount(request, holderId)).toBe(expected);
  return holderId;
};

test.describe('dev-rxdb-p2p 管理后台', () => {
  test('AC#1 普通账号被管理接口拒绝，界面没有入口，直接打开 /admin 被带回首页', async ({ browser, request }) => {
    const email = newAccount('plain');
    const user = await openDevice(browser, email, 'sign-up');
    try {
      const { token } = await signIn(request, email);
      expect((await adminCall(request, token, 'GET', '/accounts')).status()).toBe(403);
      expect((await adminCall(request, token, 'GET', '/online')).status()).toBe(403);
      expect((await adminCall(request, token, 'POST', `/devices/${crypto.randomUUID()}/kick`)).status()).toBe(403);
      expect(await (await adminCall(request, token, 'GET', '/me')).json()).toEqual({ admin: false });

      const me = user.page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/me');
      await user.page.reload();
      expect(await (await me).json()).toEqual({ admin: false });
      await expect(user.page.getByTestId('manage-entry')).toBeVisible();
      await expect(user.page.getByTestId('admin-entry')).toHaveCount(0);

      await user.page.goto('/admin');
      await expect(user.page).toHaveURL(/\/$/);
      await expect(user.page.getByTestId('admin-summary')).toHaveCount(0);
    } finally {
      await user.context.close();
    }
  });

  test('AC#2 没有令牌或令牌是伪造的，管理接口一律 401', async ({ request }) => {
    expect((await adminCall(request, null, 'GET', '/accounts')).status()).toBe(401);
    expect((await adminCall(request, 'forged-token', 'GET', '/me')).status()).toBe(401);
    expect((await adminCall(request, 'forged-token', 'DELETE', `/accounts/${crypto.randomUUID()}`)).status()).toBe(401);
  });

  test('AC#4 管理员看到账号、在线设备与服务器副本，数字与库里的真实状态一致', async ({ browser, request }) => {
    const email = newAccount('overview');
    const user = await openDevice(browser, email, 'sign-up');
    const { fileName } = await generateFile(user, 1, { upload: true });
    const { token, userId } = await signIn(request, email);
    await claimedInDatabase(request, userId, 1);
    // 上传的是密文副本（POOL-US-101）：按行上的 sourceUrl 轮询，密文路由要求编码头
    const sourceUrl = (await fileRow(user, fileName).getAttribute('data-source')) as string;
    await expect
      .poll(async () =>
        (
          await request.head(`${ORIGIN}${sourceUrl}`, {
            headers: { authorization: `Bearer ${token}`, 'x-pool-fallback-encoding': '1' }
          })
        ).status()
      )
      .toBe(200);
    const admin = await openAdmin(browser);
    try {
      const row = accountRow(admin.page, email);
      await expect(row).toBeVisible();
      await expect(row.getByTestId('admin-device-count')).toHaveText('1');
      await expect(row.getByTestId('admin-claim-count')).toHaveText('1');

      await admin.page.getByTestId('admin-tab-online').click();
      const device = admin.page.locator(`[data-testid="admin-device-row"][data-email="${email}"]`);
      await expect(device).toHaveCount(1);
      await expect(device).toContainText(user.name);
      await expect(
        admin.page.locator(`[data-testid="admin-device-row"][data-email="${ADMIN_ACCOUNT.email}"]`)
      ).toHaveCount(1);

      await admin.page.getByTestId('admin-tab-files').click();
      // 密文副本（POOL-US-101）的键是密文哈希，清单里没有它的文件名，只按大小断言
      const encHash = sourceUrl.slice('/api/files/enc/'.length);
      const copy = admin.page.locator(`[data-testid="admin-file-row"][data-hash="${encHash}"]`);
      await expect(copy).toContainText('1 MB');
    } finally {
      await admin.context.close();
      await user.context.close();
    }
  });

  test('AC#5 封禁：在线设备被断开且不自动重连，旧令牌被信令与文件接口拒绝，解封后恢复', async ({
    browser,
    request
  }) => {
    const email = newAccount('ban');
    const user = await openDevice(browser, email, 'sign-up');
    const { token, userId } = await signIn(request, email);
    const [deviceId] = await devicesOf(request, userId);
    const hello = () => helloReply({ accessToken: token, deviceId: deviceId as string, instanceId: 'ban-check' });
    await expect(hello()).resolves.toMatchObject({ type: 'welcome' });
    const admin = await openAdmin(browser);
    try {
      const row = accountRow(admin.page, email);
      await row.getByTestId('admin-ban').click();
      await confirmAction(admin.page, `已封禁 ${email}`);
      await expect(row.getByTestId('admin-banned')).toBeVisible();

      await expect(user.page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'rejected');
      await expect(user.page.getByTestId('signaling-rejected')).toBeVisible();
      const opened = user.signalingConnections();
      await outwait(4500);
      expect(user.signalingConnections()).toBe(opened);

      await expect(hello()).resolves.toMatchObject({ type: 'error', code: 'unauthorized' });
      const file = await request.get(`${ORIGIN}/api/files/${'a'.repeat(64)}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(file.status()).toBe(401);

      await row.getByTestId('admin-unban').click();
      await expect(admin.page.getByTestId('admin-notice')).toContainText(`已解封 ${email}`);
      await expect(row.getByTestId('admin-banned')).toHaveCount(0);
      await expect(hello()).resolves.toMatchObject({ type: 'welcome' });
    } finally {
      await admin.context.close();
      await user.context.close();
    }
  });

  test('AC#6 删除账号：设备登记与持有声明一并清掉，他人的声明不受影响，在线设备被断开', async ({
    browser,
    request
  }) => {
    const email = newAccount('victim');
    const victim = await openDevice(browser, email, 'sign-up');
    const bystander = await signUpWithClaim(request, 'bystander');
    await generateFile(victim, 1);
    const { userId } = await signIn(request, email);
    const holderId = await claimedInDatabase(request, userId, 1);
    const bystanderHolder = await holderIdOf(bystander.id, bystander.deviceId);
    expect(await claimCount(request, bystanderHolder)).toBe(1);
    const admin = await openAdmin(browser);
    try {
      const row = accountRow(admin.page, email);
      await row.getByTestId('admin-delete-account').click();
      await expect(admin.page.getByTestId('admin-confirm')).toContainText('设备登记');
      await confirmAction(admin.page, `已删除 ${email}`);
      await expect(row).toHaveCount(0);

      expect(await claimCount(request, holderId)).toBe(0);
      expect(await devicesOf(request, userId)).toEqual([]);
      expect(await accountExists(request, userId)).toBe(false);
      expect(await claimCount(request, bystanderHolder)).toBe(1);
      await expect(victim.page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'rejected');
    } finally {
      await admin.context.close();
      await victim.context.close();
    }
  });

  test('AC#7 删除服务器副本：R2 对象被删，清单里的持有声明保留', async ({ browser, request }) => {
    const email = newAccount('copy');
    const owner = await openDevice(browser, email, 'sign-up');
    const { fileName } = await generateFile(owner, 1, { upload: true });
    const { token, userId } = await signIn(request, email);
    const holderId = await claimedInDatabase(request, userId, 1);
    const sourceUrl = (await fileRow(owner, fileName).getAttribute('data-source')) as string;
    await expect
      .poll(async () =>
        (
          await request.head(`${ORIGIN}${sourceUrl}`, {
            headers: { authorization: `Bearer ${token}`, 'x-pool-fallback-encoding': '1' }
          })
        ).status()
      )
      .toBe(200);
    const admin = await openAdmin(browser);
    try {
      await admin.page.getByTestId('admin-tab-files').click();
      const encHash = sourceUrl.slice('/api/files/enc/'.length);
      const copy = admin.page.locator(`[data-testid="admin-file-row"][data-hash="${encHash}"]`);
      await expect(copy).toContainText('1 MB');
      await copy.getByTestId('admin-delete-file').click();
      await expect(admin.page.getByTestId('admin-confirm')).toContainText(encHash.slice(0, 12));
      await confirmAction(admin.page, encHash.slice(0, 12));
      await expect(copy).toHaveCount(0);

      expect(
        (
          await request.head(`${ORIGIN}${sourceUrl}`, {
            headers: { authorization: `Bearer ${token}`, 'x-pool-fallback-encoding': '1' }
          })
        ).status()
      ).toBe(404);
      expect(await claimCount(request, holderId)).toBe(1);
    } finally {
      await admin.context.close();
      await owner.context.close();
    }
  });

  test('AC#8 踢下线：目标设备的信令断开且不自动重连，其余设备的在线列表更新', async ({ browser }) => {
    const targetEmail = newAccount('kick-target');
    const target = await openDevice(browser, targetEmail, 'sign-up');
    const witness = await openDevice(browser, newAccount('kick-witness'), 'sign-up');
    const admin = await openAdmin(browser);
    try {
      // 目标与管理员的设备对见证者都可见：设备名由 User-Agent 派生，同一浏览器的设备同名，所以按数量断言
      await expect(witness.page.getByTestId('peer-row')).toHaveCount(2);
      await admin.page.getByTestId('admin-tab-online').click();
      const device = admin.page.locator(`[data-testid="admin-device-row"][data-email="${targetEmail}"]`);
      await device.getByTestId('admin-kick').click();
      await expect(admin.page.getByTestId('admin-confirm')).toContainText('刷新');
      await confirmAction(admin.page, '下线');

      await expect(target.page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'rejected');
      await expect(witness.page.getByTestId('peer-row')).toHaveCount(1);
      await expect(device).toHaveCount(0);
      const opened = target.signalingConnections();
      await outwait(4500);
      expect(target.signalingConnections()).toBe(opened);
      await expect(witness.page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'online');
    } finally {
      await admin.context.close();
      await witness.context.close();
      await target.context.close();
    }
  });

  test('AC#9 管理员不能封禁或删除自己', async ({ request }) => {
    const { token, userId } = await signIn(request, ADMIN_ACCOUNT.email, ADMIN_ACCOUNT.password);

    expect(await (await adminCall(request, token, 'GET', '/me')).json()).toEqual({ admin: true });
    expect((await adminCall(request, token, 'POST', `/accounts/${userId}/ban`)).status()).toBe(409);
    expect((await adminCall(request, token, 'DELETE', `/accounts/${userId}`)).status()).toBe(409);
    expect(await accountExists(request, userId)).toBe(true);
  });

  test('AC#10 普通登录用户与匿名角色调不动 p2p.admin_* 函数，service role 可以', async ({ request }) => {
    const user = await signUpWithClaim(request, 'rpc');
    const holderId = await holderIdOf(user.id, user.deviceId);
    const attempts = [
      ['admin_account_stats', {}],
      ['admin_file_catalog', {}],
      ['admin_purge_account', { target: user.id }]
    ] as const;

    for (const [name, args] of attempts) {
      for (const as of [{ token: user.token }, 'anon'] as const) {
        const response = await callFunction(request, as, name, args);
        expect([401, 403], `${name} as ${typeof as === 'string' ? as : 'a signed-in user'}`).toContain(
          response.status()
        );
      }
    }
    expect(await claimCount(request, holderId)).toBe(1);
    expect(await devicesOf(request, user.id)).toHaveLength(1);

    const stats = await callFunction(request, 'service', 'admin_account_stats');
    expect(stats.status()).toBe(200);
    expect(await stats.json()).toEqual(expect.arrayContaining([{ user_id: user.id, device_count: 1, claim_count: 1 }]));
  });
});
