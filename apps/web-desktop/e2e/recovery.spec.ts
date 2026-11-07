import { expect, test, type Page } from '@playwright/test';
import type { DesktopState } from '../src/core/types.js';

async function saveDocument(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文件名', { exact: true }).fill('恢复样本.txt');
  await editor.getByLabel('文档内容').fill('上次保存的原始正文');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  return editor;
}

async function snapshot(page: Page): Promise<DesktopState> {
  return page.evaluate(
    () =>
      new Promise<DesktopState>((resolve, reject) => {
        const request = indexedDB.open('orbit-desktop', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('state', 'readonly');
          const read = tx.objectStore('state').get('desktop');
          read.onsuccess = () => resolve(read.result as DesktopState);
          read.onerror = () => reject(read.error);
          tx.oncomplete = () => database.close();
        };
      })
  );
}

async function replace(page: Page, state: unknown) {
  await page.evaluate(
    value =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('orbit-desktop', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('state', 'readwrite');
          tx.objectStore('state').put(value, 'desktop');
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onabort = () => {
            database.close();
            reject(tx.error);
          };
        };
      }),
    state
  );
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-501/AC3：强制关闭只恢复已保存内容并说明未保存内容不能保证找回`, async ({
    page,
    context
  }) => {
    const editor = await saveDocument(page, mode);
    await editor.getByLabel('文档内容').fill('强制关闭前未保存的修改');
    await expect(page.getByLabel('未保存', { exact: true })).toBeVisible();
    await page.close({ runBeforeUnload: false });
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toHaveValue(
      '上次保存的原始正文'
    );
    await expect(reopened.getByText(/未保存内容无法保证找回/)).toBeVisible();
    await reopened.getByRole('button', { name: '关闭恢复提示', exact: true }).click();
    await expect(reopened.getByText(/未保存内容无法保证找回/)).toHaveCount(0);
  });
}

for (const corruption of ['unsupported', 'damaged', 'unknownVersion', 'unknownApp'] as const) {
  test(`DESKTOP-US-501/AC6 ${corruption}：受损数据保留，恢复诊断去正文，两次取消不重置，最终确认后才清空`, async ({
    page
  }) => {
    await saveDocument(page, 'windows');
    const original = await snapshot(page);
    const invalid = {
      unsupported: { ...original, schemaVersion: 99 },
      damaged: { ...original, schemaVersion: 3, session: [null] },
      unknownVersion: {
        ...original,
        installations: original.installations.map((app, index) => (index === 0 ? { ...app, version: '99.0.0' } : app))
      },
      unknownApp: { ...original, session: [{ ...original.session[0], appId: 'unknown-app' }] }
    }[corruption];
    const code = { unsupported: 'INVALID', damaged: 'INVALID', unknownVersion: 'NOT_FOUND', unknownApp: 'DENIED' }[
      corruption
    ];
    await replace(page, invalid);
    await page.reload();
    await expect(page.getByRole('heading', { name: '桌面未能启动', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '恢复诊断', exact: true })).toContainText(code);
    await expect(page.getByText('原始数据已保留', { exact: true })).toBeVisible();
    expect(await snapshot(page)).toEqual(invalid);
    expect(await page.locator('body').innerText()).not.toContain('上次保存的原始正文');
    await page.getByRole('button', { name: '重置受损桌面…', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await snapshot(page)).toEqual(invalid);
    await page.getByRole('button', { name: '重置受损桌面…', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await snapshot(page)).toEqual(invalid);
    await page.getByRole('button', { name: '重置受损桌面…', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '确认删除全部数据', exact: true }).click();
    await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toBeVisible();
    const reset = await snapshot(page);
    expect(reset.schemaVersion).toBe(4);
    expect(reset.files).toEqual([]);
    expect(reset.session).toEqual([]);
  });
}

for (const failure of ['QuotaExceededError', 'SecurityError'] as const) {
  test(`DESKTOP-US-501/AC4 ${failure}：布局写入被拒绝时显示影响范围，原字节和布局仍可恢复`, async ({ page }) => {
    await saveDocument(page, 'windows');
    const before = await snapshot(page);
    await page.evaluate(name => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('模拟写入被拒绝', name);
      };
    }, failure);
    await page.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('桌面布局和会话保存失败');
    await expect(page.getByRole('alert')).toContainText('已保存的文件不受此次布局保存影响');
    expect(await snapshot(page)).toEqual(before);
    await page.reload();
    await expect(page.locator('[data-app-id="editor"]')).toBeVisible();
    await expect(page.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toHaveValue(
      '上次保存的原始正文'
    );
    expect((await snapshot(page)).session[0].state).toBe('normal');
  });
}

test('DESKTOP-US-501/AC2：单个恢复实例启动失败不阻塞设置，重试或移除保留已保存文件', async ({ page, context }) => {
  await saveDocument(page, 'windows');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.locator('[data-app-id="settings"]');
  const settingsFrame = settings.locator('iframe').contentFrame();
  await settingsFrame.getByRole('button', { name: '◈ 关于与帮助', exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).session.find(win => win.appId === 'settings')?.route)
    .toBe('/about');
  await context.addInitScript(() => {
    if (
      !window.location.pathname.includes('/releases/editor/1.0.0/') ||
      localStorage.getItem('desktop-test-break-editor') !== 'yes'
    )
      return;
    const observer = new MutationObserver(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="desktop-release"]');
      if (!meta) return;
      meta.content = '模拟恢复实例启动校验失败';
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.evaluate(() => localStorage.setItem('desktop-test-break-editor', 'yes'));
  const original = await snapshot(page);
  await page.reload();
  const editor = page.locator('[data-app-id="editor"]');
  await expect(editor.getByRole('alert')).toContainText('INTEGRITY');
  await expect(settingsFrame.locator('.app-frame')).toHaveAttribute('data-route', '/about');
  const settingsId = await settings.getAttribute('data-instance-id');
  await page.evaluate(() => localStorage.removeItem('desktop-test-break-editor'));
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await editor.getByRole('button', { name: '重试', exact: true }).click();
  await expect(editor.locator('iframe').contentFrame().getByLabel('文档内容')).toHaveValue('上次保存的原始正文');
  await expect(settings).toHaveAttribute('data-instance-id', settingsId!);
  expect((await snapshot(page)).files).toEqual(original.files);
  await page.evaluate(() => localStorage.setItem('desktop-test-break-editor', 'yes'));
  await page.reload();
  await expect(editor.getByRole('alert')).toContainText('INTEGRITY');
  await editor.getByRole('alert').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(settingsFrame.locator('.app-frame')).toHaveAttribute('data-route', '/about');
  await expect.poll(async () => (await snapshot(page)).session.some(win => win.appId === 'editor')).toBe(false);
  expect((await snapshot(page)).files).toEqual(original.files);
});
