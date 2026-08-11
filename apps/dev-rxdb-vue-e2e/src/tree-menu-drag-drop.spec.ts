import { expect, type Locator, type Page, test } from '@playwright/test';

import { addRootMenu, getMenuRow, openPage, requireAttribute } from './e2e-utils.js';

async function drag(source: Locator, target: Locator, targetY: number): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('无法获取菜单行的拖放位置');
  }

  const page = source.page();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetY, { steps: 20 });
}

async function releaseDrag(page: Page): Promise<void> {
  await page.mouse.up();
}

test.describe('Tree Menu Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
  });

  test('exposes a stable drag handle', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 拖放菜单');
    await menu.hover();
    await expect(menu.getByTestId('menu-drag-handle')).toBeVisible();
  });

  test('exposes dragging state while a row is held', async ({ page }) => {
    const source = await addRootMenu(page, 'E2E 拖拽源');
    const sourceBox = await source.boundingBox();
    expect(sourceBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 10, sourceBox!.y + sourceBox!.height / 2);
    await expect(source).toHaveAttribute('data-dragging', 'true');
    await releaseDrag(page);
  });

  test('moves a row into another row and exposes the valid target state', async ({ page }) => {
    const parent = await addRootMenu(page, 'E2E 父菜单');
    const child = await addRootMenu(page, 'E2E 子菜单候选');
    const parentBox = await parent.boundingBox();
    expect(parentBox).toBeTruthy();

    await drag(child, parent, parentBox!.y + parentBox!.height / 2);
    await expect(parent).toHaveAttribute('data-drop-target', 'true');
    await expect(parent).toHaveAttribute('data-drop-valid', 'true');
    await expect(parent).toHaveAttribute('data-drop-mode', 'into');
    await releaseDrag(page);

    const movedChild = await getMenuRow(page, 'E2E 子菜单候选');
    const parentId = await requireAttribute(parent, 'data-menu-id', '父菜单行');
    await expect(movedChild).toHaveAttribute('data-parent-id', parentId);
    await expect(movedChild).toHaveAttribute('data-level', '1');
  });

  test('exposes the before drop mode', async ({ page }) => {
    const source = await addRootMenu(page, 'E2E 源项');
    const target = await addRootMenu(page, 'E2E 目标项');
    const targetBox = await target.boundingBox();
    expect(targetBox).toBeTruthy();

    await drag(source, target, targetBox!.y + 5);
    await expect(target).toHaveAttribute('data-drop-target', 'true');
    await expect(target).toHaveAttribute('data-drop-valid', 'true');
    await expect(target).toHaveAttribute('data-drop-mode', 'before');
    await releaseDrag(page);
  });
});
