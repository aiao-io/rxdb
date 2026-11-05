/**
 * POOL-US-101 回退内容加密：上传方加密后服务器只见密文；有信封的设备回退解密成功；
 * 上传之后才注册的设备没有信封，回退下载明确失败；旧客户端（不带编码头）取密文得到 426。
 */
import { expect, test, type Page } from '@playwright/test';
import { fileRow, generateFile, newAccount, openDevice, storedDigest, transferOf } from './fixtures.ts';

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
