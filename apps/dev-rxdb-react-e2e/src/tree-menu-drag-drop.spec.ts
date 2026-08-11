import { expect, type Page, test } from '@playwright/test';

import { addRootMenu, getMenuRow, openPage, requireAttribute } from './e2e-utils.js';

async function dragAndDrop(page: Page, sourceText: string, targetText: string) {
  const sourceElement = await getMenuRow(page, sourceText);
  const targetElement = await getMenuRow(page, targetText);
  const sourceBox = await sourceElement.boundingBox();
  const targetBox = await targetElement.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('无法获取菜单行的拖放位置');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.describe('Tree Menu Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
  });

  test('should display drag handle on hover', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 拖放菜单');
    await menu.hover();
    await expect(menu.getByTestId('menu-drag-handle')).toBeVisible();
  });

  test('should drag menu item to reorder', async ({ page }) => {
    await addRootMenu(page, '菜单A');
    await addRootMenu(page, '菜单B');
    await addRootMenu(page, '菜单C');

    const rows = page.getByTestId('menu-row');
    const before = await rows.evaluateAll(elements =>
      elements.map(element => element.textContent?.trim() ?? '').filter(text => /菜单[ABC]/u.test(text))
    );
    expect(before).toEqual(['菜单A', '菜单B', '菜单C']);

    await dragAndDrop(page, '菜单A', '菜单B');

    await expect
      .poll(
        async () =>
          (
            await rows.evaluateAll(elements =>
              elements.map(element => element.textContent?.trim() ?? '').filter(text => /菜单[ABC]/u.test(text))
            )
          )[0]
      )
      .not.toBe('菜单A');
  });

  test('should drag menu item into another item as a child', async ({ page }) => {
    await addRootMenu(page, 'E2E 父菜单');
    const childCandidate = await addRootMenu(page, 'E2E 子菜单候选');
    const parent = await getMenuRow(page, 'E2E 父菜单');
    const parentBox = await parent.boundingBox();
    const childBox = await childCandidate.boundingBox();

    expect(parentBox).toBeTruthy();
    expect(childBox).toBeTruthy();

    await page.mouse.move(childBox!.x + childBox!.width / 2, childBox!.y + childBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(parentBox!.x + parentBox!.width / 2, parentBox!.y + parentBox!.height / 2, { steps: 20 });
    await expect(parent).toHaveAttribute('data-drop-target', 'true');
    await expect(parent).toHaveAttribute('data-drop-valid', 'true');
    await page.mouse.up();

    const child = await getMenuRow(page, 'E2E 子菜单候选');
    const parentId = await requireAttribute(parent, 'data-menu-id', '父菜单行');
    await expect(child).toHaveAttribute('data-parent-id', parentId);
    await expect(child).toHaveAttribute('data-level', '1');
  });

  test('should expose semantic dragging state', async ({ page }) => {
    const source = await addRootMenu(page, 'E2E 拖拽源');
    const sourceBox = await source.boundingBox();
    expect(sourceBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 10, sourceBox!.y + sourceBox!.height / 2);
    await expect(source).toHaveAttribute('data-dragging', 'true');
    await page.mouse.up();
  });

  test('should expose the valid before drop mode', async ({ page }) => {
    const source = await addRootMenu(page, 'E2E 源项');
    const target = await addRootMenu(page, 'E2E 目标项');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 5, { steps: 20 });
    await expect(target).toHaveAttribute('data-drop-target', 'true');
    await expect(target).toHaveAttribute('data-drop-valid', 'true');
    await expect(target).toHaveAttribute('data-drop-mode', 'before');
    await page.mouse.up();
  });

  test('should use stable action hooks for nested rows', async ({ page }) => {
    const parent = await addRootMenu(page, 'E2E 祖父节点');
    await parent.hover();
    await parent.getByTestId('menu-add-child').click();
    await page.getByTestId('menu-title-input').fill('E2E 父节点');
    await page.getByTestId('menu-submit-child').click();

    const child = await getMenuRow(page, 'E2E 父节点');
    await child.hover();
    await child.getByTestId('menu-add-child').click();
    await page.getByTestId('menu-title-input').fill('E2E 子节点');
    await page.getByTestId('menu-submit-child').click();

    const grandChild = await getMenuRow(page, 'E2E 子节点');
    await expect(grandChild).toHaveAttribute('data-level', '2');
    const childId = await requireAttribute(child, 'data-menu-id', '子菜单行');
    await expect(grandChild).toHaveAttribute('data-parent-id', childId);
  });
});
