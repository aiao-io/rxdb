import { expect, test } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { downloadBackup, endpoint, importBackup, pngFixture, profile, prompt, provider } from './local-first.helpers';

const baseline = resolve(
  process.env['AIAO_MEDIA_BASELINE'] ?? new URL('../../aiao-media/tmp/migration-baseline/', import.meta.url).pathname
);

test('0.0.26 旧构建写入的工作区、原图与备份可由迁入后的工作区版本继续使用', async ({ page }) => {
  await stat(resolve(baseline, 'index.html')).catch(() => {
    throw new Error('Set AIAO_MEDIA_BASELINE to the previous 0.0.26 browser build before running upgrade-e2e.');
  });
  const png = await pngFixture();
  const origin = 'http://127.0.0.1:4398/**';
  await page.route(origin, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = resolve(baseline, `.${extname(pathname) ? pathname : '/index.html'}`);
    if (relative(baseline, file).startsWith('..')) throw new Error('Invalid fixture path.');
    await route.fulfill({ path: file });
  });
  await page.route(endpoint, route =>
    route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    })
  );
  await provider(page);
  await prompt(page, '迁移前保存的蓝色森林');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const previousProfile = await profile(page);
  const backup = await downloadBackup(page);

  await page.unroute(origin);
  await page.reload();
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  expect(await profile(page)).toBe(previousProfile);
  await page.goto('/create');
  await expect(page.locator('[contenteditable="true"]')).toContainText('迁移前保存的蓝色森林');
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片' }).click();
  expect(await readFile((await (await download).path()) as string)).toEqual(png);

  await page.goto('/providers');
  const restored = page.waitForEvent('load');
  await importBackup(page, backup);
  await restored;
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  expect(await profile(page)).not.toBe(previousProfile);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(1);
});
