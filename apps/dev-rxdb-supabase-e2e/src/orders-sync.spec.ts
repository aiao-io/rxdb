import { expect, test, type Browser, type Page } from '@playwright/test';
import { switchIdentity } from './support/identity';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 订单：关系数据的推拉同步（US-227）——客户 1—n 订单 1—n 订单项，订单项 n—n 分类，客户 1—1 证件（互相引用），
 * Alice 与 Bob 各开一个浏览器。
 *
 * 已登录身份共享全部订单（`supabase/orders-demo.sql`）。本轮的客户、单号、商品名、分类名与证件号带唯一后缀，结束时删掉
 * 本轮的客户（订单、订单项、关联行与证件随之级联删除）和分类；不依赖库里已有的数据，也不动别人的行。
 */
if (isRemoteE2E) {
  test.describe('Orders relational sync', () => {
    // 这些用例读写同一批演示表，Bob 还会从头拉一遍全部订单：本地全并行时，一个用例推到一半，另一个用例从头拉取就会撞上
    // 删除与修改分两次请求推送的窗口（见 sync.md「推送顺序」）。按顺序在一个 worker 里跑，清理也只跑一次（与 CI 一致）
    test.describe.configure({ mode: 'default' });
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const customer = `e2e-${runId}-客户`;
    const orderNumber = `e2e-${runId}-SO1`;
    const rejectedNumber = `e2e-${runId}-SO2`;
    const earphone = `e2e-${runId}-耳机`;
    const band = `e2e-${runId}-手环`;
    // 阶段 B（多对多）用自己的客户、订单与分类，与阶段 A 的用例互不影响
    const categoryCustomer = `e2e-${runId}-分类客户`;
    const categoryOrder = `e2e-${runId}-SO3`;
    const categorizedItem = `e2e-${runId}-充电宝`;
    const digital = `e2e-${runId}-数码`;
    const gift = `e2e-${runId}-礼品`;
    const shared = `e2e-${runId}-共享`;
    // 阶段 C（双向一对一）用自己的客户与证件
    const cardCustomer = `e2e-${runId}-证件客户`;
    const cardCode = `e2e-${runId}-ID`;

    /** 打开订单页；`mutations` 记下这个页面发出的每个推送请求（`rxdb_mutations`） */
    async function openOrders(browser: Browser, mutations: string[] = []): Promise<Page> {
      const page = await (await browser.newContext()).newPage();
      page.on('request', request => {
        if (request.url().includes('/rpc/rxdb_mutations')) mutations.push(request.url());
      });
      await page.goto('/orders', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('orders-sync')).toBeVisible({ timeout: 60_000 });
      return page;
    }

    async function openAs(browser: Browser, choice: 'alice' | 'bob', title: string): Promise<Page> {
      const page = await openOrders(browser);
      await switchIdentity(page, choice, title, 'orders-sync');
      return page;
    }

    /** 点「推送」或「拉取」并等这一轮结算：轮数加一才算结束，不会被上一轮留下的结果骗过 */
    async function syncRound(page: Page, button: 'orders-push' | 'orders-pull', done: string): Promise<void> {
      const section = page.getByTestId('orders-sync');
      const finished = Number(await section.getAttribute('data-sync-count'));
      await page.getByTestId(button).click();
      await expect(section).toHaveAttribute('data-sync-count', String(finished + 1), { timeout: 60_000 });
      await expect(page.getByTestId('orders-sync-notice')).toContainText(done);
    }

    const push = (page: Page) => syncRound(page, 'orders-push', '推送完成');
    const pull = (page: Page) => syncRound(page, 'orders-pull', '拉取完成');

    function customerRow(page: Page, name: string) {
      return page.getByTestId('customer').filter({ hasText: name });
    }

    function orderRow(page: Page, number: string) {
      return page.locator(`[data-testid="order"][data-order-number="${number}"]`);
    }

    async function createCustomer(page: Page, name: string): Promise<void> {
      const form = page.getByTestId('orders-customer-form');
      await form.getByPlaceholder('客户名称').fill(name);
      await form.getByRole('button', { name: '新建客户' }).click();
      await expect(customerRow(page, name)).toBeVisible();
    }

    /** 新建客户时填上证件号码：客户与证件在同一批里新建、互相引用 */
    async function createCustomerWithIdCard(page: Page, name: string, code: string): Promise<void> {
      const form = page.getByTestId('orders-customer-form');
      await form.getByPlaceholder('客户名称').fill(name);
      await form.getByLabel('证件号码').fill(code);
      await form.getByRole('button', { name: '新建客户' }).click();
      await expect(customerRow(page, name).getByTestId('customer-id-card')).toHaveText(`证件：${code}`);
    }

    async function createOrder(page: Page, customerName: string, number: string): Promise<void> {
      const form = page.getByTestId('orders-order-form');
      await form.getByLabel('订单的客户').selectOption({ label: customerName });
      await form.getByPlaceholder('单号').fill(number);
      await form.getByRole('button', { name: '新建订单' }).click();
      await expect(orderRow(page, number)).toBeVisible();
    }

    async function addItem(page: Page, number: string, productName: string, quantity: number, price: number) {
      const form = orderRow(page, number).getByTestId('order-item-form');
      await form.getByPlaceholder('商品名称').fill(productName);
      await form.getByLabel('数量').fill(String(quantity));
      await form.getByLabel('单价').fill(String(price));
      await form.getByRole('button', { name: '加订单项' }).click();
      await expect(orderRow(page, number).getByTestId('order-item').filter({ hasText: productName })).toBeVisible();
    }

    function categoryRow(page: Page, name: string) {
      return page.getByTestId('category').filter({ hasText: name });
    }

    async function createCategory(page: Page, name: string): Promise<void> {
      const form = page.getByTestId('orders-category-form');
      await form.getByPlaceholder('分类名称').fill(name);
      await form.getByRole('button', { name: '新建分类' }).click();
      await expect(categoryRow(page, name)).toBeVisible();
    }

    function itemCategories(page: Page, productName: string) {
      return page.getByTestId('order-item').filter({ hasText: productName }).getByTestId('order-item-categories');
    }

    async function attach(page: Page, productName: string, categoryName: string): Promise<void> {
      const form = page
        .getByTestId('order-item')
        .filter({ hasText: productName })
        .getByTestId('order-item-category-form');
      await form.getByLabel('挂上分类').selectOption({ label: categoryName });
      await form.getByRole('button', { name: '挂上' }).click();
      await expect(itemCategories(page, productName)).toContainText(categoryName);
    }

    async function detach(page: Page, productName: string, categoryName: string): Promise<void> {
      const row = page.getByTestId('order-item').filter({ hasText: productName });
      await row.getByRole('button', { name: `摘掉分类 ${categoryName}` }).click();
      await expect(itemCategories(page, productName)).not.toContainText(categoryName);
    }

    /** 删掉本机还在的那些行；返回删了几行 */
    async function removeRows(rows: ReturnType<Page['getByTestId']>[], button: string): Promise<number> {
      let removed = 0;
      for (const row of rows) {
        if ((await row.count()) === 0) continue;
        await row.getByRole('button', { name: button }).click();
        await expect(row).toHaveCount(0);
        removed += 1;
      }
      return removed;
    }

    // 用例中途失败时本轮的客户与分类可能还在远端：另开一个 Alice 的页面拉取，还在就删掉
    // （订单、订单项、关联行与证件随之级联删除）。放在 afterAll 而不是用例的 finally：清理出错时单独报出，不盖住用例本身的失败
    test.afterAll(async ({ browser }) => {
      const page = await openAs(browser, 'alice', 'Alice');
      await pull(page);
      const removed =
        (await removeRows(
          [customer, categoryCustomer, cardCustomer].map(name => customerRow(page, name)),
          '删除客户'
        )) +
        (await removeRows(
          [digital, gift, shared].map(name => categoryRow(page, name)),
          '删除分类'
        ));
      if (removed > 0) await push(page);
    });

    test('AC#1～#4 Alice 推送客户、订单与订单项，Bob 拉取；删订单级联删订单项；客户已在远端删掉时新订单以依赖被拒', async ({
      browser
    }) => {
      test.slow();
      const alice = await openAs(browser, 'alice', 'Alice');
      const bob = await openAs(browser, 'bob', 'Bob');

      // AC#1：子在前声明的实体照样按外键顺序推上去（US-037），一条都不被拒
      await createCustomer(alice, customer);
      await createOrder(alice, customer, orderNumber);
      await addItem(alice, orderNumber, earphone, 2, 10);
      await addItem(alice, orderNumber, band, 1, 5);
      await expect(orderRow(alice, orderNumber).getByTestId('order-total')).toHaveText('¥25');
      await push(alice);
      await expect(alice.getByTestId('orders-sync-notice')).toHaveText('推送完成：推上去 4 条');
      await expect(alice.getByTestId('sync-rejections-panel')).toContainText('最近没有被远端拒绝的推送');
      await expect(alice.getByTestId('orders-pending-count')).toHaveText('0');

      // AC#2：Bob 拉到同一位客户、同一张订单与两条订单项，外键对得上（订单项挂在订单下、订单显示客户名）
      await pull(bob);
      await expect(customerRow(bob, customer)).toBeVisible();
      const bobOrder = orderRow(bob, orderNumber);
      await expect(bobOrder.getByTestId('order-customer')).toHaveText(`客户：${customer}`);
      await expect(bobOrder.getByTestId('order-item')).toHaveCount(2);
      await expect(bobOrder.getByTestId('order-total')).toHaveText('¥25');

      // AC#3：Alice 删订单并推送，订单项随之删掉；Bob 拉取之后订单与订单项都不在了，客户还在
      await orderRow(alice, orderNumber).getByRole('button', { name: '删除订单' }).click();
      await expect(orderRow(alice, orderNumber)).toHaveCount(0);
      await push(alice);
      await pull(bob);
      await expect(orderRow(bob, orderNumber)).toHaveCount(0);
      await expect(bob.getByTestId('order-item').filter({ hasText: earphone })).toHaveCount(0);
      await expect(customerRow(bob, customer)).toBeVisible();

      // AC#4：Bob 在远端删掉客户；Alice 还没拉取，给这位客户新建订单并推送，以依赖被拒，本机对齐成远端的样子
      await customerRow(bob, customer).getByRole('button', { name: '删除客户' }).click();
      await expect(customerRow(bob, customer)).toHaveCount(0);
      await push(bob);
      await createOrder(alice, customer, rejectedNumber);
      await push(alice);
      await expect(alice.getByTestId('orders-sync-notice')).toContainText('被拒 1 条');
      const rejections = alice.getByTestId('sync-rejections-panel');
      await expect(rejections).toContainText('DemoOrder');
      await expect(rejections).toContainText('依赖未满足（23503）');
      await expect(alice.getByTestId('orders-dependency-notices')).toContainText(`它的客户「${customer}」已不在远端`);
      await expect(orderRow(alice, rejectedNumber)).toHaveCount(0);
      await pull(alice);
      await expect(customerRow(alice, customer)).toHaveCount(0);
    });

    test('AC#7～#9 订单项挂上、摘掉分类，Bob 拉到同样的关联；两人给同一条订单项挂同一个分类，各自推送都不失败', async ({
      browser
    }) => {
      test.slow();
      const alice = await openAs(browser, 'alice', 'Alice');
      const bob = await openAs(browser, 'bob', 'Bob');
      await createCustomer(alice, categoryCustomer);
      await createOrder(alice, categoryCustomer, categoryOrder);
      await addItem(alice, categoryOrder, categorizedItem, 1, 99);
      for (const name of [digital, gift, shared]) await createCategory(alice, name);
      await push(alice);
      await pull(bob);
      // 还没挂分类时分类那一栏是空的（不可见），先确认 Bob 拉到了这条订单项
      await expect(bob.getByTestId('order-item').filter({ hasText: categorizedItem })).toBeVisible();

      // AC#7：Alice 给订单项挂两个分类并推送，Bob 拉取后这条订单项显示两个分类
      await attach(alice, categorizedItem, digital);
      await attach(alice, categorizedItem, gift);
      await push(alice);
      await expect(alice.getByTestId('sync-rejections-panel')).toContainText('最近没有被远端拒绝的推送');
      await pull(bob);
      await expect(itemCategories(bob, categorizedItem)).toContainText(digital);
      await expect(itemCategories(bob, categorizedItem)).toContainText(gift);

      // AC#8：Alice 摘掉一个分类并推送，Bob 拉取后只剩一个
      await detach(alice, categorizedItem, gift);
      await push(alice);
      await pull(bob);
      await expect(itemCategories(bob, categorizedItem)).not.toContainText(gift);
      await expect(itemCategories(bob, categorizedItem)).toContainText(digital);

      // AC#9：两人都还没拉到对方的修改，给同一条订单项挂同一个分类并各自推送：关联行 id 相同，都推得上去
      await attach(alice, categorizedItem, shared);
      await attach(bob, categorizedItem, shared);
      await push(alice);
      await push(bob);
      await expect(bob.getByTestId('orders-sync-notice')).toHaveText('推送完成：推上去 1 条');
      await expect(bob.getByTestId('sync-rejections-panel')).toContainText('最近没有被远端拒绝的推送');
      await pull(alice);
      await pull(bob);
      for (const page of [alice, bob]) {
        await expect(itemCategories(page, categorizedItem)).toContainText(shared);
        await expect(itemCategories(page, categorizedItem)).toContainText(digital);
      }
    });

    test('AC#10～#11 同批新建互相引用的客户与证件，一次推送、Bob 拉到一致的两行；删掉证件之后两端的客户都还在、没有证件', async ({
      browser
    }) => {
      test.slow();
      const alice = await openAs(browser, 'alice', 'Alice');
      const bob = await openAs(browser, 'bob', 'Bob');

      // AC#10：客户与证件互相引用、同一批新建；推送时客户的证件引用先写空，同一请求里再补写（US-038），一条都不被拒
      await createCustomerWithIdCard(alice, cardCustomer, cardCode);
      await push(alice);
      await expect(alice.getByTestId('orders-sync-notice')).toHaveText('推送完成：推上去 2 条');
      await expect(alice.getByTestId('sync-rejections-panel')).toContainText('最近没有被远端拒绝的推送');
      await expect(alice.getByTestId('orders-pending-count')).toHaveText('0');
      // 页面只在客户指向的证件也指回这位客户时显示证件号：Bob 看到它，就说明拉下来的两行一致
      await pull(bob);
      await expect(customerRow(bob, cardCustomer).getByTestId('customer-id-card')).toHaveText(`证件：${cardCode}`);

      // AC#11：Alice 删掉证件并推送，Bob 拉取：两端的客户都还在，都没有证件
      await customerRow(alice, cardCustomer).getByRole('button', { name: '删除证件' }).click();
      await expect(customerRow(alice, cardCustomer).getByTestId('customer-id-card')).toHaveText('无证件');
      await push(alice);
      await expect(alice.getByTestId('sync-rejections-panel')).toContainText('最近没有被远端拒绝的推送');
      await pull(bob);
      await expect(customerRow(bob, cardCustomer)).toBeVisible();
      await expect(customerRow(bob, cardCustomer).getByTestId('customer-id-card')).toHaveText('无证件');
    });

    test('AC#5 访客：客户、订单与订单项只存本机，推送与拉取不可用，不发推送请求', async ({ browser }) => {
      const mutations: string[] = [];
      const visitor = await openOrders(browser, mutations);
      const visitorCustomer = `e2e-${runId}-访客的客户`;
      const visitorOrder = `e2e-${runId}-访客订单`;
      await expect(visitor.getByTestId('identity-title')).toHaveText('访客');
      await expect(visitor.getByTestId('orders-visitor-notice')).toBeVisible();

      await createCustomer(visitor, visitorCustomer);
      await createOrder(visitor, visitorCustomer, visitorOrder);
      await addItem(visitor, visitorOrder, `e2e-${runId}-访客商品`, 1, 9);
      await expect(visitor.getByTestId('orders-push')).toBeDisabled();
      await expect(visitor.getByTestId('orders-pull')).toBeDisabled();

      // 重新打开页面，订单还在本机
      await visitor.reload({ waitUntil: 'domcontentloaded' });
      await expect(orderRow(visitor, visitorOrder)).toBeVisible({ timeout: 60_000 });
      await expect(orderRow(visitor, visitorOrder).getByTestId('order-item')).toHaveCount(1);
      expect(mutations).toEqual([]);
    });
  });
}
