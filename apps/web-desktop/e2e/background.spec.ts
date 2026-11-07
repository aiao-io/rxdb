import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
}
async function resources(page: Page) {
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  return page.getByRole('region', { name: '运行与资源', exact: true });
}

test('DESKTOP-US-307/AC1：空闲静态预取不启动应用或请求授权，可显式取消和继续', async ({ page }) => {
  await enter(page);
  const panel = await resources(page);
  await panel.getByRole('button', { name: '取消后台预取', exact: true }).click();
  await expect(panel.getByRole('button', { name: '继续后台预取', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await panel.getByRole('button', { name: '继续后台预取', exact: true }).click();
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('DESKTOP-US-307/AC3-5：脏文档拒绝挂起，保存后可明确挂起、切模式并恢复同一实例', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文件名', { exact: true }).fill('挂起恢复.txt');
  await editor.getByLabel('文档内容').fill('未保存时不能挂起');
  const panel = await resources(page);
  const row = panel.getByRole('article').filter({ hasText: '文本编辑器' });
  await row.getByRole('button', { name: '挂起', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('未保存');
  await page.getByRole('button', { name: '关闭消息', exact: true }).click();
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('未保存时不能挂起');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  const src = await page.locator('iframe[title="文本编辑器"]').getAttribute('src');
  await resources(page);
  await row.getByRole('button', { name: '挂起', exact: true }).click();
  await expect(row).toContainText('已挂起');
  await expect(page.locator('iframe[title="文本编辑器"]')).toBeHidden();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', src!);
  await page.getByRole('button', { name: /切换交互模式/ }).click();
  await row.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('未保存时不能挂起');
  await expect(row).toContainText('运行中');
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveAttribute('src', src!);
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  await page.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
  await resources(page);
  await expect(row).toContainText('已隐藏');
  await expect(row).not.toContainText('已挂起');
});

test('DESKTOP-US-307/AC6：清理保留安装和活 iframe 引用，释放最后引用后回收旧资源', async ({ page }) => {
  await enter(page);
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
  const pin = await page.evaluate(async () => {
    const manifest = (await (await fetch('/resources.json')).json()) as {
      releases: { appId: string; version: string; key: string; entry: string }[];
    };
    const pkg = manifest.releases.find(pkg => pkg.appId === 'notes')!;
    const worker = (await navigator.serviceWorker.getRegistration())!.active!;
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => {
        channel.port1.close();
        if (event.data.complete) resolve();
        else reject(new Error(event.data.error));
      };
      worker.postMessage({ type: 'prepare-release', ...pkg, id: crypto.randomUUID(), priority: 'foreground' }, [
        channel.port2
      ]);
    });
    const frame = document.createElement('iframe');
    frame.title = '资源引用';
    frame.id = 'resource-reference-fixture';
    frame.src = `/releases/${pkg.appId}/${pkg.version}/${pkg.key}/${pkg.entry}`;
    document.body.append(frame);
    return pkg;
  });
  await expect(
    page.frameLocator('iframe[title="资源引用"]').getByRole('link', { name: '打开桌面', exact: true })
  ).toBeVisible();
  const panel = await resources(page);
  await panel.getByRole('button', { name: '清理无用应用资源', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('清理完成');
  expect(await page.evaluate(key => caches.has(`orbit-desktop-release-${key}`), pin.key)).toBe(true);
  await page.locator('#resource-reference-fixture').evaluate(element => element.remove());
  await panel.getByRole('button', { name: '清理无用应用资源', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('清理完成');
  await expect.poll(() => page.evaluate(key => caches.has(`orbit-desktop-release-${key}`), pin.key)).toBe(false);
  await expect(page.getByText('离线已就绪', { exact: true })).toBeVisible();
});

test('DESKTOP-US-307/AC5：批量挂起列出脏文档和未声明协议的应用，不销毁实例', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const catalog = page.frameLocator('iframe[title="应用目录"]');
  const card = catalog.getByRole('article').filter({ hasText: '速记本' });
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(card.getByRole('button', { name: '卸载', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^速记本/ }).click();
  await expect(page.frameLocator('iframe[title="速记本"]').getByLabel('文档内容')).toBeVisible();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文档内容').fill('批量回收也必须保留草稿');
  const panel = await resources(page);
  await panel.getByRole('button', { name: '检查并挂起应用', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('以下应用需要处理');
  await expect(page.getByRole('alert')).toContainText('未保存');
  await expect(page.getByRole('alert')).toContainText('未声明挂起协议');
  await expect(panel.getByRole('article').filter({ hasText: '应用目录' })).toContainText('已挂起');
  const unsupported = panel.getByRole('article').filter({ hasText: '速记本' });
  await expect(unsupported).toContainText('未声明挂起协议，需要用户处理');
  await expect(unsupported.getByRole('button', { name: '挂起', exact: true })).toHaveCount(0);
  await expect(page.locator('iframe[title="速记本"]')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭消息', exact: true }).click();
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue('批量回收也必须保留草稿');
});

test('DESKTOP-US-307/AC4：文件应用恢复保留目录和搜索路由，同一 iframe 内处理后续操作', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await files.getByLabel('新建名称').fill('挂起中的目录');
  await files.getByRole('button', { name: '创建', exact: true }).click();
  await files.getByRole('button', { name: '打开 挂起中的目录', exact: true }).press('Enter');
  const path = files.getByRole('navigation', { name: '文件路径', exact: true });
  await expect(path.getByRole('button')).toHaveText(['我的文件', '挂起中的目录']);
  await files.getByLabel('搜索当前目录').fill('搜索值');
  await expect(files.getByRole('button', { name: '新建文件夹', exact: true })).toBeEnabled();
  await files.getByLabel('搜索当前目录').evaluate(input => input.setAttribute('data-instance-probe', 'suspension'));
  const panel = await resources(page);
  const row = panel.getByRole('article').filter({ hasText: '文件' });
  await row.getByRole('button', { name: '挂起', exact: true }).click();
  await expect(row).toContainText('已挂起');
  await row.getByRole('button', { name: '恢复', exact: true }).click();
  await expect(row).toContainText('运行中');
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  await expect(path.getByRole('button')).toHaveText(['我的文件', '挂起中的目录']);
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('搜索值');
  await expect(files.getByLabel('搜索当前目录')).toHaveAttribute('data-instance-probe', 'suspension');
  await path.getByRole('button', { name: '返回我的文件', exact: true }).click();
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('');
  await expect(files.getByRole('button', { name: '打开 挂起中的目录', exact: true })).toBeVisible();
});

test('DESKTOP-US-307/204：取消后台预取后，未启动的应用仍可独立更新并回退', async ({ page }) => {
  await enter(page);
  const panel = await resources(page);
  await panel.getByRole('button', { name: '取消后台预取', exact: true }).click();
  await page.getByRole('button', { name: '运行与资源', exact: true }).click();
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const catalog = page.frameLocator('iframe[title="应用目录"]');
  const card = catalog.getByRole('article').filter({ hasText: '文本编辑器' });
  await card.getByRole('button', { name: '更新到 1.1.0', exact: true }).click();
  await page.getByRole('button', { name: '下载并继续', exact: true }).click();
  await page.getByRole('button', { name: '允许新增权限并继续', exact: true }).click();
  await expect(card.getByRole('button', { name: '回退到 1.0.0', exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveCount(0);
  await card.getByRole('button', { name: '回退到 1.0.0', exact: true }).click();
  await page.getByRole('button', { name: '准备回退', exact: true }).click();
  await expect(card.getByRole('button', { name: '更新到 1.1.0', exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="文本编辑器"]')).toHaveCount(0);
  await expect(catalog.getByRole('alert')).toHaveCount(0);
});
