import { expect, type Locator, type Page } from '@playwright/test';

/**
 * dev-rxdb-admin 的 e2e 共享工具。
 *
 * @remarks `resetE2eState` 与三端 demo 同款语义：init script 只在首次文档加载时
 * 移除数据库名，同一测试内的 reload 保留已生成的名字——既隔离跨测试数据，
 * 也验证刷新后的持久化。VTable 表格画在 canvas 上，行不可 DOM 定位，
 * 操作列图标按场景树换算坐标后点击（findActionIcon 与 dev-rxdb-react-e2e 同款）。
 */

const E2E_DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';
const E2E_RESET_MARKER = '__aiao_e2e_state_reset__';

/** 为当前 Playwright context 建立一次性的数据库隔离边界。 */
export async function resetE2eState(page: Page): Promise<void> {
  await page.addInitScript(
    ({ dbNameStorageKey, resetMarker }) => {
      if (window.sessionStorage.getItem(resetMarker) !== '1') {
        window.localStorage.removeItem(dbNameStorageKey);
        window.sessionStorage.removeItem(dbNameStorageKey);
        window.sessionStorage.setItem(resetMarker, '1');
      }
    },
    { dbNameStorageKey: E2E_DB_NAME_STORAGE_KEY, resetMarker: E2E_RESET_MARKER }
  );
}

/** 表格某行操作列图标在页面上的点击坐标，连同该行记录 id。 */
interface ActionIconHit {
  x: number;
  y: number;
  recordId: string;
}

/**
 * 定位表格第 `row` 行操作列里名为 `iconName` 的图标；该行不渲染此图标时返回 `null`。
 *
 * @remarks 图标不是 DOM 节点：VTable 把实例挂在 canvas 的 `__vtable__` 上，
 * 从场景树按图标 `name` 取包围盒换算成页面坐标，按真实位置点击。
 */
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
        records: Array<Record<string, unknown>>;
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
      return {
        x: rect.left + (box.x1 + box.x2) / 2,
        y: rect.top + (box.y1 + box.y2) / 2,
        recordId: String(table.records[targetRow - 1]?.['id'])
      };
    },
    [iconName, row] as const
  );
}

/** 等第 `row` 行的操作列图标出现并返回其坐标；图标不存在时抛错。 */
export async function expectActionIcon(page: Page, iconName: string, row = 1): Promise<ActionIconHit> {
  await expect.poll(async () => findActionIcon(page, iconName, row), { timeout: 15000 }).not.toBeNull();
  const hit = await findActionIcon(page, iconName, row);
  if (hit === null) throw new Error(`操作列没有 ${iconName} 图标`);
  return hit;
}

/** 打开「+ 新增」对话框并等待出现。 */
export async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ 新增' }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
}

/** 在打开的对话框中填一个文本字段并保存，等待对话框关闭。 */
export async function fillField(page: Page, fieldName: string, value: string): Promise<Locator> {
  const field = page.getByRole('group', { name: fieldName }).getByRole('textbox');
  await field.fill(value);
  return field;
}

/** 经「+ 新增」对话框落一条资产分类。 */
export async function createCategory(page: Page, name: string): Promise<void> {
  await openCreateDialog(page);
  await fillField(page, '分类名', name);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
}

/** 经「+ 新增」对话框落一条资产（分类为必填的关联选择）。 */
export async function createAsset(page: Page, name: string, category: string): Promise<void> {
  await openCreateDialog(page);
  await fillField(page, '名称', name);
  await selectRelationOption(page, '分类', category);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
}

/** 空列表：空态容器可见（内含「暂无数据」与录入引导；组件的默认空态经 CSS 隐藏但仍占 DOM）。 */
export async function expectListEmpty(page: Page): Promise<void> {
  await expect(page.getByTestId('entity-empty-state')).toBeVisible();
}

/** 列表有数据：空态容器消失（计数徽标只在有筛选时渲染，行本身在 canvas 上不可 DOM 定位）。 */
export async function expectListHasRows(page: Page): Promise<void> {
  await expect(page.getByTestId('entity-empty-state')).toHaveCount(0);
}

/**
 * 在关联下拉里选择一条记录：选项由活查询异步填充，且每次资源发射会重建选项列表，
 * selectOption 的重试可能一直撞在重建上——先等选项出现再选择。
 */
export async function selectRelationOption(page: Page, groupName: string, label: string): Promise<void> {
  const select = page.getByRole('group', { name: groupName }).getByRole('combobox');
  await expect
    .poll(async () => select.evaluate(el => (el as HTMLSelectElement).options.length), { timeout: 10000 })
    .toBeGreaterThan(1);
  await select.selectOption({ label });
}

/** 应用筛选后的计数徽标文案（如「1 条记录」）。 */
export async function expectFilteredCount(page: Page, count: number): Promise<void> {
  await expect(page.getByText(`${count} 条记录`)).toBeVisible();
}
