/**
 * US-707 阶段 A 浏览器半边：dev-rxdb-p2p 在两个浏览器上下文之间经真实信令与 WebRTC 互传。
 * 字节一致以两端 OPFS 里落盘文件的 SHA-256 等于清单的 contentHash 为准，直接读盘，不经应用代码。
 */
import { expect, test } from '@playwright/test';
import { connectTo, fileRow, generateFile, newAccount, openDevice, storedDigest, transferOf } from './fixtures.ts';

test.describe('dev-rxdb-p2p 浏览器双设备', () => {
  test('AC#1 两台设备经 P2P 直传 1 MiB 文件，落盘字节与清单一致', async ({ browser }) => {
    const email = newAccount('ac1');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    const { fileName, contentHash } = await generateFile(holder, 1);

    await fileRow(fetcher, fileName).getByTestId('file-download').click();

    const transfer = transferOf(fetcher, fileName);
    await expect(transfer).toHaveAttribute('data-state', 'done');
    await expect(transfer).toContainText('P2P 直传');
    await expect(fileRow(fetcher, fileName).getByTestId('file-revoke')).toBeVisible();
    expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);
    expect(await storedDigest(holder, contentHash)).toBe(contentHash);
  });

  test('AC#2 建连之后中断两端到服务器的全部路由，传输仍经 P2P 完成', async ({ browser }) => {
    const email = newAccount('ac2');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    const { fileName, contentHash } = await generateFile(holder, 1);
    await expect(fileRow(fetcher, fileName)).toBeVisible();
    await connectTo(fetcher, holder);

    await holder.cutServer();
    await fetcher.cutServer();
    await expect(fetcher.page.getByTestId('signaling-state')).not.toHaveText(/online/);
    await fileRow(fetcher, fileName).getByTestId('file-download').click();

    const transfer = transferOf(fetcher, fileName);
    await expect(transfer).toHaveAttribute('data-state', 'done');
    await expect(transfer).toContainText('P2P 直传');
    expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);
  });

  test('AC#3 没有在线的持有者时回退服务器下载，落盘字节与清单一致', async ({ browser }) => {
    const email = newAccount('ac3');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    const { fileName, contentHash } = await generateFile(holder, 1, { upload: true });
    await expect(fileRow(fetcher, fileName)).toContainText('服务器副本');

    await holder.context.close();
    await expect(fetcher.page.locator(`[data-testid="peer-row"][data-peer="${holder.name}"]`)).toHaveCount(0);
    await fileRow(fetcher, fileName).getByTestId('file-download').click();

    const transfer = transferOf(fetcher, fileName);
    await expect(transfer).toHaveAttribute('data-state', 'done');
    await expect(transfer).toContainText('服务器回退');
    expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);
  });

  test('AC#6 没连过的设备在信令不可达时明确报告新建连接的前置不满足', async ({ browser }) => {
    const email = newAccount('ac6');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    const { fileName } = await generateFile(holder, 1);
    await expect(fileRow(fetcher, fileName).getByTestId('file-download')).toBeEnabled();

    await fetcher.cutServer();

    await expect(fetcher.page.getByTestId('devices-panel')).toContainText('信令不可达');
    await expect(fileRow(fetcher, fileName).getByTestId('file-download')).toBeDisabled();
    await expect(fileRow(fetcher, fileName).getByTestId('file-download')).toHaveText(/持有者离线/);
  });
});
