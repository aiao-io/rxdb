import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, mode: 'macos' | 'windows' = 'macos') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '应用栏' })).toBeVisible();
}

async function iconWidths(page: Page) {
  return page
    .getByRole('navigation', { name: '应用栏' })
    .locator('.bar-app .app-icon')
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
}

test('macOS Dock：距离放大带动相邻图标和玻璃底座，移出后回到原位', async ({ page }, testInfo) => {
  await enter(page);
  const bar = page.getByRole('navigation', { name: '应用栏' });
  const resting = await bar.boundingBox();
  const widths = await iconWidths(page);
  await bar.getByRole('button', { name: '打开 文本编辑器', exact: true }).hover();
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeGreaterThan(resting!.width + 25);
  await expect.poll(async () => (await iconWidths(page))[0]).toBeGreaterThan(widths[0] * 1.02);
  await expect.poll(async () => (await iconWidths(page))[2]).toBeGreaterThan(widths[2] * 1.02);
  await expect(bar.getByRole('tooltip')).toHaveText('文本编辑器');
  await page.screenshot({ path: testInfo.outputPath('macos-dock-hover.png') });
  const slots = await bar.locator('[data-dock-item]').evaluateAll(nodes =>
    nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom };
    })
  );
  for (let index = 1; index < slots.length; index++) {
    expect(slots[index].left).toBeGreaterThanOrEqual(slots[index - 1].right - 0.5);
    expect(slots[index].bottom).toBeCloseTo(slots[0].bottom, 0);
  }
  await page.mouse.move(30, 100);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeCloseTo(resting!.width, 0);
  await expect(bar.getByRole('tooltip')).toBeHidden();
});

test('macOS Dock：启动弹跳与放大独立，已运行应用不重复弹跳，切换 Windows 清理动画', async ({ page }) => {
  await enter(page);
  const bar = page.getByRole('navigation', { name: '应用栏' });
  const editor = bar.getByRole('button', { name: '打开 文本编辑器', exact: true });
  await editor.click();
  const art = editor.locator('.dock-art');
  await expect.poll(() => art.evaluate(node => node.getAnimations().length)).toBe(1);
  await expect(page.locator('[data-app-id="editor"]')).toBeVisible();
  await expect.poll(() => art.evaluate(node => node.getAnimations().length)).toBe(0);
  await editor.click();
  expect(await art.evaluate(node => node.getAnimations().length)).toBe(0);
  await page.getByRole('button', { name: /^切换交互模式/ }).click();
  await expect(page.locator('.mode-windows')).toBeVisible();
  await expect(bar).toHaveCSS('border-radius', '0px');
  await expect(bar).toHaveCSS('width', `${page.viewportSize()!.width}px`);
  const before = await iconWidths(page);
  await editor.hover();
  expect(await iconWidths(page)).toEqual(before);
});

test('macOS Dock：减少动态效果禁用放大和启动弹跳，触屏不触发悬停', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  const bar = page.getByRole('navigation', { name: '应用栏' });
  const resting = await bar.boundingBox();
  const editor = bar.getByRole('button', { name: '打开 文本编辑器', exact: true });
  await editor.hover();
  expect((await bar.boundingBox())!.width).toBe(resting!.width);
  await editor.click();
  expect(await editor.locator('.dock-art').evaluate(node => node.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(20, 20);
  await bar.dispatchEvent('pointermove', { pointerType: 'touch', clientX: resting!.x + resting!.width / 2 });
  expect((await bar.boundingBox())!.width).toBe(resting!.width);
});

test('macOS Dock：快速横移和小屏放大不越界，键盘聚焦可显示应用名称', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const bar = page.getByRole('navigation', { name: '应用栏' });
  const resting = await bar.boundingBox();
  for (const fraction of [0.1, 0.5, 0.9, 0.3, 0.7]) {
    await page.mouse.move(resting!.x + resting!.width * fraction, resting!.y + 30);
    const bounds = await bar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(10);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(380);
  }
  await page.mouse.move(10, 20);
  const files = bar.getByRole('button', { name: '打开 文件', exact: true });
  await files.focus();
  await expect(bar.getByRole('tooltip')).toHaveText('文件');
  await bar.getByRole('button', { name: '打开 设置', exact: true }).hover();
  await files.press('Tab');
  await expect(bar.getByRole('tooltip')).toHaveText('应用启动器');
});

test.describe('Dock 触屏输入', () => {
  test.use({ hasTouch: true });
  test('macOS Dock：真实触屏点击不会被焦点事件重新放大', async ({ page }) => {
    await enter(page);
    const bar = page.getByRole('navigation', { name: '应用栏' });
    const resting = await bar.boundingBox();
    const editor = await bar.getByRole('button', { name: '打开 文本编辑器', exact: true }).boundingBox();
    await page.touchscreen.tap(editor!.x + editor!.width / 2, editor!.y + editor!.height / 2);
    await expect(page.locator('[data-app-id="editor"]')).toBeVisible();
    expect((await bar.boundingBox())!.width).toBe(resting!.width);
    await expect(bar.getByRole('tooltip')).toBeHidden();
  });
});
