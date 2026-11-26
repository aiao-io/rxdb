import { expect, test, type Locator, type Page } from '@playwright/test';
import { switchIdentity } from './support/identity';
import { expectNoHorizontalScroll, navigate, openSidePanel, pull, push } from './support/workbench';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

const CATALOG_LINK = '商品目录（按身份同步）';
const ORDERS_LINK = '订单（关系数据同步）';

/**
 * 顶栏的工作台（epic-016）：三页登记同一组整机推拉，撤销、重做与操作历史写明本页，右侧面板同一时刻只开一个。
 *
 * 写入的身份用匿名用户：每个浏览器上下文都是一个新的匿名用户，不动预置账号 Alice、Bob 的数据。
 * 推上去的行带唯一后缀，结束时删掉再推一次；没推的修改留在用完即弃的浏览器上下文里，不进共用的栈。
 */
if (isRemoteE2E) {
  test.describe('Header workbench', () => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    /** 以匿名用户打开一页：切换身份会重新加载页面，打开这个匿名用户自己的库 */
    async function openAsAnonymous(page: Page, path: string, readyTestId: string): Promise<void> {
      await page.goto(path, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 60_000 });
      await switchIdentity(page, 'anonymous', '匿名用户', readyTestId);
    }

    async function addTodo(page: Page, title: string): Promise<Locator> {
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      const row = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(row).toBeVisible();
      return row;
    }

    async function addCustomer(page: Page, name: string): Promise<Locator> {
      const form = page.getByTestId('orders-customer-form');
      await form.getByPlaceholder('客户名称').fill(name);
      await form.getByRole('button', { name: '新建客户' }).click();
      const row = page.getByTestId('customer').filter({ hasText: name });
      await expect(row).toBeVisible();
      return row;
    }

    /** 右侧面板里某个页面的待推送分组 */
    function pendingGroup(panel: Locator, page: string): Locator {
      return panel.locator(`[data-testid="sync-center-pending-group"][data-page="${page}"]`);
    }

    /**
     * 删掉推上去的 Todo 与客户，再推一次
     *
     * @remarks
     * 用例中途失败时它们可能还没建出来或还没推上去：没有的跳过，没推的删掉也就是了，有待推送才推。
     */
    async function removePushed(page: Page, todo: string, customer: string): Promise<void> {
      await navigate(page, 'Todo', 'Todo');
      const todoRow = page.getByTestId('todo-item').filter({ hasText: todo });
      if ((await todoRow.count()) > 0) await todoRow.getByRole('button', { name: '删除' }).click();
      await navigate(page, ORDERS_LINK, '订单');
      const customerRow = page.getByTestId('customer').filter({ hasText: customer });
      if ((await customerRow.count()) > 0) await customerRow.getByRole('button', { name: '删除客户' }).click();
      if ((await page.getByTestId('sync-pushable-count').count()) > 0) await push(page);
    }

    /** 同步中心里某个实体的那一行 */
    function repositoryRow(panel: Locator, entity: string): Locator {
      return panel.locator(`[data-testid="sync-center-repository"][data-entity="${entity}"]`);
    }

    test('US-230 AC#1、#6 / US-231 AC#1：三页的顶栏一样，首页什么都不登记，页面里没有自己的推拉', async ({ page }) => {
      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('workbench-sync-group')).toBeVisible({ timeout: 60_000 });
      const content = page.locator('#layout-content');

      for (const [link, title, scope] of [
        ['Todo', 'Todo', '本页：Todo'],
        [CATALOG_LINK, '商品目录', '本页：商品'],
        [ORDERS_LINK, '订单', '本页：订单']
      ] as const) {
        await navigate(page, link, title);
        await expect(page.getByTestId('workbench-scope')).toHaveText(scope);
        for (const id of [
          'workbench-undo',
          'workbench-redo',
          'workbench-history-toggle',
          'sync-pull',
          'sync-push',
          'sync-center-toggle'
        ]) {
          await expect(page.getByTestId(id)).toBeVisible();
        }
        // 访客没有能推的修改：推送不可点，原因悬停与读屏都读得到（US-230 AC#6）
        await expect(page.getByTestId('sync-push')).toBeDisabled();
        await expect(page.getByTestId('sync-push')).toHaveAttribute('title', '没有待推送的修改');
        await expect(content.getByRole('button', { name: /^(拉取|推送|同步|Pull|Push)$/u })).toHaveCount(0);
        await expect(content.getByTestId('sync-rejections-panel')).toHaveCount(0);
      }

      await page.getByRole('link', { name: 'Home', exact: true }).click();
      await expect(page).toHaveURL(/\/home$/u);
      await expect(page.getByTestId('workbench-edit-group')).toHaveCount(0);
      await expect(page.getByTestId('workbench-sync-group')).toHaveCount(0);
    });

    test('US-230 AC#2、#17、#20、#21：在商品页推送，Todo 与订单页没推的修改一起推上去；另一个身份拉取后两页都看得到', async ({
      browser,
      page
    }) => {
      const todo = `e2e-${runId}-整机推送的Todo`;
      const customer = `e2e-${runId}-整机推送的客户`;
      await openAsAnonymous(page, '/todo', 'todo-title');

      try {
        await addTodo(page, todo);
        await navigate(page, ORDERS_LINK, '订单');
        await addCustomer(page, customer);

        // AC#21：操作历史里刚写的这条还没推，带 ↑
        const history = await openSidePanel(page, 'history');
        const written = history.getByTestId('operation-history-item').filter({ hasText: '新建客户' });
        await expect(written.locator('[data-testid="history-chip"][data-chip="pending"]')).toBeVisible();

        // AC#17：在商品页看，推送会带上别的页的修改：按页面分组、一个事务一项，项数之和等于顶栏 ↑N
        await navigate(page, CATALOG_LINK, '商品目录');
        await expect(page.getByTestId('sync-pushable-count')).toHaveText('2');
        const center = await openSidePanel(page, 'sync');
        await expect(center.getByTestId('sync-center-pending-group')).toHaveCount(2);
        await expect(pendingGroup(center, 'Todo').getByTestId('pending-history')).toHaveCount(1);
        await expect(pendingGroup(center, '订单').getByTestId('pending-history')).toHaveCount(1);

        // AC#2、#20：在商品页点推送，两条一起推上去；清单清空，与 ↑N 同时归零
        await expect(await push(page)).toContainText('推上去 2 条');
        await expect(page.getByTestId('sync-pushable-count')).toHaveCount(0);
        await expect(center.getByTestId('sync-center-pending-empty')).toBeVisible();

        // AC#21：回到订单页，那条还在操作历史里，↑ 标记没了
        await navigate(page, ORDERS_LINK, '订单');
        await openSidePanel(page, 'history');
        await expect(written).toHaveCount(1);
        await expect(written.locator('[data-testid="history-chip"][data-chip="pending"]')).toHaveCount(0);

        // AC#2：另一个浏览器的身份拉取后，Todo 页与订单页都看到这两条
        const otherContext = await browser.newContext();
        try {
          const other = await otherContext.newPage();
          await openAsAnonymous(other, new URL('/todo', page.url()).href, 'todo-title');
          await pull(other);
          await expect(other.getByTestId('todo-item').filter({ hasText: todo })).toBeVisible({ timeout: 30_000 });
          await navigate(other, ORDERS_LINK, '订单');
          await expect(other.getByTestId('customer').filter({ hasText: customer })).toBeVisible();
        } finally {
          await otherContext.close();
        }
      } finally {
        await removePushed(page, todo, customer);
      }
    });

    test('US-231 AC#2、#4 / US-230 AC#11、#20：撤销只撤本页；输入框里的 ⌘/Ctrl+Z 只撤文字；同步中心按实体列出待推', async ({
      page
    }) => {
      const item = `e2e-${runId}-本页撤销的商品`;
      const customer = `e2e-${runId}-本页撤销的客户`;
      const todo = `e2e-${runId}-本页撤销的Todo`;
      await openAsAnonymous(page, '/catalog', 'catalog-identity');
      await openSidePanel(page, 'server');
      await page.getByRole('button', { name: '加入星河零售' }).click();
      await expect(page.getByTestId('catalog-write-hint')).toContainText('推送之前可以撤销', { timeout: 30_000 });

      // 商品页本机新建一件内部商品，订单页新建一位客户
      const form = page.getByTestId('catalog-create-form');
      await form.getByPlaceholder('新商品名称').fill(item);
      await form.getByLabel('新商品分类').selectOption('数码');
      await form.getByLabel('新商品所属租户').selectOption('xinghe');
      await form.getByLabel('新商品可见范围').selectOption('tenant');
      await form.getByRole('button', { name: '新建' }).click();
      const itemRow = page
        .locator('[data-bucket="tenant:xinghe"] [data-testid="synced-item"]')
        .filter({ hasText: item });
      await expect(itemRow).toBeVisible();
      await navigate(page, ORDERS_LINK, '订单');
      const customerRow = await addCustomer(page, customer);

      // US-230 AC#11：在 Todo 页打开同步中心，客户与商品各一条待推，Todo 没有
      await navigate(page, 'Todo', 'Todo');
      const center = await openSidePanel(page, 'sync');
      await expect(repositoryRow(center, 'DemoCustomer')).toContainText('待推 1');
      await expect(repositoryRow(center, 'CatalogItem')).toContainText('待推 1');
      await expect(repositoryRow(center, 'Todo').filter({ hasText: /待推 [1-9]/u })).toHaveCount(0);

      // US-231 AC#4：Todo 页有一条可撤销的修改；焦点在输入框里时 ⌘/Ctrl+Z 只撤输入框里的文字
      const todoRow = await addTodo(page, todo);
      await expect(page.getByTestId('sync-pushable-count')).toHaveText('3');
      const input = page.getByRole('textbox', { name: '添加新任务' });
      await input.pressSequentially('abc');
      await input.press('ControlOrMeta+z');
      await expect(input).toHaveValue('');
      await expect(todoRow).toBeVisible();
      await expect(page.getByTestId('sync-pushable-count')).toHaveText('3');

      // US-231 AC#2：在商品页撤销只撤商品——Todo 是更晚的修改，也不动；撤掉的那条先离开待推送清单（US-230 AC#20）
      await navigate(page, CATALOG_LINK, '商品目录');
      await page.getByTestId('workbench-undo').click();
      await expect(itemRow).toHaveCount(0);
      await expect(page.getByTestId('sync-pushable-count')).toHaveText('2');
      await expect(pendingGroup(center, '商品目录')).toHaveCount(0);
      await expect(center.getByTestId('pending-history')).toHaveCount(2);

      // 回到 Todo 页，那条 Todo 还在；在这里撤销才撤掉它，订单页的客户不动
      await navigate(page, 'Todo', 'Todo');
      await expect(todoRow).toBeVisible();
      await page.getByTestId('workbench-undo').click();
      await expect(todoRow).toHaveCount(0);
      await navigate(page, ORDERS_LINK, '订单');
      await expect(customerRow).toBeVisible();
      await page.getByTestId('workbench-undo').click();
      await expect(customerRow).toHaveCount(0);
      await expect(page.getByTestId('sync-pushable-count')).toHaveCount(0);
      await expect(page.getByTestId('workbench-error')).toHaveCount(0);
    });

    test('US-230 AC#12 / US-231 AC#11：375px 窄屏顶栏只剩图标与数字、三页不横向滚动；右侧面板是带遮罩的抽屉，Esc 与点遮罩都能关', async ({
      page
    }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      for (const path of ['/todo', '/catalog', '/orders']) {
        await page.goto(path, { timeout: 60_000, waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('workbench-sync-group')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('sync-pull').getByText('拉取')).toBeHidden();
        await expect(page.getByTestId('workbench-undo').getByText('撤销')).toBeHidden();
        await expectNoHorizontalScroll(page);

        // 同步中心：盖住页面的抽屉，Esc 关上，焦点回到开关
        const center = await openSidePanel(page, 'sync');
        await expect(center).toHaveAttribute('aria-modal', 'true');
        await expect(page.getByTestId('side-panel-backdrop')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await page.keyboard.press('Escape');
        await expect(center).toHaveCount(0);
        await expect(page.getByTestId('sync-center-toggle')).toBeFocused();

        // 操作历史：点左边那条遮罩关上，焦点回到开关
        const history = await openSidePanel(page, 'history');
        await expect(history).toHaveAttribute('aria-modal', 'true');
        await page.getByTestId('side-panel-backdrop').click({ position: { x: 10, y: 400 } });
        await expect(history).toHaveCount(0);
        await expect(page.getByTestId('workbench-history-toggle')).toBeFocused();
      }
    });
  });
}
