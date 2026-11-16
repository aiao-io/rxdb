import { expect, test, type Page } from '@playwright/test';
import { createAsset, createCategory, expectListHasRows, resetE2eState, settleAnimations } from './e2e-utils.js';

async function expectTableFillsContent(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .getByTestId('entity-shell')
        .locator('canvas')
        .first()
        .evaluate(canvas => {
          const content = document.querySelector<HTMLElement>('.admin-content')!;
          const shell = document.querySelector<HTMLElement>('[data-testid="entity-shell"]')!;
          return Math.max(
            Math.abs(shell.getBoundingClientRect().top - content.getBoundingClientRect().top),
            Math.abs(canvas.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom),
            content.scrollHeight - content.clientHeight,
            document.documentElement.scrollHeight - window.innerHeight
          );
        })
    )
    .toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await resetE2eState(page);
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto('/entities/assets/AssetCategory');
  await createCategory(page, '布局测试分类');
  await page.goto('/entities/assets/Asset');
  await expect(page.getByTestId('entity-empty-state')).toBeVisible();
});

test('空表、单行和多行均铺满内容区，窗口缩放后保持表格内部滚动', async ({ page }) => {
  await settleAnimations(page);
  await expectTableFillsContent(page);

  await createAsset(page, '布局测试资产 1', '布局测试分类');
  await expectListHasRows(page, { name: '布局测试资产 1' });
  await expectTableFillsContent(page);

  for (let index = 2; index <= 20; index += 1) {
    await createAsset(page, `布局测试资产 ${index}`, '布局测试分类');
  }
  await expectListHasRows(page, { name: '布局测试资产 20' });
  await expectTableFillsContent(page);

  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  await canvas.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() =>
      canvas.evaluate(element => (element as unknown as { __vtable__: { scrollTop: number } }).__vtable__.scrollTop)
    )
    .toBeGreaterThan(0);
  await expectTableFillsContent(page);

  await page.setViewportSize({ width: 1440, height: 500 });
  await expectTableFillsContent(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await expectTableFillsContent(page);
});

test('只有一行时横向滚动条贴住视口底边，并能横向滚动', async ({ page }) => {
  await createAsset(page, '单行布局测试资产', '布局测试分类');
  await expectListHasRows(page, { name: '单行布局测试资产' });
  await settleAnimations(page);

  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  await expect
    .poll(() =>
      canvas.evaluate(element => {
        interface Table {
          records: unknown[];
          scenegraph: {
            component: {
              hScrollBar: {
                attribute: { width: number };
                globalAABBBounds: { y2: number };
              };
            };
          };
        }
        const table = (element as unknown as { __vtable__: Table }).__vtable__;
        const bar = table.scenegraph.component.hScrollBar;
        return {
          records: table.records.length,
          hasHorizontalScrollbar: bar.attribute.width > 0,
          atBottom: Math.abs(element.getBoundingClientRect().height - bar.globalAABBBounds.y2) <= 1
        };
      })
    )
    .toEqual({ records: 1, hasHorizontalScrollbar: true, atBottom: true });

  await canvas.hover();
  await page.mouse.wheel(200, 0);
  await expect
    .poll(() =>
      canvas.evaluate(element => (element as unknown as { __vtable__: { scrollLeft: number } }).__vtable__.scrollLeft)
    )
    .toBeGreaterThan(0);
});

interface ResizableTable {
  colCount: number;
  rightFrozenColCount: number;
  columns: Array<{ field?: string; width?: number | string; minWidth?: number | string; maxWidth?: number | string }>;
  getHeaderField(col: number, row: number): unknown;
  getColWidth(col: number): number;
  scrollToCell(cell: { col: number; row: number }): void;
  updateColumns(columns: ResizableTable['columns']): void;
  scenegraph: {
    getCell(col: number, row: number): { globalAABBBounds: { x1: number; y1: number; y2: number } };
  };
}

async function columnWidths(page: Page) {
  return page
    .getByTestId('entity-shell')
    .locator('canvas')
    .first()
    .evaluate(element => {
      const table = (element as unknown as { __vtable__: ResizableTable }).__vtable__;
      const fields = Array.from({ length: table.colCount }, (_, col) => table.getHeaderField(col, 0));
      const actions = table.columns.find(column => column.field === 'actions')!;
      return {
        updatedAt: table.getColWidth(fields.indexOf('updatedAt')),
        actions: table.getColWidth(fields.indexOf('actions')),
        rightFrozenColCount: table.rightFrozenColCount,
        width: actions.width,
        minWidth: actions.minWidth,
        maxWidth: actions.maxWidth
      };
    });
}

async function columnResizeHandle(page: Page) {
  return page
    .getByTestId('entity-shell')
    .locator('canvas')
    .first()
    .evaluate(async element => {
      const table = (element as unknown as { __vtable__: ResizableTable }).__vtable__;
      const col = Array.from({ length: table.colCount }, (_, index) => index).find(
        index => table.getHeaderField(index, 0) === 'updatedAt'
      )!;
      table.scrollToCell({ col, row: 0 });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const bounds = table.scenegraph.getCell(col + 1, 0).globalAABBBounds;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + bounds.x1 - 2, y: rect.top + (bounds.y1 + bounds.y2) / 2 };
    });
}

async function dragColumnBoundary(page: Page, delta: number): Promise<void> {
  const handle = await columnResizeHandle(page);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + delta, handle.y, { steps: 12 });
  await page.mouse.up();
}

for (const viewportWidth of [1024, 2048]) {
  test(`滚动到最右端后，更新时间列能缩小和放大（${viewportWidth}px）`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 720 });
    await createAsset(page, '列宽测试资产', '布局测试分类');
    await expectListHasRows(page, { name: '列宽测试资产' });
    await settleAnimations(page);
    const before = await columnWidths(page);

    await dragColumnBoundary(page, -60);
    await expect.poll(async () => (await columnWidths(page)).updatedAt).toBeLessThan(before.updatedAt - 40);
    expect(await columnWidths(page)).toMatchObject({ actions: before.actions, rightFrozenColCount: 1 });
    const narrowed = await columnWidths(page);

    await dragColumnBoundary(page, 60);
    await expect.poll(async () => (await columnWidths(page)).updatedAt).toBeGreaterThan(narrowed.updatedAt + 40);
    expect(await columnWidths(page)).toMatchObject({ actions: before.actions, rightFrozenColCount: 1 });
  });
}

test('操作列根据内容自动计算宽度，并遵守最大宽度设置', async ({ page }) => {
  await createAsset(page, '操作列测试资产', '布局测试分类');
  await expectListHasRows(page, { name: '操作列测试资产' });
  await settleAnimations(page);
  const before = await columnWidths(page);
  expect(before).toMatchObject({ width: 'auto', minWidth: undefined, maxWidth: undefined });

  await page.getByTestId('admin-widget-language').click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(async () => (await columnWidths(page)).actions).toBeGreaterThan(before.actions);

  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  await canvas.evaluate(element => {
    const table = (element as unknown as { __vtable__: ResizableTable }).__vtable__;
    table.updateColumns(
      table.columns.map(column => (column.field === 'actions' ? { ...column, maxWidth: 80 } : column))
    );
  });
  await expect.poll(async () => (await columnWidths(page)).actions).toBe(80);
  expect(await columnWidths(page)).toMatchObject({
    width: 'auto',
    minWidth: undefined,
    maxWidth: 80,
    rightFrozenColCount: 1
  });
});
