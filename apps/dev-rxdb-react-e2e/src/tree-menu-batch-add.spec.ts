import { expect, type Locator, test } from '@playwright/test';
import { openPage, readCount } from './e2e-utils.js';

async function clickAndObserveDisabled(locator: Locator) {
  const sawDisabled = await locator.evaluate((button: HTMLButtonElement) => {
    // 在点击前先监听 disabled 变为 true，避免错过瞬时状态切换
    const waitForDisabled = () =>
      new Promise<boolean>(resolve => {
        if (button.disabled) {
          resolve(true);
          return;
        }

        let timeoutId = 0;
        const observer = new MutationObserver(() => {
          if (!button.disabled) return;
          observer.disconnect();
          window.clearTimeout(timeoutId);
          resolve(true);
        });
        observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });

        timeoutId = window.setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 5000);
      });

    const disabled = waitForDisabled();
    button.click();
    return disabled;
  });

  expect(sawDisabled).toBe(true);
}

test.describe('Tree Menu - Batch Add Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
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

    // 获取初始计数
    const badgeBefore = page.getByTestId('menu-count');
    const textBefore = await badgeBefore.textContent();
    const countBefore = readCount(textBefore, 'badge');

    // 点击添加 100 条
    const option100 = page.getByTestId('menu-batch-option-100');
    await option100.click();

    // 等待加载完成（等待按钮重新启用）
    await expect(option100).toBeEnabled({ timeout: 15000 });

    // 验证计数增加
    await expect
      .poll(
        async () => {
          const text = await page.getByTestId('menu-count').textContent();
          return readCount(text, 'badge');
        },
        { timeout: 30000 }
      )
      .toBeGreaterThanOrEqual(countBefore + 100);
  });

  test('should show loading state during batch add', async ({ page }) => {
    const dropdownButton = page.getByTestId('menu-batch-add');
    await dropdownButton.click();

    const option100 = page.getByTestId('menu-batch-option-100');
    await clickAndObserveDisabled(option100);

    await expect(option100).toBeEnabled({ timeout: 15000 });
  });

  test('should disable button during batch add operation', async ({ page }) => {
    const dropdownButton = page.getByTestId('menu-batch-add');
    await dropdownButton.click();

    const option100 = page.getByTestId('menu-batch-option-100');

    await clickAndObserveDisabled(option100);
    await expect(option100).toBeEnabled({ timeout: 15000 });
  });
});
