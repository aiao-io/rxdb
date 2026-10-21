import { expect, test, type Page } from '@playwright/test';

/**
 * US-528 AC#1：只用发布包从零接线的独立应用跑通最小闭环
 * 录入 / 编辑 / 筛选 / 刷新重开。隔离靠 Playwright 每测试新 context
 * 的全新 IndexedDB（固定库名），reload 保留数据验证持久化。
 */

async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ 新增' }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
}

async function createBookmark(page: Page, title: string): Promise<void> {
  await openCreateDialog(page);
  await page.getByRole('group', { name: '标题' }).getByRole('textbox').fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
}

async function expectListHasRows(page: Page): Promise<void> {
  await expect(page.getByText('暂无数据')).toHaveCount(0);
}

test.describe('独立消费示例（US-528）', () => {
  test('录入 / 编辑 / 筛选 / 刷新重开全闭环可用', async ({ page }) => {
    // 查询构建器弹层较矮视口下规则行在视口外，scrollIntoView 够不到——加大视口
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.goto('/');
    await page.waitForURL('**/bookmarks');
    await expect(page.getByText('暂无数据')).toBeVisible();

    await createBookmark(page, 'RxDB 官网');
    await createBookmark(page, 'SQLite 文档');
    await expectListHasRows(page);

    // 筛选：标题包含 RxDB
    await page.getByRole('button', { name: '筛选' }).click();
    await page.getByRole('button', { name: '添加第一个条件' }).click();
    const rule = page.locator('.rxdb-query-rule').first();
    // 筛选弹层是 fixed inset:0 的透明遮罩，Playwright 的视口滚动判定对弹层内控件
    // 失灵；树节点 Enter 不触发选择。统一走 el.click() 派发原生 click 事件，
    // 不经过任何动作性检查（筛选条件树最终由「确定」后的计数徽标断言）
    await rule
      .locator('button[popovertarget]')
      .first()
      .evaluate(el => (el as HTMLElement).click());
    await page.locator('[role="treeitem"][id$="-item-title"]').evaluate(el => (el as HTMLElement).click());
    await rule
      .locator('button[popovertarget]')
      .nth(1)
      .evaluate(el => (el as HTMLElement).click());
    await page.locator('[role="option"][id$="-opt-contains"]').evaluate(el => (el as HTMLElement).click());
    // React 受控输入：native setter + input 事件
    await rule.locator('input[placeholder="输入值"]').evaluate(el => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, 'RxDB');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: '确定' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('1 条记录')).toBeVisible();

    // 清筛选 → 编辑第一条 → 刷新重开数据仍在
    await page.getByRole('button', { name: '筛选' }).click();
    await page.getByRole('button', { name: '重置' }).evaluate(el => (el as HTMLElement).click());
    await page.getByRole('button', { name: '确定' }).evaluate(el => (el as HTMLElement).click());
    await expectListHasRows(page);

    await expect.poll(async () => findActionIcon(page, 'view-action', 1), { timeout: 15000 }).not.toBeNull();
    const view = await findActionIcon(page, 'view-action', 1);
    if (view === null) throw new Error('操作列没有 view-action 图标');
    await page.mouse.click(view.x, view.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    // 表格默认按 id 倒序：第一行是后创建的记录
    await expect(page.getByRole('group', { name: '标题' }).getByRole('textbox')).toHaveValue('SQLite 文档');
    await page.getByRole('button', { name: '关闭' }).click();

    await page.reload();
    await page.waitForURL('**/bookmarks');
    await expectListHasRows(page);
  });
});

/** 表格某行操作列图标在页面上的点击坐标（与 admin e2e 同款 VTable 场景树换算）。 */
interface ActionIconHit {
  x: number;
  y: number;
}

async function findActionIcon(page: Page, iconName: string, row = 1): Promise<ActionIconHit | null> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate(
    (el, [name, targetRow]) => {
      interface SceneNode {
        name?: string;
        globalAABBBounds: { x1: number; x2: number; y1: number; y2: number };
        forEachChildren(cb: (child: SceneNode) => void): void;
      }
      interface VTableLike {
        colCount: number;
        getHeaderField(col: number, row: number): unknown;
        scrollToCell(cell: { col: number; row: number }): void;
        scenegraph: { getCell(col: number, row: number): SceneNode };
      }
      const table = (el as unknown as { __vtable__: VTableLike }).__vtable__;
      const col = Array.from({ length: table.colCount }, (_, i) => i).find(
        c => table.getHeaderField(c, 0) === 'actions'
      );
      if (col === undefined) throw new Error('表格没有操作列');
      table.scrollToCell({ col, row: targetRow });
      let icon: SceneNode | undefined;
      const visit = (node: SceneNode): void => {
        if (!icon && node.name === name) icon = node;
        node.forEachChildren(visit);
      };
      visit(table.scenegraph.getCell(col, targetRow));
      if (!icon) return null;
      const box = icon.globalAABBBounds;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + (box.y1 + box.y2) / 2 };
    },
    [iconName, row] as const
  );
}
