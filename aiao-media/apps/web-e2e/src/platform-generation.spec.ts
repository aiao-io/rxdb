import { expect, test } from '@playwright/test';
import { backupText, downloadBackup, pngFixture, prompt, verifyImageDownload } from './local-first.helpers';
import { platformAccount, platformModel, setupPlatform, taskFixture } from './platform-fixture';

test.use({ serviceWorkers: 'block' });

test('常规 fixture 服务不读取真实账号套件留下的开发配置', async ({ request }) => {
  const response = await request.get('/api/installation');
  expect(response.ok()).toBe(true);
  const state = (await response.json()) as { initialized: boolean; auth: unknown };
  expect(state.initialized).toBe(true);
  expect(state.auth === null).toBe(true);
});

test('重复初始化平台 fixture 保留同一会话和账本状态', async ({ context }) => {
  const original = await setupPlatform(context);
  const issued =
    (JSON.parse(Buffer.from(original.token.split('.')[1], 'base64url').toString()) as { exp: number }).exp - 3600;
  original.balance = 40;
  await expect.poll(() => Math.floor(Date.now() / 1000)).toBeGreaterThan(issued);

  const repeated = await setupPlatform(context, { protocol: 'minimax' });

  expect(repeated.token === original.token).toBe(true);
  expect(repeated.balance).toBe(40);
});

test('未登录可以编辑草稿，生成引导平台登录，不出现 Key 配置', async ({ context, page }) => {
  await setupPlatform(context, { signedIn: false });
  const relay = await taskFixture(context, () => {
    throw new Error('未登录不应生成');
  });
  await page.goto('/create');
  await page.getByRole('textbox', { name: '创意描述' }).fill('未登录的本机草稿');
  await page.getByRole('button', { name: '登录后生成图片' }).click();
  await expect(page.getByRole('dialog', { name: '我的账号' }).getByRole('heading', { name: '登录账号' })).toBeVisible();
  expect(relay.calls).toBe(0);
  await expect(page.locator('#provider-key, #provider-base')).toHaveCount(0);
});

test('积分为零明确阻止接单且不创建任务', async ({ context, page }) => {
  await setupPlatform(context, { balance: 0 });
  const relay = await taskFixture(context, () => {
    throw new Error('余额不足不应生成');
  });
  await platformAccount(page);
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByRole('alert')).toContainText('可用积分不足');
  expect(relay.calls).toBe(0);
  expect(relay.account.balance).toBe(0);
  expect(relay.tasks.size).toBe(0);
});

test('成功后仅消费模型配置积分，流水与任务一致，备份不含会话和设备令牌', async ({ context, page }) => {
  const account = await setupPlatform(context, { balance: 10 });
  const png = await pngFixture();
  const relay = await taskFixture(context, () => ({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await platformAccount(page);
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
  await expect.poll(() => relay.account.balance).toBe(7);
  expect(account.entries).toHaveLength(1);
  expect(account.entries[0].delta).toBe(-platformModel.credits);
  await page.goto('/images');
  await verifyImageDownload(page, page.locator('.library-card'), png);
  const backup = backupText(await downloadBackup(page));
  expect(backup).not.toContain(account.token);
  expect(backup).not.toContain('fixture-platform-refresh');
  expect(backup).not.toContain('relay-tasks-v1');
  expect(backup).not.toContain('generation-auth.example.test');
  await page.goto('/create');
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('region', { name: '平台积分' })).toContainText('可用积分 7');
  expect(relay.calls).toBe(1);
});

for (const status of [401, 502]) {
  test(`上游 HTTP ${status} 不消费积分，不重复生成`, async ({ context, page }) => {
    await setupPlatform(context, { balance: 10 });
    const relay = await taskFixture(context, () => ({ status, json: { error: 'private-provider-key' } }));
    await platformAccount(page);
    await prompt(page);
    await page.getByRole('button', { name: '✧ 生成图片' }).click();
    await expect(
      page.getByRole('heading', { name: status === 401 ? '这次图片没有生成成功' : '请核对平台任务' })
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('body')).not.toContainText('private-provider-key');
    expect(relay.account.balance).toBe(10);
    expect(relay.account.reserved).toBe(0);
    expect(relay.account.entries).toHaveLength(0);
    expect(relay.calls).toBe(1);
  });
}

test('校验失败释放预占，不扣积分、不保存假图片', async ({ context, page }) => {
  await setupPlatform(context, { balance: 10 });
  const png = await pngFixture();
  const relay = await taskFixture(context, () => ({
    json: { data: [{ b64_json: png.subarray(0, 33).toString('base64') }] }
  }));
  await platformAccount(page);
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByRole('heading', { name: '请核对平台任务' })).toBeVisible();
  expect(relay.account.balance).toBe(10);
  expect(relay.account.reserved).toBe(0);
  expect(relay.account.entries).toHaveLength(0);
  expect(relay.calls).toBe(1);
});

test('接单后关闭页面，新页面只凭原令牌恢复一次扣费与原图', async ({ context, page }) => {
  await setupPlatform(context, { balance: 10 });
  const png = await pngFixture();
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  const relay = await taskFixture(context, async () => {
    await pending;
    return { json: { data: [{ b64_json: png.toString('base64') }] } };
  });
  await platformAccount(page);
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect.poll(() => relay.calls).toBe(1);
  expect(relay.account.balance).toBe(10);
  expect(relay.account.reserved).toBe(3);
  await page.close();
  const next = await context.newPage();
  await next.goto('/create');
  release();
  await expect(next.getByText('已保存到本机', { exact: true })).toBeVisible();
  expect(relay.account.balance).toBe(7);
  expect(relay.account.entries).toHaveLength(1);
  await next.goto('/images');
  await verifyImageDownload(next, next.locator('.library-card'), png);
  expect(relay.calls).toBe(1);
});
