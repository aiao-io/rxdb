import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode}：系统外观与 OPFS 真实目录双向同步`, async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('真实项目', { create: true });
      const file = await directory.getFileHandle('来自 OPFS.txt', { create: true });
      const writer = await file.createWritable();
      await writer.write('直接写入 OPFS 的内容');
      await writer.close();
    });
    await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await expect(page.locator('.system-bar')).toHaveCount(mode === 'macos' ? 1 : 0);
    if (mode === 'windows') {
      const bar = page.getByRole('navigation', { name: '应用栏' });
      await expect(bar).toHaveCSS('border-radius', '0px');
      const bounds = await bar.boundingBox();
      expect(bounds!.y + bounds!.height).toBe(page.viewportSize()!.height);
      const apps = await bar.locator('.taskbar-apps').boundingBox();
      expect(apps!.x + apps!.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
    }

    await page.getByRole('button', { name: '打开 文件', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const files = page.frameLocator('iframe[title="文件"]').first();
    await expect(files.locator('.app-frame')).toHaveAttribute('data-mode', mode);
    await files.getByRole('button', { name: '打开 真实项目', exact: true }).press('Enter');
    await files.getByRole('button', { name: '打开 来自 OPFS.txt', exact: true }).press('Enter');
    const editor = page.frameLocator('iframe[title="文本编辑器"]').last();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('直接写入 OPFS 的内容');
    await editor.getByLabel('文档内容').fill('桌面保存写回 OPFS');
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('已保存');
    expect(
      await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle('真实项目');
        return (await (await directory.getFileHandle('来自 OPFS.txt')).getFile()).text();
      })
    ).toBe('桌面保存写回 OPFS');
    await page.getByRole('button', { name: '关闭窗口 文本编辑器', exact: true }).click();
    await files.getByRole('button', { name: '图标视图', exact: true }).click();
    await expect(files.locator('.file-grid')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${mode}-files.png`) });
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByRole('button', { name: '应用启动器', exact: true }).click();
    await expect(page.getByRole('region', { name: '应用启动器', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${mode}-launcher.png`) });
    await page.getByLabel('搜索应用', { exact: true }).press('Escape');

    await files.getByRole('button', { name: '列表视图', exact: true }).click();
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('真实项目');
      await directory.removeEntry('来自 OPFS.txt');
    });
    await files.getByRole('button', { name: '刷新文件', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 来自 OPFS.txt', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^切换交互模式/ }).click();
    await expect(files.locator('.app-frame')).toHaveAttribute('data-mode', mode === 'macos' ? 'windows' : 'macos');
  });
}
