import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { importBackup, pngFixture, profile, verifyImageDownload } from './local-first.helpers';

test.use({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
test.setTimeout(90000);
const authUrl = 'https://library-auth.example.test';
const sessionKey = `aiao-media-supabase-session-v1:${encodeURIComponent(authUrl)}`;

async function seed(page: Page, count = 50, label = '') {
  const png = await pngFixture();
  const providerId = randomUUID();
  const jobs = Array.from({ length: count }, (_, index) => {
    const time = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    return {
      id: randomUUID(),
      request: {
        kind: 'image',
        operation: 'text-to-image',
        providerRevision: 1,
        providerInstanceId: providerId,
        modelId: index % 3 === 0 ? 'alpha-image' : 'beta-image',
        prompt: `${label}${index % 2 === 0 ? '森林' : '海洋'}作品 ${index}`
      },
      status: 'completed',
      createdAt: time,
      updatedAt: time,
      delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
      failure: null
    };
  });
  const sha256 = createHash('sha256').update(png).digest('hex');
  const backup = Buffer.from(
    JSON.stringify({
      format: 'aiao-local-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      providers: [
        {
          id: providerId,
          name: '检索验收供应商',
          baseUrl: 'https://library.example.test/v1',
          model: 'alpha-image',
          mode: 'direct',
          rememberKey: false
        }
      ],
      defaultId: providerId,
      draft: { fields: [], values: {}, document: { type: 'doc', content: [{ type: 'paragraph' }] } },
      tasks: jobs,
      images: jobs.map(job => ({ job, base64: png.toString('base64'), sha256 }))
    })
  );
  await page.goto('/providers');
  await importBackup(page, backup);
  await page.waitForLoadState('load');
  await expect(page.getByRole('heading', { name: '检索验收供应商 · 默认' })).toBeVisible({ timeout: 30000 });
  return { png, jobs };
}

async function installPreviewCounter(page: Page) {
  await page.addInitScript(() => {
    const state = { created: 0, active: new Set<string>(), owners: new Map<string, string | null>() };
    const scope = window as typeof window & { __libraryPreviews: typeof state };
    scope.__libraryPreviews = state;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      if (blob instanceof Blob && blob.type === 'image/png') {
        state.created++;
        state.active.add(url);
        state.owners.set(url, localStorage.getItem('aiao-local-profile-v1'));
      }
      return url;
    };
    URL.revokeObjectURL = url => {
      state.active.delete(url);
      state.owners.delete(url);
      revoke(url);
    };
  });
}

async function previews(page: Page) {
  return page.evaluate(() => {
    const state = (
      window as typeof window & {
        __libraryPreviews: { created: number; active: Set<string>; owners: Map<string, string | null> };
      }
    ).__libraryPreviews;
    return {
      created: state.created,
      active: state.active.size,
      urls: [...state.active],
      owners: [...state.active].map(url => state.owners.get(url))
    };
  });
}

async function configureAccount(context: BrowserContext) {
  const users = {
    alice: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'alice@example.test' },
    bob: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'bob@example.test' }
  };
  const state = { identity: users.alice };
  const business = { directoryReads: 0, failedBindings: 0, unexpected: [] as string[] };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  await context.route('**/app-config.js', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify({ url: authUrl, anonKey: 'sb_publishable_library_fixture' })};`
    })
  );
  await context.route(`${authUrl}/auth/v1/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    const account = {
      ...state.identity,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-10-24T00:00:00Z'
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: account.id, exp: expires, aud: 'authenticated', role: 'authenticated' })}.c2lnbmF0dXJl`;
    return route.fulfill({
      json:
        path.endsWith('/user') ? account : (
          {
            access_token: token,
            refresh_token: `library-fixture-refresh-token-${account.id}`,
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: expires,
            user: account
          }
        )
    });
  });
  await context.route(`${authUrl}/rest/v1/**`, route => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/rest/v1/media_workspaces') {
      business.directoryReads++;
      return route.fulfill({ json: [] });
    }
    if (request.method() === 'POST' && path === '/rest/v1/rpc/media_ensure_workspace') {
      business.failedBindings++;
      return route.fulfill({ status: 503, json: { message: 'fixture binding unavailable' } });
    }
    business.unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 500, json: { message: 'unexpected fixture business request' } });
  });
  return { users, state, business };
}

async function login(page: Page, email: string) {
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill('library-fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '我的账号', exact: true })).toContainText(email);
  await expect(page.getByRole('button', { name: '启用同步', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
}

test('本地作品筛选分页和可见预览不加载全库原图，页外任务保留本机归属', async ({ page }) => {
  await installPreviewCounter(page);
  let generations = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/(?:api\/relay|images\/generations)$/.test(new URL(request.url()).pathname))
      generations++;
  });
  await seed(page);
  await expect.poll(async () => (await previews(page)).active).toBe(0);
  await page.goto('/images');
  const cards = page.locator('.cards > .library-card').filter({ has: page.getByText('生成信息', { exact: true }) });
  await expect(cards).toHaveCount(24);
  const paging = page.getByLabel('作品分页');
  await expect(paging).toContainText('共 50 张');
  await expect(cards.first().getByAltText('本机生成作品')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('library-first-page.png'), fullPage: false });
  expect((await previews(page)).active).toBeLessThan(24);
  expect((await previews(page)).created).toBeLessThan(24);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last().getByAltText('本机生成作品')).toBeVisible();
  expect((await previews(page)).active).toBeLessThan(24);
  await page.locator('.task-history summary').click();
  await expect(page.locator('.task-history p')).toHaveCount(50);
  await expect(page.locator('.task-history')).not.toContainText('本机无副本');
  await page.getByLabel('搜索提示词', { exact: true }).fill('森林');
  await page.getByLabel('筛选模型', { exact: true }).fill('alpha');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(cards).toHaveCount(9);
  await expect(paging).toContainText('共 9 张');
  for (const card of await cards.all()) await expect(card).toContainText('森林');
  await page.getByLabel('起始日期', { exact: true }).fill('2026-02-10');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-01-10');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('起始日期不能晚于结束日期');
  await expect(cards).toHaveCount(9);
  await expect(paging).toContainText('共 9 张');
  await expect(page.getByLabel('起始日期', { exact: true })).toHaveValue('2026-02-10');
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('2026-01-10');
  await page.getByLabel('结束日期', { exact: true }).fill('');
  await page.getByLabel('起始日期', { exact: true }).fill('2100-01-01');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('没有匹配的作品', { exact: true })).toBeVisible();
  await expect.poll(async () => (await previews(page)).active).toBe(0);
  await page.getByRole('button', { name: '清空筛选', exact: true }).first().click();
  await expect(cards).toHaveCount(24);
  await expect(paging).toContainText('共 50 张');
  await page.getByRole('link', { name: '供应商设置', exact: true }).click();
  await expect.poll(async () => (await previews(page)).active).toBe(0);
  expect(generations).toBe(0);
});

test('末页删除自动回到有效页，离线筛选保留精确下载', async ({ page, context }) => {
  const { png } = await seed(page);
  await page.goto('/images');
  const cards = page.locator('.cards > .library-card').filter({ has: page.getByText('生成信息', { exact: true }) });
  await expect(cards).toHaveCount(24);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByLabel('作品分页')).toContainText('第 2 / 3 页');
  await expect(cards).toHaveCount(24);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(cards).toHaveCount(2);
  page.on('dialog', dialog => dialog.accept());
  await cards.first().getByRole('button', { name: '删除本机图片' }).click();
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: '删除本机图片' }).click();
  await expect(page.getByLabel('作品分页')).toContainText('第 2 / 2 页');
  await expect(cards).toHaveCount(24);
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await context.setOffline(true);
  await page.getByLabel('搜索提示词', { exact: true }).fill('海洋');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(page.getByLabel('作品分页')).toContainText('第 1 / 1 页');
  await expect(cards).toHaveCount(24);
  await verifyImageDownload(page, cards.first(), png);
  await context.setOffline(false);
});

test('进程内切换本机副本重置筛选分页并释放上一工作区预览', async ({ page, context }) => {
  const { users, state, business } = await configureAccount(context);
  await installPreviewCounter(page);
  let generations = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && /\/(?:api\/relay|images\/generations)$/.test(new URL(request.url()).pathname))
      generations++;
  });
  await seed(page, 50, '第一库 ');
  const firstProfile = await profile(page);
  expect(firstProfile).not.toBeNull();
  const documentTime = await page.evaluate(() => performance.timeOrigin);
  await login(page, users.alice.email);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '启用同步', exact: true }).click();
  await expect(page.getByLabel('工作区同步')).toContainText('作品信息 50 项');
  await page.getByRole('button', { name: '确认并启用同步', exact: true }).click();
  await expect(page.getByLabel('工作区同步')).toContainText('同步未完成');
  await expect(page.getByRole('button', { name: '启用同步', exact: true })).toBeEnabled();
  expect(business).toEqual({ directoryReads: 1, failedBindings: 1, unexpected: [] });
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  const cards = page.locator('.cards > .library-card').filter({ has: page.getByText('生成信息', { exact: true }) });
  const paging = page.getByLabel('作品分页');
  await expect(paging).toContainText('共 50 张');
  await page.getByLabel('搜索提示词', { exact: true }).fill('森林');
  await page.getByLabel('筛选模型', { exact: true }).fill('image');
  await page.getByLabel('起始日期', { exact: true }).fill('2025-01-01');
  await page.getByLabel('结束日期', { exact: true }).fill('2027-01-01');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(paging).toContainText('第 1 / 2 页 · 共 25 张');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(paging).toContainText('第 2 / 2 页 · 共 25 张');
  await expect(cards).toHaveCount(1);
  await cards.first().scrollIntoViewIfNeeded();
  await expect(cards.first().getByAltText('本机生成作品')).toBeVisible();
  const previousUrls = (await previews(page)).urls;
  expect(previousUrls.length).toBeGreaterThan(0);
  expect((await previews(page)).owners.every(owner => owner === firstProfile)).toBe(true);
  await logout(page);
  state.identity = users.bob;
  await login(page, users.bob.email);
  await expect(paging).toContainText('第 1 / 1 页 · 共 0 张');
  await expect(cards).toHaveCount(0);
  const secondProfile = await profile(page);
  expect(secondProfile).not.toBeNull();
  expect(secondProfile).not.toBe(firstProfile);
  await expect(page.getByLabel('搜索提示词', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('筛选模型', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('起始日期', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('');
  await expect.poll(async () => (await previews(page)).active).toBe(0);
  await page.getByLabel('搜索提示词', { exact: true }).fill('Bob 不存在的作品');
  await page.getByLabel('筛选模型', { exact: true }).fill('bob-image');
  await page.getByLabel('起始日期', { exact: true }).fill('2020-01-01');
  await page.getByLabel('结束日期', { exact: true }).fill('2021-01-01');
  await page.getByRole('button', { name: '筛选作品', exact: true }).click();
  await expect(paging).toContainText('第 1 / 1 页 · 共 0 张');
  await logout(page);
  state.identity = users.alice;
  await login(page, users.alice.email);
  await expect.poll(() => profile(page)).toBe(firstProfile);
  await expect(paging).toContainText('第 1 / 3 页 · 共 50 张');
  await expect(cards).toHaveCount(24);
  await expect(page.getByLabel('搜索提示词', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('筛选模型', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('起始日期', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('');
  await expect(cards.locator('.work-prompt')).toHaveText(
    Array.from({ length: 24 }, (_, index) => `第一库 ${(49 - index) % 2 === 0 ? '森林' : '海洋'}作品 ${49 - index}`)
  );
  await cards.first().scrollIntoViewIfNeeded();
  await expect(cards.first().getByAltText('本机生成作品')).toBeVisible();
  await expect
    .poll(async () => {
      const current = await previews(page);
      return (
        current.active > 0 &&
        current.owners.every(owner => owner === firstProfile) &&
        current.urls.every(url => !previousUrls.includes(url))
      );
    })
    .toBe(true);
  expect((await previews(page)).active).toBeLessThan(24);
  await page.locator('.task-history summary').click();
  await expect(page.locator('.task-history p')).toHaveCount(50);
  await expect(page.locator('.task-history')).not.toContainText('本机无副本');
  await expect(page.locator('.task-history p').filter({ hasText: '有本机保存记录' })).toHaveCount(50);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTime);
  expect(generations).toBe(0);
  expect(business).toEqual({ directoryReads: 1, failedBindings: 1, unexpected: [] });
});
