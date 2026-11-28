import { expect, test, type Browser, type Page } from '@playwright/test';
import { promoteToAdmin } from './support/members';
import { openSidePanel, pull, push, toast } from './support/workbench';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 商品的本机写入（US-034）：在本机增删改，推送之前撤销、重做，推送之后锁定；访客只读。
 * 远端变更历史（US-229）：推送之后能看到每次修改的前后值与操作者，入口只给能编辑的成员。
 *
 * 成员用匿名用户：每个浏览器上下文都是一个新的匿名用户，自助加入星河零售，不动预置账号 Alice、Bob 的成员关系。
 * 自助加入只是员工（US-234）：要写商品，先由星河零售的管理员 Alice 在另一个浏览器上下文里把他设为管理员。
 * 本轮新建的商品名带唯一后缀，结束时经「模拟服务端变更」删掉；演示数据里的其他商品只读不改。
 *
 * 撤销、重做、拉取与推送都在顶栏（epic-016）：撤销、重做只作用于商品，推拉是整机的。
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

    function serverRow(page: Page, name: string) {
      return page.getByTestId('server-item').filter({ hasText: name });
    }

    /** 删掉本轮建的商品；用例中途失败时它可能还没推上去，跳过 */
    async function deleteIfPushed(page: Page, name: string): Promise<void> {
      // 用例中途失败时对话框可能还开着：先关掉，免得挡住删除按钮、让清理的报错盖住真正的失败
      if ((await page.locator('dialog[open]').count()) > 0) await page.keyboard.press('Escape');
      await openSidePanel(page, 'server');
      if ((await serverRow(page, name).count()) === 0) return;
      await serverRow(page, name).getByRole('button', { name: '删除' }).click();
      await expect(toast(page, `「${name}」已删除`)).toBeVisible({ timeout: 30_000 });
    }

    test('AC#10 访客：本机的新建、编辑、删除、撤销、重做与推送都不可用，打开并同步商品目录不发推送请求', async ({
      browser
    }) => {
      const mutations: string[] = [];
      const visitor = await openCatalog(browser, mutations);
      await expect(visitor.getByTestId('identity-title')).toHaveText('访客');

      await pull(visitor);

      // 顶栏的撤销、重做不可点，原因是访客只读（US-231 AC#6）；推送不可点，原因是没有待推送的修改（US-230 AC#6）
      await expect(visitor.getByTestId('catalog-write-hint')).toContainText('访客只读');
      for (const id of ['workbench-undo', 'workbench-redo']) {
        await expect(visitor.getByTestId(id)).toBeDisabled();
        await expect(visitor.getByTestId(id)).toHaveAttribute('title', /访客只读/);
      }
      await expect(visitor.getByTestId('sync-push')).toBeDisabled();
      await expect(visitor.getByTestId('sync-push')).toHaveAttribute('title', '没有待推送的修改');
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
      // 另开一个浏览器上下文登录管理员给成员授权（US-234），与 orders-sync 的多身份用例一样放宽超时
      test.slow();
      const name = `e2e-${runId}-本机新建`;
      const member = await openCatalog(browser);
      await member.getByLabel('切换身份').selectOption('anonymous');
      await expect(member.getByTestId('identity-title')).toHaveText('匿名用户', { timeout: 60_000 });
      await openSidePanel(member, 'server');
      await member.getByRole('button', { name: '加入星河零售' }).click();
      await expect(toast(member, '已加入星河零售')).toBeVisible({ timeout: 30_000 });
      await promoteToAdmin(browser, member);
      await expect(member.getByTestId('catalog-write-hint')).toContainText('推送之前可以撤销', { timeout: 30_000 });

      try {
        // AC#1：本机新建一件租户内部商品，待推数加 1
        const form = member.getByTestId('catalog-create-form');
        await form.getByPlaceholder('新商品名称').fill(name);
        await form.getByLabel('新商品分类').selectOption('数码');
        await form.getByLabel('新商品所属租户').selectOption('xinghe');
        await form.getByLabel('新商品可见范围').selectOption('tenant');
        await form.getByRole('button', { name: '新建' }).click();
        await expect(toast(member, `「${name}」已在本机新建`)).toBeVisible();
        const row = member
          .locator('[data-bucket="tenant:xinghe"] [data-testid="synced-item"]')
          .filter({ hasText: name });
        await expect(row).toBeVisible();
        await expect(member.getByTestId('sync-pushable-count')).toHaveText('1');

        // AC#2：改售价，撤销回到原值，重做回到新值
        await row.getByRole('button', { name: '编辑' }).click();
        const editor = member.getByRole('dialog', { name: '编辑本机商品' });
        await editor.getByLabel('售价').fill('123');
        await editor.getByRole('button', { name: '保存' }).click();
        await expect(editor).toBeHidden({ timeout: 30_000 });
        await expect(row).toContainText('¥123');
        await member.getByTestId('workbench-undo').click();
        await expect(row).toContainText('¥99');
        await member.getByTestId('workbench-redo').click();
        await expect(row).toContainText('¥123');

        // US-231 AC#3：焦点不在输入框里时，⌘/Ctrl+Z 与 ⌘/Ctrl+Shift+Z 与点按钮同效
        await member.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await member.keyboard.press('ControlOrMeta+z');
        await expect(row).toContainText('¥99');
        await member.keyboard.press('ControlOrMeta+Shift+z');
        await expect(row).toContainText('¥123');

        // AC#4：推送之后撤销栈清空，服务端（重新打开页面后的「模拟服务端变更」）读到改后的值；
        // 撤销不可点并说明原因（US-231 AC#5）
        const pushed = await push(member);
        await expect(pushed).toContainText('推送前的修改不能再撤销');
        await expect(member.getByTestId('workbench-undo')).toBeDisabled();
        await expect(member.getByTestId('workbench-undo')).toHaveAttribute('title', /不能再撤销/);
        await member.reload({ waitUntil: 'domcontentloaded' });
        await openSidePanel(member, 'server');
        await expect(serverRow(member, name)).toContainText('¥123', { timeout: 60_000 });

        // US-229 AC#14：推送之后再改一次价、再推一次；变更历史按时间列出推上去的每次修改的前后值，操作者是自己。
        // 撤销掉又重做的那次改价只记一次：本机推送前摘掉了撤销的那一对
        await row.getByRole('button', { name: '编辑' }).click();
        await editor.getByLabel('售价').fill('150');
        await editor.getByRole('button', { name: '保存' }).click();
        await expect(editor).toBeHidden({ timeout: 30_000 });
        await push(member);

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
