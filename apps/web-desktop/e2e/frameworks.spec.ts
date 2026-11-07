import { expect, test, type Page } from '@playwright/test';

const frameworks = ['Angular', 'React', 'Vue'] as const;

async function enter(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '应用启动器', exact: true }).click();
  await page.getByRole('button', { name: /^应用目录/ }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const catalog = page.frameLocator('iframe[title="应用目录"]');
  for (const framework of frameworks) {
    const card = catalog.getByRole('article').filter({ has: catalog.getByRole('heading', { name: `${framework} 便签`, exact: true }) });
    await expect(card).toContainText('编辑、保存和下载文本');
    await card.getByRole('button', { name: '安装', exact: true }).click();
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(card.getByRole('button', { name: '卸载', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '最小化窗口 应用目录', exact: true }).click();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-308/AC1/2/3 framework-desktop：三框架可安装并以相同契约编辑中文`, async ({ page }) => {
    await enter(page, mode);
    for (const framework of frameworks) {
      await page.getByRole('button', { name: '应用启动器', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`^${framework} 便签`) }).click();
      const frame = page.frameLocator(`iframe[title="${framework} 便签"]`);
      await expect(frame.getByRole('heading', { name: `${framework} 便签`, exact: true })).toBeVisible();
      await frame.getByLabel('文件名', { exact: true }).fill(`${framework} 便签.txt`);
      await frame.getByLabel('文档内容').fill(`${framework} 中文输入 🌏`);
      await expect(frame.getByLabel('文档内容')).toHaveValue(`${framework} 中文输入 🌏`);
    }
    await expect(page.locator('[data-app-id^="sample-"]')).toHaveCount(3);
  });
}
