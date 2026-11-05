import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileRow, generateFile, newAccount, openDevice, storedDigest, transferOf } from './fixtures.ts';

test.describe('文件共享与本机管理交互', () => {
  test('未登录时，管理地址进入登录页', async ({ page }) => {
    await page.goto('/manage');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-sign-in')).toBeVisible();
    await expect(page.getByTestId('managed-files')).toHaveCount(0);
  });

  test('管理入口可导航和刷新，高级诊断默认收起，手机上页面不横向溢出', async ({ browser }) => {
    const device = await openDevice(browser, newAccount('management-navigation'), 'sign-up');
    const page = device.page;
    try {
      await expect(page.getByTestId('inspector-panel')).toHaveCount(0);
      await expect(page.getByTestId('manage-entry')).toBeVisible();
      await page.getByTestId('manage-entry').click();
      await expect(page).toHaveURL(/\/manage$/);
      await expect(page.getByTestId('managed-files')).toBeVisible();
      await expect(page.getByTestId('current-device')).toHaveText(device.name);

      await page.reload();
      await expect(page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'online');
      await expect(page.getByTestId('managed-files')).toBeVisible();
      await expect(page.getByTestId('current-device')).toHaveText(device.name);
      const diagnostics = page.getByTestId('advanced-diagnostics');
      await expect(diagnostics).toHaveJSProperty('open', false);
      await expect(page.getByTestId('fault-deny')).toBeHidden();
      await diagnostics.locator('summary').first().click();
      await expect(page.getByTestId('fault-deny')).toBeVisible();
      await page.getByTestId('fault-deny').check();
      await diagnostics.locator('summary').first().click();

      await page.getByRole('link', { name: '文件共享', exact: true }).click();
      await expect(page.getByTestId('fault-warning')).toBeVisible();
      await page.getByRole('button', { name: '恢复正常共享', exact: true }).click();
      await expect(page.getByTestId('fault-warning')).toHaveCount(0);
      await page.getByTestId('manage-entry').click();

      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.getByRole('link', { name: '文件共享', exact: true }).click();
      await expect(page.getByTestId('files-panel')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
      await device.context.close();
    }
  });

  test('下载后保存真实文件，清记录保留文件，确认移除只影响本机副本', async ({ browser }) => {
    const email = newAccount('management-files');
    const holder = await openDevice(browser, email, 'sign-up');
    const fetcher = await openDevice(browser, email, 'sign-in');
    try {
      const { fileName, contentHash } = await generateFile(holder, 1, { upload: true });
      await fileRow(fetcher, fileName).getByTestId('file-download').click();
      const transfer = transferOf(fetcher, fileName);
      await expect(transfer).toHaveAttribute('data-state', 'done');
      await expect(fileRow(holder, fileName)).toContainText(fetcher.name);

      const savedFile = fetcher.page.waitForEvent('download');
      await transfer.getByTestId('transfer-save').click();
      const download = await savedFile;
      expect(download.suggestedFilename()).toBe(fileName);
      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const savedBytes = await readFile(downloadPath!);
      expect(createHash('sha256').update(savedBytes).digest('hex')).toBe(contentHash);

      await fetcher.page.getByTestId('clear-transfers').click();
      await expect(transfer).toHaveCount(0);
      await expect(fileRow(fetcher, fileName).getByTestId('file-revoke')).toBeVisible();
      expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);

      await fetcher.page.getByTestId('manage-entry').click();
      const managedFile = fetcher.page.getByTestId('managed-file-row').filter({ hasText: fileName });
      await expect(managedFile).toBeVisible();
      await managedFile.getByTestId('manage-remove').click();
      const confirmation = fetcher.page.getByTestId('manage-removal-confirm');
      await expect(confirmation).toContainText('其他设备、服务器副本');
      await confirmation.getByRole('button', { name: '取消', exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(managedFile).toBeVisible();
      expect(await storedDigest(fetcher, contentHash)).toBe(contentHash);

      await managedFile.getByTestId('manage-remove').click();
      await confirmation.getByRole('button', { name: '确认移除', exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(managedFile).toHaveCount(0);
      await expect
        .poll(() =>
          fetcher.page.evaluate(async hash => {
            const root = await navigator.storage.getDirectory();
            const directory = await root.getDirectoryHandle('p2p-files');
            try {
              await directory.getFileHandle(hash);
              return true;
            } catch (error) {
              if (error instanceof DOMException && error.name === 'NotFoundError') return false;
              throw error;
            }
          }, contentHash)
        )
        .toBe(false);

      await fetcher.page.getByRole('link', { name: '文件共享', exact: true }).click();
      await expect(fileRow(fetcher, fileName).getByTestId('file-revoke')).toHaveCount(0);
      await expect(fileRow(fetcher, fileName).getByTestId('file-download')).toBeEnabled();
      await expect(fileRow(fetcher, fileName)).toContainText('服务器副本');
      await expect(fileRow(holder, fileName).getByTestId('file-revoke')).toBeVisible();
      expect(await storedDigest(holder, contentHash)).toBe(contentHash);

      await fetcher.page.setViewportSize({ width: 390, height: 844 });
      const mobileDownload = fileRow(fetcher, fileName).getByTestId('file-download');
      await mobileDownload.scrollIntoViewIfNeeded();
      await expect(mobileDownload).toBeInViewport({ ratio: 1 });
    } finally {
      await fetcher.context.close();
      await holder.context.close();
    }
  });
});
