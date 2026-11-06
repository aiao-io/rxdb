import { expect, test, type Route } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  backupText,
  contentBox,
  downloadBackup,
  endpoint,
  importBackup,
  key,
  pngFixture,
  profile,
  prompt,
  provider,
  sealRelayAnswer,
  verifyImageDownload
} from './local-first.helpers';

test('模板改写可转为普通提示词并保留正文和焦点', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '查看把一杯咖啡，拍成一张好海报', exact: true }).click();
  await page.getByRole('button', { name: '用这个灵感创作', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '创意描述', exact: true });
  await expect(editor).toBeFocused();
  const description = '一只橘猫坐在窗边，温暖的午后阳光\n胶片摄影';
  await editor.fill(description);
  await expect(page.getByText('模板缺少「产品」节点', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '转为普通提示词', exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText(description, { useInnerText: true });
  await expect(page.getByRole('button', { name: '✧ 生成图片', exact: true })).toBeEnabled();
  await expect(page.locator('.template-chip')).toHaveCount(0);
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveText(description, { useInnerText: true });
  await expect(page.getByRole('button', { name: '✧ 生成图片', exact: true })).toBeEnabled();
});

test('首页只有图片瀑布流：多列错落排开，点开详情完整显示并可用 Esc 关闭', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.feed-card')).toHaveCount(12);
  await expect(page.locator('[contenteditable=true]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toHaveCount(0);
  const columns = await page.locator('.feed-column').evaluateAll(nodes =>
    nodes.map(node => {
      const { left, width } = node.getBoundingClientRect();
      return { left: Math.round(left), width: Math.round(width), cards: node.querySelectorAll('.feed-card').length };
    })
  );
  expect(columns.length).toBeGreaterThanOrEqual(3);
  expect(new Set(columns.map(column => column.left)).size).toBe(columns.length);
  expect(new Set(columns.map(column => column.width)).size).toBe(1);
  expect(columns.every(column => column.cards > 0)).toBe(true);
  const first = page.getByRole('button', { name: '查看把一杯咖啡，拍成一张好海报', exact: true });
  await first.click();
  const dialog = page.getByRole('dialog', { name: '把一杯咖啡，拍成一张好海报' });
  await expect(dialog).toBeVisible();
  const image = dialog.locator('.media-stage img');
  await expect(image).toBeVisible();
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth > 0)).toBe(true);
  expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
});

test('首页图片从点击位置过渡到弹窗，关闭时平滑回到卡片', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.addStyleTag({
    content:
      ':root::view-transition-group(template-image) { animation-duration: 2s !important; } .feed-cover img { transition: none !important; }'
  });
  const card = page.getByRole('button', { name: '查看把一杯咖啡，拍成一张好海报', exact: true });
  const cover = card.locator('img');
  await cover.evaluate((image: HTMLImageElement) => image.decode());
  await card.hover();
  const origin = (await card.locator('.feed-cover').boundingBox())!;
  await card.click();
  const dialog = page.getByRole('dialog', { name: '把一杯咖啡，拍成一张好海报' });
  await expect(dialog).toBeVisible();
  const detail = dialog.locator('.media-stage img');
  const destination = (await detail.boundingBox())!;
  const groupFrames = () =>
    page.evaluate(() => {
      const animation = document
        .getAnimations()
        .find(
          animation =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect.pseudoElement === '::view-transition-group(template-image)'
        );
      return animation?.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : null;
    });
  await expect.poll(groupFrames).toBeTruthy();
  const frames = (await groupFrames())!;
  const firstTransform = await page.evaluate(transform => {
    const matrix = new DOMMatrix(transform);
    return { x: matrix.m41, y: matrix.m42, scaleX: matrix.m11 };
  }, String(frames[0].transform));
  expect(Number.parseFloat(String(frames[0].width)) * firstTransform.scaleX).toBeCloseTo(origin.width, 0);
  expect(firstTransform.x).toBeCloseTo(origin.x, 0);
  expect(firstTransform.y).toBeCloseTo(origin.y, 0);
  expect(destination.width).toBeGreaterThan(origin.width);
  await page.evaluate(() => {
    for (const animation of document.getAnimations())
      if (animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.includes('view-transition'))
        animation.finish();
  });
  await expect(page.locator('html')).not.toHaveClass(/template-image-transition/);
  await expect(detail).toBeVisible();
  await dialog.getByRole('button', { name: '关闭模板详情' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(groupFrames).toBeTruthy();
  const reverse = (await groupFrames())!;
  expect(Number.parseFloat(String(reverse[0].width))).toBeCloseTo(destination.width, 0);
  await page.evaluate(() => {
    for (const animation of document.getAnimations())
      if (animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.includes('view-transition'))
        animation.finish();
  });
  await expect(page.locator('html')).not.toHaveClass(/template-image-transition/);
  await expect(card).toBeFocused();
  await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
});

test('首页图片还在放大时按 Esc 能关闭并再次打开', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.addStyleTag({
    content: ':root::view-transition-group(template-image) { animation-duration: 1s !important; }'
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const card = page.getByRole('button', { name: '查看把一杯咖啡，拍成一张好海报', exact: true });
  const dialog = page.getByRole('dialog', { name: '把一杯咖啡，拍成一张好海报' });
  await card.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/template-image-transition/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/template-image-transition/);
  await expect(card).toBeFocused();
  await card.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/template-image-transition/);
  expect(errors).toEqual([]);
});

test('减少动态效果时首页图片直接打开和关闭详情', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const card = page.getByRole('button', { name: '查看把一杯咖啡，拍成一张好海报', exact: true });
  await card.click();
  const dialog = page.getByRole('dialog', { name: '把一杯咖啡，拍成一张好海报' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/template-image-transition/);
  await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('供应商保存后清空表单，切换落盘前禁止生成', async ({ page }) => {
  await provider(page, false);
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('HTTPS Base URL')).toHaveValue('');
  await expect(page.getByLabel('图片模型 ID')).toHaveValue('');
  await page.getByLabel('名称', { exact: true }).fill('第二供应商');
  await page.getByLabel('HTTPS Base URL').fill('https://second.example.test/v1');
  await page.getByLabel('图片模型 ID').fill('second-image');
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.locator('.provider-card')).toHaveCount(2);
  await prompt(page, '供应商切换回归');
  await page.evaluate(async () => {
    let acquired!: () => void;
    const ready = new Promise<void>(resolve => (acquired = resolve));
    void navigator.locks.request(`aiao-media-account-${localStorage.getItem('aiao-local-profile-v1')}`, async () => {
      acquired();
      await new Promise<void>(resolve =>
        document.addEventListener('release-provider-review-lock', () => resolve(), { once: true })
      );
    });
    await ready;
  });
  try {
    await page
      .getByLabel('图片供应商', { exact: true })
      .selectOption({ label: '第二供应商 · second-image · 浏览器直连' });
    await expect(page.getByLabel('图片供应商', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '正在保存设置…', exact: true })).toBeDisabled();
  } finally {
    await page.evaluate(() => document.dispatchEvent(new Event('release-provider-review-lock')));
  }
  await expect(page.getByLabel('图片供应商', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '✧ 生成图片', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '填写 API Key' })).toContainText('第二供应商 · second-image');
});

test('初始工作区目录就绪前禁用保存，完成后首次点击即可保存供应商', async ({ page }) => {
  await page.addInitScript(() => {
    let reads = 0;
    const ready = new Promise<void>(resolve =>
      document.addEventListener('fixture-release-initial-registry', () => resolve(), { once: true })
    );
    navigator.locks.request = new Proxy(navigator.locks.request, {
      async apply(request, locks, args) {
        const initial = args[0] === 'aiao-local-profile-v1' && ++reads === 2;
        const result: unknown = await Reflect.apply(request, locks, args);
        if (initial) {
          document.documentElement.dataset['initialRegistry'] = 'pending';
          await ready;
          delete document.documentElement.dataset['initialRegistry'];
        }
        return result;
      }
    });
  });
  let requests = 0;
  await page.route('**/*', route => {
    const request = route.request();
    if (
      ['POST', 'PUT'].includes(request.method()) &&
      /\/(images\/generations|image_generation|api\/relay(\/tasks\/[^/]+)?)$/.test(request.url())
    ) {
      requests++;
      return route.abort('blockedbyclient');
    }
    return route.fallback();
  });
  await page.goto('/providers');
  await expect(page.locator('html')).toHaveAttribute('data-initial-registry', 'pending');
  await page.getByLabel('名称', { exact: true }).fill('本机供应商');
  await page.getByLabel('HTTPS Base URL').fill('https://images.example.test/v1');
  await page.getByLabel('图片模型 ID').fill('test-image');
  const save = page.getByRole('button', { name: '保存到本机', exact: true });
  try {
    await expect(save).toBeDisabled();
  } finally {
    await page.evaluate(() => document.dispatchEvent(new Event('fixture-release-initial-registry')));
  }
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  expect(requests).toBe(0);
});
test('首次没有供应商时自动启用默认免费供应商', async ({ page }) => {
  await page.goto('/providers');
  await expect(page.getByRole('heading', { name: '默认免费供应商 · 默认' })).toBeVisible();
  await expect(page.getByText('https://api.pengdevs.com', { exact: true })).toBeVisible();
  await expect(page.locator('.provider-card')).toContainText('本站代理');
  await page.goto('/create');
  await expect(page.locator('#selected-provider')).toHaveValue('00000000-0000-4000-8000-000000000001');
  await prompt(page, '一片蓝色的天空');
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  const prompted = page.getByRole('dialog', { name: '填写 API Key' });
  await expect(prompted).toContainText('默认免费供应商 · gpt-image-2.5 · 本站代理');
  await expect(prompted.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(page).toHaveURL(/\/create$/);
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
  expect(backupText(backup)).not.toContain(key);
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
  await page.route('**/api/relay**', route => {
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
  let calls = 0;
  await page.route('**/api/relay/tasks/**', route => {
    // The failed task is released afterwards; only its creation carries the Key.
    if (route.request().method() !== 'PUT') return route.fulfill({ status: 404, json: { error: 'Task not found' } });
    calls++;
    expect(route.request().headers()['x-provider-base']).toBe('https://images.example.test/v1');
    expect(route.request().headers()['authorization']).toBe(`Bearer ${key}`);
    return route.fulfill({
      status: 403,
      json: { error: 'Provider not allowed' }
    });
  });
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  const prompted = page.getByRole('dialog', { name: '填写 API Key' });
  await expect(prompted.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(prompted.getByLabel('在此设备记住 Key')).not.toBeChecked();
  expect(calls).toBe(0);
  await prompted.getByLabel('API Key', { exact: true }).fill(key);
  await prompted.getByRole('button', { name: '保存并生成' }).click();
  await expect(page.getByRole('heading', { name: '这次图片没有生成成功' })).toBeVisible();
  await expect(prompted).toHaveCount(0);
  expect(calls).toBe(1);
});
test('代理生成中刷新页面，回来后接着取回并保存结果，任务只创建一次', async ({ page }) => {
  const png = await pngFixture();
  const seen = { created: 0, abandoned: 0, deleted: 0, polls: 0 };
  let task = { id: '', token: '' },
    ready = false;
  const view = () => ({
    status: ready ? 'received' : 'dispatched',
    upstreamStatus: ready ? 200 : null,
    updatedAt: new Date().toISOString()
  });
  await page.route('**/api/relay/tasks/**', async (route: Route) => {
    const request = route.request();
    const [, id, action = ''] = /\/api\/relay\/tasks\/([^/?]+)(\/\w+)?/.exec(new URL(request.url()).pathname) ?? [];
    const headers = request.headers();
    if (request.method() === 'PUT') {
      seen.created++;
      task = { id, token: headers['x-relay-task-token'] };
      expect(headers['authorization']).toBe(`Bearer ${key}`);
      expect(headers['x-provider-base']).toBe('https://images.example.test/v1');
      expect(task.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return route.fulfill({ status: 202, json: view() });
    }
    // After a reload the page holds no Key; the stored token alone reaches the task.
    expect([id, headers['x-relay-task-token'], headers['authorization']]).toEqual([task.id, task.token, undefined]);
    if (request.method() === 'DELETE') {
      seen.deleted++;
      return route.fulfill({ status: 204 });
    }
    if (action === '/abandon') {
      seen.abandoned++;
      return route.fulfill({ status: 404, json: { error: 'Task not found' } });
    }
    if (action === '/result')
      return route.fulfill({
        contentType: 'application/octet-stream',
        body: await sealRelayAnswer(task, { data: [{ b64_json: png.toString('base64') }] })
      });
    seen.polls++;
    await new Promise(resolve => setTimeout(resolve, 200));
    return route.fulfill({ json: view() });
  });
  await provider(page, false, 'proxy');
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('正在由本站代理生成，可以刷新或关闭页面。')).toBeVisible();
  await expect.poll(() => seen.polls).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByText('正在由本站代理生成，可以刷新或关闭页面。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '请核对供应商记录' })).toHaveCount(0);
  ready = true;
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect(page.getByAltText('本次生成的图片')).toBeVisible();
  await expect.poll(() => seen.deleted).toBe(1);
  expect([seen.created, seen.abandoned]).toEqual([1, 0]);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toBeVisible();
});
test('接单回执不明时刷新：本站没有收到就解除锁定，原请求以后也不会发出', async ({ page }) => {
  const ids = new Set<string>();
  let abandoned = 0;
  await page.route('**/api/relay/tasks/**', (route: Route) => {
    const request = route.request();
    if (request.method() === 'PUT') {
      ids.add(new URL(request.url()).pathname);
      return route.abort('failed');
    }
    if (request.url().endsWith('/abandon')) abandoned++;
    return route.fulfill({ status: 404, json: { error: 'Task not found' } });
  });
  await provider(page, false, 'proxy');
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  // The page retries the same task while it still holds the Key; the relay would accept it only once.
  await expect.poll(() => ids.size, { timeout: 10000 }).toBe(1);
  await page.waitForTimeout(1500);
  expect(ids.size).toBe(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: '这次图片没有生成成功' })).toBeVisible();
  await expect(page.getByText('请求没有送达本站，也没有发给供应商。可以重新生成。')).toBeVisible();
  expect(abandoned).toBe(1);
  await prompt(page, '解除锁定后的新提示词');
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toBeEnabled();
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
test('从创作页首次安装后，离线冷开首页仍可解码六张参考图', async ({ page, context }) => {
  await page.goto('/create');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  const offline = await context.newPage();
  await page.close();
  const response = await offline.goto('/');
  expect(response?.fromServiceWorker()).toBe(true);
  const referenceIds = ['coffee', 'ceramic', 'map', 'illustration', 'vr', 'portrait'];
  for (const id of referenceIds) {
    const image = offline.locator(`.feed-card img[src="/image-examples/${id}.jpg"]`);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0))
      .toBe(true);
  }
  await expect(offline.getByText('示例图暂时无法加载，可继续查看提示词')).toHaveCount(0);
});
test('移动端首页、供应商页和创作页不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await provider(page);
  await prompt(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/providers');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  await expect(page.locator('.feed-column')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

test('超宽屏首页：瀑布流按列数上限铺满主区，更宽的窗口里内容居中，页面不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1440 });
  await page.goto('/');
  await expect(page.locator('.feed-card')).toHaveCount(12);
  // 3440 宽：主区内容宽 3168 小于默认上限 3200，内容铺满主区，右侧没有空带；列数封顶在 8，卡片放大。
  await expect(page.locator('.feed-column')).toHaveCount(8);
  let box = await contentBox(page);
  near(box.left, box.sidebar + 32);
  near(box.right, 3440 - 32);
  const feed = await page.locator('.feed').evaluate(node => {
    const { left, right } = node.getBoundingClientRect();
    return { left, right };
  });
  near(feed.left, box.left);
  near(feed.right, box.right);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // 5120 宽：内容限在 3200 宽并居中，两侧留白相等；列数仍是 8。
  await page.setViewportSize({ width: 5120, height: 1440 });
  await expect(page.locator('.feed-column')).toHaveCount(8);
  box = await contentBox(page);
  near(box.width, 3200);
  near(box.left - box.sidebar, 5120 - box.right);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // 1440 宽：与此前一样 5 列，内容区只受窗口限制。
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.feed-column')).toHaveCount(5);
  box = await contentBox(page);
  near(box.left, box.sidebar + 32);
  near(box.right, 1440 - 32);
});

test('设置里的「显示」：页面宽度、卡片大小、对齐立即生效，刷新后保留，恢复默认回到出厂排版', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1440 });
  await page.goto('/providers#display');
  const tab = page.getByRole('tab', { name: '显示', exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel', { name: '显示' });
  const root = page.locator('app-root');
  const radio = (name: RegExp) => panel.getByRole('radio', { name });
  await expect(radio(/^超宽/)).toBeChecked();
  await expect(radio(/^中/)).toBeChecked();
  await expect(radio(/^居中/)).toBeChecked();
  await expect(panel.getByRole('button', { name: '恢复默认' })).toBeDisabled();
  // 紧凑居中：内容区 1200 宽，两侧留白相等。
  await radio(/^紧凑/).check();
  await expect(root).toHaveAttribute('data-page-width', 'compact');
  let box = await contentBox(page);
  near(box.width, 1200);
  near(box.left - box.sidebar, 3440 - box.right);
  // 靠左：内容区紧贴导航，仍是 1200 宽。
  await radio(/^靠左/).check();
  await expect(root).toHaveAttribute('data-align', 'start');
  box = await contentBox(page);
  near(box.left, box.sidebar + 32);
  near(box.width, 1200);
  // 刷新后选择仍在，页面直接按它排版。
  await page.reload();
  await expect(radio(/^紧凑/)).toBeChecked();
  await expect(radio(/^靠左/)).toBeChecked();
  box = await contentBox(page);
  near(box.left, box.sidebar + 32);
  near(box.width, 1200);
  // 卡片大小：「特大」在 3440 宽的首页最多 4 列。
  await radio(/^铺满窗口/).check();
  await radio(/^特大/).check();
  await page.goto('/');
  await expect(page.locator('.feed-column')).toHaveCount(4);
  box = await contentBox(page);
  near(box.right, 3440 - 32);
  // 恢复默认：属性、存储和选项都回到出厂值。
  await page.goto('/providers#display');
  await panel.getByRole('button', { name: '恢复默认' }).click();
  await expect(root).toHaveAttribute('data-page-width', 'ultra');
  await expect(root).toHaveAttribute('data-align', 'center');
  await expect(radio(/^中/)).toBeChecked();
  await expect(panel.getByRole('button', { name: '恢复默认' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('aiao-media-display-v1'))).toBeNull();
  // 手机宽度：分区不横向溢出，每个选项都有足够大的触点。
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const heights = await panel
    .locator('.choice')
    .evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(heights).toHaveLength(11);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
});

test('另一个标签页改了显示偏好，已打开的页面立即跟着变', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('app-root')).toHaveAttribute('data-page-width', 'ultra');
  const other = await context.newPage();
  await other.goto('/providers#display');
  await other.getByRole('radio', { name: /^紧凑/ }).check();
  await expect(page.locator('app-root')).toHaveAttribute('data-page-width', 'compact');
  await other.getByRole('button', { name: '恢复默认' }).click();
  await expect(page.locator('app-root')).toHaveAttribute('data-page-width', 'ultra');
});

test('连续导入保留各工作区，原图与草稿可离线读取并从界面切回', async ({ page, context }) => {
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
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '本机数据', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份' }).click();
  const downloaded = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const contents = await readFile((await downloaded.path()) as string);
  expect(downloaded.suggestedFilename()).toMatch(/\.zip$/);
  expect(backupText(contents)).not.toContain(key);
  const backup = JSON.parse(backupText(contents));
  const entries = unzipSync(contents);
  expect(backup.version).toBe(2);
  expect(backup.images).toHaveLength(1);
  expect(Object.keys(entries).sort()).toEqual(['backup.json', backup.images[0].path].sort());
  expect(backup.images[0].path).toMatch(/^images\/[\da-f-]+\.png$/);
  expect(backup.images[0]).not.toHaveProperty('base64');
  expect(Buffer.from(entries[backup.images[0].path])).toEqual(png);
  const originalId = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await prompt(page, '原工作区未导出的草稿');
  await page.goto('/providers#data');
  await expect(page.locator('input[type=file]')).toBeEnabled();
  const reloaded = page.waitForEvent('load');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.zip',
    mimeType: 'application/zip',
    buffer: contents
  });
  await reloaded;
  await expect.poll(() => page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).not.toBe(originalId);
  const firstImportedId = await profile(page);
  await expect(page.getByText('备份已导入当前工作区。原工作区已保留，可在下方切回。')).toBeVisible();
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toBeVisible();
  await page.goto('/create');
  await expect(page.locator('[contenteditable="true"]')).toContainText('备份中的原始提示词');
  await page.goto('/providers#data');
  const importedAgain = page.waitForEvent('load');
  await importBackup(page, contents);
  await importedAgain;
  await expect.poll(() => profile(page)).not.toBe(firstImportedId);
  expect(await profile(page)).not.toBe(originalId);
  await expect(page.getByRole('button', { name: '返回工作区：导入前工作区', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '返回工作区：backup.zip', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '返回工作区：导入前工作区', exact: true }).click()
  ]);
  await expect.poll(() => profile(page)).toBe(originalId);
  await page.goto('/create');
  await expect(page.locator('[contenteditable="true"]')).toContainText('原工作区未导出的草稿');
  await page.goto('/providers');
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue(key);
  await page.goto('/providers#data');
  const firstCopy = page.locator('.provider-actions').filter({ hasText: firstImportedId!.slice(-8) });
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([
    page.waitForEvent('load'),
    firstCopy.getByRole('button', { name: '返回工作区：backup.zip', exact: true }).click()
  ]);
  await expect.poll(() => profile(page)).toBe(firstImportedId);
  await page.goto('/create');
  await expect(page.locator('[contenteditable="true"]')).toContainText('备份中的原始提示词');
});

test('损坏的备份不会改变当前工作区或清除现有设置', async ({ page }) => {
  await provider(page);
  const original = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await page.getByRole('tab', { name: '本机数据', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"aiao-local-backup","version":999}')
  });
  await expect(page.getByText('不支持的备份格式或版本。')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(original);
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
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
