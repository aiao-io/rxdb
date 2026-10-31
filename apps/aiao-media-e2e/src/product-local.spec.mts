import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { localEnvironment } from '../../aiao-media/scripts/supabase-local.mjs';
import { endpoint, key, pngFixture, provider } from './local-first.helpers';

let admin: SupabaseClient;
const ids = new Set<string>();
test.beforeEach(({ page }) => {
  page.on('console', message => {
    console.log(`[browser:${message.type()}] ${message.location().url} ${message.text()}`);
  });
});
test.beforeAll(async () => {
  const local = await localEnvironment();
  admin = createClient(local.url, local.env['SERVICE_ROLE_KEY'], {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
});
test.afterEach(async () => {
  for (const id of ids) {
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
  await expect(page.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
  await expect(page.getByText('同步已确认', { exact: true })).toBeVisible();
  await expect(button).toBeDisabled();
}
test('真实登录不绑定，取消首次同步确认不上传或改变本机副本', async ({ page }) => {
  const user = await account();
  await page.goto('/create');
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
  await page.goto('/create');
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
  await page.goto('/create');
  await page.locator('[contenteditable=true]').fill('设备 A 的输入');
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  await signIn(page, user);
  await page.getByRole('button', { name: '启用同步', exact: true }).click();
  await page.getByRole('button', { name: '确认并启用同步' }).click();
  await expect(page.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
    await second.goto('/create');
    await second.locator('[contenteditable=true]').fill('未绑定设备 B 原始输入');
    await expect(second.getByText('输入已保存到本机', { exact: true })).toBeVisible();
    const unbound = await second.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
    await signIn(second, user);
    await second.getByRole('button', { name: '启用同步', exact: true }).click();
    await expect(second.getByText('此账号已有同步工作区', { exact: false })).toBeVisible();
    await second.getByRole('button', { name: '确认并启用同步' }).click();
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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

test('后台直达受保护，模板发布可读取且不覆盖本机草稿，角色撤销立即拒绝', async ({ page }) => {
  const user = await account();
  const templateId = `browser-${randomUUID()}`;
  await page.goto('/admin');
  await expect(page.getByText('请使用有效管理员账号登录。', { exact: true })).toBeVisible();
  await signIn(page, user);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.getByText('账号或权限已失效，远程操作已暂停。', { exact: true })).toBeVisible();
  expect((await admin.from('media_admin_memberships').insert({ user_id: user.id })).error).toBeNull();
  await page.getByRole('button', { name: '重新载入后台' }).click();
  await expect(page.getByRole('heading', { name: '用户列表', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
  try {
    await page.getByRole('button', { name: '模板', exact: true }).click();
    await page.getByRole('button', { name: '新建模板草稿' }).click();
    await page.getByLabel('模板标识', { exact: true }).fill(templateId);
    await page.getByLabel('标题', { exact: true }).fill('本地后台发布模板');
    await page.getByRole('button', { name: '校验并保存草稿' }).click();
    await expect(page.getByText('模板草稿已保存，尚未发布。', { exact: true })).toBeVisible();
    const row = page.locator('article').filter({ has: page.getByText(templateId, { exact: true }) });
    await row.getByRole('button', { name: '发布模板', exact: true }).click();
    await expect(page.getByText('模板已发布。', { exact: true })).toBeVisible();
    const published = await page.request.get('/api/templates');
    expect(published.status()).toBe(200);
    expect(
      (await published.json()).templates.some((row: { template: { id: string } }) => row.template.id === templateId)
    ).toBe(true);
    await page.getByRole('link', { name: '生成图片', exact: true }).click();
    await page.locator('[contenteditable=true]').fill('后台更新不能覆盖本机的输入');
    await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('[contenteditable=true]')).toContainText('后台更新不能覆盖本机的输入');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '用户列表', exact: true })).toBeVisible();
    expect(
      (await admin.from('media_admin_memberships').update({ enabled: false }).eq('user_id', user.id)).error
    ).toBeNull();
    await page.getByRole('button', { name: '重新载入后台' }).click();
    await expect(page.getByText('账号或权限已失效，远程操作已暂停。', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '用户列表', exact: true })).toHaveCount(0);
  } finally {
    await admin.from('media_public_content').delete().eq('kind', 'template').eq('key', templateId);
    await admin.from('media_content_drafts').delete().eq('kind', 'template').eq('key', templateId);
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
  await expect(page.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
    await page.goto('/create');
    await editDraft(page, '初始草稿');
    await enableReplica(page, user);
    const second = await context.newPage();
    await second.goto('/create');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toContainText('初始草稿');
    await context.setOffline(true);
    await editDraft(second, '离线第一版');
    await editDraft(second, '离线第二版');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByText('有待同步改动', { exact: true })).toBeVisible();
    await context.setOffline(false);
    await second.reload();
    await expect(second.locator('[contenteditable=true]')).toContainText('离线第二版');
    await second.getByRole('button', { name: '我的账号', exact: true }).click();
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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

test('供应商和作品信息跨副本同步但凭据原图留在本机，任务只在用户确认后上报', async ({ page, browser, baseURL }) => {
  const user = await account();
  const png = await pngFixture();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page, true);
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
  await editDraft(page, '不进入任务上报的私有提示词');
  await page.getByRole('button', { name: '✧ 生成图片', exact: false }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
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
    await second.goto('/create');
    await enableReplica(second, user);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await second.getByRole('link', { name: '我的图片', exact: true }).click();
    await expect(second.getByText('本机无原图', { exact: true })).toBeVisible();
    await expect(second.getByRole('link', { name: '下载图片', exact: false })).toHaveCount(0);
    await second.getByRole('link', { name: '供应商设置', exact: true }).click();
    await second.getByRole('button', { name: '编辑 / 填写 Key', exact: true }).click();
    await expect(second.getByLabel('API Key', { exact: true })).toHaveValue('');
    await expect(second.getByLabel('在此设备记住 Key')).not.toBeChecked();
  } finally {
    await context.close();
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
    await page.goto('/create');
    await editDraft(page, '重新扫描前的共同草稿');
    await enableReplica(page, user);
    const second = await context.newPage();
    await second.goto('/create');
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
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible({ timeout: 25000 });
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
    await expect(second.getByText('同步已确认', { exact: true })).toBeVisible();
    expect((await record()).data).toEqual(before);
    await second.getByRole('button', { name: '关闭账号窗口' }).click();
    await expect(second.locator('[contenteditable=true]')).toBeEmpty();
  } finally {
    await context.close();
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
  await page.route(endpoint, async route => {
    received();
    await gate;
    await route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } });
  });
  await provider(page);
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
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
  await expect(page.locator('main')).toBeHidden();
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
});
