/**
 * POOL-US-101 回退内容加密：上传方加密后服务器只见密文；有信封的设备回退解密成功；
 * 上传之后才注册的设备没有信封，回退下载明确失败；旧客户端（不带编码头）取密文得到 426。
 */
import { expect, test, type Page } from '@playwright/test';
import { fileRow, generateFile, newAccount, openDevice, storedDigest, transferOf } from './fixtures.ts';

/** 在页面里以登录身份直接取密文副本的 SHA-256：走真实服务器，不经应用代码。 */
const fetchCiphertextDigest = (page: Page, sourceUrl: string): Promise<string> =>
  page.evaluate(async url => {
    const storageKey = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    if (!storageKey) throw new Error('no supabase session in localStorage');
    const { access_token } = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { access_token: string };
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${access_token}`, 'x-pool-fallback-encoding': '1' }
    });
    if (!response.ok) throw new Error(`server responded ${response.status}`);
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
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

    // 上传之后才注册的账号没有信封：回退下载明确失败，不落盘
    const late = await openDevice(browser, newAccount('enc-late'), 'sign-up');
    await expect(fileRow(late, fileName)).toBeVisible();
    await fileRow(late, fileName).getByTestId('file-download').click();
    const failed = transferOf(late, fileName);
    await expect(failed).toHaveAttribute('data-state', 'failed');
    await expect(failed).toContainText('没有解密信封');
  });

  test('AC#8 旧客户端（不带编码头）取密文副本得到 426 升级提示', async ({ browser, request }) => {
    const holder = await openDevice(browser, newAccount('enc-426'), 'sign-up');
    const { fileName } = await generateFile(holder, 1, { upload: true });
    const sourceUrl = (await fileRow(holder, fileName).getAttribute('data-source')) as string;
    expect(sourceUrl).toMatch(/^\/api\/files\/enc\//);

    const response = await request.get(sourceUrl);
    expect(response.status()).toBe(426);
    expect(await response.text()).toContain('encrypted');
  });
});
