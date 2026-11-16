# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: list-view.spec.ts >> 新增对话框拖到视口边缘后仍可取消
- Location: src/list-view.spec.ts:37:5

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator: getByRole('button', { name: '取消', exact: true })
Expected: in viewport
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeInViewport" getByRole('button', { name: '取消', exact: true }) with timeout 5000ms
  - waiting for getByRole('button', { name: '取消', exact: true })

```

```yaml
- link "跳到主要内容":
    - /url: '#layout-content'
- complementary "主导航":
    - link "工作台":
        - /url: /
    - list:
        - listitem:
            - group:
                - text: 实体
                - list:
                    - listitem:
                        - link "资产 0":
                            - /url: /entities/assets/Asset
                    - listitem:
                        - link "资产分类 0":
                            - /url: /entities/assets/AssetCategory
                    - listitem:
                        - link "维护记录 0":
                            - /url: /entities/assets/AssetEvent
        - listitem:
            - group:
                - text: 数据
                - list:
                    - listitem:
                        - link "搜索":
                            - /url: /search
                    - listitem:
                        - link "备份 / 恢复":
                            - /url: /backup
    - button "折叠导航" [expanded]
    - separator "调整侧栏宽度"
- banner:
    - navigation "面包屑":
        - list:
            - listitem: 实体
            - listitem: 资产分类
    - button "搜索 ⌘ K"
    - button "切换语言"
    - button "时区：GMT+8": GMT+8
    - button "切换主题：跟随系统"
    - button "全屏"
    - button "刷新页面"
    - button "锁屏"
    - button "偏好设置"
- navigation "页签":
    - button "访问历史"
    - list:
        - listitem:
            - link "资产分类":
                - /url: /entities/assets/AssetCategory
            - button "移除页签：资产分类"
- main:
    - heading "资产分类" [level=1]
    - text: 资产分类
    - button "撤销 (Ctrl+Z) 0" [disabled]
    - button "重做 (Ctrl+Shift+Z) 0" [disabled]
    - button "字段配置"
    - button "排序"
    - button "分组"
    - button "筛选"
    - button "+ 新增"
    - textbox "数据表格焦点控制"
    - status "暂无数据": 暂无数据 点击「+ 新增」开始录入第一条资产分类
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import { createCategory, expectActionIcon, fillField, openCreateDialog, resetE2eState } from './e2e-utils.js';
  3   |
  4   | async function snapshot(page: Page) {
  5   |   return page
  6   |     .getByTestId('entity-shell')
  7   |     .locator('canvas')
  8   |     .first()
  9   |     .evaluate(element => {
  10  |       interface Table {
  11  |         colCount: number;
  12  |         rowCount: number;
  13  |         records: Array<Record<string, unknown>>;
  14  |         getHeaderField(col: number, row: number): unknown;
  15  |         getRecordByCell(col: number, row: number): Record<string, unknown>;
  16  |       }
  17  |       const table = (element as unknown as { __vtable__: Table }).__vtable__;
  18  |       const groups = Array.from({ length: table.rowCount - 1 }, (_, index) =>
  19  |         table.getRecordByCell(1, index + 1)
  20  |       ).filter(record => record?.['vtableMerge'] === true);
  21  |       return {
  22  |         rowCount: table.rowCount,
  23  |         fields: Array.from({ length: table.colCount }, (_, col) => table.getHeaderField(col, 0)),
  24  |         names: table.records
  25  |           .flatMap(record =>
  26  |             record['vtableMerge'] === true ? (record['children'] as Array<Record<string, unknown>>) : [record]
  27  |           )
  28  |           .map(record => record['name']),
  29  |         groups: groups.map(record => ({
  30  |           value: record['vtableMergeName'],
  31  |           count: (record['children'] as unknown[]).length
  32  |         }))
  33  |       };
  34  |     });
  35  | }
  36  |
  37  | test('新增对话框拖到视口边缘后仍可取消', async ({ page }) => {
  38  |   await resetE2eState(page);
  39  |   await page.goto('/entities/assets/AssetCategory');
  40  |   await openCreateDialog(page);
  41  |
  42  |   const title = page.getByText('新建资产分类', { exact: true });
  43  |   const titleBox = await title.boundingBox();
  44  |   const viewport = page.viewportSize();
  45  |   expect(titleBox).not.toBeNull();
  46  |   expect(viewport).not.toBeNull();
  47  |   if (!titleBox || !viewport) throw new Error('新增对话框标题或视口不可用');
  48  |
  49  |   await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
  50  |   await page.mouse.down();
  51  |   await page.mouse.move(viewport.width - 1, viewport.height - 1, { steps: 10 });
  52  |   await page.mouse.up();
  53  |
  54  |   console.log(
  55  |     await page.evaluate(() => ({
  56  |       url: location.href,
  57  |       viewport: { width: innerWidth, height: innerHeight },
  58  |       dialogs: document.querySelectorAll('[role=\"dialog\"]').length,
  59  |       cancelButtons: [...document.querySelectorAll('button')].filter(button => button.textContent?.trim() === '取消').length,
  60  |       paneStyle: document.querySelector('[role=\"dialog\"]')?.getAttribute('style')
  61  |     }))
  62  |   );
  63  |   const cancel = page.getByRole('button', { name: '取消', exact: true });
> 64  |   await expect(cancel).toBeInViewport();
      |                        ^ Error: expect(locator).toBeInViewport() failed
  65  |   await cancel.click();
  66  |   await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
  67  | });
  68  |
  69  | test('字段配置、排序和空值分组在真实表格中可操作，分组后仍可编辑', async ({ page }) => {
  70  |   await resetE2eState(page);
  71  |   await page.goto('/entities/assets/AssetCategory');
  72  |   await createCategory(page, 'beta');
  73  |   await createCategory(page, 'alpha');
  74  |
  75  |   await page.getByText('字段配置', { exact: true }).click();
  76  |   await page.getByLabel('显示说明', { exact: true }).uncheck();
  77  |   await expect.poll(async () => (await snapshot(page)).fields.includes('description')).toBe(false);
  78  |   await page.getByLabel('显示说明', { exact: true }).check();
  79  |   const source = await page.getByRole('button', { name: '拖动分类名排序', exact: true }).boundingBox();
  80  |   const target = await page.getByRole('button', { name: '拖动ID排序', exact: true }).boundingBox();
  81  |   expect(source).not.toBeNull();
  82  |   expect(target).not.toBeNull();
  83  |   await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  84  |   await page.mouse.down();
  85  |   await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
  86  |   await page.mouse.up();
  87  |   await expect.poll(async () => (await snapshot(page)).fields[1]).toBe('name');
  88  |
  89  |   await page.getByText('排序', { exact: true }).click();
  90  |   await page.getByLabel('添加排序字段').selectOption('name');
  91  |   await expect.poll(async () => (await snapshot(page)).names).toEqual(['alpha', 'beta']);
  92  |   await page.getByLabel('分类名排序方向').selectOption('desc');
  93  |   await expect.poll(async () => (await snapshot(page)).names).toEqual(['beta', 'alpha']);
  94  |
  95  |   await page.getByText('分组', { exact: true }).click();
  96  |   await page.getByLabel('分组字段', { exact: true }).selectOption('description');
  97  |   await expect.poll(async () => (await snapshot(page)).groups).toEqual([{ value: null, count: 2 }]);
  98  |   await page.getByText('分组 1', { exact: true }).click();
  99  |   const toggleGroup = () =>
  100 |     page
  101 |       .getByTestId('entity-shell')
  102 |       .locator('canvas')
  103 |       .first()
  104 |       .evaluate(element => {
  105 |         const table = (element as unknown as { __vtable__: { toggleHierarchyState(col: number, row: number): void } })
  106 |           .__vtable__;
  107 |         table.toggleHierarchyState(1, 1);
  108 |       });
  109 |   await toggleGroup();
  110 |   await expect.poll(async () => (await snapshot(page)).rowCount).toBe(2);
  111 |   await toggleGroup();
  112 |   await expect.poll(async () => (await snapshot(page)).rowCount).toBe(4);
  113 |   const view = await expectActionIcon(page, 'view-action', 2);
  114 |   await page.mouse.click(view.x, view.y);
  115 |   await expect(page.getByRole('group', { name: '分类名' }).getByRole('textbox')).toHaveValue('beta');
  116 |   await fillField(page, '分类名', 'beta-edited');
  117 |   await page.getByRole('button', { name: '保存', exact: true }).click();
  118 |   await expect.poll(async () => (await snapshot(page)).names).toContain('beta-edited');
  119 |
  120 |   await page.getByText('分组 1', { exact: true }).click();
  121 |   await page.getByLabel('分组字段', { exact: true }).selectOption('');
  122 |   await expect.poll(async () => (await snapshot(page)).groups).toEqual([]);
  123 |   await page.getByText('分组', { exact: true }).click();
  124 |
  125 |   await page.getByTestId('admin-sidebar-toggle').click();
  126 |   await page.setViewportSize({ width: 375, height: 812 });
  127 |   await page.getByText('字段配置', { exact: true }).click();
  128 |   const checkbox = page.getByLabel('显示说明', { exact: true });
  129 |   await expect(checkbox).toBeInViewport();
  130 |   await checkbox.uncheck();
  131 |   await expect.poll(async () => (await snapshot(page)).fields.includes('description')).toBe(false);
  132 | });
  133 |
  134 | test('字段开关和排序分组弹层在桌面及窄屏完整可见，支持 Escape 关闭', async ({ page }) => {
  135 |   await resetE2eState(page);
  136 |   await page.goto('/entities/assets/AssetCategory');
  137 |   await createCategory(page, '弹层定位');
  138 |   await page.getByTestId('admin-sidebar-toggle').click();
  139 |   await page.getByRole('button', { name: '字段配置', exact: true }).click();
  140 |   await expect(page.getByRole('switch', { name: '显示分类名', exact: true })).toBeChecked();
  141 |   await page.keyboard.press('Escape');
  142 |   for (const width of [1280, 768, 375]) {
  143 |     await page.setViewportSize({ width, height: 812 });
  144 |     for (const name of ['字段配置', '排序', '分组']) {
  145 |       await page.getByRole('button', { name, exact: true }).click();
  146 |       const panel = page.getByRole('group', { name: `${name}选项`, exact: true });
  147 |       await expect(panel).toBeVisible();
  148 |       await expect
  149 |         .poll(async () => {
  150 |           const box = await panel.boundingBox();
  151 |           return (
  152 |             box !== null && box.x >= 8 && box.x + box.width <= width - 8 && box.y >= 8 && box.y + box.height <= 804
  153 |           );
  154 |         })
  155 |         .toBe(true);
  156 |       await page.keyboard.press('Escape');
  157 |       await expect(panel).toBeHidden();
  158 |     }
  159 |   }
  160 | });
  161 |
```
