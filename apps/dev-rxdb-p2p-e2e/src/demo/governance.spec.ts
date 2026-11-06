/**
 * POOL-US-102 滥用治理：服务端限流、举报 → 后台处置闭环、邀请码发放/作废。
 * 激活门禁在单独的一次运行里验证（playwright.demo.gated.chrome.mts），这里的栈不要求激活。
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ADMIN_ACCOUNT, fileRow, generateFile, newAccount, openDevice } from './fixtures.ts';

/** 在页面里以登录身份直接 PUT 原始字节（限流用例用 1 字节密文，不生成大文件）。 */
const putBytes = (page: Page, encHash: string, payload: number[]): Promise<number> =>
  page.evaluate(
    async ([hash, bytes]) => {
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
      const response = await fetch(`/api/files/enc/${hash}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        body: new Uint8Array(bytes)
      });
      return response.status;
    },
    [encHash, payload] as const
  );

/** 直接调 Worker 接口（带登录身份），不经页面。 */
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

test.describe('滥用治理（POOL-US-102）', () => {
  test('AC#4/AC#5 举报文件 → 管理员看到并删除副本；重复举报去重', async ({ browser }) => {
    const holder = await openDevice(browser, newAccount('report'), 'sign-up');
    const { fileName, contentHash } = await generateFile(holder, 1, { upload: true });

    // 举报：目标标识 + 服务器副本地址（处置时按它删密文副本），不落文件内容
    const sourceUrl = (await fileRow(holder, fileName).getAttribute('data-source')) as string;
    const reporter = await openDevice(browser, newAccount('reporter'), 'sign-up');
    await expect(fileRow(reporter, fileName)).toBeVisible();
    await fileRow(reporter, fileName).getByRole('button', { name: '举报', exact: true }).click();
    await fileRow(reporter, fileName).getByRole('button', { name: '恶意软件', exact: true }).click();
    await expect(reporter.page.getByText('举报已提交，管理员会在后台处置。')).toBeVisible();

    // 同一举报人重复举报同一目标：去重，不再新建
    const duplicated = await api(reporter.page, 'POST', '/api/reports', {
      target: { contentHash, sourceUrl },
      category: 'malware'
    });
    expect(duplicated.status).toBe(200);
    expect(duplicated.body).toEqual({ created: false });

    // 管理员看到举报并处置：删除服务器副本
    const admin = await openDevice(browser, ADMIN_ACCOUNT.email, 'sign-in', ADMIN_ACCOUNT.password);
    await admin.page.getByTestId('admin-entry').click();
    await admin.page.getByTestId('admin-tab-reports').click();
    const row = admin.page
      .getByTestId('admin-report-row')
      .filter({ hasText: '恶意软件' })
      .filter({ hasText: contentHash.slice(0, 12) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '删除副本' }).click();
    await expect(row).toHaveCount(0);

    // 副本真的被删：带编码头取密文副本得到 404（不带头的旧客户端会先被 426 挡下）
    const after = await holder.page.evaluate(async url => {
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
      return (
        await fetch(url, {
          headers: { authorization: `Bearer ${token}`, 'x-pool-fallback-encoding': '1' }
        })
      ).status;
    }, sourceUrl);
    expect(after).toBe(404);
  });

  test('AC#2 回退上传超过每日配额（20 次）被 429 拒绝，其它账号不受影响', async ({ browser }) => {
    // 每个 PUT 是 1 字节密文（按内容算哈希），不发大文件；默认策略 20 次/日
    const holder = await openDevice(browser, newAccount('quota'), 'sign-up');
    const other = await openDevice(browser, newAccount('quota-other'), 'sign-up');
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const payload = [attempt & 0xff];
      const digest = createHash('sha256').update(Buffer.from(payload)).digest('hex');
      expect(await putBytes(holder.page, digest, payload)).toBe(201);
    }
    const payload = [99];
    const digest = createHash('sha256').update(Buffer.from(payload)).digest('hex');
    expect(await putBytes(holder.page, digest, payload)).toBe(429);
    // 其它账号不受影响
    expect(await putBytes(other.page, digest, payload)).toBe(201);
  });

  test('AC#8 滥用演练（封禁路径）：举报账号 → 管理员封禁 → 在线设备断开且登录被拒', async ({ browser }) => {
    // 目标账号：共享一个文件并保持在线
    const target = await openDevice(browser, newAccount('abuse'), 'sign-up');
    await generateFile(target, 1);
    const accountId = await target.page.evaluate(() => {
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
      return JSON.parse(atob(token.split('.')[1])).sub as string;
    });

    // 举报账号
    const reporter = await openDevice(browser, newAccount('reporter'), 'sign-up');
    const submitted = await api(reporter.page, 'POST', '/api/reports', {
      target: { accountId },
      category: 'harassment'
    });
    expect(submitted.status).toBe(201);

    // 管理员处置：封禁账号
    const admin = await openDevice(browser, ADMIN_ACCOUNT.email, 'sign-in', ADMIN_ACCOUNT.password);
    await admin.page.getByTestId('admin-entry').click();
    await admin.page.getByTestId('admin-tab-reports').click();
    const row = admin.page
      .getByTestId('admin-report-row')
      .filter({ hasText: '骚扰' })
      .filter({ hasText: accountId.slice(0, 12) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '封禁账号' }).click();
    await expect(row).toHaveCount(0);

    // 目标账号在线设备断开，且不自动重连（登录被拒的判定已由 US-713 的 AC#5 覆盖）
    await expect(target.page.getByTestId('signaling-state')).not.toHaveAttribute('data-state', 'online');
  });

  test('AC#7 管理员发码、作废；错误码被拒（激活门禁在 gated 运行里验证）', async ({ browser }) => {
    const admin = await openDevice(browser, ADMIN_ACCOUNT.email, 'sign-in', ADMIN_ACCOUNT.password);
    await admin.page.getByTestId('admin-entry').click();
    await admin.page.getByTestId('admin-tab-invites').click();
    await admin.page.getByTestId('invite-issue').click();
    const issued = admin.page.getByTestId('invite-issued');
    await expect(issued).toBeVisible();
    const code = ((await issued.textContent()) ?? '').replace('新码：', '').trim();
    expect(code).toHaveLength(20);

    // 一个普通账号用这个码激活；错误码被拒
    const member = await openDevice(browser, newAccount('invite'), 'sign-up');
    const wrong = await api(member.page, 'POST', '/api/invite', { code: 'WRONG-CODE-123' });
    expect(wrong.status).toBe(409);
    const good = await api(member.page, 'POST', '/api/invite', { code });
    expect(good.status).toBe(200);
    expect(good.body).toEqual({ activated: true });

    // 码一次性：另一个账号用同一码被拒
    const second = await openDevice(browser, newAccount('invite2'), 'sign-up');
    const reused = await api(second.page, 'POST', '/api/invite', { code });
    expect(reused.status).toBe(409);

    // 作废后即时失效
    await admin.page
      .getByTestId('admin-invite-row')
      .filter({ hasText: code })
      .getByRole('button', { name: '作废' })
      .click();
    const third = await openDevice(browser, newAccount('invite3'), 'sign-up');
    const revoked = await api(third.page, 'POST', '/api/invite', { code });
    expect(revoked.status).toBe(409);
  });
});

test('AC#3 管理接口失败认证被限流', async ({ request }) => {
  const denied = await request.post('/api/admin/accounts?page=1', {
    headers: { authorization: 'Bearer forged-token' }
  });
  expect(denied.status()).toBe(401);
  // 连续失败超过窗口上限后按来源地址 429（覆盖策略：10 次/60 秒）
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await request.post('/api/admin/accounts?page=1', {
      headers: { authorization: 'Bearer forged-token' }
    });
  }
  const limited = await request.post('/api/admin/accounts?page=1', {
    headers: { authorization: 'Bearer forged-token' }
  });
  expect(limited.status()).toBe(429);
});
