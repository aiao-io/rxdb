import { expect, type Page } from '@playwright/test';

/**
 * @fileoverview 合并预览与分支对比（US-312）用例的造数：两条分支分叉以来都改了同一条 Todo。
 *
 * @remarks
 * 功能用例（`working-tree.spec.ts`）与 a11y 用例（`working-tree.a11y.spec.ts`）共用。面板不造数据，改 Todo 走 /todo 页，
 * 且要走工具栏仓库菜单的链接做 SPA 导航：整页刷新后的写入不经工作树捕获（见 `working-tree.spec.ts` 的 `writeTodo`）。
 * 起点是自动启用后停在 main 上的空库；终点停在 main 上、工作树干净。
 */

/** 两条分支各自改了什么。 */
export interface DivergedBranches {
  /** 从 main 分出去的分支 */
  readonly branch: string;
  /** main 上先入史的那条 Todo 的标题 */
  readonly base: string;
  /** 分支上把它改成的标题 */
  readonly onBranch: string;
  /** main 分叉以来把它改成的标题 */
  readonly onMain: string;
  /** 分支上先建后删的一条 Todo（压缩合并要滤掉的幽灵操作）；不给就不造 */
  readonly ghost?: string;
}

const branchRow = (page: Page, branchId: string) =>
  page.locator(`[data-testid="wt-branch-item"][data-branch-id="${branchId}"]`);

const openBranchMenu = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-branch-menu').click();
  await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible({ timeout: 10000 });
};

const switchToBranch = async (page: Page, branchId: string): Promise<void> => {
  await openBranchMenu(page);
  await branchRow(page, branchId).click();
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branchId, { timeout: 30000 });
};

/**
 * 分支下拉的「New branch」：在「Create a branch」对话框里填名字建分支，建完停在新分支上（GitHub Desktop 同款）。
 *
 * @remarks
 * 只在工作树干净时用：有改动的话建完会弹「Switch branch」，那一支由调用方自己走。Create 要等对话框里的预检回来才能点。
 */
export const createBranchFromDropdown = async (page: Page, branchId: string): Promise<void> => {
  await openBranchMenu(page);
  await page.getByTestId('wt-branch-create').click();
  const dialog = page.getByTestId('wt-create-branch-dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await page.getByTestId('wt-create-branch-name').fill(branchId);
  await expect(page.getByTestId('wt-create-branch-confirm')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('wt-create-branch-confirm').click();
  await expect(dialog).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branchId, { timeout: 30000 });
};

const commitAll = async (page: Page, message: string): Promise<void> => {
  await page.getByTestId('wt-commit-message').fill(message);
  await page.getByTestId('wt-commit').click();
  await expect.poll(() => page.getByTestId('wt-commit-live').textContent(), { timeout: 30000 }).toContain('Committed');
  await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
};

/** 到 /todo 页做一段编辑，再回到面板等它反映成未提交改动。 */
const onTodoPage = async (page: Page, edit: () => Promise<void>): Promise<void> => {
  await page.getByTestId('wt-repo-menu').click();
  await page.getByTestId('wt-edit-data').click();
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  await edit();
  await page.locator('a[href="/working-tree"]').first().click();
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
};

const addTodo = async (page: Page, title: string) => {
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  const row = page.getByTestId('todo-row').filter({ hasText: title });
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
};

/** 改一条 Todo 的标题。编辑态把标题文本换成输入框，按标题捕获的行会失配，改按「带输入框的那一行」取。 */
const renameTodo = async (page: Page, from: string, to: string): Promise<void> => {
  const row = page.getByTestId('todo-row').filter({ hasText: from });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.hover();
  await row.getByTestId('todo-edit').click();
  const editingRow = page
    .getByTestId('todo-row')
    .filter({ has: page.getByTestId('todo-edit-input') })
    .first();
  await editingRow.getByTestId('todo-edit-input').fill(to);
  await editingRow.getByTestId('todo-save').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: to })).toBeVisible({ timeout: 15000 });
};

const addThenDeleteTodo = async (page: Page, title: string): Promise<void> => {
  const row = await addTodo(page, title);
  await row.hover();
  await row.getByTestId('todo-delete').click();
  await expect(row).toBeHidden({ timeout: 30000 });
};

/** main 上一条 Todo 入史后分出 `branch`，两边各把它改成不同的标题并提交。 */
export const divergeBranches = async (page: Page, setup: DivergedBranches): Promise<void> => {
  await onTodoPage(page, async () => {
    await addTodo(page, setup.base);
  });
  await commitAll(page, `add ${setup.base}`);
  await createBranchFromDropdown(page, setup.branch);

  await onTodoPage(page, async () => {
    await renameTodo(page, setup.base, setup.onBranch);
    if (setup.ghost !== undefined) await addThenDeleteTodo(page, setup.ghost);
  });
  await commitAll(page, `rename on ${setup.branch}`);

  await switchToBranch(page, 'main');
  await onTodoPage(page, () => renameTodo(page, setup.base, setup.onMain));
  await commitAll(page, 'rename on main');
};
