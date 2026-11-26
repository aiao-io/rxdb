import { expect, test, type Page } from '@playwright/test';
import { switchIdentity } from './support/identity';
import { navigate, openSidePanel, pull, push } from './support/workbench';

/**
 * 顶栏 ↓N 的准数（US-230 阶段 B / US-233）：刷新之后不把自己推上去的修改算成待拉，分区仓库按真实条数数。
 *
 * @remarks
 * 断的是绝对数量：↓N 是整机对所有仓库的计数，Todo 与订单又是登录身份共享的，栈上有别人在写，数字就不准。
 * 所以这一组**单独一轮、串行跑**（`e2e-remote` 在其它远端用例跑完之后，以 `REMOTE_E2E_COUNTS=true --workers=1`
 * 跑这一个文件），与其它用例一起跑时整组跳过。共用栈上手动演示也会打乱数字，跑之前别在演示里写。
 */
const runsAlone = process.env['REMOTE_E2E'] === 'true' && process.env['REMOTE_E2E_COUNTS'] === 'true';

if (runsAlone) {
  test.describe('Pullable count accuracy', () => {
    test.describe.configure({ mode: 'serial' });
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    function pullableCount(page: Page) {
      return page.getByTestId('sync-pullable-count');
    }

    async function openAsAnonymous(page: Page, path: string, readyTestId: string): Promise<void> {
      await page.goto(path, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 60_000 });
      await switchIdentity(page, 'anonymous', '匿名用户', readyTestId);
    }

    /** 在「模拟服务端变更」里做一次操作，等这一次操作自己的提示出现 */
    async function serverAction(page: Page, run: () => Promise<void>, notice: string): Promise<void> {
      await run();
      await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible({ timeout: 30_000 });
    }

    function serverRow(page: Page, name: string) {
      return page.getByTestId('server-item').filter({ hasText: name });
    }

    function syncedItem(page: Page, name: string) {
      return page.locator('[data-bucket="tenant:xinghe"] [data-testid="synced-item"]').filter({ hasText: name });
    }

    /**
     * 删掉本轮建的商品（服务端）与客户（本机删再推）；用例中途失败时有的还没建出来，跳过
     *
     * @remarks
     * 失败时编辑框可能还开着：模态框挡住整个页面，先关上它。
     */
    async function removeCatalogRun(page: Page, items: readonly string[], customer: string): Promise<void> {
      const editor = page.getByRole('dialog', { name: '编辑商品' });
      if (await editor.isVisible()) await editor.getByRole('button', { name: '取消' }).click();
      await openSidePanel(page, 'server');
      for (const name of items) {
        if ((await serverRow(page, name).count()) === 0) continue;
        await serverAction(
          page,
          () => serverRow(page, name).getByRole('button', { name: '删除' }).click(),
          `「${name}」已删除`
        );
      }
      await navigate(page, '订单（关系数据同步）', '订单');
      const customerRow = page.getByTestId('customer').filter({ hasText: customer });
      if ((await customerRow.count()) === 0) return;
      await customerRow.getByRole('button', { name: '删除客户' }).click();
      await push(page);
    }

    /** 删掉别人推上去的那条 Todo 再推；用例中途失败时它可能还没建出来，跳过 */
    async function removeTodoIfPushed(page: Page, title: string): Promise<void> {
      const row = page.getByTestId('todo-item').filter({ hasText: title });
      if ((await row.count()) === 0) return;
      await row.getByRole('button', { name: '删除' }).click();
      await push(page);
    }

    test('AC#14、#15：自己推上去的不算待拉；别人改了一件租户商品，刷新后 ↓ 正好是 1，拉取后归零', async ({ page }) => {
      const serverItem = `e2e-${runId}-服务端商品`;
      const localItem = `e2e-${runId}-本机商品`;
      const customer = `e2e-${runId}-计数客户`;
      await openAsAnonymous(page, '/catalog', 'catalog-identity');
      await openSidePanel(page, 'server');
      await serverAction(page, () => page.getByRole('button', { name: '加入星河零售' }).click(), '已加入星河零售');

      try {
        // 服务端新增一件租户商品，拉到本机：此后 ↓ 归零，水位线在最新
        await page.getByPlaceholder('名称', { exact: true }).fill(serverItem);
        await page.getByLabel('分类', { exact: true }).selectOption('数码');
        await page.getByLabel('所属租户', { exact: true }).selectOption('xinghe');
        await page.getByLabel('可见范围', { exact: true }).selectOption('tenant');
        await serverAction(
          page,
          () => page.getByRole('button', { name: '新增', exact: true }).click(),
          `「${serverItem}」已新增`
        );
        await pull(page);
        await expect(syncedItem(page, serverItem)).toBeVisible();
        await expect(pullableCount(page)).toHaveCount(0);

        // 自己在本机写两条（商品与客户）并推上去：它们回到远端日志里，但不是「别人的修改」
        const form = page.getByTestId('catalog-create-form');
        await form.getByPlaceholder('新商品名称').fill(localItem);
        await form.getByLabel('新商品分类').selectOption('数码');
        await form.getByLabel('新商品所属租户').selectOption('xinghe');
        await form.getByLabel('新商品可见范围').selectOption('tenant');
        await form.getByRole('button', { name: '新建' }).click();
        await expect(syncedItem(page, localItem)).toBeVisible();
        await navigate(page, '订单（关系数据同步）', '订单');
        const customerForm = page.getByTestId('orders-customer-form');
        await customerForm.getByPlaceholder('客户名称').fill(customer);
        await customerForm.getByRole('button', { name: '新建客户' }).click();
        await expect(await push(page)).toContainText('推上去 2 条');

        // 「别人」改了那件租户商品：服务端直接写，日志里这一条不带本机的 clientId
        await navigate(page, '商品目录（按身份同步）', '商品目录');
        await openSidePanel(page, 'server');
        await serverRow(page, serverItem).getByRole('button', { name: '编辑' }).click();
        const editor = page.getByRole('dialog', { name: '编辑商品' });
        await editor.getByLabel('售价', { exact: true }).fill('321');
        await editor.getByRole('button', { name: '保存' }).click();
        await expect(editor).toBeHidden({ timeout: 30_000 });

        // AC#15：刷新后 ↓ 正好是 1——不含自己推上去的两条（US-233 修之前是 3），也不是分区水位线的 id 差
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(pullableCount(page)).toHaveText('1', { timeout: 60_000 });
        const center = await openSidePanel(page, 'sync');
        await expect(center.getByTestId('sync-center-loading')).toHaveCount(0, { timeout: 30_000 });
        await expect(center.locator('[data-testid="sync-center-repository"][data-entity="CatalogItem"]')).toContainText(
          '待拉 1'
        );
        // AC#14：自己推上去的客户不算待拉，客户那一行不出现
        await expect(center.locator('[data-testid="sync-center-repository"][data-entity="DemoCustomer"]')).toHaveCount(
          0
        );

        // 拉取后归零，改动落进本机
        await pull(page);
        await expect(pullableCount(page)).toHaveCount(0);
        await expect(syncedItem(page, serverItem)).toContainText('¥321');
      } finally {
        await removeCatalogRun(page, [serverItem, localItem], customer);
      }
    });

    test('AC#16：别人推了一条 Todo，不刷新与刷新各看一次，都是 ↓1', async ({ browser, page }) => {
      const title = `e2e-${runId}-别人推的Todo`;
      await openAsAnonymous(page, '/todo', 'todo-title');
      await pull(page);
      await expect(pullableCount(page)).toHaveCount(0);

      const otherContext = await browser.newContext();
      const other = await otherContext.newPage();
      try {
        await openAsAnonymous(other, new URL('/todo', page.url()).href, 'todo-title');
        await other.getByRole('textbox', { name: '添加新任务' }).fill(title);
        await other.getByRole('button', { name: '添加', exact: true }).click();
        await push(other);

        // 不刷新：实时事件把它记成 1 条待拉
        await expect(pullableCount(page)).toHaveText('1', { timeout: 30_000 });
        // 刷新：按远端日志重新数，还是 1 条
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(pullableCount(page)).toHaveText('1', { timeout: 60_000 });

        await pull(page);
        await expect(pullableCount(page)).toHaveCount(0);
        await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();
      } finally {
        await removeTodoIfPushed(other, title);
        await otherContext.close();
      }
    });
  });
}
