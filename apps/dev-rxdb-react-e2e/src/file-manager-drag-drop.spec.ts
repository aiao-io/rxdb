import { expect, type Page, test } from '@playwright/test';

import { getFileRow, openPage, requireAttribute } from './e2e-utils.js';

async function switchToMode(page: Page, mode: 'file' | 'folder'): Promise<void> {
  const toggle = page.getByTestId('file-mode-toggle');
  const current = (await toggle.textContent())?.includes('文件夹') ? 'folder' : 'file';
  if (current === mode) return;

  await toggle.click();
  await expect(toggle).toContainText(mode === 'file' ? '文件' : '文件夹');
}

async function addFile(page: Page, name: string): Promise<ReturnType<typeof getFileRow>> {
  await switchToMode(page, 'file');
  const dot = name.lastIndexOf('.');
  const baseName = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '.txt';
  await page.getByTestId('file-name-input').fill(baseName);
  await page.getByTestId('file-extension-select').selectOption(extension);
  await page.getByTestId('file-submit').click();
  return getFileRow(page, name);
}

async function addFolder(page: Page, name: string): Promise<ReturnType<typeof getFileRow>> {
  await switchToMode(page, 'folder');
  await page.getByTestId('file-name-input').fill(name);
  await page.getByTestId('file-submit').click();
  return getFileRow(page, name);
}

test.describe('File Manager Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
  });

  test('should display drag handle on hover', async ({ page }) => {
    const row = await addFile(page, 'E2E 拖放文件.txt');
    await row.hover();
    await expect(row.getByTestId('file-drag-handle')).toBeVisible();
  });

  test('should drag file to reorder', async ({ page }) => {
    await addFile(page, '文件A.txt');
    await addFile(page, '文件B.txt');
    await addFile(page, '文件C.txt');

    const fileA = await getFileRow(page, '文件A.txt');
    const fileB = await getFileRow(page, '文件B.txt');
    const fileC = await getFileRow(page, '文件C.txt');
    const fileAId = await requireAttribute(fileA, 'data-file-id', '文件 A 行');
    const fileBId = await requireAttribute(fileB, 'data-file-id', '文件 B 行');
    const fileCId = await requireAttribute(fileC, 'data-file-id', '文件 C 行');
    const rows = page.getByTestId('file-row');
    const ids = async () => rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-file-id')));
    expect(await ids()).toEqual([fileAId, fileBId, fileCId]);

    const fileABox = await fileA.boundingBox();
    const fileBBox = await fileB.boundingBox();
    expect(fileABox).toBeTruthy();
    expect(fileBBox).toBeTruthy();

    await page.mouse.move(fileABox!.x + fileABox!.width / 2, fileABox!.y + fileABox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(fileBBox!.x + fileBBox!.width / 2, fileBBox!.y + fileBBox!.height * 0.85, { steps: 20 });
    await page.mouse.up();

    await expect.poll(ids, { timeout: 15000 }).toEqual([fileBId, fileAId, fileCId]);
  });

  test('should drag file into a folder and expose hierarchy', async ({ page }) => {
    const folder = await addFolder(page, 'E2E 项目文件夹');
    const file = await addFile(page, 'E2E 移动文件.txt');
    const folderBox = await folder.boundingBox();
    const fileBox = await file.boundingBox();
    expect(folderBox).toBeTruthy();
    expect(fileBox).toBeTruthy();

    await page.mouse.move(fileBox!.x + fileBox!.width / 2, fileBox!.y + fileBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(folderBox!.x + folderBox!.width / 2, folderBox!.y + folderBox!.height / 2, { steps: 20 });
    await expect(folder).toHaveAttribute('data-drop-target', 'true');
    await expect(folder).toHaveAttribute('data-drop-valid', 'true');
    await page.mouse.up();

    const parentId = await requireAttribute(folder, 'data-file-id', '文件夹行');
    await expect(file).toHaveAttribute('data-parent-id', parentId);
    await expect(file).toHaveAttribute('data-level', '1');
  });

  test('should expose file and folder rows', async ({ page }) => {
    const folder = await addFolder(page, 'E2E 我的文件夹');
    const file = await addFile(page, 'E2E 我的文件.txt');
    await expect(folder).toBeVisible();
    await expect(file).toBeVisible();
  });

  test('should reject dropping a file into another file', async ({ page }) => {
    const source = await addFile(page, 'E2E 文件1.txt');
    const target = await addFile(page, 'E2E 文件2.txt');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 10 });
    await expect(target).toHaveAttribute('data-drop-target', 'true');
    await expect(target).toHaveAttribute('data-drop-valid', 'false');
    await page.mouse.up();
  });

  test('should expose semantic dragging state', async ({ page }) => {
    const source = await addFile(page, 'E2E 拖拽状态.txt');
    const sourceBox = await source.boundingBox();
    expect(sourceBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 10, sourceBox!.y + sourceBox!.height / 2);
    await expect(source).toHaveAttribute('data-dragging', 'true');
    await page.mouse.up();
  });
});
