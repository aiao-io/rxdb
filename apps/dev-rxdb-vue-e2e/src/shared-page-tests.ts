import { expect, test } from '@playwright/test';
import { addRootFolder, addRootMenu, editFileRow, editMenuRow, getMenuDeleteButton } from './e2e-utils.js';

interface SharedPageOptions {
  title: string;
  entityName: string;
}

export function registerTreeMenuTests({ title, entityName }: SharedPageOptions): void {
  test('should display page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  test('should have add menu input', async ({ page }) => {
    await expect(page.getByTestId('menu-title-input')).toBeVisible();
  });

  test('should add root menu', async ({ page }) => {
    await expect(await addRootMenu(page, `${entityName}根菜单`)).toBeVisible();
  });

  test('should keep the menu row stable while editing', async ({ page }) => {
    const title = `${entityName}可编辑菜单`;
    const menu = await addRootMenu(page, title);
    await expect(await editMenuRow(menu)).toHaveValue(title);
  });

  test('should show delete button on hover', async ({ page }) => {
    const menu = await addRootMenu(page, `${entityName}可删除菜单`);
    await expect(await getMenuDeleteButton(menu)).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await expect(page.getByTestId('menu-search-input')).toBeVisible();
  });
}

export function registerFileManagerTests({ title, entityName }: SharedPageOptions): void {
  test('should display page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  test('should have file name input', async ({ page }) => {
    await expect(page.getByTestId('file-name-input')).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    await expect(page.getByTestId('file-search-input')).toBeVisible();
  });

  test('should have mode toggle button', async ({ page }) => {
    await expect(page.getByTestId('file-mode-toggle')).toBeVisible();
  });

  test('should have history control', async ({ page }) => {
    await expect(page.getByTestId('file-history')).toBeVisible();
  });

  test('should add root folder', async ({ page }) => {
    await expect(await addRootFolder(page, `${entityName}文件夹`)).toBeVisible();
  });

  test('should keep the file row stable while editing', async ({ page }) => {
    const name = `${entityName}可编辑文件夹`;
    const folder = await addRootFolder(page, name);
    await expect(await editFileRow(folder)).toHaveValue(name);
  });
}
