import { expect, type FrameLocator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
export { readState } from './state.js';

export async function openFiles(page: Page, mode: 'macos' | 'windows' = 'windows'): Promise<FrameLocator> {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
  return files;
}

export async function createDirectory(files: FrameLocator, name: string): Promise<void> {
  await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await files.getByLabel('新建名称').fill(name);
  await files.getByRole('button', { name: '创建', exact: true }).click();
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).dblclick();
  await expect(files.locator('.file-content')).toHaveAttribute('aria-label', name);
  await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
}

export async function downloadFile(page: Page, files: FrameLocator, name: string, timeout = 5000): Promise<Buffer> {
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    files.getByRole('button', { name: '下载导出', exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toBe(name);
  const path = await download.path();
  expect(path).not.toBeNull();
  const bytes = await readFile(path!);
  await expect(files.getByRole('status')).toContainText('已交付浏览器下载，请检查下载位置', { timeout });
  return bytes;
}
