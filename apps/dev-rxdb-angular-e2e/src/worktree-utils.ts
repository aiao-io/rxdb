import type { Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { expect } from './fixtures.js';

// `/worktree` 面板的共用步骤：`worktree.spec.ts` 与失败现场归档的导入用例（`failure-archive-import.spec.ts`）共用。

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

export const openPanel = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/worktree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
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
  await page.locator('a[href="/worktree"]').first().click();
  await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
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

// ── 命名 worktree（US-310） ──────────────────────────────────

/** 打开顶栏的 worktree 下拉并等它渲染出来。 */
export const openWorktreeMenu = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-worktree-menu').click();
  await expect(page.getByTestId('wt-worktree-menu-popup')).toBeVisible({ timeout: 10000 });
};

/** worktree 下拉里按所钉分支取那一行（属性选择器，理由同 `branchRow`）。 */
export const worktreeRow = (page: Page, branchId: string) =>
  page.locator(`[data-testid="wt-worktree-item"][data-branch-id="${branchId}"]`);

/** 那一行右端的移除按钮（与行按钮是兄弟，不是子节点）。 */
export const worktreeRemove = (page: Page, branchId: string) =>
  page.locator(`[data-testid="wt-worktree-remove"][data-branch-id="${branchId}"]`);

/** 创建弹层的两种来源：新建分支，或钉一条已有分支；label 原样填写（不 trim）。 */
export type WorktreeSubmitOptions =
  { readonly newBranch: string; readonly label?: string } | { readonly existing: string; readonly label?: string };

/**
 * 经创建弹层建一个 worktree：`newBranch` 走「New branch」（先 `createBranch`，FR-017：会复制当前
 * 未提交改动，再钉住），`existing` 走「Existing branch」。只点到确认为止，结果由调用方断言。
 */
export const submitWorktree = async (page: Page, options: WorktreeSubmitOptions): Promise<void> => {
  await openWorktreeMenu(page);
  await page.getByTestId('wt-worktree-create').click();
  await expect(page.getByTestId('wt-worktree-create-popover')).toBeVisible({ timeout: 10000 });
  if ('newBranch' in options) {
    await page.getByTestId('wt-worktree-mode-new').check();
    await page.getByTestId('wt-worktree-new-branch').fill(options.newBranch);
  } else {
    await page.getByTestId('wt-worktree-mode-existing').check();
    await page.getByTestId('wt-worktree-branch').selectOption(options.existing);
  }
  if (options.label !== undefined) await page.getByTestId('wt-worktree-label').fill(options.label);
  await page.getByTestId('wt-worktree-create-confirm').click();
};

/** 点 worktree 行切过去，并等 sr-only 状态条换到它钉住的分支。 */
export const switchToWorktree = async (page: Page, branchId: string): Promise<void> => {
  await openWorktreeMenu(page);
  await worktreeRow(page, branchId).click();
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branchId, { timeout: 30000 });
};
