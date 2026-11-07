import { expect, test, type Page } from '@playwright/test';
import type { DesktopState } from '../src/core/types.js';

async function snapshot(page: Page): Promise<DesktopState> {
  return page.evaluate(
    () =>
      new Promise<DesktopState>((resolve, reject) => {
        const request = indexedDB.open('orbit-desktop', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('state', 'readonly');
          const read = transaction.objectStore('state').get('desktop');
          read.onsuccess = () => resolve(read.result as DesktopState);
          read.onerror = () => reject(read.error);
          transaction.oncomplete = () => database.close();
        };
      })
  );
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-501/AC1/5：更小视口刷新后按最小化、最大化、贴靠、普通状态依次还原`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    const win = page.locator('[data-app-id="editor"]');
    await expect(win.locator('iframe').contentFrame().getByLabel('文档内容')).toBeVisible();
    const original = (await snapshot(page)).session[0];
    await win.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
    await win.getByRole('button', { name: '贴靠到右侧', exact: true }).click();
    await win.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
    await win.getByRole('button', { name: '最大化窗口 文本编辑器', exact: true }).click();
    await win.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    await expect(win).toBeHidden();
    await expect
      .poll(async () => (await snapshot(page)).session[0])
      .toMatchObject({
        state: 'minimized',
        previousState: 'right',
        beforeMinimized: 'maximized',
        bounds: original.bounds
      });
    await page.setViewportSize({ width: 700, height: 600 });
    await page.reload();
    await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
    await expect(win).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).schemaVersion).toBe(4);
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    await expect(win).toBeVisible();
    await expect(win).toHaveCSS('width', '700px');
    await expect(win.getByRole('button', { name: '还原窗口 文本编辑器', exact: true })).toBeInViewport();
    await win.getByRole('button', { name: '还原窗口 文本编辑器', exact: true }).click();
    await expect(win).toHaveCSS('width', '350px');
    await expect(win).toHaveCSS('left', '350px');
    await expect.poll(async () => (await snapshot(page)).session[0].state).toBe('right');
    await win.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
    await win.getByRole('button', { name: '还原窗口', exact: true }).click();
    await win.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).session[0].state).toBe('normal');
    await expect(win).toHaveCSS('width', '700px');
    await expect(win).toHaveCSS('left', '0px');
    await expect(win.getByRole('button', { name: '关闭窗口 文本编辑器', exact: true })).toBeInViewport();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
  });
}
