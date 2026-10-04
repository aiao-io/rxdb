import type { Locator, Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { expect, test } from './fixtures.js';

/**
 * US-028 阶段 B（AC#5～7、#17）：实体列表的手动拖拽排序。
 *
 * @remarks
 * 三端同一份用例。表格由 VTable 画在 canvas 上，行与手柄都不是 DOM 节点：
 * VTable 把实例挂在 canvas 的 `__vtable__` 上，这里从场景树按图标名取手柄包围盒，
 * 换算成页面坐标后用真实鼠标拖动，走的仍是 VTable 自己的命中测试与换位。
 * 顺序以「刷新后再读」为准——刷新后的表格数据只能来自数据库。
 */

/** `Task` 按 `completed` 分组排序：钉住「进行中」组，列表看到的就是一条完整排序域 */
const ACTIVE_GROUP = { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] };
const ACTIVE_TASKS_URL = `/entities/public/Task?fixedQuery=${encodeURIComponent(JSON.stringify(ACTIVE_GROUP))}`;

/** VTable 行拖动手柄的图标名 */
const DRAG_ICON = 'dragReorder';

const tableCanvas = (page: Page): Locator => page.getByTestId('entity-shell').locator('canvas').first();

/** 经 todo 页落三条进行中的 Task（todo 页就是 Task 的列表，追加到组末尾） */
async function seedTasks(page: Page, titles: readonly string[]): Promise<void> {
  await page.goto('/todo');
  const input = page.getByTestId('todo-title-input');
  for (const title of titles) {
    await input.fill(title);
    await page.getByTestId('todo-add').click();
    await expect(page.getByTestId('todo-title').getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(input).toHaveValue('', { timeout: 15_000 });
  }
}

/** 表格当前交给 VTable 的记录标题，按显示顺序 */
const readTitles = (page: Page): Promise<string[]> =>
  tableCanvas(page).evaluate(el => {
    const table = (el as unknown as { __vtable__: { records: Array<Record<string, unknown>> } }).__vtable__;
    return table.records.map(record => String(record['title']));
  });

/** 表格当前记录的主键，按显示顺序 */
const readIds = (page: Page): Promise<string[]> =>
  tableCanvas(page).evaluate(el => {
    const table = (el as unknown as { __vtable__: { records: Array<Record<string, unknown>> } }).__vtable__;
    return table.records.map(record => String(record['id']));
  });

/** 等表格按主键排成 `order` 方向 */
const expectSortedById = async (page: Page, order: 'asc' | 'desc'): Promise<void> => {
  await expect
    .poll(
      async () => {
        const ids = await readIds(page);
        const sorted = ids.toSorted();
        return order === 'asc' ? ids.join() === sorted.join() : ids.join() === sorted.toReversed().join();
      },
      { timeout: 15_000 }
    )
    .toBe(true);
};

const expectTitles = async (page: Page, titles: string[]): Promise<void> => {
  await expect.poll(() => readTitles(page), { timeout: 15_000 }).toEqual(titles);
};

/**
 * 第 `row` 行序号列里拖动手柄的页面坐标；该行不渲染手柄时为 `null`。
 *
 * @remarks 不传 `row` 时取该行单元格中心（用作落点）。
 */
async function rowPoint(page: Page, row: number, iconName?: string): Promise<{ x: number; y: number } | null> {
  return tableCanvas(page).evaluate(
    (el, [targetRow, name]) => {
      interface SceneNode {
        name?: string;
        globalAABBBounds: { x1: number; x2: number; y1: number; y2: number };
        forEachChildren(cb: (child: SceneNode) => void): void;
      }
      const table = (el as unknown as { __vtable__: { scenegraph: { getCell(col: number, row: number): SceneNode } } })
        .__vtable__;
      const cell = table.scenegraph.getCell(0, targetRow);
      let hit: SceneNode | undefined = name === undefined ? cell : undefined;
      const visit = (node: SceneNode): void => {
        if (!hit && node.name === name) hit = node;
        node.forEachChildren(visit);
      };
      if (!hit) visit(cell);
      if (!hit) return null;
      const box = hit.globalAABBBounds;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + (box.y1 + box.y2) / 2 };
    },
    [row, iconName] as const
  );
}

const dragHandleAt = (page: Page, row: number): Promise<{ x: number; y: number } | null> =>
  rowPoint(page, row, DRAG_ICON);

/** 按住第 `from` 行的手柄拖到第 `to` 行上松手 */
async function dragRow(page: Page, from: number, to: number): Promise<void> {
  const start = await dragHandleAt(page, from);
  const end = await rowPoint(page, to);
  if (!start || !end) throw new Error(`第 ${from} 行没有拖动手柄或第 ${to} 行不在视口内`);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, end.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * 把第 `from` 行拖到第 `to` 行，直到表格显示 `expected`。
 *
 * @remarks
 * 刚进页面时活查询还在回灌、手柄还在开合，这时松手的拖放会被吞掉（表格停在 `before`）；
 * 只在顺序仍是 `before` 时重拖，已经换过位就不再动，避免叠加两次换位。
 */
async function dragRowUntil(page: Page, from: number, to: number, before: string[], expected: string[]): Promise<void> {
  await expect(async () => {
    if ((await readTitles(page)).join() === before.join()) await dragRow(page, from, to);
    expect(await readTitles(page)).toEqual(expected);
  }).toPass({ timeout: 30_000 });
}

/**
 * 点一下 ID 列头的排序图标（VTable 在 normal → asc → desc → normal 之间轮转）。
 *
 * @remarks 只有 ID 列可排序；图标名随当前状态变化，按 `sort` 前缀找。
 */
async function clickIdSort(page: Page): Promise<void> {
  const point = await tableCanvas(page).evaluate(el => {
    interface SceneNode {
      name?: string;
      globalAABBBounds: { x1: number; x2: number; y1: number; y2: number };
      forEachChildren(cb: (child: SceneNode) => void): void;
    }
    interface VTableLike {
      colCount: number;
      getHeaderField(col: number, row: number): unknown;
      scenegraph: { getCell(col: number, row: number): SceneNode };
    }
    const table = (el as unknown as { __vtable__: VTableLike }).__vtable__;
    const col = Array.from({ length: table.colCount }, (_, i) => i).find(c => table.getHeaderField(c, 0) === 'id');
    if (col === undefined) throw new Error('表格没有 ID 列');
    let icon: SceneNode | undefined;
    const visit = (node: SceneNode): void => {
      if (!icon && node.name?.startsWith('sort')) icon = node;
      node.forEachChildren(visit);
    };
    visit(table.scenegraph.getCell(col, 0));
    if (!icon) throw new Error('ID 列头没有排序图标');
    const box = icon.globalAABBBounds;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + (box.y1 + box.y2) / 2 };
  });
  await page.mouse.click(point.x, point.y);
}

/** ID 列当前的排序方向；列头图标经 `syncHeaderSortIcon` 与 VTable 的 `sortState` 同步 */
const readIdSort = (page: Page): Promise<'asc' | 'desc' | 'normal'> =>
  tableCanvas(page).evaluate(el => {
    const table = (el as unknown as { __vtable__: { sortState: unknown } }).__vtable__;
    const states = [table.sortState].flat() as Array<{ field?: unknown; order?: unknown } | null | undefined>;
    const order = states.find(state => state?.field === 'id')?.order;
    return order === 'asc' || order === 'desc' ? order : 'normal';
  });

/**
 * 把 ID 列轮转到 `order`。
 *
 * @remarks
 * 只在还没到位时点一下：紧挨上一次的点击可能被当成双击吞掉，此时重点；已到位就不再点，避免轮转过头。
 */
async function sortIdTo(page: Page, order: 'asc' | 'desc' | 'normal'): Promise<void> {
  await expect(async () => {
    if ((await readIdSort(page)) !== order) await clickIdSort(page);
    expect(await readIdSort(page)).toBe(order);
  }).toPass({ timeout: 15_000 });
}

/**
 * 不经手柄、直接让 VTable 换位并派发拖放事件（模拟绕过界面的程序拖放）。
 *
 * @remarks 顺序与 VTable 自己一致：先 `changeRecordOrder` 原地换位，再派发 `change_header_position`。
 */
async function forceRowMove(page: Page, from: number, to: number): Promise<void> {
  await tableCanvas(page).evaluate(
    (el, [source, target]) => {
      const table = (
        el as unknown as {
          __vtable__: {
            changeRecordOrder(sourceIndex: number, targetIndex: number): void;
            fireListeners(type: string, event: unknown): unknown;
          };
        }
      ).__vtable__;
      table.changeRecordOrder(source - 1, target - 1);
      table.fireListeners('change_header_position', {
        source: { col: 0, row: source },
        target: { col: 0, row: target },
        movingColumnOrRow: 'row'
      });
    },
    [from, to] as const
  );
}

async function reloadList(page: Page): Promise<void> {
  await page.reload();
  await expect(tableCanvas(page)).toBeVisible({ timeout: 15_000 });
}

test.describe('实体列表手动排序', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await seedTasks(page, ['甲', '乙', '丙']);
  });

  test('钉住单组时显示手柄，拖动后顺序落库，按列排序时手柄收起', async ({ page }) => {
    await page.goto(ACTIVE_TASKS_URL);
    await expectTitles(page, ['甲', '乙', '丙']);
    await expect.poll(() => dragHandleAt(page, 3), { timeout: 15_000 }).not.toBeNull();

    await dragRowUntil(page, 3, 1, ['甲', '乙', '丙'], ['丙', '甲', '乙']);
    await expect.poll(() => dragHandleAt(page, 1), { timeout: 15_000 }).not.toBeNull();

    await reloadList(page);
    await expectTitles(page, ['丙', '甲', '乙']);
    await expect.poll(() => dragHandleAt(page, 1), { timeout: 15_000 }).not.toBeNull();

    // 按列排序时看到的不是手动顺序，手柄收起；轮转回 normal 后恢复
    // 每次轮转后先等表格按新方向重查完再点下一次
    await sortIdTo(page, 'asc');
    await expectSortedById(page, 'asc');
    await expect.poll(() => dragHandleAt(page, 1), { timeout: 15_000 }).toBeNull();
    await sortIdTo(page, 'desc');
    await expectSortedById(page, 'desc');
    await expect.poll(() => dragHandleAt(page, 1), { timeout: 15_000 }).toBeNull();
    await sortIdTo(page, 'normal');
    await expectTitles(page, ['丙', '甲', '乙']);
    await expect.poll(() => dragHandleAt(page, 1), { timeout: 15_000 }).not.toBeNull();
  });

  test('未钉住排序域时没有手柄，程序拖放零写入并恢复原顺序', async ({ page }) => {
    await page.goto('/entities/public/Task');
    await expectTitles(page, ['甲', '乙', '丙']);
    expect(await dragHandleAt(page, 1)).toBeNull();

    await forceRowMove(page, 3, 1);
    await expectTitles(page, ['甲', '乙', '丙']);

    await reloadList(page);
    await expectTitles(page, ['甲', '乙', '丙']);
  });
});
