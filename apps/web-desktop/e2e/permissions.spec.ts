import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { openFiles } from './import-support.js';
import { readState } from './state.js';

async function focusDocument(page: Page, name: string) {
  await page.getByRole('button', { name: '窗口概览', exact: true }).click();
  await page
    .locator('.overview-row')
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByRole('button')
    .first()
    .click();
}

async function openDocument(page: Page, files: FrameLocator, name: string) {
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).click();
  await files.getByRole('button', { name: '在新窗口打开', exact: true }).click();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-401/AC1/3/4/6 permissions-revoke：按可读文件范围撤权，拒绝保存保留草稿，其他持久授权跨刷新有效`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    for (const name of ['撤销.txt', '保留.txt']) {
      await page.getByRole('button', { name: '打开 文件', exact: true }).click();
      await files.getByLabel('导入本机文件').setInputFiles({
        name,
        mimeType: 'text/plain',
        buffer: Buffer.from(`${name} 原始正文`)
      });
      await expect(files.getByRole('button', { name: `打开 ${name}`, exact: true })).toBeVisible();
      await openDocument(page, files, name);
      await page.getByRole('button', { name: '始终允许', exact: true }).click();
      await expect(
        page
          .getByRole('region', { name: `${name} 窗口`, exact: true })
          .locator('iframe')
          .contentFrame()
          .getByLabel('文档内容')
      ).toHaveValue(`${name} 原始正文`);
    }
    const before = await readState(page);
    const target = before.files.find(file => file.name === '撤销.txt')!;
    const retained = before.files.find(file => file.name === '保留.txt')!;
    const targetInstanceId = await page
      .getByRole('region', { name: '撤销.txt 窗口', exact: true })
      .getAttribute('data-instance-id');
    const targetWindow = page.locator(`[data-instance-id="${targetInstanceId}"]`);
    const targetEditor = targetWindow.locator('iframe').contentFrame();
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const settings = page.frameLocator('iframe[title="设置"]');
    await settings.getByRole('button', { name: '◇ 权限', exact: true }).click();
    await expect(settings.getByText('授权仅控制桌面托管服务。', { exact: false })).toContainText(
      '这不是恶意代码安全沙箱'
    );
    const grant = settings.locator('.grant-row').filter({ hasText: '文件「我的文件/撤销.txt」' });
    await expect(grant).toContainText('文本编辑器 · 文件访问');
    await expect(grant).toContainText(new URL(page.url()).origin);
    await expect(grant).toContainText('持久授权');
    await expect(grant).not.toContainText(target.id);
    const otherGrant = settings.locator('.grant-row').filter({ hasText: '文件「我的文件/保留.txt」' });
    await expect(otherGrant).toContainText('文本编辑器 · 文件访问');
    await grant.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(grant).toHaveCount(0);
    await expect(otherGrant).toHaveCount(1);
    expect((await readState(page)).grants.filter(value => value.appId === 'editor')).toEqual(
      before.grants.filter(value => value.appId === 'editor' && value.scope === retained.id)
    );
    await focusDocument(page, '撤销.txt');
    const draft = '撤权失败也要保留的中文草稿 🌏';
    await targetEditor.getByLabel('文档内容').fill(draft);
    await targetEditor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('范围：文件「我的文件/撤销.txt」');
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await expect(targetEditor.getByRole('alert')).toContainText('DENIED');
    await expect(targetEditor.getByLabel('文档内容')).toHaveValue(draft);
    await expect(targetWindow).toHaveAttribute('aria-label', /未保存/);
    expect((await readState(page)).files).toEqual(before.files);
    await targetEditor.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('button', { name: '仅本次允许', exact: true }).click();
    await expect(targetEditor.getByRole('status')).toContainText('已保存');
    await targetWindow.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
    await targetWindow.getByRole('button', { name: '退出应用', exact: true }).click();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(0);
    await expect
      .poll(async () =>
        (await readState(page)).grants.some(value => value.appId === 'editor' && value.scope === target.id)
      )
      .toBe(false);
    const saved = (await readState(page)).files;
    expect(saved.find(file => file.id === target.id)).toMatchObject({
      bytes: Buffer.from(draft).toString('base64'),
      revision: target.revision + 1
    });
    expect(saved.find(file => file.id === retained.id)).toEqual(retained);
    await expect.poll(async () => (await readState(page)).session.filter(win => win.appId === 'editor').length).toBe(0);
    await openDocument(page, files, '保留.txt');
    await expect(
      page
        .getByRole('region', { name: '保留.txt 窗口', exact: true })
        .locator('iframe')
        .contentFrame()
        .getByLabel('文档内容')
    ).toHaveValue('保留.txt 原始正文');
    await expect.poll(async () => (await readState(page)).session.filter(win => win.appId === 'editor').length).toBe(1);
    await page.reload();
    const retainedEditor = page
      .getByRole('region', { name: '保留.txt 窗口', exact: true })
      .locator('iframe')
      .contentFrame();
    await expect(retainedEditor.getByLabel('文档内容')).toHaveValue('保留.txt 原始正文');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await readState(page)).grants.filter(value => value.appId === 'editor')).toEqual(
      before.grants.filter(value => value.appId === 'editor' && value.scope === retained.id)
    );
    await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
    await openDocument(page, files, '撤销.txt');
    await expect(page.getByRole('dialog')).toContainText('范围：文件「我的文件/撤销.txt」');
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(2);
    const deniedEditor = page.locator('[data-app-id="editor"]').nth(1).locator('iframe').contentFrame();
    await expect(deniedEditor.getByRole('alert')).toContainText('DENIED');
    await expect(deniedEditor.getByLabel('文档内容')).toHaveValue('');
    await expect(retainedEditor.getByLabel('文档内容')).toHaveValue('保留.txt 原始正文');
    expect((await readState(page)).files).toEqual(saved);
  });
}
