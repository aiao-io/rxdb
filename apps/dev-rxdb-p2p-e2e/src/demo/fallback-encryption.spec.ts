/**
 * POOL-US-101 回退内容加密：上传方加密后服务器只见密文；有信封的设备回退解密成功；
 * 上传之后才注册的设备没有信封，回退下载明确失败；旧客户端（不带编码头）取密文得到 426。
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ADMIN_ACCOUNT, fileRow, generateFile, newAccount, openDevice, storedDigest, transferOf } from './fixtures.ts';

/** 页面里已登录会话的用户 id（token sub）。 */
const userIdOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      let candidate: { access_token?: unknown } | null = null;
      try {
        candidate = JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: unknown } | null;
      } catch {
        // 跳过非 JSON 的值
      }
      if (candidate && typeof candidate.access_token === 'string') {
        const payload = candidate.access_token.split('.')[1]!;
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(atob(padded.replaceAll('-', '+').replaceAll('_', '/')))['sub'] as string;
      }
    }
    throw new Error('no supabase session in localStorage');
  });

/** 页面里登记的当前设备 id。 */
const deviceIdOf = (page: Page, userId: string): Promise<string> =>
  page.evaluate(user => {
    const deviceId = localStorage.getItem(`dev-rxdb-p2p:device:${user}`);
    if (!deviceId) throw new Error('no device registered in localStorage');
    return deviceId;
  }, userId);

/** 页面里显示的登录邮箱。 */
const emailOf = async (page: Page): Promise<string> =>
  ((await page.getByTestId('current-user').textContent()) ?? '').trim();

/** 管理员登录并经站内导航进入 /admin。 */
const openAdmin = async (browser: Parameters<typeof openDevice>[0]) => {
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

/** 在页面里以登录身份直接取密文副本的 SHA-256：走真实服务器，不经应用代码。 */
const fetchCiphertextDigest = (page: Page, sourceUrl: string): Promise<string> =>
  page.evaluate(async url => {
    let token: string | null = null;
    for (const key of Object.keys(localStorage)) {
      let candidate: { access_token?: unknown } | null = null;
      try {
        candidate = JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: unknown } | null;
      } catch {
        // localStorage 里还有别的东西，跳过
      }
      if (candidate && typeof candidate.access_token === 'string') token = candidate.access_token;
    }
    if (!token) throw new Error('no supabase session in localStorage');
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, 'x-pool-fallback-encoding': '1' }
    });
    if (!response.ok) throw new Error(`server responded ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }, sourceUrl);

/** 以登录身份、不带编码头（模拟旧客户端）取密文副本的响应状态。 */
const legacyFetchStatus = (page: Page, sourceUrl: string): Promise<number> =>
  page.evaluate(async url => {
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
    return (await fetch(url, { headers: { authorization: `Bearer ${token}` } })).status;
  }, sourceUrl);

test.describe('回退内容加密', () => {
  test('AC#1/AC#4 服务器副本是密文；有信封的设备解密成功；没有信封的设备明确失败', async ({ browser }) => {
    const email = newAccount('enc');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    const { fileName, contentHash } = await generateFile(holder, 1, { upload: true });
    const row = fileRow(fetcher, fileName);
    const sourceUrl = (await row.getAttribute('data-source')) as string;
    expect(sourceUrl).toMatch(/^\/api\/files\/enc\/[0-9a-f]{64}$/);

    // 服务器副本是密文：从服务器取回的字节哈希 ≠ 明文 contentHash（明文上传则两者必相等）
    expect(await fetchCiphertextDigest(fetcher.page, sourceUrl)).not.toBe(contentHash);

    // 有信封的设备回退下载，解密后落盘字节与清单一致
    await holder.context.close();
    await expect(fetcher.page.locator(`[data-testid="peer-row"][data-peer="${holder.name}"]`)).toHaveCount(0);
    await row.getByTestId('file-download').click();
    const transfer = transferOf(fetcher, fileName);
    await expect(transfer).toHaveAttribute('data-state', 'done');
    await expect(transfer).toContainText('服务器回退');
    expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);

    // 上传之后才注册的账号没有信封：关掉全部在线持有者逼它走回退，明确失败，不落盘
    await fetcher.context.close();
    const late = await openDevice(browser, newAccount('enc-late'), 'sign-up');
    await expect(fileRow(late, fileName)).toBeVisible();
    await fileRow(late, fileName).getByTestId('file-download').click();
    const failed = transferOf(late, fileName);
    await expect(failed).toHaveAttribute('data-state', 'failed');
    await expect(failed).toContainText('没有解密信封');
  });

  test('AC#8 旧客户端（不带编码头）取密文副本得到 426 升级提示', async ({ browser }) => {
    const holder = await openDevice(browser, newAccount('enc-426'), 'sign-up');
    const { fileName } = await generateFile(holder, 1, { upload: true });
    const sourceUrl = (await fileRow(holder, fileName).getAttribute('data-source')) as string;
    expect(sourceUrl).toMatch(/^\/api\/files\/enc\//);

    // 旧客户端是已认证用户，只是不带编码头：服务端 426 提示升级，不把密文当明文交给它
    expect(await legacyFetchStatus(holder.page, sourceUrl)).toBe(426);
  });
});

/** 在页面里以登录身份查信封行：断言只有密文字段，不含密钥明文与私钥 JWK。 */
const envelopeRows = (page: Page, contentHash: string): Promise<readonly Record<string, unknown>[]> =>
  page.evaluate(async hash => {
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
    const config = (globalThis as { __P2P_CONFIG__?: { supabaseAnonKey: string; supabaseUrl: string } }).__P2P_CONFIG__;
    const apikey = config?.supabaseAnonKey ?? '';
    if (!token || !apikey || !config?.supabaseUrl) throw new Error('no supabase session in localStorage');
    const url = new URL('/rest/v1/p2p_fallback_envelope', config.supabaseUrl);
    url.searchParams.set('select', '*');
    url.searchParams.set('contentHash', `eq.${hash}`);
    const response = await fetch(url, {
      headers: { apikey, authorization: `Bearer ${token}`, 'accept-profile': 'p2p' }
    });
    if (!response.ok) throw new Error(`PostgREST responded ${response.status}`);
    return (await response.json()) as Record<string, unknown>[];
  }, contentHash);

/** 页面里以登录身份直接 PUT 明文字节到明文回退路由（旧世界副本）。 */
const putPlaintextCopy = (page: Page, contentHash: string, payload: number[]): Promise<number> =>
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
      const response = await fetch(`/api/files/${hash}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
        body: new Uint8Array(bytes)
      });
      return response.status;
    },
    [contentHash, payload] as const
  );

test.describe('回退内容加密的处置与泄漏面', () => {
  test('AC#3/AC#10 信封行只有密文字段，不含内容密钥明文与设备私钥 JWK', async ({ browser }) => {
    const holder = await openDevice(browser, newAccount('env-row'), 'sign-up');
    const { contentHash } = await generateFile(holder, 1, { upload: true });

    const rows = await envelopeRows(holder.page, contentHash);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const allowed = new Set([
        'id',
        'contentHash',
        'encHash',
        'publisherUserId',
        'recipientDeviceId',
        'kid',
        'epk',
        'iv',
        'ct',
        'tag',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy'
      ]);
      expect(Object.keys(row).every(key => allowed.has(key))).toBe(true);
      expect(row['kid']).toBe('p256-1');
      expect(row['encHash']).toMatch(/^[0-9a-f]{64}$/);
      expect(row['publisherUserId']).toMatch(/^[0-9a-f-]{36}$/);
      for (const field of ['epk', 'iv', 'ct', 'tag']) {
        expect(typeof row[field]).toBe('string');
        expect((row[field] as string).length).toBeGreaterThan(0);
      }
    }
    // 信封密文里不可能有明文密钥或私钥 JWK 的特征字段（contentHash 是清单元数据，本身就在行里）
    expect(JSON.stringify(rows)).not.toContain('kty');
    expect(JSON.stringify(rows)).not.toContain('privateKeyJwk');
  });

  test('AC#7 升级后新上传全加密；管理员删除旧明文副本后无明文残留', async ({ browser }) => {
    const holder = await openDevice(browser, newAccount('legacy-copy'), 'sign-up');
    // 新上传是密文副本
    const { fileName } = await generateFile(holder, 1, { upload: true });
    expect(await fileRow(holder, fileName).getAttribute('data-source')).toMatch(/^\/api\/files\/enc\//);

    // 旧世界明文副本：直接 PUT 明文到明文路由（旧客户端行为），管理员能在列表看到并删除。
    // 键是载荷自己的哈希——旧明文副本是独立对象，与清单的 contentHash 无关
    const payload = [1, 2, 3, 4];
    const legacyHash = createHash('sha256').update(Buffer.from(payload)).digest('hex');
    expect(await putPlaintextCopy(holder.page, legacyHash, payload)).toBe(201);
    const admin = await openAdmin(browser);
    try {
      await admin.page.getByTestId('admin-tab-files').click();
      const legacy = admin.page.locator(`[data-testid="admin-file-row"][data-hash="${legacyHash}"]`);
      await expect(legacy).toBeVisible();
      await legacy.getByTestId('admin-delete-file').click();
      await confirmAction(admin.page, legacyHash.slice(0, 12));
      await expect(legacy).toHaveCount(0);
    } finally {
      await admin.context.close();
    }
    // 明文副本已删：明文路由 404，密文副本不受影响
    const after = await holder.page.evaluate(async hash => {
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
      return (await fetch(`/api/files/${hash}`, { headers: { authorization: `Bearer ${token}` } })).status;
    }, legacyHash);
    expect(after).toBe(404);
  });

  test('AC#9 管理员删除账号：该账号设备的信封一并清理，其他设备的信封保留', async ({ browser }) => {
    const uploader = await openDevice(browser, newAccount('purge-env'), 'sign-up');
    const fetcher = await openDevice(browser, newAccount('purge-peer'), 'sign-up');
    const { contentHash } = await generateFile(uploader, 1, { upload: true });
    const uploaderUserId = await userIdOf(uploader.page);
    const uploaderDeviceId = await deviceIdOf(uploader.page, uploaderUserId);

    const before = await envelopeRows(fetcher.page, contentHash);
    expect(before.some(row => row['recipientDeviceId'] === uploaderDeviceId)).toBe(true);

    const admin = await openAdmin(browser);
    const uploaderEmail = await emailOf(uploader.page);
    try {
      const row = admin.page.locator(`[data-testid="admin-account-row"][data-email="${uploaderEmail}"]`);
      await row.getByTestId('admin-delete-account').click();
      await confirmAction(admin.page, `已删除 ${uploaderEmail}`);
      await expect(row).toHaveCount(0);
    } finally {
      await admin.context.close();
    }

    const after = await envelopeRows(fetcher.page, contentHash);
    expect(after.some(row => row['recipientDeviceId'] === uploaderDeviceId)).toBe(false);
    expect(after).toHaveLength(before.length - 1);
  });
});
