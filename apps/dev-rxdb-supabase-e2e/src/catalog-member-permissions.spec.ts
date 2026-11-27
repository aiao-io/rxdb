import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { switchIdentity } from './support/identity';
import { memberRow, roleBadge, setRole, userIdOf, withTenantAdmin } from './support/members';
import { openSidePanel, pull, push, toast } from './support/workbench';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 租户内成员权限（US-234 AC#11～#15）：管理员能改、员工只能看，能不能写只由服务端裁决。
 *
 * Alice（星河零售的管理员）、Bob（极光百货的管理员）自己的权限一律不改：员工、升降权、降权后推送的场景用每次新建的
 * 匿名用户 X；Alice 加入极光百货的场景结束时退出，回到初始状态（加入之前就在的不动）。
 * 用例只在本机改演示数据里的商品，推送被拒，远端不变。商品按所属租户（`data-tenant-id`）与区（`data-bucket`）取，
 * 不依赖具体的商品名：共用栈上的演示数据可能被手动改过。
 */
if (isRemoteE2E) {
  test.describe('Catalog member permissions', () => {
    async function openCatalog(browser: Browser): Promise<Page> {
      const page = await (await browser.newContext()).newPage();
      await page.goto('/catalog', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('catalog-identity')).toBeVisible({ timeout: 60_000 });
      return page;
    }

    /** 本机同步的、属于某个租户的第一件商品（公开的或内部的） */
    function tenantItem(page: Page, tenantId: string): Locator {
      return page.locator(`[data-testid="synced-item"][data-tenant-id="${tenantId}"]`).first();
    }

    /** 本机同步的、某个租户区里的第一件内部商品：所在租户的成员（员工也算）全部同步 */
    function internalItem(page: Page, tenantId: string): Locator {
      return page.locator(`[data-bucket="tenant:${tenantId}"] [data-testid="synced-item"]`).first();
    }

    function writeButtons(row: Locator): Locator[] {
      return [
        row.getByRole('button', { name: '编辑', exact: true }),
        row.getByRole('button', { name: /^(公开|收回为内部)$/ }),
        row.getByRole('button', { name: '删除', exact: true })
      ];
    }

    async function expectWritable(row: Locator): Promise<void> {
      for (const button of writeButtons(row)) await expect(button).toBeEnabled();
      await expect(row.getByRole('button', { name: '历史' })).toBeVisible();
      await expect(row.getByTestId('synced-item-readonly')).toHaveCount(0);
    }

    async function expectStaffReadonly(row: Locator): Promise<void> {
      for (const button of writeButtons(row)) await expect(button).toBeDisabled();
      await expect(row.getByTestId('synced-item-readonly')).toHaveText('员工只读');
      await expect(row.getByRole('button', { name: '历史' })).toHaveCount(0);
    }

    /** 一行里「¥<售价> · 成本」的售价 */
    async function priceOf(row: Locator): Promise<string> {
      const price = /¥([\d.]+) · 成本/u.exec(await row.innerText())?.[1];
      if (!price) throw new Error('这一行没有售价');
      return price;
    }

    /** 匿名用户 X 自助加入极光百货：加入之后是员工 */
    async function joinJiguangAsStaff(page: Page): Promise<void> {
      await switchIdentity(page, 'anonymous', '匿名用户', 'catalog-identity');
      await openSidePanel(page, 'server');
      await page.getByRole('button', { name: '加入极光百货' }).click();
      await expect(toast(page, '已加入极光百货')).toBeVisible({ timeout: 30_000 });
      await expect(roleBadge(page, 'jiguang', '员工')).toBeVisible({ timeout: 30_000 });
      await pull(page);
    }

    /** 退出极光百货，不留下本轮的成员关系；用例中途失败时对话框可能还开着，先关掉 */
    async function leaveJiguang(page: Page): Promise<void> {
      if ((await page.locator('dialog[open]').count()) > 0) await page.keyboard.press('Escape');
      await openSidePanel(page, 'server');
      await page.getByRole('button', { name: '退出极光百货' }).click();
      await expect(toast(page, '已退出极光百货')).toBeVisible({ timeout: 30_000 });
    }

    /**
     * 让 Alice 在极光百货里（她在那儿是员工）
     *
     * @returns 收尾要做的事：本来不在就退出，回到初始状态；共用栈上手动演示时她可能已经在里面，那就不动
     */
    async function joinJiguangAsAlice(alice: Page, drawer: Locator): Promise<() => Promise<void>> {
      const join = drawer.getByRole('button', { name: '加入极光百货' });
      await expect(join.or(drawer.getByRole('button', { name: '退出极光百货' }))).toBeVisible({ timeout: 30_000 });
      if (!(await join.isVisible())) return () => Promise.resolve();
      await join.click();
      await expect(toast(alice, '已加入极光百货')).toBeVisible({ timeout: 30_000 });
      return () => leaveJiguang(alice);
    }

    test('AC#11 Bob 是极光百货的管理员：极光百货的商品能新建、编辑、删除、公开 / 收回，有「历史」', async ({
      browser
    }) => {
      const bob = await openCatalog(browser);
      await switchIdentity(bob, 'bob', 'Bob', 'catalog-identity');
      await expect(roleBadge(bob, 'jiguang', '管理员')).toBeVisible({ timeout: 30_000 });

      await pull(bob);

      await expectWritable(tenantItem(bob, 'jiguang'));
      const tenant = bob.getByTestId('catalog-create-form').getByLabel('新商品所属租户');
      await expect(tenant).toBeEnabled();
      await expect(tenant.locator('option[value="jiguang"]')).toHaveCount(1);
    });

    test('AC#12、#13 Alice 加入极光百货是员工：内部商品同步进本机、成本价可见，写入口与「历史」只留星河零售；顶栏的撤销、重做与推送不按角色禁用', async ({
      browser
    }) => {
      const alice = await openCatalog(browser);
      await switchIdentity(alice, 'alice', 'Alice', 'catalog-identity');
      const restore = await joinJiguangAsAlice(alice, await openSidePanel(alice, 'server'));

      try {
        await pull(alice);

        await expect(roleBadge(alice, 'xinghe', '管理员')).toBeVisible();
        await expect(roleBadge(alice, 'jiguang', '员工')).toBeVisible();
        const staffRow = internalItem(alice, 'jiguang');
        await expect(staffRow).toBeVisible();
        await expect(staffRow).not.toContainText('无权读取');
        await expectStaffReadonly(staffRow);
        await expectStaffReadonly(tenantItem(alice, 'jiguang'));
        await expectWritable(tenantItem(alice, 'xinghe'));
        const tenant = alice.getByTestId('catalog-create-form').getByLabel('新商品所属租户');
        await expect(tenant.locator('option')).toHaveText(['星河零售']);

        // AC#13：顶栏的编辑组与同步组不说「员工只读」，按各自的次数与状态可用
        for (const id of ['workbench-undo', 'workbench-redo', 'sync-push']) {
          await expect(alice.getByTestId(id)).not.toHaveAttribute('title', /员工只读/u);
        }
        await expect(alice.getByTestId('sync-push')).toHaveAttribute('title', '没有待推送的修改');
        await expect(alice.getByTestId('sync-pull')).toBeEnabled();
      } finally {
        await restore();
      }
    });

    test('AC#14 Bob 把 X 设为管理员、再设回员工：X 每次拉取之后写入口与「历史」跟着出现、消失；X 的「成员与权限」里没有改权限的按钮', async ({
      browser
    }) => {
      // 另开一个浏览器上下文登录管理员给成员授权（US-234），与 orders-sync 的多身份用例一样放宽超时
      test.slow();
      const x = await openCatalog(browser);
      await joinJiguangAsStaff(x);
      try {
        const userId = await userIdOf(x);
        const own = (await openSidePanel(x, 'server')).locator(
          '[data-testid="tenant-members"][data-tenant-id="jiguang"]'
        );
        await expect(own).toContainText('极光百货 · 员工');
        await expect(own.getByRole('button', { name: '管理员', exact: true })).toHaveCount(0);
        await expectStaffReadonly(tenantItem(x, 'jiguang'));

        await withTenantAdmin(browser, x, 'jiguang', async drawer => {
          await expect(memberRow(drawer, 'jiguang', userId)).toContainText('匿名用户');

          await setRole(drawer, 'jiguang', userId, '管理员');
          await pull(x);
          await expect(roleBadge(x, 'jiguang', '管理员')).toBeVisible();
          await expectWritable(tenantItem(x, 'jiguang'));

          await setRole(drawer, 'jiguang', userId, '员工');
          await pull(x);
          await expect(roleBadge(x, 'jiguang', '员工')).toBeVisible();
          await expectStaffReadonly(tenantItem(x, 'jiguang'));
        });
      } finally {
        await leaveJiguang(x);
      }
    });

    test('AC#15 X 当管理员时在本机改了极光百货的商品没推送，Bob 把他降为员工：推送被拒、本机对齐远端，之后写入口变灰', async ({
      browser
    }) => {
      // 另开一个浏览器上下文登录管理员给成员授权（US-234），与 orders-sync 的多身份用例一样放宽超时
      test.slow();
      const x = await openCatalog(browser);
      await joinJiguangAsStaff(x);
      try {
        const userId = await userIdOf(x);
        const row = tenantItem(x, 'jiguang');
        await withTenantAdmin(browser, x, 'jiguang', async drawer => {
          await setRole(drawer, 'jiguang', userId, '管理员');
          await pull(x);
          await expectWritable(row);
          const remotePrice = await priceOf(row);

          await row.getByRole('button', { name: '编辑', exact: true }).click();
          const editor = x.getByRole('dialog', { name: '编辑本机商品' });
          await editor.getByLabel('售价').fill('1');
          await editor.getByRole('button', { name: '保存' }).click();
          await expect(editor).toBeHidden({ timeout: 30_000 });
          await expect(row).toContainText('¥1 · 成本');
          await setRole(drawer, 'jiguang', userId, '员工');

          await expect(await push(x)).toContainText('被拒 1 条');

          await expect(row).toContainText(`¥${remotePrice} · 成本`);
        });
        await expectStaffReadonly(row);
        const rejections = (await openSidePanel(x, 'sync')).getByTestId('sync-rejections-panel');
        await expect(rejections).toContainText('CatalogItem');
        await expect(rejections).toContainText('42501');
      } finally {
        await leaveJiguang(x);
      }
    });
  });
}
