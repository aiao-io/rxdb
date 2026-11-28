import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * US-029 阶段 D（AC#18～20）：按作用域的成员写权限，在实体列表上按行派生写入口。
 *
 * @remarks
 * 三端同一份用例。`TenantNote` 声明 `tenant:` + `tenantId` 作用域，三个写操作都要 `edit`。
 * demo 没有远端：列表上方的授权快照演示面板用系统写落 a、b 各一行（`a-note` / `b-note`），再由应用设入快照。
 * 表格由 VTable 画在 canvas 上：行只读标记与操作列图标从 canvas 的 `__vtable__` 读，点击走真实坐标。
 * 行按标题定位（标题在用例里唯一）。快照写进本地库，刷新后读回——刷新后的断言只能来自数据库。
 */

const TENANT_NOTES_URL = '/entities/public/TenantNote';

const tableCanvas = (page: Page): Locator => page.getByTestId('entity-shell').locator('canvas').first();

/** 一行的标题、作用域值与只读标记 */
interface RowState {
  title: string;
  tenant: string;
  readonly: boolean;
}

/** 表格当前的行，按标题排序（列表的默认顺序与这里无关） */
const readRows = (page: Page): Promise<RowState[]> =>
  tableCanvas(page).evaluate(el => {
    const table = (el as unknown as { __vtable__: { records: Array<Record<string, unknown>> } }).__vtable__;
    return table.records
      .map(record => ({
        title: String(record['title']),
        tenant: String(record['tenantId']),
        readonly: record['_readonly'] === true
      }))
      .toSorted((x, y) => x.title.localeCompare(y.title));
  });

/** 每一行是否只读，按标题排序 */
const readonlyByTitle = async (page: Page): Promise<Array<[string, boolean]>> =>
  (await readRows(page)).map(row => [row.title, row.readonly]);

/** 标题为 `title` 的那一行在表格里的行号（第 0 行是表头） */
const rowOf = (page: Page, title: string): Promise<number> =>
  tableCanvas(page).evaluate((el, target) => {
    const table = (el as unknown as { __vtable__: { records: Array<Record<string, unknown>> } }).__vtable__;
    return table.records.findIndex(record => record['title'] === target) + 1;
  }, title);

/**
 * 标题为 `title` 的那一行操作列里名为 `iconName` 的图标的页面坐标；该行不渲染此图标时为 `null`。
 *
 * @remarks 先把操作列单元格滚进视口，再从场景树按图标 `name` 取包围盒，换算成页面坐标。
 */
async function actionIconOf(page: Page, title: string, iconName: string): Promise<{ x: number; y: number } | null> {
  const row = await rowOf(page, title);
  if (row === 0) throw new Error(`表格里没有标题为 ${title} 的行`);
  return tableCanvas(page).evaluate(
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

/** 点标题为 `title` 的那一行的「查看」（重绘途中单元格里还没有图标：轮询到图标出现再点） */
async function openRow(page: Page, title: string): Promise<void> {
  await expect.poll(() => actionIconOf(page, title, 'view-action'), { timeout: 15_000 }).not.toBeNull();
  const view = await actionIconOf(page, title, 'view-action');
  await page.mouse.click(view!.x, view!.y);
  await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
}

/** 详情表单里某个字段的文本框（按字段的显示名定位） */
const fieldBox = (page: Page, label: string): Locator => page.getByRole('group', { name: label }).getByRole('textbox');

test.describe('US-029 实体列表按行派生写入口', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('快照未取到时全关并说明原因；a 可编辑、b 只读；收回 a 的 edit 后不刷新即收紧，刷新后从本地库读回', async ({
    page
  }) => {
    await page.goto(TENANT_NOTES_URL);
    const demo = page.getByTestId('grant-demo');
    const status = demo.getByTestId('grant-demo-status');
    const notice = page.getByTestId('entity-write-blocked');
    const create = page.getByRole('button', { name: '+ 新增' });
    const save = page.getByRole('button', { name: '保存', exact: true });
    const detailTab = page.getByRole('tab', { name: '基本信息' });

    // AC#20 快照未取到：写入口全关并给出原因；系统写照样落得下 a、b 两行，两行都只读、没有删除
    await expect(status).toHaveText('未取到');
    await expect(notice).toContainText('还没取到授权');
    await expect(create).toHaveCount(0);
    await demo.getByRole('button', { name: '生成示例数据' }).click();
    await expect
      .poll(() => readonlyByTitle(page), { timeout: 15_000 })
      .toEqual([
        ['a-note', true],
        ['b-note', true]
      ]);
    await expect.poll(() => actionIconOf(page, 'a-note', 'view-action'), { timeout: 15_000 }).not.toBeNull();
    expect(await actionIconOf(page, 'a-note', 'delete-action')).toBeNull();

    // AC#18 a 可编辑、b 只读：原因消失、新增放行；a 的行可编辑可删，b 的行只读只能查看
    await demo.getByRole('button', { name: 'a 可编辑、b 只读' }).click();
    await expect(status).toHaveText('tenant:a: edit, read; tenant:b: read');
    await expect(notice).toHaveCount(0);
    await expect(create).toBeVisible();
    await expect
      .poll(() => readonlyByTitle(page), { timeout: 15_000 })
      .toEqual([
        ['a-note', false],
        ['b-note', true]
      ]);
    await expect.poll(() => actionIconOf(page, 'a-note', 'delete-action'), { timeout: 15_000 }).not.toBeNull();
    expect(await actionIconOf(page, 'b-note', 'delete-action')).toBeNull();

    // a 的行以 edit 模式打开并保存：公开写入口按这一行的作用域放行
    await openRow(page, 'a-note');
    await expect(fieldBox(page, '标题')).toHaveValue('a-note');
    await fieldBox(page, '标题').fill('a-note-edited');
    await save.click();
    await expect(detailTab).toHaveCount(0);
    await expect
      .poll(async () => (await readRows(page)).map(row => row.title), { timeout: 15_000 })
      .toEqual(['a-note-edited', 'b-note']);

    // b 的行以 view 模式打开：没有可编辑控件、没有保存入口
    await openRow(page, 'b-note');
    await expect(page.locator('form').locator('input, select, textarea')).toHaveCount(0);
    await expect(save).toHaveCount(0);
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(detailTab).toHaveCount(0);

    // 新增只放行 a：表单保存到 b 被拒并指出缺权限的作用域，同一份草稿改到 a 才落库
    await create.click();
    await fieldBox(page, '标题').fill('new-note');
    await fieldBox(page, '租户').fill('b');
    await save.click();
    await expect(page.getByTestId('entity-detail-errors')).toContainText('tenant:b');
    await fieldBox(page, '租户').fill('a');
    await save.click();
    await expect(detailTab).toHaveCount(0);
    await expect
      .poll(() => readRows(page), { timeout: 15_000 })
      .toEqual([
        { title: 'a-note-edited', tenant: 'a', readonly: false },
        { title: 'b-note', tenant: 'b', readonly: true },
        { title: 'new-note', tenant: 'a', readonly: false }
      ]);

    // AC#19 收回 a 的 edit：不刷新，a 的行变只读、删除入口消失、新增关闭
    await demo.getByRole('button', { name: '收回 a 的 edit' }).click();
    await expect(status).toHaveText('tenant:a: read; tenant:b: read');
    await expect(create).toHaveCount(0);
    await expect
      .poll(() => readonlyByTitle(page), { timeout: 15_000 })
      .toEqual([
        ['a-note-edited', true],
        ['b-note', true],
        ['new-note', true]
      ]);
    await expect.poll(() => actionIconOf(page, 'a-note-edited', 'delete-action'), { timeout: 15_000 }).toBeNull();

    // 刷新：快照从本地库读回（不回到「未取到」），行仍只读，保存过的修改都在
    await page.reload();
    await expect(status).toHaveText('tenant:a: read; tenant:b: read');
    await expect(notice).toHaveCount(0);
    await expect
      .poll(() => readRows(page), { timeout: 15_000 })
      .toEqual([
        { title: 'a-note-edited', tenant: 'a', readonly: true },
        { title: 'b-note', tenant: 'b', readonly: true },
        { title: 'new-note', tenant: 'a', readonly: true }
      ]);
  });
});
