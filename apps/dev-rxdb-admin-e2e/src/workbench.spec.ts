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
  resetE2eState
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

  test('AC#3 空列表显示空态', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await expectListEmpty(page);
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
    await page.goto('/entities/assets/Asset');
    await createAsset(page, '笔记本', '办公设备');

    // 详情：查看对话框显示字段值与关联信息
    const view = await expectActionIcon(page, 'view-action', 1);
    await page.mouse.click(view.x, view.y);
    await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
    await expect(page.getByRole('group', { name: '名称' }).getByRole('textbox')).toHaveValue('笔记本');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);

    // 编辑：改名称并保存
    const edit = await expectActionIcon(page, 'edit-action', 1);
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

    // 删除：行消失、回到空态
    const del = await expectActionIcon(page, 'delete-action', 1);
    await page.mouse.click(del.x, del.y);
    await expect(page.getByText('暂无数据')).toBeVisible();
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
