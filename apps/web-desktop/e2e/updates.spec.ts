import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
}
async function catalog(page: Page, first = false) {
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  if (first) await page.getByRole('button', { name: '始终允许', exact: true }).click();
  return page.frameLocator('iframe[title="应用目录"]').getByRole('article').filter({ hasText: '文本编辑器' });
}

test('DESKTOP-US-204：拒绝新增权限、取消脏关闭、更新和回退均保留文档', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文件名', { exact: true }).fill('版本切换.txt');
  await editor.getByLabel('文档内容').fill('首次保存的文档');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await editor.getByLabel('文档内容').fill('版本更新前的未保存修改');
  const oldURL = await page.locator('iframe[title="文本编辑器"]').getAttribute('src');
  expect(oldURL).toContain('/releases/editor/1.0.0/');
  const card = await catalog(page, true);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('clipboard');
  await page.getByRole('button', { name: '稍后', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', oldURL!);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '拒绝，保留旧版本', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', oldURL!);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('版本更新前的未保存修改');
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', oldURL!);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.1\.0\//);
  await expect(editor.getByLabel('文档内容')).toHaveValue('版本更新前的未保存修改');
  await expect(editor.getByRole('button', { name: '复制全文', exact: true })).toBeVisible();
  await page.reload();
  await expect(editor.getByLabel('文档内容')).toHaveValue('版本更新前的未保存修改');
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.1\.0\//);
  const refreshed = await catalog(page);
  await refreshed.getByRole('button', { name: '回退到 1.0.0', exact: true }).click();
  await page.getByRole('button', { name: '准备回退', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.0\.0\//);
  await expect(editor.getByLabel('文档内容')).toHaveValue('版本更新前的未保存修改');
  await expect(editor.getByRole('button', { name: '复制全文', exact: true })).toHaveCount(0);
});

test('DESKTOP-US-204：断网导致新资源不完整时旧版本继续运行', async ({ page, context }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文档内容').fill('断网也不能丢');
  const oldURL = await page.locator('iframe[title="文本编辑器"]').getAttribute('src');
  const card = await catalog(page, true);
  await context.setOffline(true);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await expect(page.frameLocator('iframe[title="应用目录"]').getByRole('alert')).toContainText(
    /OFFLINE|fetch|INTEGRITY/i
  );
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', oldURL!);
  await expect(editor.getByLabel('文档内容')).toHaveValue('断网也不能丢');
  await expect(card.getByRole('button', { name: '更新到 1.1.0', exact: true })).toBeEnabled();
  await context.setOffline(false);
});

test('DESKTOP-US-204：新版本启动校验失败后显式回退恢复已保存文档', async ({ page, context }) => {
  await context.addInitScript(() => {
    if (!window.location.pathname.includes('/releases/editor/1.1.0/')) return;
    const observer = new MutationObserver(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="desktop-release"]');
      if (!meta) return;
      meta.content = '模拟新版本启动校验失败';
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文件名', { exact: true }).fill('启动失败回退.txt');
  await editor.getByLabel('文档内容').fill('故障后仍能恢复');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  const card = await catalog(page, true);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '应用未能启动' })).toContainText('INTEGRITY');
  const after = await catalog(page);
  await after.getByRole('button', { name: '回退到 1.0.0', exact: true }).click();
  await page.getByRole('button', { name: '准备回退', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('故障后仍能恢复');
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.0\.0\//);
});

test('DESKTOP-US-204：同应用全部实例切换到固定新资源，其他应用保持版本', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toBeVisible();
  await page.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
  await page.getByRole('button', { name: '新建窗口', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveCount(2);
  const card = await catalog(page, true);
  const catalogURL = await page.locator('iframe[title="应用目录"]').getAttribute('src');
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveCount(2);
  for (const frame of await page.locator('iframe[title="文本编辑器"]').all())
    await expect(frame).toHaveAttribute('src', /\/releases\/editor\/1\.1\.0\//);
  await expect(page.locator('iframe[title="应用目录"]')).toHaveAttribute('src', catalogURL!);
  await page.getByLabel('窗口操作 文本编辑器', { exact: true }).last().click();
  await page.getByRole('button', { name: '新建窗口', exact: true }).last().click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveCount(3);
  for (const frame of await page.locator('iframe[title="文本编辑器"]').all())
    await expect(frame).toHaveAttribute('src', /\/releases\/editor\/1\.1\.0\//);
});

test('DESKTOP-US-204：新版本资源丢失且断网时桌面仍能回退到完整旧版', async ({ page, context }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文档内容').fill('离线回退保留的正文');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  const card = await catalog(page, true);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.1\.0\//);
  await expect(editor.getByLabel('文档内容')).toHaveValue('离线回退保留的正文');
  const url = new URL((await page.locator('iframe[title="文本编辑器"]').getAttribute('src'))!);
  const key = url.pathname.split('/').at(-2)!;
  await context.setOffline(true);
  expect(await page.evaluate(value => caches.delete(`orbit-desktop-release-${value}`), key)).toBe(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '应用未能启动' })).toBeVisible();
  const after = await catalog(page);
  await after.getByRole('button', { name: '回退到 1.0.0', exact: true }).click();
  await page.getByRole('button', { name: '准备回退', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('离线回退保留的正文');
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', /\/releases\/editor\/1\.0\.0\//);
  await context.setOffline(false);
});

test('DESKTOP-US-405：编辑器更新后可完整复制超过 1 MiB 的中英文和 emoji', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await enter(page);
  const card = await catalog(page, true);
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await expect(card.getByRole('button', { name: '回退到 1.0.0', exact: true })).toBeVisible();
  const text = `${'中文 English 🌏'.repeat(1000)}\n`.repeat(80);
  expect(Buffer.byteLength(text)).toBeGreaterThan(1024 * 1024);
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  await files
    .getByLabel('导入本机文件')
    .setInputFiles({ name: '大文本.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await files.getByRole('button', { name: '打开 大文本.txt', exact: true }).press('Enter');
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await expect(editor.getByRole('status')).toContainText('已打开');
  await editor.getByRole('button', { name: '复制全文', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已复制全文');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await expect(editor.getByLabel('文档内容')).toHaveValue(text);
});
