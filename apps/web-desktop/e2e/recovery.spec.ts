import { expect, test, type Page } from '@playwright/test';
import { readState as snapshot } from './state.js';

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
    expect(reset.schemaVersion).toBe(5);
    expect(reset.files).toEqual([]);
    expect(reset.session).toEqual([]);
  });
}

for (const failure of ['quota', 'abort'] as const) {
  test(`DESKTOP-US-501/AC6 recovery-reset-${failure}：受损桌面重置失败保留原始记录，刷新后可明确重试`, async ({
    page
  }) => {
    await saveDocument(page, 'windows');
    const original = await snapshot(page);
    const invalid = { ...original, schemaVersion: 99 };
    await replace(page, invalid);
    await page.reload();
    await expect(page.getByRole('heading', { name: '桌面未能启动', exact: true })).toBeVisible();
    await page.evaluate(kind => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        if (this.name === 'state' && key === 'desktop' && kind === 'quota')
          throw new DOMException('模拟恢复额度不足', 'QuotaExceededError');
        const request = put.call(this, value, key);
        if (this.name === 'state' && key === 'desktop' && kind === 'abort')
          request.addEventListener('success', () => this.transaction.abort(), { once: true });
        return request;
      };
    }, failure);
    await page.getByRole('button', { name: '重置受损桌面…', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '确认删除全部数据', exact: true }).click();
    await expect(page.locator('.boot-card')).toContainText(failure === 'quota' ? 'QUOTA' : 'STORAGE');
    await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toHaveCount(0);
    expect(await snapshot(page)).toEqual(invalid);
    await page.reload();
    await expect(page.getByRole('heading', { name: '桌面未能启动', exact: true })).toBeVisible();
    expect(await snapshot(page)).toEqual(invalid);
    await page.getByRole('button', { name: '重置受损桌面…', exact: true }).click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '确认删除全部数据', exact: true }).click();
    await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toBeVisible();
    expect((await snapshot(page)).files).toEqual([]);
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

test('DESKTOP-US-501/AC2 missing-install：未安装应用的两个快照保留到显式移除，布局操作与刷新不会丢项', async ({
  page
}) => {
  await saveDocument(page, 'windows');
  const state = await snapshot(page);
  const missing = {
    ...state.session[0],
    id: 'pending-a',
    appId: 'notes',
    state: 'minimized' as const,
    previousState: 'right' as const,
    beforeMinimized: 'maximized' as const
  };
  state.session.unshift(missing, { ...missing, id: 'pending-b' });
  state.navigation.activeWindows['first'] = 2;
  await replace(page, state);
  await page.reload();
  const pending = page.getByRole('region', { name: '待恢复窗口', exact: true });
  await expect(pending.locator('[data-recovery-id]')).toHaveCount(2);
  await expect(pending).toContainText('速记本');
  await expect(pending.getByRole('button', { name: '关闭恢复待办', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pending).toHaveCount(0);
  const toggle = page.getByRole('button', { name: '恢复待办', exact: true });
  await toggle.click();
  await expect(pending.getByRole('button', { name: '关闭恢复待办', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await pending.getByRole('button', { name: '关闭恢复待办', exact: true }).click();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toHaveValue(
    '上次保存的原始正文'
  );
  await page.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).session.filter(win => win.appId === 'notes').length).toBe(2);
  await page.reload();
  await expect(pending.locator('[data-recovery-id]')).toHaveCount(2);
  await pending
    .locator('[data-recovery-id="pending-a"]')
    .getByRole('button', { name: '重试恢复', exact: true })
    .click();
  await expect(pending.locator('[data-recovery-id="pending-a"]')).toContainText('NOT_FOUND');
  await pending
    .locator('[data-recovery-id="pending-a"]')
    .getByRole('button', { name: '移除恢复项', exact: true })
    .click();
  await expect(pending.locator('[data-recovery-id]')).toHaveCount(1);
  expect((await snapshot(page)).files).toEqual(state.files);
  await page.reload();
  await expect(pending.locator('[data-recovery-id="pending-b"]')).toBeVisible();
  await pending.getByRole('button', { name: '移除恢复项', exact: true }).click();
  await expect(pending).toHaveCount(0);
  await expect(page.getByRole('button', { name: '恢复待办', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '恢复待办', exact: true })).toHaveCount(0);
  expect((await snapshot(page)).files).toEqual(state.files);
});

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-501/AC2 missing-install-install：目录安装后按身份恢复一个窗口，保留同应用另一待办与文件路由`, async ({
    page
  }) => {
    await saveDocument(page, mode);
    const state = await snapshot(page);
    const fileId = state.files[0].id;
    const missing = {
      ...state.session[0],
      id: 'pending-a',
      appId: 'notes',
      fileId,
      route: `/documents/${fileId}?line=2#L2`,
      state: 'minimized' as const,
      previousState: 'right' as const,
      beforeMinimized: 'maximized' as const
    };
    state.session.unshift(missing, { ...missing, id: 'pending-b' });
    state.navigation.activeWindows['first'] = 2;
    await replace(page, state);
    await page.reload();
    const pending = page.getByRole('region', { name: '待恢复窗口', exact: true });
    await pending.getByRole('button', { name: '打开应用目录', exact: true }).click();
    await expect(pending).toHaveCount(0);
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).session.filter(win => win.appId === 'notes').length).toBe(2);
    const catalog = page.frameLocator('iframe[title="应用目录"]');
    const card = catalog.getByRole('article').filter({ hasText: '速记本' });
    await card.getByRole('button', { name: '安装', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(card.getByRole('button', { name: '卸载', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '恢复待办', exact: true }).click();
    await expect(pending.locator('[data-recovery-id]')).toHaveCount(2);
    await pending
      .locator('[data-recovery-id="pending-a"]')
      .getByRole('button', { name: '重试恢复', exact: true })
      .click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(pending.locator('[data-recovery-id]')).toHaveCount(1);
    await expect(pending.locator('[data-recovery-id="pending-b"]')).toBeVisible();
    const restored = page.locator('[data-app-id="notes"]');
    await expect(restored).toHaveCount(1);
    await expect(restored.locator('iframe').contentFrame().getByLabel('文档内容')).toHaveValue('上次保存的原始正文');
    await expect.poll(async () => (await snapshot(page)).session.find(win => win.id === 'pending-a')).toEqual(missing);
    expect((await snapshot(page)).files).toEqual(state.files);
    await page.reload();
    await expect(page.locator('[data-app-id="notes"]')).toHaveCount(2);
    await expect(page.getByRole('button', { name: '恢复待办', exact: true })).toHaveCount(0);
    const current = await snapshot(page);
    expect(
      current.session
        .filter(win => win.appId === 'notes')
        .map(win => win.id)
        .sort()
    ).toEqual(['pending-a', 'pending-b']);
    expect(current.files).toEqual(state.files);
  });
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-501/AC2 missing-install-workspace：删除工作区迁移待恢复快照，之后移除与刷新使用最新位置`, async ({
    page
  }) => {
    await saveDocument(page, mode);
    const state = await snapshot(page);
    state.workspaces.push({ id: 'writing', name: '待删写作区' });
    state.navigation.activeWindows['writing'] = null;
    const missing = { ...state.session[0], id: 'pending-a', appId: 'notes', workspaceId: 'writing' };
    state.session.push(missing, { ...missing, id: 'pending-b' });
    await replace(page, state);
    await page.reload();
    const pending = page.getByRole('region', { name: '待恢复窗口', exact: true });
    await expect(pending.locator('[data-recovery-id]')).toHaveCount(2);
    await expect(pending).toContainText('待删写作区');
    await pending.getByRole('button', { name: '关闭恢复待办', exact: true }).click();
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const settings = page.frameLocator('iframe[title="设置"]');
    await settings.getByRole('button', { name: '▤ 工作区', exact: true }).click();
    const writing = settings.locator('.workspace-setting').filter({ hasText: '待删写作区' });
    await writing.getByRole('button', { name: '删除并迁移窗口', exact: true }).click();
    await page.getByLabel('迁移到', { exact: true }).selectOption('first');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(writing).toHaveCount(0);
    await expect
      .poll(async () => (await snapshot(page)).session.filter(win => win.appId === 'notes').map(win => win.workspaceId))
      .toEqual(['first', 'first']);
    await page.getByRole('button', { name: '恢复待办', exact: true }).click();
    await expect(pending.locator('[data-recovery-id="pending-a"]')).toContainText('工作区 1');
    await expect(pending).not.toContainText('待删写作区');
    await pending
      .locator('[data-recovery-id="pending-a"]')
      .getByRole('button', { name: '移除恢复项', exact: true })
      .click();
    await expect(pending.locator('[data-recovery-id]')).toHaveCount(1);
    await page.reload();
    await expect(pending.locator('[data-recovery-id="pending-b"]')).toContainText('工作区 1');
    expect((await snapshot(page)).files).toEqual(state.files);
  });
}
