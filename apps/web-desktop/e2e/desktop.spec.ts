import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-001/602：中文编辑保存、取消关闭、重开与会话恢复`, async ({ page }, testInfo) => {
    await enter(page, mode);
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
    await editor.getByLabel('文件名', { exact: true }).fill('中文笔记.txt');
    await editor.getByLabel('文档内容').fill('你好，Orbit。\n第二行 🌏');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('已保存');
    await page.screenshot({ path: testInfo.outputPath(`${mode}-editing.png`) });
    await editor.getByLabel('文档内容').fill('尚未保存的新内容');
    await page.getByRole('button', { name: '关闭窗口 文本编辑器', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('尚未保存的新内容');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('已保存');
    await page.getByRole('button', { name: '关闭窗口 文本编辑器', exact: true }).click();
    await page.getByRole('button', { name: '打开 文件', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const files = page.frameLocator('iframe[title="文件"]').first();
    await files.getByRole('button', { name: '打开 中文笔记.txt', exact: true }).dblclick();
    const reopened = page.frameLocator('iframe[title="文本编辑器"]').last();
    await expect(reopened.getByLabel('文档内容')).toBeVisible();
    await expect(reopened.getByLabel('文档内容')).toHaveValue('尚未保存的新内容');
    await page.reload();

    await expect(page.frameLocator('iframe[title="文本编辑器"]').last().getByLabel('文档内容')).toHaveValue(
      '尚未保存的新内容'
    );
  });
}

test('DESKTOP-US-004：切换模式保留实例和脏内容', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await editor.getByLabel('文档内容').fill('未保存的中文');
  const id = await page.locator('[data-app-id="editor"]').getAttribute('data-instance-id');
  await page.getByRole('button', { name: /^切换交互模式/ }).click();
  await expect(page.locator('[data-app-id="editor"]')).toHaveAttribute('data-instance-id', id ?? '');
  await expect(editor.getByLabel('文档内容')).toHaveValue('未保存的中文');
});

test('DESKTOP-US-504：第二标签页不能启动可写应用', async ({ page, context }) => {
  await enter(page, 'windows');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: '桌面已在另一个标签页打开' })).toBeVisible();
  await expect(other.getByRole('navigation', { name: '应用栏' })).toHaveCount(0);
});

test('DESKTOP-US-502：完整资源准备后断网刷新并保存', async ({ page, context }) => {
  await enter(page, 'windows');
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await editor.getByLabel('文件名', { exact: true }).fill('离线.txt');
  await editor.getByLabel('文档内容').fill('联网时保存');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await context.setOffline(true);
  await page.reload();
  const offlineEditor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await expect(offlineEditor.getByLabel('文档内容')).toHaveValue('联网时保存');
  await offlineEditor.getByLabel('文档内容').fill('断网后仍可保存');
  await offlineEditor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(offlineEditor.getByRole('status')).toContainText('已保存');
  await page.reload();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容')).toHaveValue(
    '断网后仍可保存'
  );
});

test('DESKTOP-US-504：脏文档可取消接管，批准后旧页失去写入入口', async ({ page, context }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容').fill('暂时不能离开');
  const other = await context.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '请求接管', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('取消');
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
  await other.getByRole('button', { name: '请求接管', exact: true }).click();
  await page.getByRole('button', { name: '放弃更改', exact: true }).click();
  await expect(other.getByRole('navigation', { name: '应用栏' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '桌面已在另一个标签页打开' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '应用栏' })).toHaveCount(0);
});

test('DESKTOP-US-701：欢迎页和编辑旅程自动无障碍检查', async ({ page }) => {
  await page.goto('/');
  const welcome = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(welcome.violations).toEqual([]);
  await page.getByRole('button', { name: /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

test('DESKTOP-US-602/603：超过 1 MiB 的中文内容保存后刷新完整恢复', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]').first();
  const content = '大文件中文 🌏\n'.repeat(60000);
  await files
    .getByLabel('导入本机文件')
    .setInputFiles({ name: '大文件.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await files.getByRole('button', { name: '打开 大文件.txt', exact: true }).dblclick();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await expect.poll(async () => (await editor.getByLabel('文档内容').inputValue()) === content).toBe(true);
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await page.reload();
  await expect
    .poll(
      async () =>
        (await page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容').inputValue()) === content
    )
    .toBe(true);
});

test('DESKTOP-US-603：本机导入重名可取消、保留两份和版本检查替换', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]').first();
  const input = files.getByLabel('导入本机文件');
  const local = { name: '本机.txt', mimeType: 'text/plain', buffer: Buffer.from('第一版') };
  await input.setInputFiles(local);
  await expect(files.getByRole('button', { name: '打开 本机.txt', exact: true })).toBeVisible();
  await input.setInputFiles(local);
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('CANCELLED');
  await input.setInputFiles(local);
  await page.getByRole('button', { name: '保留两份', exact: true }).click();
  await expect(files.getByRole('button', { name: '打开 本机 (2).txt', exact: true })).toBeVisible();
  await input.setInputFiles({ ...local, buffer: Buffer.from('替换后') });
  await page.getByRole('button', { name: '替换', exact: true }).click();
  await expect(files.getByRole('alert')).toHaveCount(0);
  await files.getByRole('button', { name: '打开 本机.txt', exact: true }).dblclick();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容')).toHaveValue('替换后');
});

test('DESKTOP-US-602：同一文件双实例冲突保留编辑内容，重新加载读取胜出版本', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const first = page.frameLocator('iframe[title="文本编辑器"]').first();
  await first.getByLabel('文件名', { exact: true }).fill('共享.txt');
  await first.getByLabel('文档内容').fill('初始内容');
  await first.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(first.getByRole('status')).toContainText('已保存');
  await page.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const manager = page.frameLocator('iframe[title="文件"]').first();
  await manager.getByRole('button', { name: '打开 共享.txt', exact: true }).click();
  await manager.getByRole('button', { name: '在新窗口打开', exact: true }).click();
  await expect(page.locator('[data-app-id="editor"]')).toHaveCount(2);
  const second = page.frameLocator('iframe[title="文本编辑器"]').nth(1);
  await second.getByLabel('文档内容').fill('B 需要保留的修改');
  await page.getByRole('button', { name: '窗口概览', exact: true }).click();
  await page
    .locator('.overview-row')
    .filter({ has: page.getByText('共享.txt', { exact: true }) })
    .getByRole('button')
    .first()
    .click();
  await first.getByLabel('文档内容').fill('A 最新保存');
  await first.getByRole('button', { name: '保存', exact: true }).click();
  await expect(first.getByRole('status')).toContainText('已保存');
  await page.getByRole('button', { name: '窗口概览', exact: true }).click();
  await page
    .locator('.overview-row')
    .filter({ has: page.getByText('共享.txt · 未保存', { exact: true }) })
    .getByRole('button')
    .first()
    .click();
  await second.getByRole('button', { name: '保存', exact: true }).click();
  await expect(second.getByRole('alert')).toContainText('CONFLICT');
  await expect(second.getByLabel('文档内容')).toHaveValue('B 需要保留的修改');
  await second.getByRole('button', { name: '重新加载', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(second.getByLabel('文档内容')).toHaveValue('A 最新保存');
});

test('DESKTOP-US-502：清除资源缓存后撤销离线就绪标记', async ({ page }) => {
  await enter(page, 'windows');
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    for (const key of await caches.keys()) if (key.startsWith('orbit-desktop-')) await caches.delete(key);
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByText('离线已就绪', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '准备离线资源', exact: true }).click();
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
});

test('DESKTOP-US-503：损坏备份在恢复确认前拒绝，现有桌面保持可用', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]').first();
  await settings.getByRole('button', { name: /备份/ }).click();
  await settings
    .getByLabel('选择桌面备份')
    .setInputFiles({ name: '损坏.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"broken"}') });
  await expect(settings.getByRole('alert')).toContainText('INVALID');
  await expect(page.getByRole('heading', { name: '替换桌面数据' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
});

test('DESKTOP-US-602：取消保存选择保留脏内容，另存为使用所选名称', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await editor.getByLabel('文档内容').fill('取消不能丢失的内容');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('未保存');
  await expect(editor.getByLabel('文档内容')).toHaveValue('取消不能丢失的内容');
  await editor.getByRole('button', { name: '另存为', exact: true }).click();
  await page.getByLabel('保存文件名', { exact: true }).fill('选择后的名字.txt');
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await expect(editor.getByLabel('文件名', { exact: true })).toHaveValue('选择后的名字.txt');
});

test('DESKTOP-US-201/205/404：安装速记本、设默认打开方式、卸载保留共享文件', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const catalog = page.frameLocator('iframe[title="应用目录"]').first();
  const card = catalog.getByRole('article').filter({ hasText: '速记本' });
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(card.getByRole('button', { name: '卸载', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '最小化窗口 应用目录', exact: true }).click();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]').first();
  await files
    .getByLabel('导入本机文件')
    .setInputFiles({ name: '关联.txt', mimeType: 'text/plain', buffer: Buffer.from('共享文件不会随应用卸载') });
  await files.getByRole('button', { name: '打开 关联.txt', exact: true }).click();
  await files.getByRole('button', { name: '打开方式', exact: true }).click();
  await page.getByLabel('打开应用', { exact: true }).selectOption('notes');
  await page.getByLabel('作为此类型的默认应用', { exact: true }).selectOption('yes');
  await page.getByRole('button', { name: '用此应用打开', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(page.frameLocator('iframe[title="速记本"]').first().getByLabel('文档内容')).toHaveValue(
    '共享文件不会随应用卸载'
  );
  await page.reload();
  await expect(page.frameLocator('iframe[title="速记本"]').first().getByLabel('文档内容')).toHaveValue(
    '共享文件不会随应用卸载'
  );
  await page.getByRole('button', { name: '最小化窗口 速记本', exact: true }).click();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await files.getByRole('button', { name: '打开 关联.txt', exact: true }).dblclick();
  await expect(page.locator('[data-app-id="notes"]')).toHaveCount(1);
  await expect(page.locator('[data-app-id="editor"]')).toHaveCount(0);
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  await card.getByRole('button', { name: '卸载', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(card.getByRole('button', { name: '安装', exact: true })).toBeVisible();
  await expect(page.locator('[data-app-id="notes"]')).toHaveCount(0);
  await expect(files.getByRole('button', { name: '打开 关联.txt', exact: true })).toHaveCount(1);
});

test('DESKTOP-US-005/701：系统深色主题和 200% 字体缩放同步到独立应用', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await expect(editor.getByLabel('文档内容')).toHaveCSS('color', 'rgb(228, 237, 242)');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]').first();
  await settings.getByLabel('界面缩放', { exact: true }).selectOption('200');
  await expect(editor.getByLabel('文档内容')).toHaveCSS('font-size', '28px');
  await page.screenshot({ path: testInfo.outputPath('system-dark-200.png') });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});

test('DESKTOP-US-107/501：刷新恢复当前工作区及每区活动窗口', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]').first();
  await settings.getByRole('button', { name: '▤ 工作区', exact: true }).click();
  await settings.getByLabel('新工作区名称').fill('研究区');
  await settings.getByRole('button', { name: '创建工作区', exact: true }).click();
  await expect(page.getByRole('button', { name: '研究区', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await page.getByRole('button', { name: '最大化窗口 文件', exact: true }).click();
  const fileBounds = await page.locator('[data-app-id="files"]').boundingBox();
  const switcherBounds = await page.getByRole('button', { name: '研究区', exact: true }).boundingBox();
  if (!fileBounds || !switcherBounds) throw new Error('窗口或工作区切换器缺少可见边界');
  expect(fileBounds.y + fileBounds.height).toBeLessThanOrEqual(switcherBounds.y);
  await page.getByRole('button', { name: '研究区', exact: true }).click();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '研究区', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-app-id="editor"]')).toHaveClass(/active/);
  await expect(page.locator('[data-app-id="files"]')).toBeHidden();
  await page.getByRole('button', { name: '工作区 1', exact: true }).click();
  await expect(page.locator('[data-app-id="files"]')).toHaveClass(/active/);
  await expect(page.locator('[data-app-id="editor"]')).toBeHidden();
  await page.getByRole('button', { name: '研究区', exact: true }).click();
  await expect(page.locator('[data-app-id="editor"]')).toHaveClass(/active/);
});

test('DESKTOP-US-503/AC6：只重置配置可在最终确认取消，完成后保留脏文档', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await editor.getByLabel('文档内容').fill('配置重置仍须保留');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]').first();
  await settings.getByLabel('界面缩放', { exact: true }).selectOption('200');
  await expect(editor.getByLabel('文档内容')).toHaveCSS('font-size', '28px');
  await settings.getByRole('button', { name: /数据与备份/ }).click();
  await settings.getByRole('button', { name: '只重置配置', exact: true }).click();
  await page.getByRole('button', { name: '继续重置', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveCSS('font-size', '28px');
  await expect(editor.getByLabel('文档内容')).toHaveValue('配置重置仍须保留');
  await settings.getByRole('button', { name: '只重置配置', exact: true }).click();
  await page.getByRole('button', { name: '继续重置', exact: true }).click();
  await page.getByRole('button', { name: '确认重置配置', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveCSS('font-size', '14px');
  await expect(editor.getByLabel('文档内容')).toHaveValue('配置重置仍须保留');
  await expect(editor.getByRole('status')).toContainText('未保存');
});

test('DESKTOP-US-601/AC4：目录面包屑按祖先导航，切换目录清除搜索和选择', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]').first();
  for (const name of ['项目', '草稿']) {
    await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await files.getByLabel('新建名称').fill(name);
    await files.getByRole('button', { name: '创建', exact: true }).click();
    await files.getByRole('button', { name: `打开 ${name}`, exact: true }).press('Enter');
  }
  const path = files.getByRole('navigation', { name: '文件路径', exact: true });
  await expect(path.getByRole('button')).toHaveText(['我的文件', '项目', '草稿']);
  await files.getByLabel('导入本机文件').setInputFiles([
    { name: '目标.txt', mimeType: 'text/plain', buffer: Buffer.from('内容') },
    { name: '其他.txt', mimeType: 'text/plain', buffer: Buffer.from('另一个文件') }
  ]);
  await files.getByLabel('搜索当前目录').fill('目标');
  await expect(files.getByRole('button', { name: '打开 目标.txt', exact: true })).toBeVisible();
  await expect(files.getByRole('button', { name: '打开 其他.txt', exact: true })).toHaveCount(0);
  await path.getByRole('button', { name: '项目', exact: true }).press('Enter');
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('');
  await expect(files.getByRole('button', { name: '打开 草稿', exact: true })).toBeVisible();
  await path.getByRole('button', { name: '返回我的文件', exact: true }).click();
  await expect(files.getByRole('button', { name: '打开 项目', exact: true })).toBeVisible();
  await path.getByRole('button', { name: '返回我的文件', exact: true }).click();
  await expect(files.getByRole('button', { name: '新建文件夹', exact: true })).toBeEnabled();
});

test('DESKTOP-US-004/602：已保存后继续编辑，切换模式再保存不会用旧文件覆盖草稿', async ({ page }) => {
  await enter(page, 'windows');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]').first();
  await editor.getByLabel('文档内容').fill('第一次已保存');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await editor.getByLabel('文档内容').fill('切换后必须保留的第二次修改');
  await page.getByRole('button', { name: /^切换交互模式/ }).click();
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await page.reload();
  await expect(page.frameLocator('iframe[title="文本编辑器"]').first().getByLabel('文档内容')).toHaveValue(
    '切换后必须保留的第二次修改'
  );
});
