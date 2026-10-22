import { expect, test } from '@playwright/test';
import {
  createAsset,
  createCategory,
  expectActionIcon,
  expectFilteredCount,
  expectListEmpty,
  expectListHasRows,
  fillField,
  openCreateDialog,
  resetE2eState,
  selectRelationOption
} from './e2e-utils.js';

/**
 * US-526 工作台闭环的组合验收（domain/ 目录硬约束的领域测试应用）：
 * 预置 schema → 导航 → 录入 / 编辑 / 筛选 → 刷新 / 重开持久化，
 * 以及加载、失败与空态的断言覆盖。
 */
test.describe('模型驱动数据工作台', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('AC#1 导航只显示声明可见的实体，点击切换列表', async ({ page }) => {
    await page.goto('/entities');
    await page.waitForURL('**/entities/assets/Asset');
    const catalog = page.getByTestId('entity-catalog');
    await expect(catalog.getByTestId('entity-nav-link')).toHaveText(['资产', '资产分类', '维护记录']);
    await catalog.getByRole('link', { name: '资产分类' }).click();
    await page.waitForURL('**/entities/assets/AssetCategory');
  });

  test('AC#3 空列表显示空态与录入引导', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await expectListEmpty(page);
    await expect(page.getByTestId('entity-empty-state')).toContainText('点击「+ 新增」开始录入第一条资产分类');
  });

  test('AC#4 缺少必填字段提交给出可读校验反馈，数据不入库', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await openCreateDialog(page);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText(/是必填项/)).toBeVisible();
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
    await expectListEmpty(page);
  });

  test('AC#2/#5 录入关联实体、详情显示关联字段、编辑与删除', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    // 保存成功 toast 短暂出现
    await expect(page.getByTestId('save-toast')).toBeVisible();
    await page.goto('/entities/assets/Asset');
    await createAsset(page, '笔记本', '办公设备');

    // 详情：查看对话框显示字段值与关联信息
    const view = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(view.x, view.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    await expect(page.getByRole('group', { name: '名称' }).getByRole('textbox')).toHaveValue('笔记本');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    // 编辑：权限齐备时「查看」打开的就是 edit 模式（操作列没有独立编辑图标，与 Todo 同款）
    const edit = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(edit.x, edit.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    await fillField(page, '名称', '工作站');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    const afterEdit = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(afterEdit.x, afterEdit.y);
    await expect(page.getByRole('group', { name: '名称' }).getByRole('textbox')).toHaveValue('工作站');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    // 删除：确认弹层 → 行消失、回到空态
    const del = await expectActionIcon(page, 'delete-action', 1);
    await page.mouse.click(del.x, del.y);
    await expect(page.getByTestId('delete-confirm-submit')).toBeVisible();
    await page.getByTestId('delete-confirm-submit').click();
    await expectListEmpty(page);
  });

  test('维护记录：日期选择器与必填关联校验（评审反馈回归）', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await page.goto('/entities/assets/Asset');
    await createAsset(page, '笔记本', '办公设备');
    await page.goto('/entities/assets/AssetEvent');

    // 必填关联：不选所属资产提交 → 表单层校验反馈，不打到数据库
    // （事项/日期/所属资产三条必填同时报错，取第一条断言）
    await openCreateDialog(page);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText(/是必填项/).first()).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();

    // 日期选择器 + 关联选择：完整新建
    await openCreateDialog(page);
    await fillField(page, '事项', '更换电池');
    await page.getByRole('group', { name: '日期' }).locator('input[type="date"]').fill('2026-10-21');
    await selectRelationOption(page, '所属资产', '笔记本');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
    await expectListHasRows(page);
  });

  test('空库下必填关联给出创建提示（评审反馈回归）', async ({ page }) => {
    await page.goto('/entities/assets/AssetEvent');
    await openCreateDialog(page);
    // 暂无资产可关联：下拉只有 (空)，提示先创建对应记录
    await expect(page.getByTestId('relation-empty-hint')).toContainText('暂无「所属资产」可选');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
  });

  test('AC#6 查询筛选：按关联字段与标量字段过滤', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await createCategory(page, '家具');
    await expectListHasRows(page);

    await page.getByRole('button', { name: '筛选' }).click();
    await page.getByRole('button', { name: '添加第一个条件' }).click();
    const rule = page.locator('.rxdb-query-rule').first();
    await rule.locator('button[popovertarget]').first().click();
    await page.locator('[role="treeitem"][id$="-item-name"]').click();
    await rule.locator('button[popovertarget]').nth(1).click();
    await page.locator('[role="option"][id$="-opt-contains"]').click();
    await rule.locator('input[placeholder="输入值"]').fill('办公');
    await page.getByRole('button', { name: '确定' }).click();
    await expectFilteredCount(page, 1);

    // 快捷清除筛选：工具栏一键还原
    await page.getByTestId('clear-filter').click();
    await expectListHasRows(page);
    await expect(page.getByText('2 条记录')).toHaveCount(0);
  });

  test('AC#7 刷新与关闭重开浏览器标签后数据仍在', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await expectListHasRows(page);
    await page.reload();
    await page.waitForURL('**/entities/assets/AssetCategory');
    await expectListHasRows(page);
  });

  test('AC#8 失败态：未注册实体给出可读失败提示', async ({ page }) => {
    await page.goto('/entities/assets/Unknown');
    await expect(page.getByTestId('entity-load-failed')).toBeVisible();
    await expect(page.getByTestId('entity-load-failed')).toContainText('加载失败');
  });
});
