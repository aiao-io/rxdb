import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * @fileoverview `/working-tree` 面板的 git 工作流功能用例。
 *
 * @remarks
 * 面板重构（2026-09-18）的目标是「还原 git 提交的过程」，这份用例按同一条叙事走：
 * 初始化 → 首次提交 → 建分支 → 分支提交 → 带脏工作树被拒 → 丢弃后切换 → 合并
 * （落进工作树，像 `git merge --no-commit`）→ 提交合并 → 恢复历史版本 → 提交恢复。
 *
 * a11y 与 SC-005 的断言在 `working-tree.a11y.spec.ts`，这里只锁行为。
 */

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

const openPanel = async (page: import('@playwright/test').Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(SETTLED, { timeout: 20000 });
};

const enablePanel = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByTestId('wt-enable').click();
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

/** 写入一条 Todo 并等状态区反映出来。 */
const writeTodo = async (page: import('@playwright/test').Page, title: string): Promise<void> => {
  await page.getByTestId('wt-todo-title').fill(title);
  await page.getByTestId('wt-write-todo').click();
  await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
};

/** 用给定信息提交并等提交落定。 */
const commit = async (page: import('@playwright/test').Page, message: string): Promise<void> => {
  await page.getByTestId('wt-commit-message').fill(message);
  await page.getByTestId('wt-commit').click();
  await expect(page.getByTestId('wt-commit-outcome')).toHaveText(/已提交/, { timeout: 30000 });
};

/**
 * 左栏里按分支名取那一行。
 *
 * 用行上的 `data-branch-id` 属性而不是文本过滤：行内还带着「来自 <parentId>」，
 * 子串 `main` 会同时命中名字是「feature/x main」的那一行；而文本过滤的正则
 * 锚定（`^`）撞不上 textContent 的前导空白。属性选择器两头都不沾。
 */
const branchRow = (page: import('@playwright/test').Page, branchId: string) =>
  page.locator(`[data-testid="wt-branch-item"][data-branch-id="${branchId}"]`);

test.describe('Working Tree 页面功能', () => {
  test('完整 git 流程：提交 → 分支 → 脏工作树拒切 → 合并入工作树 → 恢复', async ({ page }) => {
    await openPanel(page);
    await enablePanel(page);

    // ── 1. main 上首次提交 ─────────────────────────────────
    await writeTodo(page, 'docs: 首页文档');
    await commit(page, 'docs: 首页文档');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    // ── 2. 建分支并切过去 ──────────────────────────────────
    await page.getByTestId('wt-branch-create').click();
    await page.getByTestId('wt-branch-name').fill('feature/x');
    await page.getByTestId('wt-branch-create-confirm').click();
    await expect(branchRow(page, 'feature/x')).toBeVisible({ timeout: 10000 });

    await branchRow(page, 'feature/x').click();
    await page.getByTestId('wt-branch-switch').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x', { timeout: 30000 });

    // ── 3. 分支上的提交（历史继承 main 的父链） ─────────────
    await writeTodo(page, 'feat: 新功能');
    await commit(page, 'feat: 新功能');
    await page.getByTestId('wt-list-commits').click();
    await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
    await expect(page.getByTestId('wt-commits-list')).toContainText('docs: 首页文档');
    await expect(page.getByTestId('wt-commits-list')).toContainText('feat: 新功能');

    // ── 4. 脏工作树 + requireClean → 切换被拒 ──────────────
    await writeTodo(page, '未完成的草稿');
    await branchRow(page, 'main').click();
    await page.getByTestId('wt-branch-switch').click();
    await expect(page.getByTestId('wt-toast')).toContainText('未提交改动', { timeout: 10000 });
    // 拒绝不等于切换：还留在原分支上
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x');

    // 丢弃后重试成功
    await page.getByTestId('wt-discard').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await branchRow(page, 'main').click();
    await page.getByTestId('wt-branch-switch').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });

    // ── 5. 合并：结果进工作树（git merge --no-commit） ──────
    await branchRow(page, 'feature/x').click();
    await page.getByTestId('wt-branch-merge').click();
    await page.getByTestId('wt-merge-confirm').click();
    await expect(page.getByTestId('wt-toast')).toContainText('工作树', { timeout: 10000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });

    await commit(page, 'merge: feature/x');
    await page.getByTestId('wt-list-commits').click();
    await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
    await expect(page.getByTestId('wt-commits-list')).toContainText('merge: feature/x');

    // ── 6. 恢复历史版本：内容回工作树，再提交 ──────────────
    // 历史倒序（最新在前）：merge / feat / docs / 基线。基线没有恢复按钮，
    // 最后一个恢复按钮对应最早的用户提交 docs。
    await page.getByTestId('wt-restore').last().click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-restore')).toHaveText('恢复中', { timeout: 10000 });

    await commit(page, 'revert: 恢复 docs 版本');
    await page.getByTestId('wt-list-commits').click();
    await expect(page.getByTestId('wt-commits-list')).toContainText('revert: 恢复 docs 版本');
  });

  test('干净工作树上的空提交被拒（empty_commit 有 UI 呈现）', async ({ page }) => {
    await openPanel(page);
    await enablePanel(page);

    await page.getByTestId('wt-commit-message').fill('什么都不会发生');
    await page.getByTestId('wt-commit').click();
    // 工作树干净 → CommitValidationError.empty_commit，落进提交结果的 error 相位。
    await expect(page.getByTestId('wt-commit-phase')).toHaveText('error', { timeout: 30000 });
    await expect(page.getByTestId('wt-commit-error')).toBeVisible();
  });
});
