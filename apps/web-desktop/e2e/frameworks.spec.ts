import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readState } from './state.js';

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
    const card = catalog
      .getByRole('article')
      .filter({ has: catalog.getByRole('heading', { name: `${framework} 便签`, exact: true }) });
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

async function windowAction(window: Locator, action: string) {
  const button = window.getByRole('button', { name: action, exact: true });
  if (!(await button.isVisible())) await window.locator('.window-menu summary').click();
  await button.click();
}

async function focus(page: Page, title: string) {
  await page.getByRole('button', { name: '窗口概览', exact: true }).click();
  await page
    .locator('.overview-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('button')
    .first()
    .click();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-308/AC1/2/3 DESKTOP-US-702/AC2/8 framework-combination：三端六实例的保存、拒绝、路由、样式、切换和退出互不串扰`, async ({
    page
  }) => {
    test.setTimeout(120000);
    await enter(page, mode);
    const documents: {
      id: string;
      appId: string;
      name: string;
      text: string;
      route: string;
      timeOrigin: number;
      src: string;
    }[] = [];
    for (const framework of frameworks) {
      const appId = `sample-${framework.toLowerCase()}`;
      await page.getByRole('button', { name: '应用启动器', exact: true }).click();
      await page.getByRole('button', { name: new RegExp(`^${framework} 便签`) }).click();
      for (const index of [1, 2]) {
        const current = page.locator(`[data-app-id="${appId}"]`).last();
        const id = await current.getAttribute('data-instance-id');
        expect(id).not.toBeNull();
        const window = page.locator(`[data-instance-id="${id}"]`);
        const frame = window.locator('iframe').contentFrame();
        const name = `${framework}-${index}.txt`;
        const savedText = `${framework} 第 ${index} 份中文\n独立内容 🌏`;
        await frame.getByLabel('文件名', { exact: true }).fill(name);
        await frame.getByLabel('文档内容').fill(savedText);
        if (index === 1) {
          await frame.getByRole('button', { name: '复制全文', exact: true }).click();
          await expect(page.getByRole('dialog')).toContainText('能力：剪贴板');
          await page.getByRole('button', { name: '拒绝', exact: true }).click();
          await expect(frame.getByRole('alert')).toContainText('DENIED');
          await expect(frame.getByLabel('文档内容')).toHaveValue(savedText);
        }
        await frame.getByRole('button', { name: '保存到我的文件', exact: true }).click();
        if (index === 1) {
          await expect(page.getByRole('dialog')).toContainText('范围：目录「我的文件」');
          await page.getByRole('button', { name: '始终允许', exact: true }).click();
        }
        await expect(frame.getByRole('status')).toContainText('已保存到我的文件');
        const state = await readState(page);
        const file = state.files.find(file => file.name === name)!;
        expect(file.bytes).toBe(Buffer.from(savedText).toString('base64'));
        const route = `/documents/${file.id}?line=2#L2`;
        await frame.getByLabel('逻辑位置', { exact: true }).fill(route);
        await frame.getByRole('button', { name: '前往位置', exact: true }).click();
        await expect(frame.locator('.framework-sample')).toHaveAttribute('data-route', route);
        if (index === 1) {
          await frame.getByRole('button', { name: '检查当前内容', exact: true }).click();
          await page.getByRole('button', { name: '取消', exact: true }).click();
          await expect(frame.getByRole('alert')).toContainText('CANCELLED');
          await expect(frame.getByLabel('文档内容')).toHaveValue(savedText);
          await frame.getByRole('button', { name: '切换强调色', exact: true }).click();
          await expect(frame.locator('.framework-sample')).toHaveAttribute('data-accent', 'violet');
        } else await expect(frame.locator('.framework-sample')).toHaveAttribute('data-accent', 'blue');
        const text = `${savedText}\n仅在本实例的未保存修改`;
        await frame.getByLabel('文档内容').fill(text);
        await expect(window).toHaveAttribute('aria-label', `${name} · 未保存 窗口`);
        documents.push({
          id: id!,
          appId,
          name,
          text,
          route,
          timeOrigin: await frame.locator('body').evaluate(() => performance.timeOrigin),
          src: (await window.locator('iframe').getAttribute('src'))!
        });
        if (index === 1) {
          await windowAction(window, '新建窗口');
          await expect(page.locator(`[data-app-id="${appId}"]`)).toHaveCount(2);
        }
      }
    }
    await expect(page.locator('[data-app-id^="sample-"]')).toHaveCount(6);
    const saved = await readState(page);
    expect(saved.files).toHaveLength(6);
    for (let turn = 0; turn < 20; turn++) {
      const prior = (await readState(page)).profile.mode;
      await page.getByRole('button', { name: /^切换交互模式/ }).click();
      await expect.poll(async () => (await readState(page)).profile.mode).not.toBe(prior);
    }
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const settings = page.frameLocator('iframe[title="设置"]');
    await settings.getByLabel('外观', { exact: true }).selectOption('dark');
    for (const doc of documents) {
      const window = page.locator(`[data-instance-id="${doc.id}"]`);
      const frame = window.locator('iframe').contentFrame();
      await expect(window.locator('iframe')).toHaveAttribute('src', doc.src);
      await expect(frame.getByLabel('文档内容')).toHaveValue(doc.text);
      await expect(frame.locator('.framework-sample')).toHaveAttribute('data-route', doc.route);
      await expect(frame.locator('.framework-sample')).toHaveAttribute('data-theme', 'dark');
      await expect(frame.getByLabel('文档内容')).toHaveCSS('background-color', 'rgb(30, 48, 75)');
      expect(await frame.locator('body').evaluate(() => performance.timeOrigin)).toBe(doc.timeOrigin);
    }
    for (const framework of frameworks) {
      const doc = documents.find(doc => doc.appId === `sample-${framework.toLowerCase()}`)!;
      await focus(page, `${doc.name} · 未保存`);
      const window = page.locator(`[data-instance-id="${doc.id}"]`);
      await windowAction(window, '退出应用');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.locator(`[data-app-id="${doc.appId}"]`)).toHaveCount(2);
      await expect(window.locator('iframe').contentFrame().getByLabel('文档内容')).toHaveValue(doc.text);
      await windowAction(window, '退出应用');
      await page.getByRole('button', { name: '放弃更改', exact: true }).click();
      await page.getByRole('button', { name: '放弃更改', exact: true }).click();
      await expect(page.locator(`[data-app-id="${doc.appId}"]`)).toHaveCount(0);
    }
    await expect(page.locator('[data-app-id^="sample-"]')).toHaveCount(0);
    expect((await readState(page)).files).toEqual(saved.files);
  });
}

for (const framework of frameworks) {
  test(`DESKTOP-US-308/AC4 framework-standalone ${framework}：独立编辑、历史和真实下载可用，桌面能力明确不可用`, async ({
    page
  }) => {
    await page.goto(`/sample-${framework.toLowerCase()}.html`);
    await expect(page.getByRole('heading', { name: `${framework} 便签`, exact: true })).toBeVisible();
    await expect(page.getByText('独立运行：', { exact: false })).toContainText('桌面托管文件、剪贴板和窗口能力不可用');
    const name = `${framework} 独立中文.txt`;
    const text = '不依赖桌面的中文内容\nEmoji 🌏';
    await page.getByLabel('文件名', { exact: true }).fill(name);
    await page.getByLabel('文档内容').fill(text);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByLabel('文档内容')).toHaveValue('');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.getByLabel('文档内容')).toHaveValue(text);
    await expect(page.getByRole('button', { name: '保存到我的文件', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制全文', exact: true })).toBeDisabled();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '下载文本', exact: true }).click()
    ]);
    expect(download.suggestedFilename()).toBe(name);
    const path = await download.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.equals(Buffer.from(text))).toBe(true);
    await expect(page.getByRole('status')).toContainText('已交付浏览器下载');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
