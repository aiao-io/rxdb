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
