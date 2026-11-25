import { expect, test, type Browser, type Page } from '@playwright/test';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 商品的本机写入（US-034）：在本机增删改，推送之前撤销、重做，推送之后锁定；访客只读。
 * 远端变更历史（US-229）：推送之后能看到每次修改的前后值与操作者，入口只给能编辑的成员。
 *
 * 成员用匿名用户：每个浏览器上下文都是一个新的匿名用户，自助加入星河零售，不动预置账号 Alice、Bob 的成员关系。
 * 本轮新建的商品名带唯一后缀，结束时经「模拟服务端变更」删掉；演示数据里的其他商品只读不改。
 */
if (isRemoteE2E) {
  test.describe('Catalog local writes', () => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    /** 打开商品目录；`mutations` 记下这个页面发出的每个推送请求（`rxdb_mutations`） */
    async function openCatalog(browser: Browser, mutations: string[] = []): Promise<Page> {
      const page = await (await browser.newContext()).newPage();
      page.on('request', request => {
        if (request.url().includes('/rpc/rxdb_mutations')) mutations.push(request.url());
      });
      await page.goto('/catalog', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('catalog-identity')).toBeVisible({ timeout: 60_000 });
      return page;
    }

    /** 点「同步」并等这一轮结算：按钮上的轮数加一才算这一轮结束 */
    async function sync(page: Page): Promise<void> {
      const button = page.getByTestId('catalog-sync');
      const finished = Number(await button.getAttribute('data-sync-count'));
      await button.click();
      await expect(button).toHaveAttribute('data-sync-count', String(finished + 1), { timeout: 60_000 });
      await expect(page.getByTestId('catalog-sync-result')).toContainText('同步完成');
    }

    function serverRow(page: Page, name: string) {
      return page.getByTestId('server-item').filter({ hasText: name });
    }

    /** 删掉本轮建的商品；用例中途失败时它可能还没推上去，跳过 */
    async function deleteIfPushed(page: Page, name: string): Promise<void> {
      // 用例中途失败时对话框可能还开着：先关掉，免得挡住删除按钮、让清理的报错盖住真正的失败
      if ((await page.locator('dialog[open]').count()) > 0) await page.keyboard.press('Escape');
      if ((await serverRow(page, name).count()) === 0) return;
      await serverRow(page, name).getByRole('button', { name: '删除' }).click();
      await expect(page.getByRole('status').filter({ hasText: `「${name}」已删除` })).toBeVisible({ timeout: 30_000 });
    }

    test('AC#10 访客：本机的新建、编辑、删除、撤销、重做与推送都不可用，打开并同步商品目录不发推送请求', async ({
      browser
    }) => {
      const mutations: string[] = [];
      const visitor = await openCatalog(browser, mutations);
      await expect(visitor.getByTestId('identity-title')).toHaveText('访客');

      await sync(visitor);

      await expect(visitor.getByTestId('catalog-write-hint')).toContainText('访客只读');
      for (const id of ['catalog-undo', 'catalog-redo', 'catalog-push']) {
        await expect(visitor.getByTestId(id)).toBeDisabled();
      }
      const form = visitor.getByTestId('catalog-create-form');
      await expect(form.getByPlaceholder('新商品名称')).toBeDisabled();
      await expect(form.getByRole('button', { name: '新建' })).toBeDisabled();
      const row = visitor.getByTestId('synced-item').first();
      await expect(row).toBeVisible();
      for (const name of ['编辑', '删除']) {
        await expect(row.getByRole('button', { name })).toBeDisabled();
      }
      // US-229 AC#14：变更历史只对能编辑的成员开放，访客连入口都没有
      await expect(visitor.getByTestId('synced-item').getByRole('button', { name: '历史' })).toHaveCount(0);
      expect(mutations).toEqual([]);
    });

    test('成员在本机新建、改售价、撤销、重做之后推送：服务端收到改后的值，推送之后不能再撤销', async ({ browser }) => {
      const name = `e2e-${runId}-本机新建`;
      const member = await openCatalog(browser);
      await member.getByLabel('切换身份').selectOption('anonymous');
      await expect(member.getByTestId('identity-title')).toHaveText('匿名用户', { timeout: 60_000 });
      await member.getByRole('button', { name: '加入星河零售' }).click();
      await expect(member.getByTestId('catalog-write-hint')).toContainText('推送之前可以撤销', { timeout: 30_000 });

      try {
        // AC#1：本机新建一件租户内部商品，待推数加 1
        const form = member.getByTestId('catalog-create-form');
        await form.getByPlaceholder('新商品名称').fill(name);
        await form.getByLabel('新商品分类').selectOption('数码');
        await form.getByLabel('新商品所属租户').selectOption('xinghe');
        await form.getByLabel('新商品可见范围').selectOption('tenant');
        await form.getByRole('button', { name: '新建' }).click();
        await expect(member.getByTestId('catalog-write-notice')).toHaveText(`「${name}」已在本机新建`);
        const row = member
          .locator('[data-bucket="tenant:xinghe"] [data-testid="synced-item"]')
          .filter({ hasText: name });
        await expect(row).toBeVisible();
        await expect(member.getByTestId('catalog-pending-count')).toHaveText('1');

        // AC#2：改售价，撤销回到原值，重做回到新值
        await row.getByRole('button', { name: '编辑' }).click();
        const editor = member.getByRole('dialog', { name: '编辑本机商品' });
        await editor.getByLabel('售价').fill('123');
        await editor.getByRole('button', { name: '保存' }).click();
        await expect(editor).toBeHidden({ timeout: 30_000 });
        await expect(row).toContainText('¥123');
        await member.getByTestId('catalog-undo').click();
        await expect(row).toContainText('¥99');
        await member.getByTestId('catalog-redo').click();
        await expect(row).toContainText('¥123');

        // AC#4：推送之后撤销栈清空，服务端（重新打开页面后的「模拟服务端变更」）读到改后的值
        await member.getByTestId('catalog-push').click();
        await expect(member.getByTestId('catalog-write-notice')).toContainText('推送完成', { timeout: 60_000 });
        await expect(member.getByTestId('catalog-undo')).toBeDisabled();
        await member.reload({ waitUntil: 'domcontentloaded' });
        await expect(serverRow(member, name)).toContainText('¥123', { timeout: 60_000 });

        // US-229 AC#14：推送之后再改一次价、再推一次；变更历史按时间列出推上去的每次修改的前后值，操作者是自己。
        // 撤销掉又重做的那次改价只记一次：本机推送前摘掉了撤销的那一对
        await row.getByRole('button', { name: '编辑' }).click();
        await editor.getByLabel('售价').fill('150');
        await editor.getByRole('button', { name: '保存' }).click();
        await expect(editor).toBeHidden({ timeout: 30_000 });
        await member.getByTestId('catalog-push').click();
        await expect(member.getByTestId('catalog-write-notice')).toContainText('推送完成', { timeout: 60_000 });

        await row.getByRole('button', { name: '历史' }).click();
        const history = member.getByRole('dialog', { name: `变更历史 · ${name}` });
        const entries = history.getByTestId('history-entry');
        await expect(entries).toHaveCount(3, { timeout: 30_000 });
        await expect(entries.nth(0)).toContainText('新建 · 本机推送');
        await expect(entries.nth(0)).toContainText('售价：— → 99');
        await expect(entries.nth(1)).toContainText('修改 · 本机推送');
        await expect(entries.nth(1)).toContainText('售价：99 → 123');
        await expect(entries.nth(2)).toContainText('修改 · 本机推送');
        await expect(entries.nth(2)).toContainText('售价：123 → 150');
        await expect(entries.nth(2)).not.toContainText('名称');
        for (const entry of await entries.all()) await expect(entry).toContainText('· 我');
        await history.getByRole('button', { name: '关闭' }).click();
        await expect(history).toBeHidden();
      } finally {
        await deleteIfPushed(member, name);
      }
    });
  });
}
