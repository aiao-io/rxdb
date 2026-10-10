import { expect, test, type Page } from '@playwright/test';
import {
  loadParityGolden,
  normalizeParitySnapshot,
  type ParityFilterRaw,
  type ParityRawSnapshot
} from '../../../modules/e2e-parity/entity-model-parity.mjs';
import { resetE2eState } from './e2e-utils.js';

/**
 * rxdb-model 跨框架对拍（T049）：同一份 Todo 种子数据下，断言本端
 * 列表 / 详情 / 表单 / 查询构建器输出的**语义快照**与三端共享的 golden 一致。
 *
 * 三端（Angular / React / Vue）各有一份本 spec 的副本，跑同一场景；
 * 归一化与 golden 都在 `modules/e2e-parity/`（单一实现，见 entity-model-parity.mjs）。
 * 三端都过同一 golden ⇒ 三端两两一致。
 *
 * 副本间只允许一处差异：Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），
 * React / Vue 从 `@playwright/test` 取。其余内容必须保持同步，改一处改三处。
 */

/** 种子 Todo 标题：决定排序后的行序与筛选命中集，改这里必须同步更新 golden。 */
const SEED_TITLES = ['parity-alpha', 'parity-bravo', 'parity-charlie'] as const;
/** 筛选条件值：只命中第二笔种子。 */
const FILTER_VALUE = 'parity-bravo';

/** 表格某行操作列图标在页面上的点击坐标，连同该行记录 id。 */
interface ActionIconHit {
  x: number;
  y: number;
  recordId: string;
}

/**
 * 定位表格第 `row` 行操作列里名为 `iconName` 的图标；该行不渲染此图标时返回 `null`。
 *
 * @remarks 与 entity-model.spec.ts 同款：表格由 VTable 画在 canvas 上，图标不是 DOM 节点。
 * 先从 `__vtable__` 找到操作列，把单元格滚进视口，再从场景树按图标 `name` 取包围盒换算成
 * 页面坐标，后续按真实位置点击，走的仍是 VTable 自己的命中测试。
 */
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

/**
 * 读取列表的原始输出：表头字段顺序 + 行内容（行序 = 表格渲染序）。
 *
 * @remarks 归一化（易失值替换、结构校验）在共享模块 normalizeParitySnapshot 里，这里只负责采集。
 */
async function readListRaw(page: Page) {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  return canvas.evaluate(el => {
    interface VTableLike {
      colCount: number;
      records: Array<Record<string, unknown>>;
      getHeaderField(col: number, row: number): unknown;
    }
    const table = (el as unknown as { __vtable__: VTableLike }).__vtable__;
    const columns = Array.from({ length: table.colCount }, (_, c) => {
      const field = table.getHeaderField(c, 0);
      return typeof field === 'string' && field.length > 0 ? field : null;
    });
    const valueColumns = columns.filter((field): field is string => field !== null && field !== 'actions');
    const rows = table.records.map(record => {
      const row: Record<string, unknown> = {};
      for (const field of valueColumns) row[field] = record[field];
      return row;
    });
    return { columns, rows };
  });
}

/**
 * 点击列表表头（canvas 内）的排序图标，触发 VTable 列头排序。
 *
 * @remarks 头行是 scenegraph 的第 0 行；点表头单元格本身不排序，必须点单元格里的
 * 排序图标（场景树节点名 `sort_normal` / `sort_asc` / `sort_desc`）。先把单元格滚进
 * 视口，再按图标包围盒中心点击。
 */
async function clickHeader(page: Page, field: string): Promise<void> {
  const canvas = page.getByTestId('entity-shell').locator('canvas').first();
  const point = await canvas.evaluate((el, targetField) => {
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
    const col = Array.from({ length: table.colCount }, (_, c) => c).find(
      c => String(table.getHeaderField(c, 0)) === targetField
    );
    if (col === undefined) throw new Error(`表格没有 ${targetField} 列`);
    table.scrollToCell({ col, row: 0 });
    let sortIcon: SceneNode | undefined;
    const visit = (node: SceneNode): void => {
      if (!sortIcon && node.name !== undefined && node.name.startsWith('sort_')) sortIcon = node;
      node.forEachChildren(visit);
    };
    visit(table.scenegraph.getCell(col, 0));
    if (!sortIcon) throw new Error(`${targetField} 列头没有排序图标（列未开启排序）`);
    const box = sortIcon.globalAABBBounds;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + (box.y1 + box.y2) / 2 };
  }, field);
  await page.mouse.click(point.x, point.y);
}

/**
 * 读取表单原始输出：字段显示名 + 控件类型 + 当前值（view 模式为展示文本）。
 *
 * @remarks 三端都渲染 `<form><fieldset><legend>字段名</legend>…` 结构，以此作为采集契约；
 * view 模式没有 input / select / textarea，值取 legend 之后的组内文本。
 */
async function readFormRaw(page: Page) {
  const form = page.locator('form');
  await expect(form).toHaveCount(1);
  return form.locator('fieldset').evaluateAll(fieldsets =>
    fieldsets.map(fieldset => {
      const legend = fieldset.querySelector('legend');
      const label = (legend?.textContent ?? '').trim();
      const control = fieldset.querySelector('input, select, textarea');
      if (control === null) {
        const full = fieldset.textContent ?? '';
        const value = full.slice(full.indexOf(label) + label.length).trim();
        return { label, value };
      }
      const tag = control.tagName.toLowerCase();
      if (tag === 'select') {
        return { label, kind: 'select', value: (control as HTMLSelectElement).selectedOptions[0]?.text ?? '' };
      }
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        return { label, kind: 'checkbox', value: control.checked };
      }
      if (tag === 'textarea') {
        return { label, kind: 'textarea', value: (control as HTMLTextAreaElement).value };
      }
      const input = control as HTMLInputElement;
      return { label, kind: input.type === 'text' ? 'textbox' : input.type, value: input.value };
    })
  );
}

/**
 * 读取筛选弹层里查询构建器的原始条件树。
 *
 * @remarks 根分组组合关系取高亮按钮（btn-primary）的文本；每条规则的字段 / 操作符取选择器
 * 按钮的文本（即字段显示名 / 操作符标签），值取 `input[placeholder='输入值']`（规则里其它
 * input 属于已收起的选择器弹层，不能按位置取）。
 */
async function readFilterRaw(page: Page): Promise<ParityFilterRaw> {
  const group = page.locator('.rxdb-query-group').first();
  // join 按钮只有 AND / OR 两种文本；语义契约由 normalizeParitySnapshot 下游校验。
  const combinator = (await group.locator('.join button.btn-primary').innerText())
    .trim()
    .toLowerCase() as ParityFilterRaw['combinator'];
  const rules = await group.locator('.rxdb-query-rule').evaluateAll(ruleEls =>
    ruleEls.map(rule => {
      const buttons = rule.querySelectorAll('button[popovertarget]');
      const field = (buttons[0]?.textContent ?? '').trim();
      const operator = (buttons[1]?.textContent ?? '').trim();
      const valueInput = rule.querySelector('input[placeholder="输入值"]');
      if (!(valueInput instanceof HTMLInputElement)) {
        throw new Error('对拍规则缺值输入框：采集契约被破坏');
      }
      return { field, operator, value: valueInput.value };
    })
  );
  return { combinator, rules };
}

/** 经「+ 新增」对话框落一条 Todo（标题固定），并等待对话框关闭。 */
async function createTodo(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ 新增' }).click();
  await page.getByRole('group', { name: 'title' }).getByRole('textbox').fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
}

test.describe('Entity Model Cross-Framework Parity', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('同一份 Todo 种子数据下的语义快照与三端共享 golden 一致', async ({ page }, testInfo) => {
    await page.goto('/entities/public/Todo');
    await expect(page.getByTestId('entity-shell')).toBeVisible();
    await expect(page.getByText('暂无数据')).toBeVisible();

    // 1) create 模式表单字段（空值）——从第一笔种子的对话框里采集
    await page.getByRole('button', { name: '+ 新增' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    const createForm = await readFormRaw(page);
    await page.getByRole('group', { name: 'title' }).getByRole('textbox').fill(SEED_TITLES[0]);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    // 2) 种子：同一份 Todo 数据（标题固定，completed 走默认 false）
    for (const title of SEED_TITLES.slice(1)) {
      await createTodo(page, title);
    }
    await expect(page.getByText('暂无数据')).toHaveCount(0);

    // 3) 列表渲染：点 title 列头按标题升序（默认 id 倒序的 UUID 是随机的，顺序必须由排序交互确定）。
    // 先等三笔种子都进了表格：表格没就绪时点击会落空，而排序只能点一次（再点就翻成降序），不能重试
    await expect.poll(async () => (await readListRaw(page)).rows.length, { timeout: 15000 }).toBe(SEED_TITLES.length);
    await clickHeader(page, 'title');
    await expect
      .poll(async () => (await readListRaw(page)).rows[0]?.['title'], { timeout: 15000 })
      .toBe(SEED_TITLES[0]);
    const list = await readListRaw(page);

    // 4) 详情：第一行（parity-alpha）的详情对话框（Todo 权限齐备，「查看」打开 edit 模式）
    await expect.poll(() => findActionIcon(page, 'view-action', 1)).not.toBeNull();
    const view = await findActionIcon(page, 'view-action', 1);
    await page.mouse.click(view!.x, view!.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    // 详情记录经仓库异步加载，加载完之前表单按空数据渲染：等标题值落定再采集，否则读到的是空表单
    await expect(page.getByRole('group', { name: 'title' }).getByRole('textbox')).toHaveValue(SEED_TITLES[0]);
    const detail = {
      // tab 是 radio input，文本走 aria-label；读可见文本会拿到空串
      tabs: await page
        .getByRole('tab')
        .evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim())),
      form: await readFormRaw(page)
    };
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    // 5) 查询构建器：title 包含 parity-bravo 的条件树
    await page.getByRole('button', { name: '筛选' }).click();
    await page.getByRole('button', { name: '添加第一个条件' }).click();
    const rule = page.locator('.rxdb-query-rule').first();
    await rule.locator('button[popovertarget]').first().click();
    await page.locator('[role="treeitem"][id$="-item-title"]').click();
    await rule.locator('button[popovertarget]').nth(1).click();
    await page.locator('[role="option"][id$="-opt-contains"]').click();
    await rule.locator('input[placeholder="输入值"]').fill(FILTER_VALUE);
    const filter = await readFilterRaw(page);

    // 6) 应用筛选：计数徽标 + 过滤后的列表
    await page.getByRole('button', { name: '确定' }).click();
    await expect(page.getByText('1 条记录')).toBeVisible();
    const filterCountText = await page.getByText(/^\d+ 条记录$/).innerText();
    const filteredList = await readListRaw(page);

    // 7) 归一化并对比三端共享 golden（三端都过同一 golden ⇒ 三端两两一致）
    const snapshot = normalizeParitySnapshot({
      entity: 'public:Todo',
      list,
      detail,
      createForm,
      filter,
      filterCountText,
      filteredList
    } satisfies ParityRawSnapshot);
    expect(snapshot).toEqual(loadParityGolden(testInfo.file));
  });
});
