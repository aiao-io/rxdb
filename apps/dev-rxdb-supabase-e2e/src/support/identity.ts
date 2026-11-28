import { expect, type Page } from '@playwright/test';

/**
 * 用顶栏的「切换身份」换一个身份，等页面按新身份重新加载完
 *
 * @param page - 页面
 * @param choice - 菜单项的值：`visitor` / `anonymous` / `alice` / `bob`
 * @param title - 换好之后顶栏显示的身份名
 * @param readyTestId - 页面重新加载完时可见的元素；切换身份会重新加载页面，不等它就会点到旧页面上
 */
export async function switchIdentity(page: Page, choice: string, title: string, readyTestId: string): Promise<void> {
  await page.getByLabel('切换身份').selectOption(choice);
  await expect(page.getByTestId('identity-title')).toHaveText(title, { timeout: 60_000 });
  await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 60_000 });
}
