import { expect, test, type Browser, type Page } from '@playwright/test';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

/**
 * 商品目录：按身份授权的同步（epic-015：US-033 / US-035 / US-036），经页面走一遍。
 *
 * 成员用匿名用户：每个浏览器上下文都是一个新的匿名用户，自助加入星河零售，不动预置账号 Alice、Bob 的成员关系。
 * 本轮的商品名带唯一后缀，结束时删掉；演示数据里的其他商品只读不改。
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

    async function switchIdentity(page: Page, choice: string, title: string): Promise<void> {
      await page.getByLabel('切换身份').selectOption(choice);
      await expect(page.getByTestId('identity-title')).toHaveText(title, { timeout: 60_000 });
      await expect(page.getByTestId('catalog-identity')).toBeVisible({ timeout: 60_000 });
    }

    /** 点「同步」并等这一轮结算：按钮上的轮数加一才算这一轮结束，不会被上一轮留下的结果骗过 */
    async function sync(page: Page): Promise<void> {
      const button = page.getByTestId('catalog-sync');
      const finished = Number(await button.getAttribute('data-sync-count'));
      await button.click();
      await expect(button).toHaveAttribute('data-sync-count', String(finished + 1), { timeout: 60_000 });
      await expect(page.getByTestId('catalog-sync-result')).toContainText('同步完成');
    }

    /** 本机某个区里的一件商品；列表随本地库响应式刷新，断言一律用会重试的定位器 */
    function syncedItem(page: Page, bucket: string, name: string) {
      return page.locator(`[data-bucket="${bucket}"] [data-testid="synced-item"]`).filter({ hasText: name });
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

    /** 删掉本轮建的商品；用例中途失败时有的还没建出来，跳过 */
    async function deleteIfCreated(page: Page, name: string): Promise<void> {
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
      await switchIdentity(member, 'anonymous', '匿名用户');
      await serverAction(member, () => member.getByRole('button', { name: '加入星河零售' }).click(), '已加入星河零售');
      await expect(member.getByTestId('catalog-buckets')).toContainText('租户 · 星河零售');

      try {
        for (const [name, category, visibility] of [
          [publicDigital, '数码', 'public'],
          [publicHome, '家居', 'public'],
          [internalDigital, '数码', 'tenant']
        ] as const) {
          await member.getByPlaceholder('名称', { exact: true }).fill(name);
          await member.getByLabel('分类', { exact: true }).selectOption(category);
          await member.getByLabel('所属租户', { exact: true }).selectOption('xinghe');
          await member.getByLabel('可见范围', { exact: true }).selectOption(visibility);
          await expect(member.getByPlaceholder('名称', { exact: true })).toHaveValue(name);
          await serverAction(
            member,
            () => member.getByRole('button', { name: '新增', exact: true }).click(),
            `「${name}」已新增`
          );
        }

        // US-033 AC#1：访客（anon，不登录）只能读公开区；默认规则只关注数码
        const visitor = await openCatalog(browser, member);
        await expect(visitor.getByTestId('identity-title')).toHaveText('访客');
        await expect(visitor.getByTestId('catalog-buckets')).toHaveText('公开');
        await sync(visitor);
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
        await sync(visitor);
        await expect(syncedItem(visitor, 'public', publicHome)).toBeVisible();

        // US-033 AC#2：成员读得到所在租户的内部商品，成本价有列权限
        await sync(member);
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).toBeVisible();
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).not.toContainText('无权读取');

        // US-033 AC#5：公开改为租户内部：访客那边移除，成员那边换到租户区
        await serverAction(
          member,
          () => serverRow(member, publicHome).getByRole('button', { name: '收回为内部' }).click(),
          `「${publicHome}」已收回为租户内部`
        );
        await sync(visitor);
        await expect(allSynced(visitor).filter({ hasText: publicHome })).toHaveCount(0);
        await sync(member);
        await expect(syncedItem(member, 'tenant:xinghe', publicHome)).toBeVisible();

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
        await sync(member);
        await expect(member.locator('[data-bucket="tenant:xinghe"]')).toHaveCount(0);
        await serverAction(
          member,
          () => member.getByRole('button', { name: '加入星河零售' }).click(),
          '已加入星河零售'
        );
        await sync(member);
        await expect(syncedItem(member, 'tenant:xinghe', internalDigital)).toBeVisible();
      } finally {
        for (const name of [publicDigital, publicHome, internalDigital]) {
          await deleteIfCreated(member, name);
        }
      }
    });

    test('宽屏上商品展示在左、模拟服务端变更在右，窄屏上下堆叠', async ({ browser }) => {
      const page = await openCatalog(browser, undefined);
      const columns = () =>
        page.evaluate(() => {
          const box = (testId: string) => {
            const { left, right, top, bottom } = document
              .querySelector(`[data-testid="${testId}"]`)!
              .getBoundingClientRect();
            return { left, right, top, bottom };
          };
          return { display: box('catalog-display'), operations: box('catalog-operations') };
        });

      await page.setViewportSize({ width: 1440, height: 900 });
      const wide = await columns();
      expect(wide.operations.left).toBeGreaterThanOrEqual(wide.display.right);
      expect(wide.operations.top).toBeCloseTo(wide.display.top, 0);

      await page.setViewportSize({ width: 800, height: 900 });
      const narrow = await columns();
      expect(narrow.operations.left).toBeCloseTo(narrow.display.left, 0);
      expect(narrow.operations.top).toBeGreaterThanOrEqual(narrow.display.bottom);
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
