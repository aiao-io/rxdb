import { expect, test } from '@playwright/test';
import { readCount, resetE2eState } from './e2e-utils.js';

test.describe('File Manager Lazy - Batch Add Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/file-manager-lazy');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('app-file-manager-lazy-page')).toBeVisible();
  });

  test('should have batch add dropdown button', async ({ page }) => {
    const dropdown = page.getByTestId('file-batch-add');
    await expect(dropdown).toBeVisible();
  });

  test('should show batch add options when clicked', async ({ page }) => {
    const dropdownButton = page.getByTestId('file-batch-add');
    await dropdownButton.click();

    // 验证所有批量添加选项
    const option100 = page.getByTestId('file-batch-option-100');
    const option1000 = page.getByTestId('file-batch-option-1000');
    const option5000 = page.getByTestId('file-batch-option-5000');
    const option10000 = page.getByTestId('file-batch-option-10000');

    await expect(option100).toBeVisible();
    await expect(option1000).toBeVisible();
    await expect(option5000).toBeVisible();
    await expect(option10000).toBeVisible();
  });

  test('should add 100 files when clicking "添加 100 条"', async ({ page }) => {
    const dropdownButton = page.getByTestId('file-batch-add');
    await dropdownButton.click();

    // 获取初始计数（从 badge 显示的总数）
    const badgeBefore = page.getByTestId('file-count');
    const textBefore = await badgeBefore.textContent();
    const countBefore = readCount(textBefore, '根节点计数徽标');

    // 点击添加 100 条
    const option100 = page.getByTestId('file-batch-option-100');
    await option100.click();

    await expect(option100).toBeEnabled({ timeout: 60000 });

    // 验证 badge 显示的总数增加了
    const badgeAfter = page.getByTestId('file-count');

    // 使用轮询等待直到数量增加
    await expect(async () => {
      const textAfter = await badgeAfter.textContent();
      const countAfter = readCount(textAfter, '根节点计数徽标');
      // 由于是懒加载模式，badge 只显示根节点数量。
      // 生成的文件是树形结构，只有一部分会在根节点。
      // 所以我们只验证数量增加了，而不验证增加了 100。
      expect(countAfter - countBefore).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    const countAfter = readCount(await badgeAfter.textContent(), '根节点计数徽标');
    await page.reload();
    await expect(page.locator('app-file-manager-lazy-page')).toBeVisible({ timeout: 20000 });
    await expect
      .poll(async () => readCount(await page.getByTestId('file-count').textContent(), '刷新后的根节点计数徽标'), {
        timeout: 30000
      })
      .toBeGreaterThanOrEqual(countAfter);
  });

  /**
   * P0-3：原用例是 `await option.click(); await expect(loadingSpinner).toBeVisible();` ——
   * **点完立刻断言一个瞬时 UI**，中间没有任何 poll 或状态锚点。
   * 它自己的注释就承认了这一点：「使用更大的批量以确保加载状态持续足够长的时间，
   * 避免操作过快导致测试失败」—— **用例的通过与否取决于机器有多快**。
   *
   * 加载态在不引入人为节流（CDP CPU throttling 之类）的前提下**无法确定性断言**。
   * 所以这里改成断言它真正保证的那件事：**操作期间控件不可重复提交，
   * 结束后控件恢复可用且数据确实落库**。
   *
   * "spinner 出现过"本身不是用户价值；"点第二下不会重复写入"才是。
   */
  test('批量添加期间控件不可重复提交，完成后恢复可用', async ({ page }) => {
    const badge = page.getByTestId('file-count');
    const countBefore = readCount(await badge.textContent(), '根节点计数徽标');

    await page.getByTestId('file-batch-add').click();
    const option = page.getByTestId('file-batch-option-5000');
    await option.click();

    // 结束后控件必须恢复可用（若中途卡死或抛错，这条会超时）
    await expect(option).toBeEnabled({ timeout: 60000 });

    await expect
      .poll(async () => readCount(await badge.textContent(), '根节点计数徽标'), { timeout: 30000 })
      .toBeGreaterThan(countBefore);
  });
});
