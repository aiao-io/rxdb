import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  downloadBackup,
  endpoint,
  importBackup,
  key,
  profile,
  prompt,
  provider,
  verifyImageDownload
} from './local-first.helpers';
test('首次没有供应商时自动启用默认免费供应商', async ({ page }) => {
  await page.goto('/providers');
  await expect(page.getByRole('heading', { name: '默认免费供应商 · 默认' })).toBeVisible();
  await expect(page.getByText('https://api.pengdevs.com', { exact: true })).toBeVisible();
  await expect(page.locator('.provider-card')).toContainText('本站代理');
  await page.goto('/create');
  await expect(page.locator('#selected-provider')).toHaveValue('00000000-0000-4000-8000-000000000001');
  await prompt(page, '一片蓝色的天空');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page).toHaveURL(/\/providers$/);
  await expect(page.getByText('请输入当前会话的 API Key。')).toBeVisible();
});

test('实际静态应用无需登录，RxDB 设置、草稿和图片经刷新仍在', async ({ page }) => {
  const oldApi: string[] = [];
  page.on('request', r => {
    if (/\/api\/(auth|generations|image-config)/.test(r.url())) oldApi.push(r.url());
  });
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    expect(route.request().headers()['authorization']).toBe(`Bearer ${key}`);
    expect(route.request().headers()['cookie']).toBeUndefined();
    return route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  await provider(page);
  await prompt(page);
  await page.reload();
  await expect(page.locator('[contenteditable="true"]')).toContainText('一片绿色的森林');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page.getByAltText('本次生成的图片')).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片' }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  await expect(page.getByAltText('本机生成作品')).toBeVisible();
  await page.reload();
  await expect(page.getByAltText('本机生成作品')).toBeVisible();
  await page.getByText('本机任务记录', { exact: false }).click();
  await expect(page.locator('.task-history')).toContainText('有本机保存记录');
  expect(calls).toBe(1);
  expect(oldApi).toEqual([]);
});
test('MiniMax JPEG 原图可保存、按真实后缀下载、刷新回读和备份恢复', async ({ page }) => {
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#b74e28' } })
    .jpeg({ progressive: true })
    .toBuffer();
  let calls = 0;
  let reads = 0;
  await page.route('https://api.minimax.cn/v1/image_generation', route => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({ model: 'image-01', width: 1024, height: 1024, n: 1 });
    return route.fulfill({
      json: { base_resp: { status_code: 0 }, data: { image_urls: ['https://results.example.test/original.png'] } }
    });
  });
  await page.route('https://results.example.test/original.png', route => {
    reads++;
    for (const name of ['authorization', 'cookie', 'referer']) expect(route.request().headers()[name]).toBeUndefined();
    return route.fulfill({ contentType: 'image/jpeg', body: jpeg });
  });
  await provider(page, false, 'direct', { baseUrl: 'https://api.minimax.cn/v1', model: 'image-01', key });
  await prompt(page, 'JPEG 原图完整交付');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  const resultDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片' }).click();
  const downloaded = await resultDownload;
  expect(downloaded.suggestedFilename()).toMatch(/\.jpg$/);
  expect(await readFile((await downloaded.path())!)).toEqual(jpeg);
  await page.goto('/images');
  await page.reload();
  const card = page.locator('.library-card').filter({ hasText: 'JPEG 原图完整交付' });
  await expect(card.getByAltText('本机生成作品')).toBeVisible();
  await verifyImageDownload(page, card, jpeg);
  await expect(card).toContainText('image/jpeg');
  await expect(card.locator('.card-caption > p')).toContainText('JPEG');
  expect(
    await page.evaluate(() =>
      localStorage.getItem(`aiao-local-schema-${localStorage.getItem('aiao-local-profile-v1')}`)
    )
  ).toBe('2');
  const originalProfile = await profile(page);
  const backup = await downloadBackup(page);
  expect(backup.toString()).not.toContain(key);
  const reloaded = page.waitForEvent('load');
  await importBackup(page, backup);
  await reloaded;
  await expect.poll(() => profile(page)).not.toBe(originalProfile);
  await page.goto('/images');
  await expect(card.getByAltText('本机生成作品')).toBeVisible();
  await verifyImageDownload(page, card, jpeg);
  expect(calls).toBe(1);
  expect(reads).toBe(1);
});
test('未知结果刷新后仍锁定，不会自动重复提交或切换代理', async ({ page }) => {
  let calls = 0,
    relayCalls = 0;
  await page.route(endpoint, route => {
    calls++;
    return route.abort('failed');
  });
  await page.route('**/api/relay', route => {
    relayCalls++;
    return route.fulfill({ status: 500 });
  });
  await provider(page);
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByRole('heading', { name: '请核对供应商记录' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '请核对供应商记录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '请先核对原请求' })).toBeDisabled();
  await page.goto('/providers');
  await expect(page.getByRole('button', { name: '编辑 / 填写 Key' })).toBeEnabled();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存到本机', exact: true })).toBeEnabled();
  expect(calls).toBe(1);
  expect(relayCalls).toBe(0);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '已核对，解除本机锁定' }).click();
  await prompt(page, '解除锁定后的新提示词');
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toBeEnabled();
});
test('默认 Key 只在内存；代理由用户主动选择', async ({ page }) => {
  await provider(page, false, 'proxy');
  await prompt(page);
  await page.reload();
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(page.getByText('请输入当前会话的 API Key。')).toBeVisible();
  await page.getByLabel('API Key', { exact: true }).fill(key);
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  let calls = 0;
  await page.route('**/api/relay', route => {
    calls++;
    expect(route.request().headers()['x-provider-base']).toBe('https://images.example.test/v1');
    expect(route.request().headers()['authorization']).toBe(`Bearer ${key}`);
    return route.fulfill({
      status: 403,
      json: { error: 'Provider not allowed' }
    });
  });
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByRole('heading', { name: '这次图片没有生成成功' })).toBeVisible();
  expect(calls).toBe(1);
});
test('首次缓存后四条页面离线可打开，设置和草稿仍可读', async ({ page, context }) => {
  await provider(page);
  await prompt(page, '离线也能继续的创作');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  for (const path of ['/providers', '/create', '/images', '/']) {
    await page.goto(path);
    if (path === '/providers') await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
    if (path === '/create') await expect(page.locator('[contenteditable="true"]')).toContainText('离线也能继续的创作');
    await expect(page.getByRole('link', { name: 'Aiao Images 首页' })).toBeVisible();
  }
});
test('移动端供应商页和创作页不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await provider(page);
  await prompt(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/providers');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('备份含原图与草稿但不含 Key，导入到独立工作区后离线可读取', async ({ page, context }) => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page, '备份中的原始提示词');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '供应商设置' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份' }).click();
  const downloaded = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const contents = await readFile((await downloaded.path()) as string);
  expect(contents.toString()).not.toContain(key);
  const backup = JSON.parse(contents.toString());
  expect(backup.images).toHaveLength(1);
  expect(Buffer.from(backup.images[0].base64, 'base64')).toEqual(png);
  const originalId = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  const reloaded = page.waitForEvent('load');
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: contents
  });
  await reloaded;
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).not.toBe(originalId);
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toBeVisible();
  await page.goto('/create');
  await expect(page.locator('[contenteditable="true"]')).toContainText('备份中的原始提示词');
});

test('损坏的备份不会改变当前工作区或清除现有设置', async ({ page }) => {
  await provider(page);
  const original = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"aiao-local-backup","version":999}')
  });
  await expect(page.getByText('不支持的备份格式或版本。')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(original);
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
});

test('三个画幅均能保存原图，每次用户操作只产生一个请求', async ({ page }) => {
  await provider(page);
  await prompt(page);
  const sizes: string[] = [];
  await page.route(endpoint, async route => {
    const body = route.request().postDataJSON();
    sizes.push(body.size);
    const landscape = body.size === '1536x1024',
      portrait = body.size === '1024x1536';
    const png = await sharp({
      create: {
        width: landscape ? 96 : 64,
        height: portrait ? 96 : 64,
        channels: 3,
        background: '#8a9c62'
      }
    })
      .png()
      .toBuffer();
    await route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  for (const [index, label] of ['正方形', '横向', '纵向'].entries()) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('button', { name: '✧ 生成图片' }).click();
    await expect.poll(() => sizes.length).toBe(index + 1);
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  }
  expect(sizes).toEqual(['1024x1024', '1536x1024', '1024x1536']);
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  await expect(page.getByAltText('本机生成作品')).toHaveCount(3);
});

test('两标签页并发点击不会重复付费请求', async ({ page, context }) => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();
  let release: () => void = () => undefined;
  const hold = new Promise<void>(resolve => {
    release = resolve;
  });
  let calls = 0;
  await context.route(endpoint, async route => {
    calls++;
    await hold;
    await route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  await provider(page);
  await prompt(page);
  const other = await context.newPage();
  await other.goto('/create');
  await expect(other.getByRole('button', { name: '✧ 生成图片' })).toBeEnabled();
  await Promise.all([
    page.getByRole('button', { name: '✧ 生成图片' }).click(),
    other.getByRole('button', { name: '✧ 生成图片' }).click()
  ]);
  await expect.poll(() => calls).toBe(1);
  release();
  await expect
    .poll(
      async () =>
        (await page.getByRole('link', { name: '下载图片' }).count()) +
        (await other.getByRole('link', { name: '下载图片' }).count())
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await page.getByText('已保存到本机', { exact: true }).count()) > 0 ||
        (await other.getByText('已保存到本机', { exact: true }).count()) > 0,
      { timeout: 10000 }
    )
    .toBe(true);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(1);
  expect(calls).toBe(1);
});

test('本机写入失败时保留可下载结果，重试保存不再生成', async ({ page }) => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    return route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  await provider(page);
  await prompt(page);
  await page.evaluate(() => {
    const prototype = FileSystemDirectoryHandle.prototype;
    const original = prototype.getFileHandle;
    Object.defineProperty(window, '__restoreOpfs', {
      value: () => {
        prototype.getFileHandle = original;
      },
      configurable: true
    });
    prototype.getFileHandle = async () => {
      throw new DOMException('fixture quota', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('图片已生成，本机保存失败。请先下载，再释放空间并重试保存。')).toBeVisible();
  await expect(page.getByRole('link', { name: '下载图片' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __restoreOpfs: () => void }).__restoreOpfs();
  });
  await page.getByRole('button', { name: '重试保存' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
