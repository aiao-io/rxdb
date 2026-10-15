import type { Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { expect } from './fixtures.js';

// `/working-tree` 面板的共用步骤：`working-tree.spec.ts` 与失败现场归档的导入用例（`failure-archive-import.spec.ts`）共用。

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

export const openPanel = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(SETTLED, { timeout: 20000 });
};

/**
 * 等自动初始化落定。
 *
 * 空库在**应用启动时**就被 `enableIfEmpty()` 自动启用（setup 在 init 之后 fire-and-forget），
 * 页面加载后这里只等、不点：手动 `enable()` 只属于「有内容但未启用」的库（见
 * 「有内容的库不自动启用」用例，它用 localStorage 键跳过启动时的自动启用）。
 */
export const waitForAutoEnabled = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

/**
 * 到 /todo 页写一条 Todo，再回到工作树页等它反映成未提交改动。
 *
 * 面板不造数据是有意的：和 GitHub Desktop 打开一个别人编辑过的仓库是同一件事，
 * 「编辑文件」这一步发生在别处。
 *
 * **必须走侧栏链接做 SPA 导航，不能用 `page.goto`。** `goto` 是整页刷新：
 * 刷新后落在 /todo 上的那次写入不经工作树捕获（实测 2026-09-18），工作树
 * 会一直显示「干净」；同一次页面会话里点链接切页，捕获路径保持不变。
 */
export const writeTodo = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('wt-repo-menu').click();
  await page.getByTestId('wt-edit-data').click();
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  await page.locator('a[href="/working-tree"]').first().click();
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
};

/**
 * 用给定信息提交并等提交落定（提交框在「变更」标签页里）。
 *
 * 成功没有可见的状态行（GitHub Desktop 同款）：断言两条不可见契约——读屏播报
 * `wt-commit-live` 出「已提交」，底部状态条跟着翻成「干净」。
 */
export const commit = async (page: Page, message: string): Promise<void> => {
  await page.getByTestId('wt-commit-message').fill(message);
  await page.getByTestId('wt-commit').click();
  await expect.poll(() => page.getByTestId('wt-commit-live').textContent(), { timeout: 30000 }).toContain('Committed');
  await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
};

/**
 * 切到「历史」标签页并等历史落定。
 *
 * 面板头没有刷新按钮（GitHub Desktop 同款）：第一次进历史页由 `selectTab` 自动补读
 * （`listCommitsState` 停在 idle 时），之后每次提交 `runCommit` 都会重读。
 */
export const openHistory = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-tab-history').click();
  await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
};

/** 切回「变更」标签页。 */
export const openChanges = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-tab-changes').click();
};
