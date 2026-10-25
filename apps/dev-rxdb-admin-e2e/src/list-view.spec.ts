import { expect, test, type Page } from '@playwright/test';
import { createCategory, expectActionIcon, fillField, resetE2eState } from './e2e-utils.js';

async function snapshot(page: Page) {
  return page
    .getByTestId('entity-shell')
    .locator('canvas')
    .first()
    .evaluate(element => {
      interface Table {
        colCount: number;
        rowCount: number;
        records: Array<Record<string, unknown>>;
        getHeaderField(col: number, row: number): unknown;
        getRecordByCell(col: number, row: number): Record<string, unknown>;
      }
      const table = (element as unknown as { __vtable__: Table }).__vtable__;
      const groups = Array.from({ length: table.rowCount - 1 }, (_, index) =>
        table.getRecordByCell(1, index + 1)
      ).filter(record => record?.['vtableMerge'] === true);
      return {
        rowCount: table.rowCount,
        fields: Array.from({ length: table.colCount }, (_, col) => table.getHeaderField(col, 0)),
        names: table.records
          .flatMap(record =>
            record['vtableMerge'] === true ? (record['children'] as Array<Record<string, unknown>>) : [record]
          )
          .map(record => record['name']),
        groups: groups.map(record => ({
          value: record['vtableMergeName'],
          count: (record['children'] as unknown[]).length
        }))
      };
    });
}

test('字段配置、排序和空值分组在真实表格中可操作，分组后仍可编辑', async ({ page }) => {
  await resetE2eState(page);
  await page.goto('/entities/assets/AssetCategory');
  await createCategory(page, 'beta');
  await createCategory(page, 'alpha');

  await page.getByText('字段配置', { exact: true }).click();
  await page.getByLabel('显示说明', { exact: true }).uncheck();
  await expect.poll(async () => (await snapshot(page)).fields.includes('description')).toBe(false);
  await page.getByLabel('显示说明', { exact: true }).check();
  const source = await page.getByRole('button', { name: '拖动分类名排序', exact: true }).boundingBox();
  const target = await page.getByRole('button', { name: '拖动ID排序', exact: true }).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).fields[1]).toBe('name');

  await page.getByText('排序', { exact: true }).click();
  await page.getByLabel('添加排序字段').selectOption('name');
  await expect.poll(async () => (await snapshot(page)).names).toEqual(['alpha', 'beta']);
  await page.getByLabel('分类名排序方向').selectOption('desc');
  await expect.poll(async () => (await snapshot(page)).names).toEqual(['beta', 'alpha']);

  await page.getByText('分组', { exact: true }).click();
  await page.getByLabel('分组字段', { exact: true }).selectOption('description');
  await expect.poll(async () => (await snapshot(page)).groups).toEqual([{ value: null, count: 2 }]);
  await page.getByText('分组 1', { exact: true }).click();
  const toggleGroup = () =>
    page
      .getByTestId('entity-shell')
      .locator('canvas')
      .first()
      .evaluate(element => {
        const table = (element as unknown as { __vtable__: { toggleHierarchyState(col: number, row: number): void } })
          .__vtable__;
        table.toggleHierarchyState(1, 1);
      });
  await toggleGroup();
  await expect.poll(async () => (await snapshot(page)).rowCount).toBe(2);
  await toggleGroup();
  await expect.poll(async () => (await snapshot(page)).rowCount).toBe(4);
  const view = await expectActionIcon(page, 'view-action', 2);
  await page.mouse.click(view.x, view.y);
  await expect(page.getByRole('group', { name: '分类名' }).getByRole('textbox')).toHaveValue('beta');
  await fillField(page, '分类名', 'beta-edited');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).names).toContain('beta-edited');

  await page.getByText('分组 1', { exact: true }).click();
  await page.getByLabel('分组字段', { exact: true }).selectOption('');
  await expect.poll(async () => (await snapshot(page)).groups).toEqual([]);
  await page.getByText('分组', { exact: true }).click();

  await page.getByRole('button', { name: '收起导航', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByText('字段配置', { exact: true }).click();
  const checkbox = page.getByLabel('显示说明', { exact: true });
  await expect(checkbox).toBeInViewport();
  await checkbox.uncheck();
  await expect.poll(async () => (await snapshot(page)).fields.includes('description')).toBe(false);
});

test('字段开关和排序分组弹层在桌面及窄屏完整可见，支持 Escape 关闭', async ({ page }) => {
  await resetE2eState(page);
  await page.goto('/entities/assets/AssetCategory');
  await createCategory(page, '弹层定位');
  await page.getByRole('button', { name: '收起导航', exact: true }).click();
  await page.getByRole('button', { name: '字段配置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '显示分类名', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const name of ['字段配置', '排序', '分组']) {
      await page.getByRole('button', { name, exact: true }).click();
      const panel = page.getByRole('group', { name: `${name}选项`, exact: true });
      await expect(panel).toBeVisible();
      await expect
        .poll(async () => {
          const box = await panel.boundingBox();
          return (
            box !== null && box.x >= 8 && box.x + box.width <= width - 8 && box.y >= 8 && box.y + box.height <= 804
          );
        })
        .toBe(true);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    }
  }
});
