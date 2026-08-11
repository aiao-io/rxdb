import { expect, test, type Locator } from '@playwright/test';
/*
 * 本文件的等待统一放宽到 20s，原因写在这里而不是每处重复：
 *
 * 这是**懒加载 + 虚拟滚动**的树，新增一个节点要经过
 * 「写 wa-sqlite → 订阅回流 → 重算可见窗口 → CDK 渲染」四段。
 * 在 `workers: 2` 的全量跑里（另一个 worker 可能正在跑 5000 条批量插入），
 * 这条链路超过 10s 是常态而非异常。
 *
 * 本轮把 `retries` 从「本地无条件 2 次」改回 0（P0-1）之后，这个文件是最先红的 ——
 * **它此前一直是靠重试遮住的**。放宽超时是对的：这些用例断的是"最终会渲染出来"，
 * 不是"多快渲染出来"；性能预算属于 benchmarks，不该混在功能门禁里（见 P0-2）。
 */

import { readCount, readRequiredAttribute, resetE2eState } from './e2e-utils.js';

/**
 * 取出 `boundingBox()` 的结果，取不到就以一条能指认现场的错误失败。
 *
 * @remarks
 * P1-6：原实现是 `expect(bbox).toBeTruthy()` 然后到处 `bbox!`。
 * **`toBeTruthy()` 不会让 TypeScript 收窄类型**，那些 `!` 是在向编译器保证
 * 一件编译器无从验证的事；真正取不到布局盒时（元素被遮挡或尚未渲染），
 * 报错会发生在算坐标那一行、表现为 NaN，与真实原因完全对不上。
 *
 * 顺带说明为什么写成独立函数而不是测试体里的 `if`：
 * `playwright/no-conditional-in-test` 禁止测试体内出现分支。放进 helper 后
 * 既能收窄类型又不违反规则；而 `expect(x).not.toBeNull()` 在 Playwright 里
 * **不带 assertion signature**，收窄不了 —— 实测会继续报 `TS18047: possibly null`。
 */
function requireBox(box: Awaited<ReturnType<Locator['boundingBox']>>, what: string): NonNullable<typeof box> {
  if (box === null) {
    throw new Error(`${what}没有布局盒（可能被遮挡或尚未渲染）`);
  }
  return box;
}

test.describe('Lazy Loading Tree Menu - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/menu-lazy');
    await page.waitForLoadState('domcontentloaded');
    // 等待页面完全加载
    await expect(page.locator('app-tree-menu-lazy-page')).toBeVisible();
    await expect(page.getByTestId('menu-title-input')).toBeVisible({ timeout: 20000 });
  });

  test('should display lazy loading menu page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Tree Menu - Lazy Load|场景3：懒加载/);
  });

  test('should have add menu input', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');
    await expect(input).toBeVisible();
  });

  test('should add root menu', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');
    const addButton = page.getByTestId('menu-add-root');

    // 输入菜单标题
    await input.fill('E2E 根菜单');

    // 点击添加按钮
    await addButton.click();

    // 验证新菜单出现在列表中
    const menuList = page.getByTestId('menu-row');
    const newMenu = menuList.filter({ hasText: 'E2E 根菜单' }).first();
    await expect(newMenu).toBeVisible({ timeout: 20000 });

    // 等待输入框清空
    await expect(input).toHaveValue('', { timeout: 20000 });
  });

  test('should add child menu', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 先添加一个根菜单
    await input.fill('父菜单');
    await input.press('Enter');

    // 找到菜单项
    const menuList = page.getByTestId('menu-row');
    const parentMenu = menuList.filter({ hasText: '父菜单' }).first();
    await expect(parentMenu).toBeVisible({ timeout: 20000 });
    await parentMenu.hover();

    const addChildButton = parentMenu.getByTestId('menu-add-child');
    await expect(addChildButton).toBeVisible();
    await addChildButton.click();
    await expect(page.getByTestId('menu-selected-parent')).toBeVisible();
    await expect(page.getByTestId('menu-submit-child')).toBeVisible();
    await input.fill('子菜单');
    await input.press('Enter');

    const childMenu = menuList.filter({ hasText: '子菜单' }).first();
    await expect(childMenu).toBeVisible({ timeout: 20000 });
    await expect(childMenu).toHaveAttribute(
      'data-parent-id',
      await readRequiredAttribute(parentMenu, 'data-menu-id', '父菜单行')
    );
  });

  test('should have expand/collapse button', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');
    const menuList = page.getByTestId('menu-row');

    // 添加一个根菜单
    await input.fill('测试菜单');
    await input.press('Enter');

    // P1-9 + 稳定性：原先是 `page.locator('text="测试菜单"')` —— **全页范围**的文本定位，
    // 页面上任何地方（面包屑、toast、历史侧栏）出现同样的字都会命中，
    // 多处命中时 Playwright 会抛 strict mode violation。
    //
    // 而且它没给显式超时，落到默认 `expect.timeout`（本地 5s）。
    // 这个树是**懒加载**的：新增后要等订阅回流才渲染，2 worker 争 CPU 时 5s 不够 ——
    // 本轮把 `retries` 从"本地无条件 2 次"改回 0（P0-1）之后，
    // 这条就是全量跑时最先红的用例之一。作用域收窄 + 显式超时一起修。
    const menu = menuList.filter({ hasText: '测试菜单' }).first();
    await expect(menu).toBeVisible({ timeout: 20000 });
    await menu.hover();
    await expect(menu.getByTestId('menu-add-child')).toBeVisible();
    await menu.getByTestId('menu-add-child').click();
    await input.fill('测试子菜单');
    await input.press('Enter');
    await expect(menuList.filter({ hasText: '测试子菜单' }).first()).toBeVisible({ timeout: 20000 });
    const toggle = menu.getByTestId('menu-node-toggle');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(menuList.filter({ hasText: '测试子菜单' }).first()).toBeHidden();
    await toggle.click();
    await expect(menuList.filter({ hasText: '测试子菜单' }).first()).toBeVisible();
  });

  test('should show edit button on hover', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 添加菜单
    await input.fill('可编辑菜单');
    await input.press('Enter');

    const menuList = page.getByTestId('menu-row');
    const menu = menuList.filter({ hasText: '可编辑菜单' }).first();
    await expect(menu).toBeVisible({ timeout: 20000 });

    // Hover 显示编辑按钮
    await menu.hover();
    const editButton = menu.getByTestId('menu-edit');
    await expect(editButton).toBeVisible();
  });

  test('should show delete button on hover', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 添加菜单
    await input.fill('可删除菜单');
    await input.press('Enter');

    const menuList = page.getByTestId('menu-row');
    const menu = menuList.filter({ hasText: '可删除菜单' }).first();
    await expect(menu).toBeVisible({ timeout: 20000 });

    // Hover 显示删除按钮
    await menu.hover();
    const deleteButton = menu.getByTestId('menu-delete');
    await expect(deleteButton).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    const searchInput = page.getByTestId('menu-search-input');
    await expect(searchInput).toBeVisible();
  });

  test('should have undo and redo buttons', async ({ page }) => {
    const undoButton = page.locator('button[aria-label="撤销"]');
    const redoButton = page.locator('button[aria-label="重做"]');

    await expect(undoButton).toBeVisible();
    await expect(redoButton).toBeVisible();
  });

  test('should have history toggle button', async ({ page }) => {
    const historyButton = page.locator('button[aria-label="历史记录"]');
    await expect(historyButton).toBeVisible();
  });

  test('should display menu count badge', async ({ page }) => {
    const badge = page.getByTestId('menu-count');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('项');
  });

  test('should render virtual scroll after adding a menu', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    await input.fill('虚拟滚动测试菜单');
    await input.press('Enter');

    // 懒加载树新增后要等订阅回流才渲染；2 worker 争 CPU 时 10s 会不够。
    // `.first()` 是必要的：虚拟滚动可能同时渲染出多个匹配行（缓冲区）。
    await expect(page.getByTestId('menu-row').filter({ hasText: '虚拟滚动测试菜单' }).first()).toBeVisible({
      timeout: 20000
    });
    await expect(page.locator('app-tree-menu-lazy-page .virtual-scroll-viewport')).toBeVisible();
  });

  test('should support history undo/redo', async ({ page }) => {
    const menuList = page.getByTestId('menu-row');
    const input = page.getByTestId('menu-title-input');
    const undoButton = page.locator('button[aria-label="撤销"]');

    // 添加菜单
    await input.fill('历史测试菜单');
    await input.press('Enter');

    // 验证菜单存在
    await expect(menuList.filter({ hasText: '历史测试菜单' }).first()).toBeVisible({ timeout: 20000 });

    // 点击撤销
    await undoButton.click();

    // 菜单应该消失
    await expect(menuList.filter({ hasText: '历史测试菜单' })).toHaveCount(0, { timeout: 20000 });
  });

  test('should show expand icon after dragging node into empty folder', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');
    const menuList = page.getByTestId('menu-row');

    // 添加目标节点 B（原本没有子节点）
    await input.fill('目标节点B');
    await input.press('Enter');
    await expect(menuList.filter({ hasText: '目标节点B' }).first()).toBeVisible({ timeout: 20000 });

    // 添加源节点 A
    await input.fill('源节点A');
    await input.press('Enter');
    await expect(menuList.filter({ hasText: '源节点A' }).first()).toBeVisible({ timeout: 20000 });

    // 获取源节点和目标节点
    const sourceNode = menuList.filter({ hasText: '源节点A' }).first();
    const targetNode = menuList.filter({ hasText: '目标节点B' }).first();

    // 选择节点展开/折叠按钮
    const targetExpandButton = targetNode.getByTestId('menu-node-toggle');

    // 目标节点没有子节点，展开控件应保持隐藏
    await expect(targetExpandButton).toBeHidden();

    // 执行拖拽：将源节点 A 拖入目标节点 B
    // 使用手动拖拽来确保正确触发 dragover 和 drop 事件
    const sourceBbox = await sourceNode.boundingBox();
    const targetBbox = await targetNode.boundingBox();

    // P1-6：原先是 `expect(x).toBeTruthy()` 然后到处 `x!`。
    // **`toBeTruthy()` 不会让 TS 收窄类型**，所以 7 个 `!` 是在向编译器保证一件
    // 编译器无从验证的事；真正取不到 boundingBox 时（元素被遮挡/未布局），
    // 报错会发生在算坐标那一行，指向的是 NaN 而不是"元素拿不到位置"。
    // 用类型守卫一次断言到位，后面不再需要 `!`。
    // 源节点的坐标改从拖拽手柄本身取（见下方 P1-7），所以这里只需要确认它有布局盒。
    requireBox(sourceBbox, '拖拽源节点');
    const targetBox = requireBox(targetBbox, '拖拽目标节点');

    // P1-7：原先是 `sourceBbox!.x + 30` —— 30 是硬编码的手柄横向偏移，
    // 手柄尺寸一改就静默拖错位置。改为直接定位手柄元素本身取其中心。
    const dragHandle = sourceNode.getByTestId('menu-drag-handle');
    const handleBox = requireBox(await dragHandle.boundingBox(), '拖拽手柄');
    const sourceX = handleBox.x + handleBox.width / 2;
    const sourceY = handleBox.y + handleBox.height / 2;
    // 目标位置在目标节点的中心
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + targetBox.height / 2;

    // 执行拖拽操作
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    // 缓慢移动到目标位置，让 dragover 事件正确触发
    await page.mouse.move(targetX, targetY, { steps: 20 });
    // P1-7：原先这里有一句注释「等待一下让 drop mode 切换到 'into'」，
    // 而**它描述的等待并不存在** —— 下一行直接就 mouse.up()，时序全靠上面的
    // `{ steps: 20 }` 隐式凑。补上真实的等待。
    //
    // 判据用的是模板里的**语义类** `drop-into`
    // （`[class.drop-into]="targetItemId === node.menu.id && dropMode === 'into' && isValidTarget"`），
    // 而不是某个 Tailwind 工具类 —— 它精确表达"目标合法且模式是 into"，
    // 顺带把「拖到了非法目标」这种情况区分开（那会是 `drop-invalid`）。
    await expect(targetNode).toHaveClass(/drop-into/u, { timeout: 5000 });
    await expect(targetNode).not.toHaveClass(/drop-invalid/u);
    await page.mouse.up();

    // 关键验证：目标节点 B 现在显示展开/折叠控件
    // 这证明了 hasChildren 属性被正确更新为 true
    const updatedTargetNode = menuList.filter({ hasText: '目标节点B' }).first();
    const expandButton = updatedTargetNode.getByTestId('menu-node-toggle');

    // 使用 toPass 进行重试，等待 hasChildren 更新后 UI 刷新
    await expect(async () => {
      await expect(expandButton).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
  });

  /**
   * 连续两次批量添加后，「展开全部」能把 200 条全部展开。
   *
   * @remarks
   * `APP-dev-rxdb-angular-e2e-p0-1`：本用例在 `--retries=0` 下 **6/6 必红**，不是 flaky。
   * 根因是产品缺陷 —— `generateBatchMenus` 每批都从 `Batch 0` 起编号，
   * 第二批的根节点与第一批撞上 `(parentId, title)` 唯一索引，整批 INSERT 回滚。
   * 页面上连点两次「添加 100 条」，第二次真的不生效（只在 console 留一条错误）。
   *
   * 顺带修掉两处让这件事被遮住多时的伪断言：
   *
   * 1. 原来的中间断言是 `count2 > count1`。徽标读的是
   *    `menuResource.value().length`，而懒加载模式下它只数**已加载的可见行**；
   *    刚添完 100 条时可见的只有根（约 5~8 个，`generateBatchMenus` 随机建树，
   *    根的期望数是 `1 + ln(N)`）。于是 `count1` 常常是第一批**还在渐进渲染**时的中间值，
   *    `count2 > count1` 靠第一批自己涨上去就能满足 —— 它从来没有验证过第二批发生了。
   *    这条中间断言没有独立价值，直接删掉；判据交给下面那条。
   *
   * 2. 最终断言原来是 `toContainText('200 项')`。**这是子串匹配**：
   *    库里若残留数据（wa-sqlite 按 origin 共享，`1200 项` 也含 `200 项`）它照样绿。
   *    改成 `toHaveText` 精确匹配。
   *
   * 再补上 React 端 P0-3 已有的那条：按钮 title 从「展开全部」翻成「折叠全部」，
   * 证明"展开"这件事本身真的发生了，而不只是数字对上了。
   */
  test('should correctly expand all items after adding batch twice (Regression Test)', async ({ page }) => {
    const add100Button = page.getByTestId('menu-batch-option-100');
    const badge = page.getByTestId('menu-count');

    // 1. 第一批 100 条
    await page.getByTestId('menu-batch-add').click();
    await add100Button.click();
    await expect(async () => {
      expect(readCount(await badge.textContent(), '计数徽标')).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // `useAction` 的 isPending 归零即写入完成（它按在途调用计数）
    await expect(add100Button).toBeEnabled({ timeout: 60000 });

    // 2. 第二批 100 条
    await page.getByTestId('menu-batch-add').click();
    await add100Button.click();
    await expect(add100Button).toBeEnabled({ timeout: 60000 });

    // 3. 展开全部
    const expandAllButton = page.getByTestId('menu-toggle-all');
    await expandAllButton.click();

    // 4. 展开真的发生了，且两批共 200 条一条不少
    await expect(expandAllButton).toHaveAttribute('title', '折叠全部', { timeout: 20000 });
    await expect(badge).toHaveText('200 项', { timeout: 20000 });
  });
});
