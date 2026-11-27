import { expect, type Locator, type Page } from '@playwright/test';

/** 推或拉 */
export type SyncDirection = 'pull' | 'push';

/** 右侧面板：同步中心、商品页的模拟服务端变更；操作历史在左侧，见 {@link openHistory} */
export type SidePanelView = 'sync' | 'server';

const SYNC_BUTTONS: Record<SyncDirection, string> = { pull: 'sync-pull', push: 'sync-push' };
const SYNC_DONE: Record<SyncDirection, string> = { pull: '拉取完成', push: '推送完成' };
const PANEL_TOGGLES: Record<SidePanelView, string> = {
  sync: 'sync-center-toggle',
  server: 'catalog-server-toggle'
};

/**
 * 点顶栏的「拉取」或「推送」，等这一轮结束（US-230）
 *
 * @param page - 页面
 * @param direction - 拉取或推送
 * @returns 这一轮结果的那条消息（toast，`data-source` 是 `sync-round-<轮次>`）
 *
 * @remarks
 * 同步组上的 `data-sync-round` 加一才算这一轮结束，成功失败都加；按轮次找消息，不会被上一轮留下的消息骗过。
 * 成功的消息几秒后自己消失，拿到之后马上断言。
 * 按钮不可点时（`aria-disabled`，比如没有待推送的修改）点击会一直等到超时，用例写错了会以超时报出。
 */
export async function syncRound(page: Page, direction: SyncDirection): Promise<Locator> {
  const group = page.getByTestId('workbench-sync-group');
  const finished = Number(await group.getAttribute('data-sync-round', { timeout: 60_000 }));
  await page.getByTestId(SYNC_BUTTONS[direction]).click({ timeout: 60_000 });
  await expect(group).toHaveAttribute('data-sync-round', String(finished + 1), { timeout: 60_000 });
  return page.locator(`[data-testid="toast"][data-source="sync-round-${finished + 1}"]`);
}

/**
 * 写着这段文字的消息（toast）
 *
 * @param page - 页面
 * @param text - 消息里的文字
 */
export function toast(page: Page, text: string): Locator {
  return page.getByTestId('toast').filter({ hasText: text });
}

/** 页面上的错误消息 */
export function errorToasts(page: Page): Locator {
  return page.locator('[data-testid="toast"][data-kind="error"]');
}

/**
 * 元素在视口里的位置与大小
 *
 * @param locator - 元素
 * @throws 元素不可见时直接报错，不拿空值往下比
 */
export async function boundsOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error('元素不可见，量不到位置');
  return bounds;
}

/**
 * 打开左侧的操作历史；已经开着就不动（宽屏默认开着）
 *
 * @param page - 页面
 * @returns 操作历史那一栏
 */
export async function openHistory(page: Page): Promise<Locator> {
  const column = page.getByTestId('history-column');
  if ((await column.count()) === 0) await page.getByTestId('workbench-history-toggle').click();
  await expect(column).toBeVisible();
  return column;
}

/**
 * 点顶栏的「拉取」，等它成功
 *
 * @param page - 页面
 * @returns 这一轮的结果行
 */
export async function pull(page: Page): Promise<Locator> {
  const result = await syncRound(page, 'pull');
  await expect(result).toContainText(SYNC_DONE.pull);
  return result;
}

/**
 * 点顶栏的「推送」，等它完成（被拒的也算完成，结果行写明条数）
 *
 * @param page - 页面
 * @returns 这一轮的结果行
 */
export async function push(page: Page): Promise<Locator> {
  const result = await syncRound(page, 'push');
  await expect(result).toContainText(SYNC_DONE.push);
  return result;
}

/**
 * 打开右侧的一个面板；已经开着就不动
 *
 * @param page - 页面
 * @param view - 哪个面板
 * @param timeout - 等面板出现的时限；缺省用 expect 的配置。刚切完身份、还在加载本地库的页面要放宽
 * @returns 右侧面板
 */
export async function openSidePanel(page: Page, view: SidePanelView, timeout?: number): Promise<Locator> {
  const panel = page.locator(`[data-testid="side-panel"][data-view="${view}"]`);
  if ((await panel.count()) === 0) await page.getByTestId(PANEL_TOGGLES[view]).click();
  await expect(panel).toBeVisible({ timeout });
  return panel;
}

/**
 * 断言页面不出现横向滚动：整页、内容区与顶栏都不比视口宽
 *
 * @param page - 页面
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() =>
    ['html', '#layout-content', '#layout-topbar'].filter(selector => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`页面上没有 ${selector}`);
      return element.scrollWidth > element.clientWidth;
    })
  );
  expect(overflowing, '这些容器出现了横向滚动').toEqual([]);
}

/**
 * 经侧栏切到另一页（不重新加载），等页面登记到顶栏
 *
 * @param page - 页面
 * @param link - 侧栏链接的文字
 * @param title - 顶栏显示的页面名
 */
export async function navigate(page: Page, link: string, title: string): Promise<void> {
  await page.getByRole('link', { name: link, exact: true }).click();
  await expect(page.getByTestId('workbench-title')).toHaveText(title);
}
