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
  await expect(page.getByTestId('entity-empty-state')).toHaveCount(0);
}

test.describe('独立消费示例（US-528）', () => {
  test('录入 / 编辑 / 筛选 / 刷新重开全闭环可用', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/bookmarks');
    await expect(page.getByTestId('entity-empty-state')).toBeVisible();

    await createBookmark(page, 'RxDB 官网');
    await createBookmark(page, 'SQLite 文档');
    await expectListHasRows(page);

    // 筛选：标题包含 RxDB
    await page.getByRole('button', { name: /^筛选/ }).click();
    await page.getByRole('button', { name: '添加第一个条件' }).click();
    const rule = page.locator('.rxdb-query-rule').first();
    await rule.locator('button[popovertarget]').first().click();
    await page.locator('[role="treeitem"][id$="-item-title"]').click();
    await rule.locator('button[popovertarget]').nth(1).click();
    await page.locator('[role="option"][id$="-opt-contains"]').click();
    await rule.locator('input[placeholder="输入值"]').fill('RxDB');
    await page.getByRole('button', { name: '确定' }).click();
    await expect(page.getByText('1 条记录')).toBeVisible();

    // 清筛选 → 编辑第一条 → 刷新重开数据仍在
    await page.getByRole('button', { name: /^筛选/ }).click();
    await page.getByRole('button', { name: '重置' }).click();
    await page.getByRole('button', { name: '确定' }).click();
    await expectListHasRows(page);

    const view = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(view.x, view.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    const title = page.getByRole('group', { name: '标题' }).getByRole('textbox');
    const url = page.getByRole('group', { name: '链接' }).getByRole('textbox');
    await expect(title).toHaveValue('SQLite 文档');
    await title.fill('SQLite 官方文档');
    await url.fill('https://www.sqlite.org/docs.html');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    await page.reload();
    await page.waitForURL('**/bookmarks');
    const persisted = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(persisted.x, persisted.y);
    await expect(title).toHaveValue('SQLite 官方文档');
    await expect(url).toHaveValue('https://www.sqlite.org/docs.html');
  });
});

/** 表格某行操作列图标在页面上的点击坐标（与 admin e2e 同款 VTable 场景树换算）。 */
interface ActionIconHit {
  x: number;
  y: number;
}

async function expectActionIcon(page: Page, iconName: string, row = 1): Promise<ActionIconHit> {
  await expect.poll(async () => findActionIcon(page, iconName, row), { timeout: 15000 }).not.toBeNull();
  const hit = await findActionIcon(page, iconName, row);
  if (hit === null) throw new Error(`操作列没有 ${iconName} 图标`);
  return hit;
}

async function findActionIcon(page: Page, iconName: string, row = 1): Promise<ActionIconHit | null> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate(
    async (el, [name, targetRow]) => {
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
      // 横向滚动触发异步重渲染：滚动后的下一帧场景树才带上图标，立即读会拿到空单元格
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
