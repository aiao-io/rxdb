import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pngFixture, verifyImageDownload } from './local-first.helpers';

const url = 'https://auth.example.test';
const publicKey = 'sb_publishable_browser_fixture';
const sessionKey = `aiao-media-supabase-session-v1:${encodeURIComponent(url)}`;
const email = 'creator@example.test';
const account = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  aud: 'authenticated',
  role: 'authenticated',
  email,
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-10-24T00:00:00Z'
};
function receipt() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: account.id, exp, aud: 'authenticated', role: 'authenticated' })}.c2lnbmF0dXJl`;
  return {
    access_token: token,
    refresh_token: 'fixture-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: account
  };
}
async function configure(context: BrowserContext) {
  await context.route('**/app-config.js', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `globalThis.__AIAO_SUPABASE_CONFIG__ = ${JSON.stringify({ url, anonKey: publicKey })};`
    })
  );
}
async function authFixture(context: BrowserContext) {
  const calls: string[] = [];
  const state = { failUser: false, rejectPassword: false };
  await context.route(`${url}/auth/v1/**`, async route => {
    const request = route.request();
    const endpoint = new URL(request.url());
    calls.push(`${request.method()} ${endpoint.pathname}${endpoint.search}`);
    expect(request.headers()['apikey']).toBe(publicKey);
    expect(request.headers()['cookie']).toBeUndefined();
    if (endpoint.pathname.endsWith('/user')) {
      if (state.failUser) return route.abort('failed');
      return route.fulfill({ json: account });
    }
    if (endpoint.pathname.endsWith('/signup')) return route.fulfill({ json: { user: account } });
    if (endpoint.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (state.rejectPassword)
      return route.fulfill({
        status: 400,
        // Cross-origin fetch only exposes non-safelisted headers explicitly.
        // The real SDK uses this version before reading the response's code.
        headers: {
          'X-Supabase-Api-Version': '2024-01-01',
          'Access-Control-Expose-Headers': 'X-Supabase-Api-Version'
        },
        json: {
          code: 'invalid_credentials',
          msg: 'sensitive-upstream-error fixture-refresh-token'
        }
      });
    return route.fulfill({ json: receipt() });
  });
  return { calls, state };
}
async function login(page: Page) {
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill('browser-fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
}
// Auth fixtures verify the built application + real SDK without contacting an external Auth project.
// The local-first suite separately verifies Service Worker installation and offline cold starts.
test.use({ serviceWorkers: 'block' });

test('平台接单响应丢失后刷新，使用原标识核对，不因修改提示词重复接单', async ({ page, context }) => {
  await configure(context);
  await authFixture(context);
  const png = await pngFixture();
  const requests: Record<string, unknown>[] = [];
  let dropped = false;
  let visible = false;
  let status = 'queued';
  const task = () => ({
    id: status === 'completed' ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requestId: requests[0]?.['requestId'],
    prompt: '平台原请求',
    model: 'platform-model',
    size: '1024x1024',
    billing: 'free',
    credits: 0,
    status,
    createdAt: '2026-10-30T00:00:00Z',
    result:
      status === 'completed' ?
        {
          mimeType: 'image/png',
          width: 64,
          height: 64,
          bytes: png.length,
          sha256: createHash('sha256').update(png).digest('hex')
        }
      : null,
    message: '当前繁忙，任务已进入队列。'
  });
  await context.route('**/api/platform/**', async route => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith('/result')) return route.fulfill({ contentType: 'image/png', body: png });
    if (path.endsWith('/catalog'))
      return route.fulfill({
        json: {
          enabled: true,
          freeDaily: 2,
          models: [{ id: 'platform-model', name: '平台模型', credits: 2, sizes: ['1024x1024'] }],
          pack: null,
          fairness: '按接单顺序处理'
        }
      });
    if (path.endsWith('/account'))
      return route.fulfill({ json: { credits: 0, freeRemaining: 2, freeReset: 'UTC 00:00', ledger: [] } });
    if (path.endsWith('/cancel')) {
      status = 'cancelled';
      return route.fulfill({ json: task() });
    }
    if (request.method() === 'GET') return route.fulfill({ json: { jobs: visible ? [task()] : [] } });
    requests.push(request.postDataJSON() as Record<string, unknown>);
    if (!dropped) {
      dropped = true;
      return route.abort('failed');
    }
    visible = true;
    return route.fulfill({ json: task() });
  });
  await page.goto('/create');
  await login(page);
  const editor = page.locator('[contenteditable="true"]');
  await editor.fill('平台原请求');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '确认并提交平台生图', exact: true }).click();
  await expect(page.getByText(/再次点击将核对同一请求/)).toBeVisible();
  await page.reload();
  await expect(editor).toBeVisible();
  await editor.fill('修改后的新提示词');
  await page.getByRole('button', { name: '确认并提交平台生图', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消排队并释放额度' })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.getByRole('button', { name: '取消排队并释放额度' }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();
  status = 'completed';
  await page.getByRole('button', { name: '刷新任务与余额' }).click();
  await page.getByRole('button', { name: '读取原图并保存到本机' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  await expect(page.locator('.library-card')).toHaveCount(1);
  await verifyImageDownload(page, page.locator('.library-card'), png);
});

test('未配置账号时四页面不连接 Supabase 或创建会话', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) foreign.push(request.url());
  });
  page.on('websocket', socket => foreign.push(socket.url()));
  for (const path of ['/', '/create', '/images', '/providers']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: '登录账号', exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: '供应商设置', exact: true })).toBeVisible();
  expect(foreign).toEqual([]);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('aiao-media-supabase-session')))
  ).toEqual([]);
});

test('登录刷新恢复且退出保留本机草稿，账号凭据不进入备份', async ({ page, context }) => {
  await configure(context);
  const { calls } = await authFixture(context);
  await page.goto('/create');
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.fill('登录前的本机草稿');
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  const profile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await login(page);
  await page.reload();
  await expect(page.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
  expect(calls).toContain('GET /auth/v1/user');
  await page.getByRole('link', { name: '供应商设置', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份', exact: true }).click();
  const download = await downloading;
  const backup = await readFile((await download.path())!, 'utf8');
  expect(backup).toContain('登录前的本机草稿');
  expect(backup).not.toContain('fixture-refresh-token');
  expect(backup).not.toContain('access_token');
  expect(backup).not.toContain(email);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
  await expect(editor).toContainText('登录前的本机草稿');
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(profile);
  expect(calls).toContain('POST /auth/v1/logout?scope=local');
  expect(calls.some(call => call.includes('/rest/'))).toBe(false);
});

test('注册待邮箱确认时不显示已登录，错误不显示上游敏感文本', async ({ page, context }) => {
  await configure(context);
  const { state } = await authFixture(context);
  await page.goto('/');
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByRole('button', { name: '还没有账号？注册' }).click();
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill('browser-fixture-password');
  await page.getByRole('button', { name: '注册', exact: true }).click();
  await expect(page.getByText('请检查邮箱并完成确认，然后回来登录。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '已有账号？登录' }).click();
  state.rejectPassword = true;
  await page.getByLabel('密码', { exact: true }).fill('browser-fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('邮箱或密码不正确。')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('sensitive-upstream-error');
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
});

test('离线校验保留会话但显示待验证，重试可恢复，跨标签退出立即生效', async ({ page, context }) => {
  await configure(context);
  const { state } = await authFixture(context);
  await page.goto('/');
  await login(page);
  state.failUser = true;
  await page.reload();
  await expect(page.getByRole('button', { name: '账号待验证', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toContain('fixture-refresh-token');
  state.failUser = false;
  await page.getByRole('button', { name: '账号待验证', exact: true }).click();
  await page.getByRole('button', { name: '重新验证会话' }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  const second = await context.newPage();
  await second.goto('/providers');
  await expect(second.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(second.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  await second.close();
});
