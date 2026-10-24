import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
// Node-only Compose helpers are shared with the SDK/RLS probes.
import { localEnvironment, type LocalSupabaseEnvironment } from '../../aiao-media/scripts/supabase-local.mjs';
import { confirmLocalEmail } from '../../aiao-media/scripts/test-supabase-local.mjs';

let local: LocalSupabaseEnvironment;
let admin: SupabaseClient;
const temporaryAccounts = new Set<string>();
const mailboxes = new Set<string>();

function credentials() {
  const email = `aiao-browser-${randomUUID()}@example.test`;
  mailboxes.add(email.split('@')[0]);
  return { email, password: randomBytes(24).toString('hex') };
}
async function confirmedAccount() {
  const account = credentials();
  const { data, error } = await admin.auth.admin.createUser({
    ...account,
    email_confirm: true
  });
  if (error) throw new Error('Could not create a disposable local Auth account.');
  temporaryAccounts.add(data.user.id);
  return account;
}
async function openLogin(page: Page) {
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
}
async function fillCredentials(page: Page, account: { email: string; password: string }) {
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('密码', { exact: true }).fill(account.password);
}
async function signIn(page: Page, account: { email: string; password: string }) {
  await openLogin(page);
  await fillCredentials(page, account);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
}
async function saveDraft(page: Page, text: string) {
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await editor.fill(text);
  await expect(page.getByText('输入已保存到本机', { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  local = await localEnvironment();
  // The administrative client is only used by the Node runner for disposable
  // users. Browser requests receive the generated public anon configuration.
  admin = createClient(local.url, local.env['SERVICE_ROLE_KEY'], {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
});
test.afterEach(async () => {
  // Only remove accounts and mailboxes created by this test run.
  const failures: string[] = [];
  for (const id of temporaryAccounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push(id);
    else temporaryAccounts.delete(id);
  }
  for (const mailbox of mailboxes)
    await fetch(`${local.mailUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}`, {
      method: 'DELETE'
    });
  mailboxes.clear();
  expect(failures, 'Disposable local accounts must be cleaned up').toEqual([]);
});
test.afterAll(async () => {
  await admin?.removeAllChannels();
});

test('真实邮箱注册、确认、登录、刷新和退出保留本机草稿', async ({ page }) => {
  const account = credentials();
  await page.goto('/create');
  await saveDraft(page, '真实账号登录前的本机草稿');
  const profile = await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'));
  await openLogin(page);
  await page.getByRole('button', { name: '还没有账号？注册' }).click();
  await fillCredentials(page, account);
  const signup = page.waitForResponse(
    response => response.url() === `${local.url}/auth/v1/signup` && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: '注册', exact: true }).click();
  const response = await signup;
  const body = await response.json();
  const id = body.user?.id ?? body.id;
  if (typeof id === 'string') temporaryAccounts.add(id);
  expect(response.ok()).toBe(true);
  expect(typeof id).toBe('string');
  await expect(page.getByText('请检查邮箱并完成确认，然后回来登录。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '已有账号？登录' }).click();
  await fillCredentials(page, account);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('请先完成邮箱确认，再登录。')).toBeVisible();
  await confirmLocalEmail(local.mailUrl, account.email);
  await fillCredentials(page, account);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toContainText('真实账号登录前的本机草稿');
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toContainText('真实账号登录前的本机草稿');
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-profile-v1'))).toBe(profile);
});

test('真实错误密码提示与 Auth 断网恢复不阻断本机编辑', async ({ page, context }) => {
  const account = await confirmedAccount();
  await page.goto('/create');
  await openLogin(page);
  await fillCredentials(page, {
    ...account,
    password: 'deliberately-wrong-password'
  });
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByText('邮箱或密码不正确。')).toBeVisible();
  await expect(page.getByLabel('密码', { exact: true })).toHaveValue('');
  await fillCredentials(page, account);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  // Fail only the Auth network; all successful Auth responses use the real stack.
  const endpoint = `${local.url}/auth/v1/**`;
  await context.route(endpoint, route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('button', { name: '账号待验证', exact: true })).toBeVisible();
  await saveDraft(page, '账号服务断网时继续本机编辑');
  await context.unroute(endpoint);
  await page.getByRole('button', { name: '账号待验证', exact: true }).click();
  await page.getByRole('button', { name: '重新验证会话' }).click();
  await expect(page.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  await expect(page.locator('[contenteditable="true"]')).toContainText('账号服务断网时继续本机编辑');
});

test('真实账号跨标签退出生效且会话凭据不进入本机备份', async ({ page, context }) => {
  const account = await confirmedAccount();
  const remoteWrites: string[] = [];
  page.on('request', request => {
    if (request.url().startsWith(`${local.url}/rest/`)) remoteWrites.push(request.url());
  });
  await page.goto('/providers');
  await signIn(page, account);
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith('aiao-media-supabase-session-v1:'));
    const stored = key ? localStorage.getItem(key) : null;
    return stored ? JSON.parse(stored) : null;
  });
  expect(session?.access_token).toBeTruthy();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出本机备份', exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error('Local backup download is missing.');
  const backup = await readFile(path, 'utf8');
  for (const secret of [
    session.access_token,
    session.refresh_token,
    account.email,
    account.password,
    local.env['SERVICE_ROLE_KEY']
  ])
    expect(backup).not.toContain(secret);
  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(second.getByRole('button', { name: '登录账号', exact: true })).toBeVisible();
  expect(remoteWrites).toEqual([]);
  await second.close();
});
