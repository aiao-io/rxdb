import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { localEnvironment } from '../../../scripts/supabase/supabase-local.mjs';
import { importBackup, key, pngFixture, verifyImageDownload } from './local-first.helpers';
import { productGenerationFixture } from './product-generation.fixture.mts';
import { seedRemoteImagePreviews } from './remote-image-preview.fixture.mts';
import { storageObjectFixture } from './storage-object.fixture.mts';

let admin: SupabaseClient;
const ids = new Set<string>();
const adminDrafts = new Set<string>();
const storageFixtures = new Set<Awaited<ReturnType<typeof storageObjectFixture>>>();
test.beforeAll(async () => {
  const local = await localEnvironment();
  admin = createClient(local.url, local.env['SERVICE_ROLE_KEY'], {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
});
test.afterEach(async () => {
  for (const key of adminDrafts) {
    const result = await admin.from('media_content_drafts').delete().eq('kind', 'template').eq('key', key);
    expect(result.error).toBeNull();
  }
  adminDrafts.clear();
  for (const fixture of storageFixtures) await fixture.close();
  storageFixtures.clear();
  for (const id of ids) {
    const audit = await admin.from('media_admin_audit').delete().eq('actor_id', id);
    expect(audit.error).toBeNull();
    const files = await admin.from('media_file_records').delete().eq('createdBy', id);
    expect(files.error).toBeNull();
    const result = await admin.auth.admin.deleteUser(id);
    expect(result.error).toBeNull();
  }
  ids.clear();
});
async function account() {
  const credentials = {
    email: `media-product-${randomUUID()}@example.test`,
    password: randomBytes(24).toString('hex')
  };
  const result = await admin.auth.admin.createUser({ ...credentials, email_confirm: true });
  if (result.error) throw result.error;
  ids.add(result.data.user.id);
  return { ...credentials, id: result.data.user.id };
}
async function signIn(page: Page, user: { email: string; password: string }) {
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill(user.email);
  await page.getByLabel('密码', { exact: true }).fill(user.password);
  const [authenticated] = await Promise.all([
    page.waitForResponse(
      response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/auth/v1/token'
    ),
    page.getByRole('button', { name: '登录', exact: true }).click()
  ]);
  expect(authenticated.ok()).toBe(true);
  const session = (await authenticated.json()) as { access_token: string };
  const verified = await admin.auth.getUser(session.access_token);
  expect(verified.error).toBeNull();
  expect(verified.data.user?.email).toBe(user.email);
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
}
async function synchronizePage(page: Page) {
  const verified = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/user');
  const button = page.getByRole('button', { name: '立即同步', exact: true });
  await button.click();
  await verified;
  await expect(button).toBeEnabled({ timeout: 25000 });
  await expect(page.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({ timeout: 25000 });
}
async function deleteRemoteDraft(page: Page, ownerId: string) {
  const workspace = (await admin.from('media_workspaces').select('id').eq('owner_id', ownerId).single()).data!;
  const button = page.getByRole('button', { name: '删除同步端草稿', exact: true });
  page.once('dialog', dialog => dialog.accept());
  await button.click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from('media_sync_records')
            .select('deleted')
            .eq('workspaceId', workspace.id)
            .eq('kind', 'draft')
            .single()
        ).data?.deleted
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
  await expect(page.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible();
  await expect(button).toBeDisabled();
}
test('真实登录不绑定，取消首次同步确认不上传或改变本机副本', async ({ page }) => {
  const user = await account();
  await page.goto('/images');
  await page.locator('[contenteditable=true]').fill('本机未绑定的草稿');
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  const profile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await signIn(page, user);
  expect((await admin.from('media_workspaces').select('id').eq('owner_id', user.id)).data).toEqual([]);
  await page.getByRole('button', { name: '启用同步', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认并启用同步' })).toBeVisible();
  await page.getByRole('button', { name: '取消同步确认' }).click();
  expect((await admin.from('media_workspaces').select('id').eq('owner_id', user.id)).data).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(profile);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('本机未绑定的草稿');
});

test('有效会话在同步预览期间恢复焦点，确认范围仍保留且不会自动绑定', async ({ page }) => {
  const user = await account();
  await page.goto('/images');
  await editDraft(page, '焦点恢复前的本机草稿');
  await signIn(page, user);
  let releasePreview!: () => void;
  let previewStarted!: () => void;
  const blocked = new Promise<void>(resolve => {
    releasePreview = resolve;
  });
  const started = new Promise<void>(resolve => {
    previewStarted = resolve;
  });
  const pattern = '**/rest/v1/media_workspaces?**';
  await page.route(pattern, async route => {
    if (new URL(route.request().url()).searchParams.get('select') === 'id,owner_id,request_id') {
      previewStarted();
      await blocked;
    }
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: '启用同步', exact: true }).click();
    await started;
    const reverified = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/user');
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await reverified;
    releasePreview();
    await expect(page.getByRole('button', { name: '确认并启用同步' })).toBeVisible();
    expect((await admin.from('media_workspaces').select('id').eq('owner_id', user.id)).data).toEqual([]);
    await page.getByRole('button', { name: '取消同步确认' }).click();
    expect((await admin.from('media_workspaces').select('id').eq('owner_id', user.id)).data).toEqual([]);
  } finally {
    releasePreview();
    await page.unroute(pattern);
  }
});

test('两台独立设备通过原生 RxDB 同步草稿，登录/退出与 A→B→A 保留独立副本', async ({ page, browser, baseURL }) => {
  const user = await account(),
    other = await account();
  await page.goto('/images');
  await page.locator('[contenteditable=true]').fill('设备 A 的输入');
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  await signIn(page, user);
  await page.getByRole('button', { name: '启用同步', exact: true }).click();
  await page.getByRole('button', { name: '确认并启用同步' }).click();
  await expect(page.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({ timeout: 25000 });
  const aProfile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  const workspace = (await admin.from('media_workspaces').select('id').eq('owner_id', user.id).single()).data!;
  await expect
    .poll(
      async () =>
        (await admin.from('media_sync_records').select('payload').eq('workspaceId', workspace.id).eq('kind', 'draft'))
          .data?.[0]?.payload
    )
    .toContain('设备 A 的输入');
  const context = await browser.newContext({ baseURL });
  try {
    const second = await context.newPage();
    await second.goto('/images');
    await second.locator('[contenteditable=true]').fill('未绑定设备 B 原始输入');
    await expect(second.getByText('输入已保存到本机', { exact: true })).toBeVisible();
    const unbound = await second.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
    await signIn(second, user);
    await second.getByRole('button', { name: '启用同步', exact: true }).click();
    await expect(second.getByText('此账号已有同步工作区', { exact: false })).toBeVisible();
    await second.getByRole('button', { name: '确认并启用同步' }).click();
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({
      timeout: 25000
    });
    expect(await second.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).not.toBe(unbound);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toContainText('设备 A 的输入');
    await second.locator('[contenteditable=true]').click();
    await second.locator('[contenteditable=true]').press('ControlOrMeta+A');
    await second.locator('[contenteditable=true]').pressSequentially('设备 B 的新修订');
    await expect(second.getByTestId('prompt-count')).toContainText('9');
    await expect(second.getByText('输入已保存到本机', { exact: true })).toBeVisible();
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await synchronizePage(second);
    await expect
      .poll(
        async () =>
          (
            await admin
              .from('media_sync_records')
              .select('payload')
              .eq('workspaceId', workspace.id)
              .eq('kind', 'draft')
              .single()
          ).data?.payload
      )
      .toContain('设备 B 的新修订');
    await synchronizePage(page);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(page.locator('[contenteditable=true]')).toContainText('设备 B 的新修订');
  } finally {
    await context.close();
  }
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('设备 B 的新修订');
  await signIn(page, other);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.locator('[contenteditable=true]')).toBeEmpty();
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).not.toBe(aProfile);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await signIn(page, user);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('设备 B 的新修订');
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(aProfile);
});

test('主站不公开后台入口，后台路径不回落到主站页面', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('后台已迁移', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /独立后台|业务管理后台/ })).toHaveCount(0);

  for (const pathname of ['/admin', '/admin/']) {
    const response = await page.request.get(pathname);
    expect(response.status()).toBe(200);
    await expect(page.goto(pathname)).resolves.toBeTruthy();
    await expect(page.getByRole('heading', { name: '后台管理', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toHaveCount(0);
  }
});

async function editDraft(page: Page, text: string) {
  const editor = page.locator('[contenteditable=true]');
  await editor.click();
  await editor.press('ControlOrMeta+A');
  await editor.pressSequentially(text);
  const preview = page.getByLabel('最终提示词预览', { exact: true });
  if (!(await preview.isVisible())) await page.getByRole('button', { name: '预览最终提示词', exact: true }).click();
  await expect(preview).toHaveText(text);
  await expect(page.getByTestId('prompt-count')).toHaveText(`${text.length} / 2000`);
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
}
async function enableReplica(page: Page, user: { email: string; password: string }) {
  await signIn(page, user);
  await page.getByRole('button', { name: '启用同步', exact: true }).click();
  await page.getByRole('button', { name: '确认并启用同步' }).click();
  await expect(page.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole('button', { name: '立即同步', exact: true })).toBeEnabled();
}

test('离线多次编辑与重开可推送，修改冲突和删除冲突保留双方，明确采用删除后不复活', async ({
  page,
  browser,
  baseURL
}) => {
  const user = await account();
  const context = await browser.newContext({ baseURL });
  try {
    await page.goto('/images');
    await editDraft(page, '初始草稿');
    await enableReplica(page, user);
    const second = await context.newPage();
    await second.goto('/images');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toContainText('初始草稿');
    await context.setOffline(true);
    await editDraft(second, '离线第一版');
    await editDraft(second, '离线第二版');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByLabel('工作区同步').locator('p.sync-state')).toContainText('有待同步改动', {
      timeout: 25000
    });
    await context.setOffline(false);
    await second.reload();
    await expect(second.locator('[contenteditable=true]')).toContainText('离线第二版');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({
      timeout: 25000
    });
    await synchronizePage(page);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(page.locator('[contenteditable=true]')).toContainText('离线第二版');
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await context.setOffline(true);
    await editDraft(second, 'B未上传的并发稿');
    await editDraft(page, 'A已经上传的并发稿');
    await page.getByRole('button', { name: '我的账号', exact: true }).click();
    await synchronizePage(page);
    await context.setOffline(false);
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await second.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect(second.getByRole('heading', { name: '草稿存在冲突', exact: true })).toBeVisible({ timeout: 25000 });
    await second.reload();
    await expect(second.locator('[contenteditable=true]')).toContainText('B未上传的并发稿');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByRole('heading', { name: '草稿存在冲突', exact: true })).toBeVisible({ timeout: 25000 });
    await second.getByRole('button', { name: '保留本机版本', exact: true }).click();
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({
      timeout: 25000
    });
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toContainText('B未上传的并发稿');
    await synchronizePage(page);
    await context.setOffline(true);
    await editDraft(second, '删除前B未上传的修改');
    await deleteRemoteDraft(page, user.id);
    await context.setOffline(false);
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await second.getByRole('button', { name: '立即同步', exact: true }).click();
    await expect(second.getByText('同步端：已删除', { exact: false })).toBeVisible({ timeout: 25000 });
    await second.getByRole('button', { name: '采用同步端版本', exact: true }).click();
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({
      timeout: 25000
    });
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toBeEmpty();
    await second.reload();
    await expect(second.locator('[contenteditable=true]')).toBeEmpty();
    const workspace = (await admin.from('media_workspaces').select('id').eq('owner_id', user.id).single()).data!;
    await expect
      .poll(
        async () =>
          (
            await admin
              .from('media_sync_records')
              .select('deleted')
              .eq('workspaceId', workspace.id)
              .eq('kind', 'draft')
              .single()
          ).data?.deleted
      )
      .toBe(true);
  } finally {
    await context.close();
  }
});

test('历史供应商和作品导入后跨副本同步，凭据剥离且原图留在本机，任务明确确认后上报', async ({
  page,
  browser,
  baseURL
}) => {
  const user = await account();
  const png = await pngFixture(),
    providerId = randomUUID(),
    createdAt = new Date().toISOString();
  const job = {
    id: randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerInstanceId: providerId,
      providerRevision: 1,
      modelId: 'test-image',
      prompt: '不进入任务上报的私有提示词'
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
  await page.goto('/providers');
  const reloaded = page.waitForEvent('load');
  await importBackup(
    page,
    Buffer.from(
      JSON.stringify({
        format: 'aiao-local-backup',
        version: 1,
        createdAt,
        providers: [
          {
            id: providerId,
            name: '历史本机供应商',
            baseUrl: 'https://images.example.test/v1',
            model: 'test-image',
            mode: 'direct',
            apiKey: key,
            rememberKey: true
          }
        ],
        defaultId: providerId,
        draft: null,
        tasks: [{ ...job, channel: 'direct', saved: true }],
        images: [{ job, base64: png.toString('base64'), sha256: createHash('sha256').update(png).digest('hex') }]
      })
    )
  );
  await reloaded;
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
  await editDraft(page, job.request.prompt);
  await enableReplica(page, user);
  const workspace = (await admin.from('media_workspaces').select('id').eq('owner_id', user.id).single()).data!;
  const records = (await admin.from('media_sync_records').select('kind,payload').eq('workspaceId', workspace.id)).data!;
  expect(records.map(record => record.kind).sort()).toEqual(['draft', 'provider', 'work']);
  expect(JSON.stringify(records)).not.toContain(key);
  expect(JSON.stringify(records)).not.toMatch(/fileId|opfsPath|blob:|rememberKey|apiKey/);
  expect((await admin.from('media_task_reports').select('id').eq('owner_id', user.id)).data).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '上报本机任务', exact: true }).click();
  await expect
    .poll(async () => (await admin.from('media_task_reports').select('payload').eq('owner_id', user.id)).data?.length)
    .toBe(1);
  const reports = (await admin.from('media_task_reports').select('payload').eq('owner_id', user.id)).data!;
  expect(JSON.stringify(reports)).not.toContain('不进入任务上报的私有提示词');
  expect(reports[0].payload).toMatchObject({
    source: 'application',
    requestCount: 1,
    providerUnits: null,
    verifiedCost: null
  });
  const context = await browser.newContext({ baseURL });
  try {
    const second = await context.newPage();
    await second.goto('/images');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await second.getByRole('link', { name: '我的图片', exact: true }).click();
    await expect(second.getByText('本机无原图', { exact: true })).toBeVisible();
    await expect(second.getByRole('link', { name: '下载图片', exact: false })).toHaveCount(0);
    await second.getByRole('link', { name: '设置', exact: true }).click();
    await expect(second.locator('#provider-key, #provider-base')).toHaveCount(0);
    await expect(second.getByRole('heading', { name: '供应商', exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('已删除原图明确创建新版本，准备和提交回执丢失后重开复用，第二设备可取回', async ({ page, browser, baseURL }) => {
  const user = await account(),
    png = await pngFixture(),
    storage = await storageObjectFixture(admin);
  storageFixtures.add(storage);
  let uploads = 0;
  async function installStorage(context: BrowserContext) {
    await context.route('**/storage/v1/object/aiao-media-images/**', async route => {
      expect(route.request().method()).toBe('POST');
      const bytes = route.request().postDataBuffer()!;
      expect(bytes).toEqual(png);
      await storage.put(
        new URL(route.request().url()).pathname.replace('/storage/v1/object/', ''),
        bytes,
        route.request().headers()['authorization']
      );
      uploads++;
      await route.fulfill({ json: { Key: 'private-file' } });
    });
    await context.route('**/storage/v1/object/authenticated/aiao-media-images/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/storage/v1/object/authenticated/', '');
      const bytes = storage.files.get(path);
      expect(bytes).toBeDefined();
      await route.fulfill({ contentType: 'image/png', body: bytes! });
    });
    await context.route('**/storage/v1/object/aiao-media-images', async route => {
      expect(route.request().method()).toBe('DELETE');
      const body = route.request().postDataJSON() as { prefixes: string[] };
      const rows = await storage.remove(body.prefixes, route.request().headers()['authorization']);
      expect(rows).toHaveLength(1);
      await route.fulfill({ json: rows });
    });
  }
  await installStorage(page.context());
  const createdAt = new Date().toISOString(),
    digest = createHash('sha256').update(png).digest('hex');
  const job = {
    id: randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerInstanceId: randomUUID(),
      providerRevision: 1,
      modelId: 'test-image',
      prompt: '显式重新上传新版本原图'
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
  await page.goto('/providers');
  const reloaded = page.waitForEvent('load');
  await importBackup(
    page,
    Buffer.from(
      JSON.stringify({
        format: 'aiao-local-backup',
        version: 1,
        createdAt,
        providers: [],
        defaultId: '',
        draft: null,
        tasks: [],
        images: [{ job, base64: png.toString('base64'), sha256: digest }]
      })
    )
  );
  await reloaded;
  await enableReplica(page, user);
  const imageSync = page.getByRole('article', { name: '图片原图同步' });
  await imageSync.getByRole('button', { name: '设置图片同步范围', exact: true }).click();
  const selection = imageSync.getByRole('region', { name: '图片同步范围确认' });
  await selection.getByRole('radio', { name: '已有及以后保存的图片', exact: true }).check();
  await selection.getByRole('button', { name: '确认并启用图片同步', exact: true }).click();
  await expect(imageSync).toContainText('已同步 1 张原图');
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  const original = page.locator('.library-card').filter({ hasText: job.request.prompt });
  const context = await browser.newContext({ baseURL });
  try {
    await installStorage(context);
    const second = await context.newPage();
    await second.goto('/images');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await second.getByRole('link', { name: '我的图片', exact: true }).click();
    const remote = second.locator('.library-card').filter({ hasText: job.request.prompt });
    await expect(remote.locator('img')).toBeVisible();
    await remote.getByRole('button', { name: `删除远端原图：${job.request.prompt}`, exact: true }).click();
    await second
      .getByRole('dialog', { name: '删除远端原图确认' })
      .getByRole('button', { name: '确认删除此远端原图', exact: true })
      .click();
    await expect(second.locator('#toast')).toContainText('远端原图已删除');
    await expect(
      remote.getByRole('button', { name: `删除远端原图：${job.request.prompt}`, exact: true })
    ).toBeFocused();
    await expect(remote.getByRole('button', { name: '取回并保存原图', exact: true })).toBeDisabled();
    expect(await storage.count()).toBe(0);
    await remote.scrollIntoViewIfNeeded();
    await expect(remote.getByRole('button', { name: '重试远端预览', exact: true })).toBeVisible();
    const reuploadButton = original.getByRole('button', { name: `重新上传新版本：${job.request.prompt}`, exact: true });
    await reuploadButton.click();
    const confirmation = page.getByRole('dialog', { name: '重新上传新版本确认' });
    await expect(confirmation).toContainText(digest);
    await confirmation.getByRole('button', { name: '取消重新上传', exact: true }).click();
    expect((await admin.from('media_file_records').select('id').eq('createdBy', user.id)).data).toHaveLength(1);
    const requestIds: string[] = [];
    let firstPreparedId = '';
    await page.route('**/rest/v1/rpc/media_prepare_image_reupload', async route => {
      requestIds.push((route.request().postDataJSON() as { p_request_id: string }).p_request_id);
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const prepared = (await response.json()) as { id: string };
      if (!firstPreparedId) {
        firstPreparedId = prepared.id;
        await route.abort('connectionfailed');
        return;
      }
      expect(prepared.id).toBe(firstPreparedId);
      await route.fulfill({ response });
    });
    await reuploadButton.click();
    await confirmation.getByRole('button', { name: '确认重新上传新版本', exact: true }).click();
    await expect(confirmation).toContainText('fetch');
    expect(uploads).toBe(1);
    expect(
      (await admin.from('media_file_records').select('status').eq('createdBy', user.id).eq('deleted', false)).data
    ).toEqual([{ status: 'pending' }]);
    await confirmation.getByRole('button', { name: '取消重新上传', exact: true }).click();
    let commitDrops = 0;
    await page.route('**/rest/v1/media_file_records?**', async route => {
      const request = route.request();
      if (
        request.method() !== 'PATCH' ||
        commitDrops ||
        (request.postDataJSON() as { status?: string }).status !== 'uploaded'
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      commitDrops++;
      await route.abort('connectionfailed');
    });
    await page.reload();
    await reuploadButton.click();
    await confirmation.getByRole('button', { name: '确认重新上传新版本', exact: true }).click();
    await expect.poll(() => commitDrops).toBe(1);
    await expect(confirmation.getByRole('button', { name: '确认重新上传新版本', exact: true })).toBeEnabled();
    expect((await admin.from('media_file_records').select('id,status').eq('id', firstPreparedId)).data).toEqual([
      { id: firstPreparedId, status: 'uploaded' }
    ]);
    expect(uploads).toBe(2);
    await confirmation.getByRole('button', { name: '取消重新上传', exact: true }).click();
    await page.reload();
    await reuploadButton.click();
    await confirmation.getByRole('button', { name: '确认重新上传新版本', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('新版本已上传');
    expect(commitDrops).toBe(1);
    expect(requestIds).toHaveLength(3);
    expect(new Set(requestIds).size).toBe(1);
    expect(requestIds[1]).toBe(requestIds[0]);
    expect(uploads).toBe(2);
    expect(await storage.count()).toBe(1);
    const rows = (
      await admin.from('media_file_records').select('id,version,status,deleted,path').eq('createdBy', user.id)
    ).data!;
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.version === digest)).toMatchObject({ status: 'deleted', deleted: true });
    const next = rows.find(row => row.id === firstPreparedId)!;
    expect(next).toMatchObject({ version: `${digest}-${requestIds[0]}`, status: 'uploaded', deleted: false });
    await verifyImageDownload(page, original, png);
    await remote.getByRole('button', { name: '重试远端预览', exact: true }).click();
    await expect(remote).toContainText('远端可取回 · 本机尚未保存原图');
    await expect(remote.getByText('远端原图已删除，本机已有副本保留。', { exact: true })).toHaveCount(0);
    await remote.getByRole('button', { name: '取回并保存原图', exact: true }).click();
    await expect(remote.getByAltText('本机生成作品')).toBeVisible();
    await verifyImageDownload(second, remote, png);
  } finally {
    await context.close();
  }
});

test('无任务历史的本机原图可以补传，第二设备先看到缺图原因再重试取回', async ({ page, browser, baseURL }) => {
  const user = await account(),
    png = await pngFixture();
  const storage = await storageObjectFixture(admin);
  storageFixtures.add(storage);
  const files = storage.files;
  let releaseVerification!: () => void;
  const verification = new Promise<void>(resolve => {
    releaseVerification = resolve;
  });
  await page.route('**/storage/v1/object/aiao-media-images/**', async route => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    const bytes = request.postDataBuffer()!;
    expect(bytes).toEqual(png);
    await storage.put(
      new URL(request.url()).pathname.replace('/storage/v1/object/', ''),
      bytes,
      request.headers()['authorization']
    );
    await route.fulfill({ status: 200, json: {} });
  });
  await page.route('**/storage/v1/object/authenticated/aiao-media-images/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/storage/v1/object/authenticated/', '');
    const bytes = files.get(path);
    expect(bytes).toBeDefined();
    await verification;
    await route.fulfill({ contentType: 'image/png', body: bytes! });
  });
  const createdAt = new Date().toISOString();
  const job = {
    id: randomUUID(),
    request: {
      kind: 'image',
      operation: 'text-to-image',
      providerInstanceId: randomUUID(),
      providerRevision: 1,
      modelId: 'test-image',
      prompt: '平台原图跨设备恢复'
    },
    status: 'completed',
    createdAt,
    updatedAt: createdAt,
    delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
    failure: null
  };
  await page.goto('/providers');
  const reloaded = page.waitForEvent('load');
  await importBackup(
    page,
    Buffer.from(
      JSON.stringify({
        format: 'aiao-local-backup',
        version: 1,
        createdAt,
        providers: [],
        defaultId: '',
        draft: null,
        tasks: [],
        images: [{ job, base64: png.toString('base64'), sha256: createHash('sha256').update(png).digest('hex') }]
      })
    )
  );
  await reloaded;
  await enableReplica(page, user);
  const imageSync = page.getByRole('article', { name: '图片原图同步' });
  await expect(imageSync).toBeVisible();
  await imageSync.getByRole('button', { name: '设置图片同步范围', exact: true }).click();
  const selection = imageSync.getByRole('region', { name: '图片同步范围确认' });
  await expect(selection).toContainText('可上传 1 张');
  await expect(selection.getByRole('radio', { name: '仅以后保存的图片', exact: true })).not.toBeChecked();
  await expect(selection.getByRole('radio', { name: '已有及以后保存的图片', exact: true })).not.toBeChecked();
  await expect(selection.getByRole('button', { name: '确认并启用图片同步', exact: true })).toBeDisabled();
  await expect(selection).toContainText('总容量：未知');
  await expect(selection).toContainText('平台承担存储与服务成本');
  await selection.getByRole('button', { name: '取消范围确认', exact: true }).click();
  await expect(selection).toHaveCount(0);
  expect(files.size).toBe(0);
  await imageSync.getByRole('button', { name: '设置图片同步范围', exact: true }).click();
  await expect(selection).toContainText('可上传 1 张');
  await selection.getByRole('radio', { name: '仅以后保存的图片', exact: true }).check();
  await selection.getByRole('button', { name: '确认并启用图片同步', exact: true }).click();
  await expect(imageSync).toContainText('已有图片未上传');
  const context = await browser.newContext({ baseURL });
  try {
    await context.route('**/storage/v1/object/authenticated/aiao-media-images/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/storage/v1/object/authenticated/', '');
      const bytes = files.get(path);
      expect(bytes).toBeDefined();
      await route.fulfill({ contentType: 'image/png', body: bytes! });
    });
    const second = await context.newPage();
    await second.goto('/images');
    await enableReplica(second, user);
    await expect(second.getByRole('article', { name: '图片原图同步' })).not.toContainText('图片自动同步已启用');
    await expect(second.getByRole('button', { name: '设置图片同步范围', exact: true })).toBeEnabled();
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await second.getByRole('link', { name: '我的图片', exact: true }).click();
    await expect(second.getByText('本机无原图', { exact: true })).toBeVisible();
    const card = second.locator('.library-card').filter({ hasText: '平台原图跨设备恢复' });
    await card.getByRole('button', { name: '取回并保存原图', exact: true }).click();
    await expect(card).toContainText('请在有原图的设备打开“设置图片同步范围”，选择“已有及以后保存的图片”并确认');
    expect(files.size).toBe(0);
    await imageSync.getByRole('button', { name: '设置图片同步范围', exact: true }).click();
    await expect(selection).toContainText('可上传 1 张');
    await selection.getByRole('radio', { name: '已有及以后保存的图片', exact: true }).check();
    await expect(selection).toContainText('本次历史范围：1 张');
    await selection.getByRole('button', { name: '确认并启用图片同步', exact: true }).click();
    const progress = imageSync.getByRole('progressbar', { name: '当前原图上传分片进度' });
    await expect(progress).toHaveJSProperty('value', png.length);
    await expect(progress).toHaveJSProperty('max', png.length);
    await expect(imageSync).toContainText('已确认 0 字节');
    await expect(imageSync).toContainText('原图完整性与关联尚未确认');
    expect((await admin.from('media_file_records').select('status').eq('createdBy', user.id)).data).toEqual([
      { status: 'pending' }
    ]);
    releaseVerification();
    await expect(imageSync).toContainText('已同步 1 张原图');
    await expect(progress).toHaveCount(0);
    expect(files.size).toBe(1);
    const uploaded = (await admin.from('media_file_records').select('status,path,sha256').eq('createdBy', user.id))
      .data!;
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].status).toBe('uploaded');
    expect(uploaded[0].path).toMatch(new RegExp(`^${user.id}/`));
    await card.getByRole('button', { name: '重试取回原图', exact: true }).click();
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    await verifyImageDownload(second, card, png);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    await page.getByRole('link', { name: '我的图片', exact: true }).click();
    const original = page.locator('.library-card').filter({ hasText: job.request.prompt });
    page.once('dialog', dialog => dialog.accept());
    await original.getByRole('button', { name: `删除本机图片：${job.request.prompt}`, exact: true }).click();
    await expect(page.locator('#toast')).toHaveText('已删除本机图片。');
    await page.getByRole('button', { name: '我的账号', exact: true }).click();
    await synchronizePage(page);
    const retained = await admin
      .from('media_sync_records')
      .select('sourceId,deleted')
      .eq('createdBy', user.id)
      .eq('kind', 'work');
    expect(retained.error).toBeNull();
    expect(retained.data).toEqual([{ sourceId: job.id, deleted: false }]);
    expect((await admin.from('media_file_records').select('status').eq('createdBy', user.id)).data).toEqual([
      { status: 'uploaded' }
    ]);
    expect(files.size).toBe(1);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(original.getByText('本机无原图', { exact: true })).toBeVisible();
    await original.getByRole('button', { name: '取回并保存原图', exact: true }).click();
    await expect(original.getByAltText('本机生成作品')).toBeVisible();
    await verifyImageDownload(page, original, png);
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    await page.context().setOffline(true);
    page.once('dialog', dialog => {
      expect(dialog.message()).toContain('各设备原图和云端对象都保留');
      return dialog.accept();
    });
    await original.getByRole('button', { name: `从同步图库移除：${job.request.prompt}`, exact: true }).click();
    await expect(page.locator('#toast')).toContainText('远端尚未确认');
    await expect(original.getByText('仅本机', { exact: true })).toBeVisible();
    expect(
      (await admin.from('media_sync_records').select('deleted').eq('createdBy', user.id).eq('kind', 'work')).data
    ).toEqual([{ deleted: false }]);
    await page.context().setOffline(false);
    await page.reload();
    await expect
      .poll(
        async () =>
          (await admin.from('media_sync_records').select('deleted').eq('createdBy', user.id).eq('kind', 'work')).data
      )
      .toEqual([{ deleted: true }]);
    await expect(original.getByAltText('本机生成作品')).toBeVisible();
    await verifyImageDownload(page, original, png);
    await page.getByRole('button', { name: '我的账号', exact: true }).click();
    const resumed = page.getByRole('article', { name: '图片原图同步' });
    await expect(resumed).toContainText('已选 0 张');
    await resumed.getByRole('button', { name: '重试图片队列', exact: true }).click();
    expect((await admin.from('media_file_records').select('status').eq('createdBy', user.id)).data).toEqual([
      { status: 'uploaded' }
    ]);
    expect(files.size).toBe(1);
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await synchronizePage(second);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(card.getByText('仅本机', { exact: true })).toBeVisible();
    await verifyImageDownload(second, card, png);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    expect(await storage.count()).toBe(1);
    let deleteCalls = 0;
    let loseDeletionReply = true;
    await page.route('**/storage/v1/object/aiao-media-images', async route => {
      expect(route.request().method()).toBe('DELETE');
      deleteCalls++;
      const payload = route.request().postDataJSON() as { prefixes: string[] };
      const rows = await storage.remove(payload.prefixes, route.request().headers()['authorization']);
      expect(rows).toHaveLength(1);
      if (loseDeletionReply) {
        loseDeletionReply = false;
        await route.abort('connectionfailed');
        return;
      }
      await route.fulfill({ json: rows });
    });
    const deleting = original.getByRole('button', { name: `删除远端原图：${job.request.prompt}`, exact: true });
    await deleting.click();
    const deletion = page.getByRole('dialog', { name: '删除远端原图确认' });
    await expect(deletion).toContainText(createHash('sha256').update(png).digest('hex'));
    await expect(deletion).toContainText('保留引用：0');
    expect((await admin.from('media_file_records').select('status').eq('createdBy', user.id)).data).toEqual([
      { status: 'uploaded' }
    ]);
    await deletion.getByRole('button', { name: '取消远端删除', exact: true }).click();
    expect(files.size).toBe(1);
    await deleting.click();
    await deletion.getByRole('button', { name: '确认删除此远端原图', exact: true }).click();
    await expect(deletion).toContainText('fetch');
    expect(files.size).toBe(0);
    expect(await storage.count()).toBe(0);
    expect((await admin.from('media_image_deletions').select('state').eq('createdBy', user.id)).data).toEqual([
      { state: 'pending' }
    ]);
    await deletion.getByRole('button', { name: '取消远端删除', exact: true }).click();
    await page.reload();
    await deleting.click();
    await expect(deletion).toContainText('已有删除回执');
    await deletion.getByRole('button', { name: '继续核对远端删除', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('远端原图已删除');
    expect(deleteCalls).toBe(1);
    expect((await admin.from('media_image_deletions').select('state').eq('createdBy', user.id)).data).toEqual([
      { state: 'complete' }
    ]);
    expect((await admin.from('media_file_records').select('status,deleted').eq('createdBy', user.id)).data).toEqual([
      { status: 'deleted', deleted: true }
    ]);
    await verifyImageDownload(page, original, png);
    await verifyImageDownload(second, card, png);
  } finally {
    if (!page.isClosed()) await page.context().setOffline(false);
    releaseVerification();
    await context.close();
    await storage.close();
    storageFixtures.delete(storage);
  }
});

test('明确重新扫描重放旧日志，保留未上传修订和删除冲突，重复扫描不复活或重复推送', async ({
  page,
  browser,
  baseURL
}) => {
  const user = await account();
  const context = await browser.newContext({ baseURL });
  try {
    await page.goto('/images');
    await editDraft(page, '重新扫描前的共同草稿');
    await enableReplica(page, user);
    const second = await context.newPage();
    await second.goto('/images');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await context.setOffline(true);
    await editDraft(second, '检查点恢复仍须保留的本机修改');
    await deleteRemoteDraft(page, user.id);
    await context.setOffline(false);
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    const scans: string[] = [];
    second.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/rest/v1/rxdb_change' && url.searchParams.get('id') === 'gt.0') scans.push(url.pathname);
    });
    second.once('dialog', dialog => dialog.dismiss());
    await second.getByRole('button', { name: '重新扫描远程记录', exact: true }).click();
    expect(scans).toEqual([]);
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: '重新扫描远程记录', exact: true }).click();
    await expect(second.getByText('同步端：已删除', { exact: false })).toBeVisible({ timeout: 25000 });
    expect(scans.length).toBeGreaterThan(0);
    await second.getByText('查看两个版本', { exact: true }).click();
    await expect(second.locator('article pre').first()).toContainText('检查点恢复仍须保留的本机修改');
    await second.reload();
    await expect(second.locator('[contenteditable=true]')).toContainText('检查点恢复仍须保留的本机修改');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByText('同步端：已删除', { exact: false })).toBeVisible({ timeout: 25000 });
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: '重新扫描远程记录', exact: true }).click();
    await expect(second.getByRole('button', { name: '采用同步端版本', exact: true })).toBeEnabled({ timeout: 25000 });
    await second.getByRole('button', { name: '采用同步端版本', exact: true }).click();
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible({
      timeout: 25000
    });
    const workspace = (await admin.from('media_workspaces').select('id').eq('owner_id', user.id).single()).data!;
    const record = () =>
      admin
        .from('media_sync_records')
        .select('id,revision,deleted')
        .eq('workspaceId', workspace.id)
        .eq('kind', 'draft')
        .single();
    const before = (await record()).data!;
    expect(before.deleted).toBe(true);
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: '重新扫描远程记录', exact: true }).click();
    await expect(second.getByRole('button', { name: '重新扫描远程记录', exact: true })).toBeEnabled({ timeout: 25000 });
    await expect(second.getByLabel('工作区同步').getByText('同步已确认', { exact: false })).toBeVisible();
    expect((await record()).data).toEqual(before);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toBeEmpty();
  } finally {
    await context.close();
  }
});

test('远端图库分三页仅预览可见卡片，离开后释放 URL，显式保存才落本机', async ({ page }) => {
  const user = await account();
  const png = await pngFixture();
  await page.goto('/images');
  await enableReplica(page, user);
  const seeded = await seedRemoteImagePreviews(admin, user, png, 53);
  const reads: string[] = [];
  let release!: () => void;
  const blocked = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.addInitScript(() => {
    const state = { active: new Set<string>(), revoked: 0 };
    Object.assign(window, { remotePreviewUrls: state });
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = object => {
      const url = create(object);
      if (object instanceof Blob && ['image/png', 'image/jpeg'].includes(object.type)) state.active.add(url);
      return url;
    };
    URL.revokeObjectURL = url => {
      if (state.active.delete(url)) state.revoked++;
      revoke(url);
    };
  });
  await page.route('**/storage/v1/object/authenticated/aiao-media-images/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(
      '/storage/v1/object/authenticated/aiao-media-images/',
      ''
    );
    expect(seeded.paths.has(path)).toBe(true);
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    reads.push(path.split('/')[2]);
    await blocked;
    await route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
  try {
    await page.reload();
    await page.getByRole('button', { name: '我的账号', exact: true }).click();
    await synchronizePage(page);
    expect(reads).toEqual([]);
    await page.getByRole('button', { name: '关闭账号窗口' }).click();
    await page.getByRole('link', { name: '我的图片', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的图片', level: 1 })).toBeVisible();
    const cards = page.locator('.remote-card');
    await expect(cards).toHaveCount(24);
    await expect.poll(() => reads.length).toBe(2);
    await expect(cards.getByText('正在核对远端原图…', { exact: true }).first()).toBeVisible();
    const firstPage = await cards.evaluateAll(elements =>
      elements.map(element => element.getAttribute('data-source-id'))
    );
    expect(reads.every(id => firstPage.includes(id))).toBe(true);
    release();
    await expect(cards.locator('img').first()).toBeVisible();
    await expect(cards.getByText('远端可取回 · 本机尚未保存原图', { exact: true }).first()).toBeVisible();
    expect(reads.length).toBeLessThan(24);
    await expect(page.locator('.library-card:not(.remote-card)')).toHaveCount(0);
    const pager = page.getByRole('navigation', { name: '同步作品分页' });
    await pager.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(pager).toContainText('第 2 页');
    await expect(cards).toHaveCount(24);
    const secondPage = await cards.evaluateAll(elements =>
      elements.map(element => element.getAttribute('data-source-id'))
    );
    expect(secondPage.every(id => !firstPage.includes(id))).toBe(true);
    await pager.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(pager).toContainText('第 3 页');
    await expect(cards).toHaveCount(5);
    await cards.first().scrollIntoViewIfNeeded();
    await expect(cards.first().locator('img')).toBeVisible();
    await page.getByRole('link', { name: '生成图片', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = Reflect.get(window, 'remotePreviewUrls') as { active: Set<string>; revoked: number };
          return state.active.size;
        })
      )
      .toBe(0);
    expect(
      await page.evaluate(() => {
        const state = Reflect.get(window, 'remotePreviewUrls') as { revoked: number };
        return state.revoked;
      })
    ).toBeGreaterThan(0);
    await page.getByRole('link', { name: '我的图片', exact: true }).click();
    await expect(page.getByRole('heading', { name: '我的图片', level: 1 })).toBeVisible();
    await cards.first().scrollIntoViewIfNeeded();
    await expect(cards.first().locator('img')).toBeVisible();
    const sourceId = await cards.first().getAttribute('data-source-id');
    const selected = seeded.works.find(work => work.jobId === sourceId)!;
    await cards.first().getByRole('button', { name: '取回并保存原图', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('原图已校验并保存到本机');
    await expect(page.locator('.library-card:not(.remote-card)')).toHaveCount(1);
    const saved = page.locator('.library-card:not(.remote-card)').filter({ hasText: selected.prompt });
    await verifyImageDownload(page, saved, png);
  } finally {
    release();
  }
});

test('A 的生成响应迟到时不进入 B 的工作区，回到 A 仍能读取原图', async ({ page }) => {
  const a = await account(),
    b = await account(),
    png = await pngFixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let received!: () => void;
  const started = new Promise<void>(resolve => {
    received = resolve;
  });
  const relay = await productGenerationFixture(page, admin, png, gate, received);
  await page.goto('/images');
  await editDraft(page, 'A的在途生成必须保留');
  await enableReplica(page, a);
  const aProfile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await page.getByRole('button', { name: '✧ 生成图片', exact: false }).click();
  await started;
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await signIn(page, b);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  release();
  await expect(page.locator('[contenteditable=true]')).toBeVisible();
  await expect(page.locator('[contenteditable=true]')).toBeEmpty();
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).not.toBe(aProfile);
  await page.getByRole('link', { name: '我的图片', exact: true }).click();
  await expect(page.getByAltText('本机生成作品')).toHaveCount(0);
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await signIn(page, a);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.getByAltText('本机生成作品')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(aProfile);
  expect(relay.calls).toBe(1);
  await verifyImageDownload(page, page.locator('.library-card'), png);
});

async function signInAdmin(page: Page, path: string) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('aiao-media-supabase-session-v1'));
  const user = await account();
  const membership = await admin.from('media_admin_memberships').insert({ user_id: user.id, enabled: true });
  expect(membership.error).toBeNull();
  await page.goto(`/admin/${path}`);
  await page.getByLabel('邮箱', { exact: true }).fill(user.email);
  await page.getByLabel('密码', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: '登录后台', exact: true }).click();
  await page.waitForURL('**/admin/users');
  if (path !== 'users') await page.goto(`/admin/${path}`);
  return user;
}

test('后台 P0 回归：真实配置表格、中文弹窗及切页和窗口尺寸恢复', async ({ page }) => {
  const key = `admin-review-${randomUUID()}`;
  const seeded = await admin.from('media_content_drafts').insert({
    kind: 'template',
    key,
    revision: 1,
    payload: { title: '后台回归模板', prompt: '验证真实配置渲染', tags: [], enabled: true }
  });
  expect(seeded.error).toBeNull();
  adminDrafts.add(key);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAdmin(page, 'templates');
  const list = page.locator('app-admin-config-model rxdb-entity-list');
  await expect(list).toBeVisible();
  const canvas = list.locator('canvas').first();
  await expect.poll(() => canvas.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(200);
  await expect(page.getByTestId('admin-page')).toContainText('提示词模板');
  await expect(page.getByTestId('admin-page')).not.toContainText(/text\.[a-f0-9]{10}|detail\.basic|common\.save/);
  await list.getByRole('button', { name: '+ 新增', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/text\.[a-f0-9]{10}|detail\.basic|common\.save/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => canvas.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(200);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: '用户列表', exact: true })).toBeVisible();
  await page.goto('/admin/templates');
  await expect.poll(() => canvas.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(200);
});

test('后台 P0 回归：时间选择器同时约束任务列表与用量请求', async ({ page }) => {
  await signInAdmin(page, 'tasks');
  const form = page.locator('form.filter-card');
  await expect(form.getByRole('button', { name: '应用筛选', exact: true })).toBeEnabled();
  const requests: URL[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/media_task_reports' && url.searchParams.has('started_at')) requests.push(url);
  });
  await form.locator('input[name="from"]').fill('2026-11-15T08:00');
  await form.locator('input[name="to"]').fill('2026-11-16T08:00');
  const range = await page.evaluate(() => [
    new Date('2026-11-15T08:00').toISOString(),
    new Date('2026-11-16T08:00').toISOString()
  ]);
  await form.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  for (const url of requests)
    expect(url.searchParams.getAll('started_at')).toEqual([`gte.${range[0]}`, `lt.${range[1]}`]);
  await expect(page.getByRole('status').filter({ hasText: '当前筛选已汇总' })).toContainText(
    '未上报的任务不在统计范围内'
  );
});

test('后台 P0 回归：51 条真实积分流水连续分页并返回最新', async ({ page }) => {
  const user = await signInAdmin(page, 'users');
  for (let index = 1; index <= 51; index++) {
    const adjustment = await admin.rpc('media_admin_adjust_credits', {
      p_actor: user.id,
      p_target: user.id,
      p_delta: 1,
      p_reason: `回归流水 ${index}`,
      p_request_id: randomUUID()
    });
    expect(adjustment.error).toBeNull();
  }
  await page.locator('input[name="userSearch"]').fill(user.email);
  await page.getByRole('button', { name: '查找用户', exact: true }).click();
  await page.getByRole('button', { name: user.email, exact: true }).click();
  const detail = page.locator('aside.detail-card');
  await expect(detail.locator('tbody tr')).toHaveCount(50);
  await expect(detail).toContainText('余额 51');
  await expect(detail.locator('tbody tr').first()).toContainText('回归流水 51');
  await detail.getByRole('button', { name: '更早的流水', exact: true }).click();
  await expect(detail.locator('tbody tr')).toHaveCount(1);
  await expect(detail.locator('tbody tr').first()).toContainText('回归流水 1');
  await detail.getByRole('button', { name: '返回最新流水', exact: true }).click();
  await expect(detail.locator('tbody tr')).toHaveCount(50);
  await expect(detail.locator('tbody tr').first()).toContainText('回归流水 51');
});

test('后台账户：身份下拉、名称保存、直接刷新和重新登录保持一致', async ({ page }, testInfo) => {
  const user = await signInAdmin(page, 'users');
  const trigger = page.getByRole('button', { name: `账户菜单：${user.email}` });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '退出登录' })).toHaveCount(0);
  await trigger.focus();
  await trigger.press('Space');
  await expect(page.getByRole('menuitem', { name: '账户详情' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: '退出登录' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('menuitem', { name: '账户详情' }).press('Space');
  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(page.getByRole('heading', { name: '账户详情' })).toBeVisible();
  const name = page.getByRole('textbox', { name: /名称/ });
  await expect(name).toBeEnabled();
  await expect(page.getByText(user.id, { exact: true })).toBeVisible();
  await name.fill('a'.repeat(41));
  await expect(page.getByRole('button', { name: '保存名称', exact: true })).toBeDisabled();
  await name.fill('新管理员 👩‍💻');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '名称已保存。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '账户菜单：新管理员 👩‍💻' })).toBeVisible();
  await page.getByRole('button', { name: '账户菜单：新管理员 👩‍💻' }).click();
  const accessibility = await new AxeBuilder({ page })
    .include('app-admin-account')
    .include('app-admin-account-menu')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await testInfo.attach('账户详情与身份菜单', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTrigger = page.getByRole('button', { name: '账户菜单：新管理员 👩‍💻' });
  await expect
    .poll(async () => {
      const box = await mobileTrigger.boundingBox();
      return box ? box.x + box.width : Infinity;
    })
    .toBeLessThanOrEqual(390);
  await mobileTrigger.click();
  const dropdown = await page.getByRole('menu', { name: '账户操作' }).boundingBox();
  expect(dropdown?.x).toBeGreaterThanOrEqual(0);
  await testInfo.attach('小屏账户菜单', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await expect(page.getByRole('heading', { name: '账户详情' })).toBeVisible();
  await expect(name).toHaveValue('新管理员 👩‍💻');
  await page.getByRole('button', { name: '账户菜单：新管理员 👩‍💻' }).click();
  await page.getByRole('menuitem', { name: '退出登录' }).click();
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter(key => key.startsWith('aiao-media-admin-') && key.includes('session'))
      )
    )
    .toEqual([]);
  await page.getByLabel('邮箱', { exact: true }).fill(user.email);
  await page.getByLabel('密码', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: '登录后台', exact: true }).click();
  await expect(page.getByRole('button', { name: '账户菜单：新管理员 👩‍💻' })).toBeVisible();
});

test('后台账户：多页面修改产生 CAS 冲突，重新读取后才能再次保存', async ({ page }) => {
  await signInAdmin(page, 'account');
  const name = page.getByRole('textbox', { name: /名称/ });
  await expect(name).toBeEnabled();
  const second = await page.context().newPage();
  await second.goto('/admin/account');
  await expect(second.getByRole('textbox', { name: /名称/ })).toBeEnabled();
  await name.fill('第一个页面');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.getByText('名称已保存。', { exact: true })).toBeVisible();
  await second.getByRole('textbox', { name: /名称/ }).fill('第二个页面');
  await second.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(second.getByRole('status').filter({ hasText: '资料已被其他页面修改' })).toBeVisible();
  await expect(second.getByRole('textbox', { name: /名称/ })).toHaveValue('第二个页面');
  await expect(second.getByRole('button', { name: '保存名称', exact: true })).toBeDisabled();
  await second.getByRole('button', { name: '重新读取资料' }).click();
  await expect(second.getByRole('textbox', { name: /名称/ })).toHaveValue('第一个页面');
  await second.close();
});

test('后台账户：保存响应丢失不虚报成功，重新读取确认真实结果', async ({ page }) => {
  await signInAdmin(page, 'account');
  await expect(page.getByRole('textbox', { name: /名称/ })).toBeEnabled();
  await page.route('**/rest/v1/rpc/media_admin_update_profile', async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort('failed');
  });
  await page.getByRole('textbox', { name: /名称/ }).fill('已到达服务器');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '未能确认保存结果' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存名称', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重新读取资料' }).click();
  await expect(page.getByRole('button', { name: '账户菜单：已到达服务器' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /名称/ })).toHaveValue('已到达服务器');
});

test('后台账户：资料读取失败保留会话，撤权后资料保存被服务端拒绝', async ({ page }) => {
  await page.route('**/rest/v1/rpc/media_admin_profile', route =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } })
  );
  const user = await signInAdmin(page, 'account');
  await expect(page.getByRole('heading', { name: '账户详情' })).toBeVisible();
  await expect(page.getByRole('button', { name: `账户菜单：${user.email}` })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '账户资料暂时无法读取' })).toBeVisible();
  await page.unroute('**/rest/v1/rpc/media_admin_profile');
  await page.getByRole('button', { name: '重新读取资料' }).click();
  const name = page.getByRole('textbox', { name: /名称/ });
  await expect(name).toBeEnabled();
  const revoked = await admin.from('media_admin_memberships').update({ enabled: false }).eq('user_id', user.id);
  expect(revoked.error).toBeNull();
  await name.fill('不应写入');
  const response = page.waitForResponse(value => value.url().endsWith('/rpc/media_admin_update_profile'));
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  expect((await response).status()).toBe(403);
  await expect(page.getByRole('status').filter({ hasText: '未能确认保存结果' })).toBeVisible();
  const profiles = await admin.from('media_profiles').select('display_name').eq('user_id', user.id);
  expect(profiles.error).toBeNull();
  expect(profiles.data).toEqual([]);
});

/** 读取管理员工作区下的配置模板（服务端视角）。 */
async function workspaceTemplates(ownerId: string) {
  const workspace = await admin.from('media_workspaces').select('id').eq('owner_id', ownerId).single();
  expect(workspace.error).toBeNull();
  const rows = await admin
    .from('media_prompt_templates')
    .select('id,key,title,revision')
    .eq('workspaceId', workspace.data!.id)
    .order('key');
  expect(rows.error).toBeNull();
  return { workspaceId: workspace.data!.id as string, rows: rows.data ?? [] };
}

/** 进入配置页并等到本机库打开、权限确认、首轮同步完成。 */
async function openTemplates(page: Page) {
  const config = page.locator('app-admin-config-model');
  await expect(config.locator('rxdb-entity-list')).toBeVisible({ timeout: 30000 });
  await expect(
    config
      .locator('app-admin-config-state')
      .getByRole('status')
      .filter({ hasText: /同步状态：(已与工作区同步|最近提交已应用)/ })
  ).toBeVisible({ timeout: 30000 });
  return config;
}

/** 经模型驱动的新增弹窗创建一条模板；系统字段由页面固定带入。 */
async function createTemplate(page: Page, values: { key: string; title: string; prompt: string }, enable = false) {
  await page
    .locator('app-admin-config-model rxdb-entity-list')
    .getByRole('button', { name: '+ 新增', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  // 模型表单把标签放在字段组上，输入框本身没有关联标签（rxdb-model-angular 的可访问性缺口），按字段组定位。
  const field = (label: string) => dialog.getByRole('group', { name: `${label} *`, exact: true }).getByRole('textbox');
  await field('标识').fill(values.key);
  await field('标题').fill(values.title);
  await field('提示词').fill(values.prompt);
  if (enable) await dialog.getByRole('group', { name: /^启用/ }).getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function commitChanges(page: Page, message: string) {
  const form = page.getByRole('form', { name: '提交本机修改' });
  await form.getByLabel('提交说明').fill(message);
  await form.getByRole('button', { name: '提交修改', exact: true }).click();
  await expect(form).toHaveCount(0);
}

test('后台配置：断网时的修改保存在本机，刷新后恢复未提交状态，联网后同步到工作区草稿', async ({ page }) => {
  const user = await signInAdmin(page, 'templates');
  const config = await openTemplates(page);
  const suffix = randomUUID().slice(0, 8);
  await createTemplate(page, { key: `e2e-online-${suffix}`, title: '联网新增', prompt: '联网时写入的模板' });
  await expect(config.getByRole('form', { name: '提交本机修改' })).toContainText('本机有 1 项未提交的修改');

  await page.context().setOffline(true);
  await expect(config.locator('app-admin-config-state').getByRole('status')).toContainText('离线：修改只保存在本机');
  await createTemplate(page, { key: `e2e-offline-${suffix}`, title: '断网新增', prompt: '断网时写入的模板' });
  await expect(config.getByRole('form', { name: '提交本机修改' })).toContainText('本机有 2 项未提交的修改');

  await page.context().setOffline(false);
  await page.reload();
  const restored = await openTemplates(page);
  await expect(restored.getByRole('form', { name: '提交本机修改' })).toContainText('本机有 2 项未提交的修改');
  await expect
    .poll(async () => (await workspaceTemplates(user.id)).rows.map(row => row.key), { timeout: 30000 })
    .toEqual([`e2e-offline-${suffix}`, `e2e-online-${suffix}`]);
});

test('后台配置：提交后应用，状态与服务端修订号可见且不留簿记修改，回滚需二次确认，状态区与提交详情无 WCAG 2.1 AA 违规', async ({
  page
}) => {
  const user = await signInAdmin(page, 'templates');
  const config = await openTemplates(page);
  const key = `e2e-apply-${randomUUID().slice(0, 8)}`;
  await createTemplate(page, { key, title: '首页', prompt: '生成海报' });
  await commitChanges(page, '新增首页模板');
  const detail = config.locator('app-admin-config-commit');
  await expect(detail).toContainText('新增首页模板');
  await expect(detail).toContainText('已同步，待应用', { timeout: 30000 });

  await detail.getByRole('button', { name: '应用提交', exact: true }).click();
  await expect(detail).toContainText('已应用', { timeout: 30000 });
  const { workspaceId, rows } = await workspaceTemplates(user.id);
  const template = rows.find(row => row.key === key)!;
  const applied = await admin
    .from('media_config_records')
    .select('revision,deleted')
    .eq('workspace_id', workspaceId)
    .eq('entity_id', template.id)
    .single();
  expect(applied.data).toEqual({ revision: 1, deleted: false });
  await expect(config.getByRole('form', { name: '提交本机修改' })).toHaveCount(0);

  await page.reload();
  const reloaded = await openTemplates(page);
  const reloadedDetail = reloaded.locator('app-admin-config-commit');
  await expect(reloadedDetail).toContainText('新增首页模板');
  await expect(reloadedDetail).toContainText('已应用');
  await expect(reloadedDetail).toContainText(user.id);
  await expect(reloaded.getByRole('form', { name: '提交本机修改' })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page })
    .include('app-admin-config-state')
    .include('app-admin-config-commit')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await detail.getByRole('button', { name: '执行安全回滚', exact: true }).click();
  await expect(detail).toContainText('确认回滚「新增首页模板」');
  await detail.getByRole('button', { name: '确认回滚', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from('media_config_records')
            .select('revision,deleted')
            .eq('workspace_id', workspaceId)
            .eq('entity_id', template.id)
            .single()
        ).data
    )
    .toEqual({ revision: 2, deleted: true });
});

test('目录预览：取消保留两种模型和语音能力，确认后公开目录只剩选中的模型', async ({ page, request }) => {
  const user = await signInAdmin(page, 'platforms');
  const model = {
    id: 'preview-keep',
    name: '预览测试',
    model: 'fixture-image',
    credits: 1,
    baseUrl: 'https://images.example.test/v1',
    apiKey: 'local-fixture'
  };
  const capability = {
    providerInstanceId: randomUUID(),
    providerRevision: 1,
    operation: 'text-to-speech',
    kind: 'audio',
    label: '测试语音',
    modelId: 'preview-voice',
    model: 'fixture-voice',
    protocol: 'openai',
    credits: 1,
    baseUrl: 'https://audio.example.test/v1',
    apiKey: 'local-fixture',
    input: { textMaxLength: 500 },
    parameters: { languages: ['zh-CN'], voices: [{ id: 'alloy', label: 'Alloy' }], speeds: [1] },
    output: { mediaTypes: ['audio/wav'], maxBytes: 8388608, maxDurationMs: 120000 }
  };
  const seed = await admin.from('media_platform_configuration').insert({
    id: 'default',
    updated_by: user.id,
    revision: 1,
    models: [model, { ...model, id: 'preview-remove' }],
    capabilities: [capability]
  });
  test.skip(seed.error?.code === '23505', '本地环境已有平台配置，保留现有凭据。');
  expect(seed.error).toBeNull();
  try {
    await page.reload();
    await page.getByLabel('图片模型 JSON').fill(JSON.stringify([model]));
    await page.getByLabel('ASR / TTS / 音乐 / 视频 JSON').fill('[]');
    await page.getByRole('button', { name: '预览变更' }).click();
    const preview = page.getByLabel('目录变更预览');
    await expect(preview).toContainText('preview-remove');
    await expect(preview).toContainText('preview-voice');
    await page.getByRole('button', { name: '返回编辑' }).click();
    const publicModels = async () => {
      const response = await request.get('/api/models');
      expect(response.ok()).toBe(true);
      return (await response.json()).models.map((value: { id: string }) => value.id);
    };
    expect(await publicModels()).toEqual(['preview-keep', 'preview-remove']);
    const capabilities = async () => {
      const response = await request.get('/api/media/capabilities');
      expect(response.ok()).toBe(true);
      return (await response.json()).capabilities.map((value: { modelId: string }) => value.modelId);
    };
    expect(await capabilities()).toEqual(['preview-voice']);
    await page.getByRole('button', { name: '预览变更' }).click();
    await page.getByRole('button', { name: '确认保存并启用' }).click();
    await expect(page.getByRole('status')).toContainText('新的目录已生效');
    expect(await publicModels()).toEqual(['preview-keep']);
    expect(await capabilities()).toEqual([]);
  } finally {
    expect(
      (await admin.from('media_platform_configuration').delete().eq('id', 'default').eq('updated_by', user.id)).error
    ).toBeNull();
  }
});

test('模板发布：应用后用户仍读旧标题，发布并刷新后灵感页显示新版', async ({ page, browser }) => {
  await signInAdmin(page, 'templates');
  const config = await openTemplates(page);
  const key = `release-${randomUUID().slice(0, 8)}`;
  const oldTitle = '旧版海报 ' + key;
  const newTitle = '新版海报 ' + key;
  const legacy = {
    id: key,
    title: oldTitle,
    prompt: '生成海报',
    purpose: '设计',
    style: '简洁',
    tags: [],
    image: '/prompt-art/coffee-launch.svg',
    alt: '海报',
    updatedAt: '2026-11-01',
    author: 'Aiao',
    source: 'Aiao 原创',
    rights: 'aiao-original-text-and-svg',
    needsReference: false,
    referenceModel: null,
    featuredRank: null
  };
  const row = { kind: 'template', key, payload: legacy, revision: 1 };
  expect((await admin.from('media_content_drafts').insert(row)).error).toBeNull();
  adminDrafts.add(key);
  const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:4399' });
  try {
    expect((await admin.from('media_public_content').insert(row)).error).toBeNull();
    const feed = await visitor.newPage();
    await feed.goto('/');
    await expect(feed.getByRole('button', { name: '查看' + oldTitle })).toBeVisible();
    await createTemplate(page, { key, title: newTitle, prompt: legacy.prompt }, true);
    await commitChanges(page, '更新灵感页标题');
    const detail = config.locator('app-admin-config-commit');
    await detail.getByRole('button', { name: '应用提交' }).click();
    await expect(detail.getByRole('button', { name: '发布模板到灵感页' })).toBeEnabled();
    await page.reload();
    await openTemplates(page);
    await feed.reload();
    await expect(feed.getByRole('button', { name: '查看' + oldTitle })).toBeVisible();
    await detail.getByRole('button', { name: '发布模板到灵感页' }).click();
    await expect(detail).toContainText('已发布');
    await feed.reload();
    await expect(feed.getByRole('button', { name: '查看' + newTitle })).toBeVisible();
    await expect(feed.getByRole('button', { name: '查看' + oldTitle })).toHaveCount(0);
  } finally {
    await visitor.close();
    expect((await admin.from('media_public_content').delete().eq('kind', 'template').eq('key', key)).error).toBeNull();
  }
});

test('后台配置：其他设备已应用同一配置时，应用被服务端拒绝并显示冲突，不写入配置', async ({ page }) => {
  const user = await signInAdmin(page, 'templates');
  const config = await openTemplates(page);
  const key = `e2e-conflict-${randomUUID().slice(0, 8)}`;
  await createTemplate(page, { key, title: '冲突模板', prompt: '本机版本' });
  await commitChanges(page, '本机新增模板');
  const detail = config.locator('app-admin-config-commit');
  await expect(detail).toContainText('已同步，待应用', { timeout: 30000 });

  await expect.poll(async () => (await workspaceTemplates(user.id)).rows.map(row => row.key)).toEqual([key]);
  const { workspaceId, rows } = await workspaceTemplates(user.id);
  const otherDevice = await admin.from('media_config_records').insert({
    workspace_id: workspaceId,
    branch_id: 'main',
    entity: 'MediaPromptTemplate',
    entity_id: rows[0]!.id,
    revision: 1,
    payload: { key, title: '另一台设备的版本', prompt: '先应用' },
    deleted: false,
    updated_by: user.id
  });
  expect(otherDevice.error).toBeNull();

  await detail.getByRole('button', { name: '应用提交', exact: true }).click();
  await expect(detail.getByRole('alert')).toContainText('冲突：数据版本已变化');
  await expect(config.locator('app-admin-config-state').getByRole('alert')).toHaveCount(0);
  await expect(detail).toContainText('已同步，待应用');
  const record = await admin
    .from('media_config_records')
    .select('payload')
    .eq('workspace_id', workspaceId)
    .eq('entity_id', rows[0]!.id)
    .single();
  expect(record.data?.payload).toEqual({ key, title: '另一台设备的版本', prompt: '先应用' });
});
