import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export const key = 'fixture-key-only';
export const endpoint = 'https://images.example.test/v1/images/generations';
export async function provider(page: Page, remember = true, mode = 'direct') {
  await page.goto('/providers');
  await page.getByLabel('名称', { exact: true }).fill('本机供应商');
  await page.getByLabel('HTTPS Base URL').fill('https://images.example.test/v1');
  await page.getByLabel('图片模型 ID').fill('test-image');
  await page.getByLabel('API Key', { exact: true }).fill(key);
  await page.getByLabel('在此设备记住 Key').setChecked(remember);
  await page.getByLabel('请求通道').selectOption(mode);
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
}
export async function prompt(page: Page, text = '一片绿色的森林') {
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.fill(text);
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
}
export const pngFixture = () =>
  sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();

export async function downloadBackup(page: Page) {
  await page.goto('/providers');
  await expect(page.getByRole('button', { name: '导出本机备份' })).toBeEnabled();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份' }).click();
  return readFile((await (await event).path()) as string);
}
export async function importBackup(page: Page, buffer: Buffer) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer
  });
}
export async function profile(page: Page) {
  return page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
}
