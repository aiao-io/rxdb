import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { switchIdentity as switchTo } from './support/identity';
import { expectNoHorizontalScroll, openSidePanel, pull } from './support/workbench';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 商品目录：按身份授权的同步（epic-015：US-033 / US-035 / US-036），经页面走一遍。
 *
 * 成员用匿名用户：每个浏览器上下文都是一个新的匿名用户，自助加入星河零售，不动预置账号 Alice、Bob 的成员关系。
 * 本轮的商品名带唯一后缀，结束时删掉；演示数据里的其他商品只读不改。
 *
 * 拉取经顶栏（US-230）；「模拟服务端变更」不在主界面，用到它的步骤先经页头的开关在右侧打开（US-232）。
 */
if (isRemoteE2E) {
  test.describe('Catalog identity-scoped sync', () => {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const publicDigital = `e2e-${runId}-数码公开`;
    const publicHome = `e2e-${runId}-家居公开`;
    const internalDigital = `e2e-${runId}-数码内部`;

    async function openCatalog(browser: Browser, base: Page | undefined): Promise<Page> {
      const page = await (await browser.newContext()).newPage();
      await page.goto(base ? new URL('/catalog', base.url()).href : '/catalog', {
        timeout: 60_000,
        waitUntil: 'domcontentloaded'
      });
      await expect(page.getByTestId('catalog-identity')).toBeVisible({ timeout: 60_000 });
      return page;
    }

    function switchIdentity(page: Page, choice: string, title: string): Promise<void> {
      return switchTo(page, choice, title, 'catalog-identity');
    }

    /**
     * 匿名登录、加入星河零售，打开「模拟服务端变更」：之后的服务端操作都在这个面板里做
     *
     * @remarks
     * 切换身份会重新加载页面，面板随之收起，所以登录之后才打开。宽屏上面板占右侧一栏，开着它照样能点顶栏的「拉取」。
     */
    async function joinAsMember(page: Page): Promise<void> {
      await switchIdentity(page, 'anonymous', '匿名用户');
      await openSidePanel(page, 'server');
      await serverAction(page, () => page.getByRole('button', { name: '加入星河零售' }).click(), '已加入星河零售');
    }

    /** 本机某个区里的一件商品；列表随本地库响应式刷新，断言一律用会重试的定位器 */
    function syncedItem(page: Page, bucket: string, name: string) {
      return page.locator(`[data-bucket="${bucket}"] [data-testid="synced-item"]`).filter({ hasText: name });
    }

    /** 元素在视口里的位置与大小；不可见时直接报错，不拿空值往下比 */
    async function boundsOf(page: Page, testId: string) {
      const bounds = await page.getByTestId(testId).boundingBox();
      if (!bounds) throw new Error(`${testId} 不可见`);
      return bounds;
    }

    function allSynced(page: Page) {
      return page.getByTestId('synced-item');
    }

    /**
     * 在「模拟服务端变更」面板里做一次操作，等这一次操作自己的提示出现
     *
     * @remarks
     * 不能只等「去点同步」：上一次操作的提示还挂在页面上，会让用例在这一次还没完成时就往下走。
     */
    async function serverAction(page: Page, run: () => Promise<void>, notice: string): Promise<void> {
      await run();
      await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible({ timeout: 30_000 });
    }

    function serverRow(page: Page, name: string) {
      return page.getByTestId('server-item').filter({ hasText: name });
    }

    /** 在「模拟服务端变更」里给星河零售新增一件商品 */
    async function addItem(page: Page, name: string, category: string, visibility: 'public' | 'tenant'): Promise<void> {
      await page.getByPlaceholder('名称', { exact: true }).fill(name);
      await page.getByLabel('分类', { exact: true }).selectOption(category);
      await page.getByLabel('所属租户', { exact: true }).selectOption('xinghe');
      await page.getByLabel('可见范围', { exact: true }).selectOption(visibility);
      await expect(page.getByPlaceholder('名称', { exact: true })).toHaveValue(name);
      await serverAction(
        page,
        () => page.getByRole('button', { name: '新增', exact: true }).click(),
        `「${name}」已新增`
      );
    }

    /**
     * 在编辑框里改一件商品，等编辑框关上
     *
     * @remarks
     * 编辑框在服务端写入成功之后才关：不能等「已修改」的提示，同一件商品改两次时上一次的提示还挂在页面上。
     */
    async function editItem(page: Page, name: string, edit: (editor: Locator) => Promise<void>): Promise<void> {
      await serverRow(page, name).getByRole('button', { name: '编辑' }).click();
      const editor = page.getByRole('dialog', { name: '编辑商品' });
      await edit(editor);
      await editor.getByRole('button', { name: '保存' }).click();
      await expect(editor).toBeHidden({ timeout: 30_000 });
    }

    /**
     * 删掉本轮建的商品；用例中途失败时有的还没建出来，跳过
     *
     * @remarks
     * 失败时编辑框可能还开着：模态框挡住整个页面，先关上它，否则删除点不到，商品会留在共用的栈上。
     */
    async function deleteIfCreated(page: Page, name: string): Promise<void> {
      const editor = page.getByRole('dialog', { name: '编辑商品' });
      if (await editor.isVisible()) await editor.getByRole('button', { name: '取消' }).click();
      await openSidePanel(page, 'server');
      if ((await serverRow(page, name).count()) === 0) return;
      await serverAction(
        page,
        () => serverRow(page, name).getByRole('button', { name: '删除' }).click(),
        `「${name}」已删除`
      );
    }

    test('访客只同步公开区里规则选中的行，成员同步所在租户；可见范围与成员关系变了，下次同步补齐或清理', async ({
      browser
    }) => {
      // 成员：匿名用户加入星河零售，新增公开的数码、家居商品各一件与一件内部的数码商品
      const member = await openCatalog(browser, undefined);
      await joinAsMember(member);
      await expect(member.getByTestId('catalog-buckets')).toContainText('租户 · 星河零售');

      try {
        for (const [name, category, visibility] of [
          [publicDigital, '数码', 'public'],
          [publicHome, '家居', 'public'],
          [internalDigital, '数码', 'tenant']
        ] as const) {
          await addItem(member, name, category, visibility);
        }

        // US-033 AC#1：访客（anon，不登录）只能读公开区；默认规则只关注数码
        const visitor = await openCatalog(browser, member);
        await expect(visitor.getByTestId('identity-title')).toHaveText('访客');
        await expect(visitor.getByTestId('catalog-buckets')).toHaveText('公开');
        // US-232 AC#5：访客打开「模拟服务端变更」只看到说明，没有能操作的按钮
        const visitorDrawer = await openSidePanel(visitor, 'server');
        await expect(visitorDrawer.getByTestId('server-panel-visitor')).toBeVisible();
        await expect(visitorDrawer.getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
        await visitor.getByTestId('catalog-server-toggle').click();
        await expect(visitorDrawer).toBeHidden();
        await pull(visitor);
        // 先等规则选中的行出现，列表已经刷新过，下面「没有」的断言才有意义
        await expect(syncedItem(visitor, 'public', publicDigital)).toBeVisible();
        await expect(visitor.locator('[data-bucket^="tenant:"]')).toHaveCount(0);
        await expect(allSynced(visitor).filter({ hasText: internalDigital })).toHaveCount(0);
        await expect(allSynced(visitor).filter({ hasText: publicHome })).toHaveCount(0);

        // US-036 AC#1：规则之外的公开商品在线浏览得到，不落进同步子集
        await visitor.getByRole('tab', { name: '家居' }).click();
        // 按名称筛到本轮的商品：并行的其他用例也在同一分类里建商品，分页会把它挤到后面
        await visitor.getByLabel('按名称筛选').fill(publicHome);
        await visitor.getByLabel('按名称筛选').press('Enter');
        await expect(visitor.getByTestId('browse-item').filter({ hasText: publicHome })).toBeVisible({
          timeout: 30_000
        });
        await expect(allSynced(visitor).filter({ hasText: publicHome })).toHaveCount(0);

        // US-033 AC#7：放宽规则（关注家居），下次同步补齐新匹配的行
        await visitor.getByRole('button', { name: /关注「家居」/ }).click();
        await pull(visitor);
        await expect(syncedItem(visitor, 'public', publicHome)).toBeVisible();

        // US-033 AC#2：成员读得到所在租户的内部商品，成本价有列权限
        await pull(member);
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).toBeVisible();
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).not.toContainText('无权读取');

        // US-033 AC#5：公开改为租户内部：访客那边移除，成员那边换到租户区
        await serverAction(
          member,
          () => serverRow(member, publicHome).getByRole('button', { name: '收回为内部' }).click(),
          `「${publicHome}」已收回为租户内部`
        );
        await pull(visitor);
        await expect(allSynced(visitor).filter({ hasText: publicHome })).toHaveCount(0);
        // US-232 AC#3：不用关抽屉就能拉取，本机商品列表随拉取更新，抽屉仍开着
        await pull(member);
        await expect(syncedItem(member, 'tenant:xinghe', publicHome)).toBeVisible();
        await expect(member.getByTestId('catalog-server-panel')).toBeVisible();

        // US-036 AC#2：浏览缓存过的行变成私有，再查同一分类时消失
        await visitor.getByRole('button', { name: '刷新' }).click();
        await expect(visitor.getByTestId('browse-item').filter({ hasText: publicHome })).toHaveCount(0, {
          timeout: 30_000
        });

        // US-033 AC#4 / AC#3：成员关系变了、业务行一行没改：退出整块删除，重新加入补快照
        await serverAction(
          member,
          () => member.getByRole('button', { name: '退出星河零售' }).click(),
          '已退出星河零售'
        );
        await pull(member);
        await expect(member.locator('[data-bucket="tenant:xinghe"]')).toHaveCount(0);
        await serverAction(
          member,
          () => member.getByRole('button', { name: '加入星河零售' }).click(),
          '已加入星河零售'
        );
        await pull(member);
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).toBeVisible();
      } finally {
        for (const name of [publicDigital, publicHome, internalDigital]) {
          await deleteIfCreated(member, name);
        }
      }
    });

    test('编辑商品：改名改价，下次同步收到修改；改到访客没关注的分类，访客那边按规则移除', async ({ browser }) => {
      const before = `e2e-${runId}-编辑前`;
      const after = `e2e-${runId}-编辑后`;
      const member = await openCatalog(browser, undefined);
      await joinAsMember(member);

      try {
        await addItem(member, before, '数码', 'public');
        // 访客默认只关注数码
        const visitor = await openCatalog(browser, member);
        await pull(visitor);
        await expect(syncedItem(visitor, 'public', before)).toBeVisible();

        // 改名、改价：行留在公开区，下次同步按更新收到；服务端那一行马上变，本机要等同步
        await editItem(member, before, async editor => {
          await editor.getByLabel('名称', { exact: true }).fill(after);
          await editor.getByLabel('售价', { exact: true }).fill('123');
        });
        await expect(serverRow(member, after)).toContainText('¥123');
        await expect(syncedItem(visitor, 'public', before)).toBeVisible();
        await pull(visitor);
        await expect(syncedItem(visitor, 'public', after)).toContainText('¥123');
        await expect(allSynced(visitor).filter({ hasText: before })).toHaveCount(0);

        // 改到访客没关注的分类：这次更新对访客不再匹配规则，服务端按移除发过去
        // 下拉框包在 label 里，label 的文字带上了全部选项：按角色和可访问名称找
        await editItem(member, after, async editor => {
          await editor.getByRole('combobox', { name: '分类' }).selectOption('图书');
        });
        await pull(visitor);
        await expect(allSynced(visitor).filter({ hasText: after })).toHaveCount(0);
      } finally {
        for (const name of [before, after]) {
          await deleteIfCreated(member, name);
        }
      }
    });

    test('US-232 模拟服务端变更不在主界面：宽屏从页头开关在右侧一栏打开、不挡页面；窄屏是带遮罩的抽屉，点遮罩收起', async ({
      browser
    }) => {
      const page = await openCatalog(browser, undefined);
      const toggle = page.getByTestId('catalog-server-toggle');

      // AC#1：单栏，主界面上没有服务端模拟器
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(page.getByTestId('catalog-server-panel')).toHaveCount(0);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // AC#2：右侧打开，开关 aria-expanded 为真，焦点在面板标题上；宽屏不加遮罩，面板在内容的右边
      await toggle.click();
      const drawer = page.getByTestId('side-panel');
      await expect(page.getByTestId('catalog-server-panel')).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(drawer.getByRole('heading', { name: '模拟服务端变更' })).toBeFocused();
      await expect(page.getByTestId('side-panel-backdrop')).toHaveCount(0);
      expect((await boundsOf(page, 'side-panel')).x).toBeGreaterThanOrEqual(
        (await boundsOf(page, 'catalog-display')).x + (await boundsOf(page, 'catalog-display')).width
      );

      // AC#6：窄屏换成盖住页面的抽屉，左边留一条遮罩；页面不横向滚动；点遮罩收起，焦点回到开关
      await page.setViewportSize({ width: 375, height: 800 });
      await expect(drawer).toHaveAttribute('aria-modal', 'true');
      await expectNoHorizontalScroll(page);
      await page.getByTestId('side-panel-backdrop').click({ position: { x: 10, y: 400 } });
      await expect(drawer).toHaveCount(0);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
    });

    test('每个身份一个本地库：访客与 Alice 打开不同的库，Alice 读得到星河零售的区', async ({ browser }) => {
      const page = await openCatalog(browser, undefined);
      const visitorDatabase = await page.getByTestId('catalog-database').innerText();

      await switchIdentity(page, 'alice', 'Alice');
      await expect(page.getByLabel('切换身份')).toHaveValue('alice');
      await expect(page.getByTestId('catalog-buckets')).toContainText('租户 · 星河零售');
      await expect(page.getByTestId('catalog-database')).not.toHaveText(visitorDatabase);
    });
  });
}
