import { expect, type Dialog, type Locator, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export const key = 'fixture-key-only';
export const endpoint = 'https://images.example.test/v1/images/generations';
export async function provider(
  page: Page,
  remember = true,
  mode = 'direct',
  settings = { baseUrl: 'https://images.example.test/v1', model: 'test-image', key }
) {
  await page.goto('/providers');
  await page.getByLabel('名称', { exact: true }).fill('本机供应商');
  await page.getByLabel('HTTPS Base URL').fill(settings.baseUrl);
  await page.getByLabel('图片模型 ID').fill(settings.model);
  await page.getByLabel('API Key', { exact: true }).fill(settings.key);
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
/**
 * Seals a provider answer the way the relay stores it: AES-256-GCM with a key derived by HKDF-SHA-256 from the task
 * token (salt: task id, info: aiao-relay-result-v1), stored as a 12-byte IV followed by the ciphertext. Written
 * independently of the app so the browser is checked against the documented format.
 */
export async function sealRelayAnswer(task: { id: string; token: string }, answer: unknown) {
  const encoder = new TextEncoder();
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(task.token), 'HKDF', false, ['deriveKey']);
  const sealing = await webcrypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(task.id), info: encoder.encode('aiao-relay-result-v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const sealed = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sealing,
    encoder.encode(JSON.stringify(answer))
  );
  return Buffer.concat([iv, new Uint8Array(sealed)]);
}
export const pngFixture = () =>
  sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();

export async function downloadBackup(page: Page) {
  // Builds without settings tabs ignore the hash and show the backup controls directly.
  await page.goto('/providers#data');
  await expect(page.getByRole('button', { name: '导出本机备份' })).toBeEnabled();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份' }).click();
  const contents = await readFile((await (await event).path()) as string);
  // Callers continue on the provider list, as they did before settings had tabs.
  const providers = page.getByRole('tab', { name: '供应商', exact: true });
  if (await providers.isVisible()) await providers.click();
  return contents;
}
const isZipBackup = (buffer: Buffer) => buffer[0] === 0x50 && buffer[1] === 0x4b;
export function backupText(buffer: Buffer): string {
  return isZipBackup(buffer) ? strFromU8(unzipSync(buffer)['backup.json']) : buffer.toString();
}
/** Opens the local data tab when the build has one; upgrade suites also drive builds without tabs. */
export async function openDataTab(page: Page) {
  const tab = page.getByRole('tab', { name: '本机数据', exact: true });
  await tab.or(page.locator('input[type=file]')).first().waitFor();
  if (await tab.isVisible()) await tab.click();
}
const acceptBackupImport = (dialog: Dialog) => dialog.accept();
export async function importBackup(page: Page, buffer: Buffer) {
  await openDataTab(page);
  // setInputFiles skips actionability checks, so it can upload into an input that workspace
  // initialization has just disabled again. Clicking waits until the input is enabled.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('input[type=file]').click()]);
  page.off('dialog', acceptBackupImport);
  page.once('dialog', acceptBackupImport);
  page.once('load', () => page.off('dialog', acceptBackupImport));
  await chooser.setFiles({
    name: isZipBackup(buffer) ? 'backup.zip' : 'backup.json',
    mimeType: isZipBackup(buffer) ? 'application/zip' : 'application/json',
    buffer
  });
}
export async function profile(page: Page) {
  return page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
}

/** 主区内容区（去掉左右内边距）在视口中的左右边界，以及固定在左侧的导航栏宽度。 */
export async function contentBox(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    const rect = main.getBoundingClientRect();
    const style = getComputedStyle(main);
    const left = rect.left + parseFloat(style.paddingLeft);
    const right = rect.right - parseFloat(style.paddingRight);
    return { left, right, width: right - left, sidebar: document.querySelector('.app-sidebar')!.getBoundingClientRect().width };
  });
}

export async function verifyImageDownload(page: Page, card: Locator, bytes: Buffer) {
  await card.getByText('生成信息', { exact: true }).click();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await expect(card).toContainText(sha256);
  const download = page.waitForEvent('download');
  await card.getByRole('link', { name: '下载图片' }).click();
  const result = await download;
  const metadata = await sharp(bytes).metadata();
  expect(result.suggestedFilename().endsWith(metadata.format === 'jpeg' ? '.jpg' : '.png')).toBe(true);
  expect(await readFile((await result.path()) as string)).toEqual(bytes);
  return sha256;
}
