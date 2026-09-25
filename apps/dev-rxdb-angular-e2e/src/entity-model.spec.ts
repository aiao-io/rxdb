import { expect, test, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * 经「+ 新增」对话框落一条 Todo，并等待对话框关闭。
 *
 * @remarks 表格由 VTable 渲染在 canvas 上，行本身不可被 DOM 定位；
 * 列表侧只能靠空态 / 计数徽标这类真实 DOM 反映数据变化。
 */
async function createTodo(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ 新增' }).click();
  await page.getByRole('group', { name: 'title' }).getByRole('textbox').fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
}

test.describe('Entity Model Pages', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test.describe('Entity List (/entities)', () => {
    test('left catalog renders and auto-redirects to the first entity', async ({ page }) => {
      await page.goto('/entities');
      // 左侧实体目录 + 自动重定向到首个实体（public:Article）
      await expect(page.getByText('实体类型')).toBeVisible();
      await page.waitForURL('**/entities/public/Article');
      await expect(page.getByText('Article', { exact: true }).first()).toBeVisible();
    });

    test('should switch the right list by clicking the left catalog', async ({ page }) => {
      await page.goto('/entities/public/Article');

      // 限定在壳页目录内：全局侧边栏菜单也有 "Todo (findAll)" 链接（三端统一 testid 锚点）
      await page.getByTestId('entity-shell').getByRole('link', { name: /^Todo/ }).click();
      await page.waitForURL('**/entities/public/Todo');

      await expect(page.getByText('Todo', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '撤销 (Ctrl+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '筛选' })).toBeVisible();
      await expect(page.getByRole('button', { name: '+ 新增' })).toBeVisible();
      // 空库时表格渲染空态
      await expect(page.getByText('暂无数据')).toBeVisible();
    });

    test('should create a todo through the detail dialog and refresh the list', async ({ page }) => {
      await page.goto('/entities/public/Todo');
      await page.getByRole('button', { name: '+ 新增' }).click();
      // 对话框内是 create 模式的实体详情（Tab + 表单）
      await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'title' }).getByRole('textbox')).toBeVisible();
      await expect(page.getByRole('group', { name: 'completed' }).getByRole('checkbox')).toBeVisible();

      await page.getByRole('group', { name: 'title' }).getByRole('textbox').fill('e2e-connected-todo');
      await page.getByRole('button', { name: '保存', exact: true }).click();

      // 保存成功：对话框关闭，列表刷新后空态消失
      await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
      await expect(page.getByText('暂无数据')).toHaveCount(0);
    });

    test('undo / redo 回滚并重放新增的记录', async ({ page }) => {
      await page.goto('/entities/public/Todo');
      await createTodo(page, 'e2e-undo-todo');

      const undo = page.getByRole('button', { name: '撤销 (Ctrl+Z)' });
      const redo = page.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' });
      await expect(undo).toBeEnabled();
      await expect(page.getByText('暂无数据')).toHaveCount(0);

      // 撤销：记录回滚 → 空态恢复，重做变可用
      await undo.click();
      await expect(page.getByText('暂无数据')).toBeVisible();
      await expect(redo).toBeEnabled();

      // 重做走键盘快捷键：焦点落在列表内的非输入控件上才会命中 keydown 监听
      await page.getByRole('button', { name: '筛选' }).press('Control+Shift+z');
      await expect(page.getByText('暂无数据')).toHaveCount(0);
      await expect(undo).toBeEnabled();
    });

    test('筛选弹层按条件重查，重置后恢复全量', async ({ page }) => {
      await page.goto('/entities/public/Todo');
      await createTodo(page, 'e2e-filter-hit');

      await page.getByRole('button', { name: '筛选' }).click();
      // 弹层里的控件必须能按 role 定位：整片带上 aria-hidden 会让这一步连同读屏一起落空
      const apply = page.getByRole('button', { name: '确定' });
      await expect(apply).toBeVisible();
      await expect(page.getByRole('button', { name: '重置' })).toBeVisible();

      // 组一条 title 包含 filter-hit 的规则（Todo 首字段是布尔 completed，需先切字段）
      await page.getByRole('button', { name: '添加第一个条件' }).click();
      const rule = page.locator('.rxdb-query-rule').first();
      await rule.locator('button[popovertarget]').first().click();
      await page.locator('[role="treeitem"][id$="-item-title"]').click();
      await rule.locator('button[popovertarget]').nth(1).click();
      await page.locator('[role="option"][id$="-opt-contains"]').click();
      await rule.locator('input[placeholder="输入值"]').fill('filter-hit');
      await apply.click();
      await expect(page.getByText('1 条记录')).toBeVisible();

      // 换成匹配不到的值：计数归零并回到空态
      await page.getByRole('button', { name: '筛选' }).click();
      await rule.locator('input[placeholder="输入值"]').fill('no-such-todo');
      await apply.click();
      await expect(page.getByText('0 条记录')).toBeVisible();
      await expect(page.getByText('暂无数据')).toBeVisible();

      // 重置：计数徽标随筛选条件一起消失，列表恢复全量（resetFilter 不关闭弹层）
      await page.getByRole('button', { name: '筛选' }).click();
      await page.getByRole('button', { name: '重置' }).click();
      await expect(page.getByText('条记录')).toHaveCount(0);
      await expect(page.getByText('暂无数据')).toHaveCount(0);
    });
  });
});
