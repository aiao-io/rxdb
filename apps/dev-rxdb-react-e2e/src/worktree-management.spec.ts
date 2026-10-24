import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { createBranchFromDropdown } from './working-tree-branches.js';

const openPanel = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

const openWorktrees = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-worktree-menu').click();
  await expect(page.getByTestId('wt-worktree-menu-popup')).toBeVisible();
};

const branchRow = (page: Page, branch: string): Locator =>
  page.getByTestId('wt-branch-item').and(page.locator(`[data-branch-id="${branch}"]`));

const switchBranch = async (page: Page, branch: string): Promise<void> => {
  await page.getByTestId('wt-branch-menu').click();
  await branchRow(page, branch).click();
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branch, { timeout: 30000 });
};

const writeTodo = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('wt-repo-menu').click();
  await page.getByTestId('wt-edit-data').click();
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  await page.locator('a[href="/working-tree"]').first().click();
  await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
};

const commit = async (page: Page, message: string): Promise<void> => {
  await page.getByTestId('wt-tab-changes').click();
  await page.getByTestId('wt-commit-message').fill(message);
  await page.getByTestId('wt-commit').click();
  await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
};

const history = async (page: Page, messages: readonly string[]): Promise<void> => {
  await page.getByTestId('wt-tab-history').click();
  await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
  await expect(page.getByTestId('wt-commit-item')).toHaveCount(messages.length + 1);
  for (const message of messages) await expect(page.getByTestId('wt-commits-list')).toContainText(message);
};

const mount = async (page: Page, name: string, branch: string): Promise<void> => {
  await openWorktrees(page);
  await page.getByTestId('wt-worktree-item').filter({ hasText: name }).click();
  await expect(page.getByTestId('wt-worktree-menu')).toContainText(name, { timeout: 30000 });
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branch, { timeout: 30000 });
  await expect(page.getByTestId('wt-branch-menu')).toContainText(branch);
};

const openCreate = async (page: Page): Promise<Locator> => {
  await openWorktrees(page);
  await page.getByTestId('wt-worktree-create').click();
  const dialog = page.getByTestId('wt-worktree-create-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

const createWorktree = async (page: Page, name: string, branch: string): Promise<void> => {
  const dialog = await openCreate(page);
  await page.getByTestId('wt-worktree-create-name').fill(name);
  await page.getByTestId('wt-worktree-create-branch').selectOption(branch);
  await page.getByTestId('wt-worktree-create-confirm').click();
  await expect(dialog).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByTestId('wt-worktree-menu')).toContainText(name, { timeout: 30000 });
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branch, { timeout: 30000 });
  await expect(page.getByTestId('wt-worktree-menu')).toBeFocused();
};

const action = async (page: Page, verb: 'Rename' | 'Delete', name: string): Promise<Locator> => {
  await openWorktrees(page);
  await page.getByRole('button', { name: `${verb} ${name}`, exact: true }).click();
  const dialog = page.getByTestId(`wt-worktree-${verb.toLowerCase()}-dialog`);
  await expect(dialog).toBeVisible();
  return dialog;
};

const scan = async (page: Page, testId: string): Promise<void> => {
  await expect(page.getByTestId(testId)).toBeVisible();
  const result = await new AxeBuilder({ page }).include(`[data-testid="${testId}"]`).analyze();
  expect(result.violations).toEqual([]);
};

const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let index = 0; index < 12; index += 1) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
};

const assertTrap = async (page: Page, first: Locator, last: Locator): Promise<void> => {
  await first.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
};

const composeKey = async (target: Locator, key: string): Promise<void> => {
  await target.dispatchEvent('keydown', { key, isComposing: true, bubbles: true });
};

test.describe('US-314 Worktree 浏览器验收', () => {
  test('创建、往返主检出位、历史隔离、改名与删除后保留分支改动', async ({ page }) => {
    await openPanel(page);
    await writeTodo(page, 'Main baseline');
    await commit(page, 'Main baseline commit');
    await createBranchFromDropdown(page, 'feature/worktree');
    await switchBranch(page, 'main');
    await createWorktree(page, 'Feature work', 'feature/worktree');

    await writeTodo(page, 'Linked committed todo');
    await commit(page, 'Linked worktree commit');
    await history(page, ['Linked worktree commit', 'Main baseline commit']);
    await writeTodo(page, 'Linked uncommitted todo');
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('Linked uncommitted todo');

    await mount(page, 'Main worktree', 'main');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(0);
    await history(page, ['Main baseline commit']);
    await openWorktrees(page);
    await expect(page.getByTestId('wt-worktree-menu-popup')).toContainText('Linked worktrees');
    await expect(page.getByRole('button', { name: /^(Rename|Delete) Main worktree$/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await mount(page, 'Feature work', 'feature/worktree');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await page.getByTestId('wt-tab-changes').click();
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('Linked uncommitted todo');
    const rename = await action(page, 'Rename', 'Feature work');
    await page.getByTestId('wt-worktree-rename-name').fill('Renamed work');
    await page.getByTestId('wt-worktree-rename-confirm').click();
    await expect(rename).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-menu')).toContainText('Renamed work', { timeout: 30000 });

    const deletion = await action(page, 'Delete', 'Renamed work');
    await expect(page.getByTestId('wt-worktree-delete-warning')).toContainText('uncommitted');
    await page.getByTestId('wt-worktree-delete-cancel').click();
    await expect(deletion).toHaveCount(0);
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/worktree');
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('Linked uncommitted todo');
    await action(page, 'Delete', 'Renamed work');
    await page.getByTestId('wt-worktree-delete-confirm').click();
    await expect(deletion).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-menu')).toContainText('Main worktree', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-menu')).toBeFocused();
    await openWorktrees(page);
    await expect(page.getByTestId('wt-worktree-item')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await switchBranch(page, 'feature/worktree');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('Linked uncommitted todo');
    await history(page, ['Linked worktree commit', 'Main baseline commit']);
  });

  test('空闲分支右键在新 Worktree 检出，占用分支不再提供该入口', async ({ page }) => {
    await openPanel(page);
    await createBranchFromDropdown(page, 'feature/context-worktree');
    await switchBranch(page, 'main');
    await page.getByTestId('wt-branch-menu').click();
    await branchRow(page, 'feature/context-worktree').click({ button: 'right' });
    await page.getByTestId('wt-branch-menu-worktree').click();
    const creation = page.getByTestId('wt-worktree-create-dialog');
    await expect(creation).toBeVisible();
    await expect(page.getByTestId('wt-worktree-create-branch')).toHaveValue('feature/context-worktree');
    await page.getByTestId('wt-worktree-create-name').fill('Context work');
    await page.getByTestId('wt-worktree-create-confirm').click();
    await expect(creation).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-menu')).toContainText('Context work', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/context-worktree', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-menu')).toBeFocused();
    await page.getByTestId('wt-branch-menu').click();
    await branchRow(page, 'main').click({ button: 'right' });
    await expect(page.getByTestId('wt-branch-menu-worktree')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark']) {
    test(`${theme}：菜单和三个对话框 axe 零违规、键盘焦点圈定、IME 不误提交或关闭`, async ({ page }) => {
      await page.addInitScript(value => window.localStorage.setItem('theme', value), theme);
      await openPanel(page);
      const trigger = page.getByTestId('wt-worktree-menu');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await scan(page, 'wt-worktree-menu-popup');
      await tabTo(page, page.getByTestId('wt-worktree-create'));
      await page.keyboard.press('Enter');
      const creation = page.getByTestId('wt-worktree-create-dialog');
      const createName = page.getByTestId('wt-worktree-create-name');
      await expect(createName).toBeFocused();
      await expect(page.getByTestId('wt-worktree-create-confirm')).toBeDisabled();
      await createName.fill('keyboard-work');
      await expect(page.getByTestId('wt-worktree-create-branch')).toHaveValue('');
      await scan(page, 'wt-worktree-create-dialog');
      await assertTrap(page, createName, page.getByTestId('wt-worktree-create-confirm'));
      await composeKey(createName, 'Enter');
      await composeKey(createName, 'Escape');
      await expect(creation).toBeVisible();
      await expect(createName).toHaveValue('keyboard-work');
      await page.keyboard.press('Escape');
      await expect(creation).toHaveCount(0);

      await openCreate(page);
      await page.getByTestId('wt-worktree-create-name').fill('keyboard-work');
      await page.keyboard.press('Enter');
      await expect(creation).toHaveCount(0, { timeout: 30000 });
      await expect(trigger).toContainText('keyboard-work', { timeout: 30000 });
      await expect(page.getByTestId('wt-status-branch')).toHaveText('keyboard-work', { timeout: 30000 });
      await expect(trigger).toBeFocused();
      await openWorktrees(page);
      await scan(page, 'wt-worktree-menu-popup');
      const main = page.getByTestId('wt-worktree-item').and(page.locator('[data-worktree-id="main"]'));
      await expect(main).toContainText('main');
      await expect(main).not.toContainText('keyboard-work');
      const renameButton = page.getByRole('button', { name: 'Rename keyboard-work', exact: true });
      await tabTo(page, renameButton);
      await page.keyboard.press('Enter');
      const renaming = page.getByTestId('wt-worktree-rename-dialog');
      const renameName = page.getByTestId('wt-worktree-rename-name');
      await expect(renameName).toBeFocused();
      await renameName.fill('Keyboard renamed');
      await scan(page, 'wt-worktree-rename-dialog');
      await assertTrap(page, renameName, page.getByTestId('wt-worktree-rename-confirm'));
      await composeKey(renameName, 'Enter');
      await composeKey(renameName, 'Escape');
      await expect(renaming).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(renaming).toHaveCount(0, { timeout: 30000 });
      await expect(trigger).toContainText('Keyboard renamed', { timeout: 30000 });

      const deletion = await action(page, 'Delete', 'Keyboard renamed');
      await scan(page, 'wt-worktree-delete-dialog');
      const cancel = page.getByTestId('wt-worktree-delete-cancel');
      await assertTrap(page, cancel, page.getByTestId('wt-worktree-delete-confirm'));
      await composeKey(cancel, 'Escape');
      await expect(deletion).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(deletion).toHaveCount(0);
      await expect(trigger).toContainText('Keyboard renamed');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await composeKey(page.getByTestId('wt-worktree-create'), 'Escape');
      await expect(page.getByTestId('wt-worktree-menu-popup')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('wt-worktree-menu-popup')).toHaveCount(0);
    });
  }
});
