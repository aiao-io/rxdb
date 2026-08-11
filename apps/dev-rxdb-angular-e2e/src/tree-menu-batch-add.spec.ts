import { expect, test, type Page } from '@playwright/test';
import { readCount, resetE2eState } from './e2e-utils.js';

async function readVisibleMenuCount(page: Page) {
  const countBadge = page.getByTestId('menu-count');
  return readCount(await countBadge.textContent(), '菜单计数徽标');
}

test.describe('Tree Menu - Batch Add Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/menu-simple');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('app-tree-menu-simple-page')).toBeVisible();
  });

  test('should have batch add dropdown button', async ({ page }) => {
    const dropdown = page.getByTestId('menu-batch-add');
    await expect(dropdown).toBeVisible();
  });

  test('should show batch add options when clicked', async ({ page }) => {
    const dropdownButton = page.getByTestId('menu-batch-add');
    await dropdownButton.click();

    // 验证所有批量添加选项
    const option100 = page.getByTestId('menu-batch-option-100');
    const option1000 = page.getByTestId('menu-batch-option-1000');
    const option5000 = page.getByTestId('menu-batch-option-5000');
    const option10000 = page.getByTestId('menu-batch-option-10000');

    await expect(option100).toBeVisible();
    await expect(option1000).toBeVisible();
    await expect(option5000).toBeVisible();
    await expect(option10000).toBeVisible();
  });

  test('should add 100 menus when clicking "添加 100 条"', async ({ page }) => {
    const dropdownButton = page.getByTestId('menu-batch-add');
    await dropdownButton.click();

    const countBefore = await readVisibleMenuCount(page);

    // 点击添加 100 条
    const option100 = page.getByTestId('menu-batch-option-100');
    await option100.click();

    // 等待加载完成（等待按钮重新启用）
    await expect(option100).toBeEnabled({ timeout: 15000 });

    await expect
      .poll(async () => await readVisibleMenuCount(page), { timeout: 15000 })
      .toBeGreaterThanOrEqual(countBefore + 100);
  });

  /**
   * P2-4 + P0-3：这里原先是**两个逐字重复的用例**
   * （`should show loading state during batch add` 与
   * `should disable button during batch add operation`）——
   * 操作序列与断言完全一致，只有注释不同；后者的注释写着「快速连续点击」，
   * 而实现只 `click()` 了一次。
   *
   * 而且两者都在赌同一个瞬时窗口：`click()` 之后立刻 `toBeDisabled()`，
   * 100 条数据在快机器上可能已经写完、按钮已恢复可用。
   *
   * 合并成一条，并把断言换成不依赖时序的那部分：**结束后控件恢复可用、计数确实增长**。
   */
  test('批量添加完成后控件恢复可用且计数增长', async ({ page }) => {
    const countBefore = await readVisibleMenuCount(page);

    await page.getByTestId('menu-batch-add').click();
    const option100 = page.getByTestId('menu-batch-option-100');
    await option100.click();

    await expect(option100).toBeEnabled({ timeout: 60000 });
    await expect
      .poll(async () => await readVisibleMenuCount(page), { timeout: 30000 })
      .toBeGreaterThanOrEqual(countBefore + 100);
  });
});
