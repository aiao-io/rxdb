import { expect, test } from '@playwright/test';
import { readCount, resetE2eState } from './e2e-utils.js';
import { createBranchFromDropdown, divergeBranches } from './working-tree-branches.js';

/**
 * @fileoverview `/working-tree` 面板的 git 工作流功能用例。
 *
 * @remarks
 * 本份是 Angular 参考实现（2026-09-18 二版重构为 GitHub Desktop 形态）的移植：
 * 顶部分支栏（分支下拉）+ 左侧「变更 / 历史」标签页 + 右栏详情。面板本身**不造数据**——
 * 实体数据在别的页面（/todo）产生，一条实体记录就是工作树里的一个「文件」；
 * 点行即切换（GitHub Desktop 同款），带着未提交改动时先弹「Switch branch」问改动怎么办。
 * 这份用例按同一条叙事走：
 * 自动初始化（空库在应用启动时自动启用）→ 首次提交 → 建分支 → 分支提交 → 带着改动点别的分支弹 Switch branch（取消）→ 丢弃后切换 → 合并
 * （落进工作树，像 `git merge --no-commit`）→ 提交合并 → 恢复历史版本 → 提交恢复。
 *
 * a11y 与 SC-005 的断言在 `working-tree.a11y.spec.ts`，这里只锁行为。
 *
 * 框架差异只在应用壳的选择器：Angular 用 `app-sidebar` / `app-header`，
 * React 壳的侧栏是 `#layout-main > aside`、顶栏是 `#layout-topbar`。
 */

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

const openPanel = async (page: import('@playwright/test').Page): Promise<void> => {
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
const waitForAutoEnabled = async (page: import('@playwright/test').Page): Promise<void> => {
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

/**
 * 到 /todo 页写一条 Todo，再回到工作树页等它反映成未提交改动。
 *
 * 面板不造数据是有意的：和 GitHub Desktop 打开一个别人编辑过的仓库是同一件事，
 * 「编辑文件」这一步发生在别处。
 *
 * **必须走工具栏仓库菜单的链接做 SPA 导航，不能用 `page.goto`。** `goto` 是整页刷新：
 * 刷新后落在 /todo 上的那次写入不经工作树捕获（实测 2026-09-18），工作树
 * 会一直显示「干净」；同一次页面会话里点链接切页，捕获路径保持不变。
 */
const writeTodo = async (page: import('@playwright/test').Page, title: string): Promise<void> => {
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
 * `wt-commit-live` 出「Committed」，底部状态条跟着翻成「干净」。
 */
const commit = async (page: import('@playwright/test').Page, message: string): Promise<void> => {
  await page.getByTestId('wt-commit-message').fill(message);
  await page.getByTestId('wt-commit').click();
  await expect.poll(() => page.getByTestId('wt-commit-live').textContent(), { timeout: 30000 }).toContain('Committed');
  await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
};

/** 打开顶栏的分支下拉并等它渲染出行。 */
const openBranchMenu = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByTestId('wt-branch-menu').click();
  await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible({ timeout: 10000 });
};

/**
 * 切到「历史」标签页并等历史落定。
 *
 * 面板头没有刷新按钮（GitHub Desktop 同款）：第一次进历史页由 `selectTab` 自动补读
 * （`listCommitsState` 停在 idle 时），之后每次提交 `runCommit` 都会重读。
 */
const openHistory = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByTestId('wt-tab-history').click();
  await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
};

/** 切回「变更」标签页。 */
const openChanges = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByTestId('wt-tab-changes').click();
};

/**
 * 分支下拉里按分支名取那一行。
 *
 * 用行上的 `data-branch-id` 属性而不是文本过滤：行内还带着「来自 <parentId>」，
 * 子串 `main` 会同时命中名字是「feature/x main」的那一行；而文本过滤的正则
 * 锚定（`^`）撞不上 textContent 的前导空白。属性选择器两头都不沾。
 */
const branchRow = (page: import('@playwright/test').Page, branchId: string) =>
  page.locator(`[data-testid="wt-branch-item"][data-branch-id="${branchId}"]`);

/**
 * 在元素上派发一次 keydown（会冒泡）。
 *
 * 无头浏览器里造不出真实的 IME 组字，`isComposing` 只能随事件一起造；同一个事件不带它
 * 就是正对照——证明这条派发路径本身确实能触发提交 / 关闭。
 */
const dispatchKeyDown = (locator: import('@playwright/test').Locator, key: string, isComposing: boolean) =>
  locator.evaluate(
    (element, init) => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: init.key, isComposing: init.isComposing, bubbles: true })
      );
    },
    { key, isComposing }
  );

test.describe('Working Tree 页面功能', () => {
  test('保留应用侧栏，工作树只占路由内容区', async ({ page }) => {
    await openPanel(page);

    const appSidebar = page.locator('#layout-main > aside');
    const workspace = page.getByTestId('working-tree-page');
    await expect(appSidebar).toBeVisible();
    await expect(appSidebar).toHaveCSS('width', '240px');
    await expect(page.locator('#layout-topbar')).toBeVisible();
    await expect
      .poll(async () => {
        const [sidebarBox, workspaceBox] = await Promise.all([appSidebar.boundingBox(), workspace.boundingBox()]);
        return {
          sidebarRight: Math.round(sidebarBox!.x + sidebarBox!.width),
          workspaceLeft: Math.round(workspaceBox!.x)
        };
      })
      .toEqual({ sidebarRight: 240, workspaceLeft: 240 });
  });

  test('亮色主题下仓库与分支按钮的展开态为白底', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await openPanel(page);
    await waitForAutoEnabled(page);

    const repositoryButton = page.getByTestId('wt-repo-menu');
    await repositoryButton.click();
    await expect(page.getByTestId('wt-repo-menu-popup')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(repositoryButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(repositoryButton).toHaveCSS('color', 'rgb(36, 41, 47)');
    await expect
      .poll(() =>
        repositoryButton.evaluate(button => {
          const box = button.getBoundingClientRect();
          const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return topmost === button || button.contains(topmost);
        })
      )
      .toBe(true);
    await page.locator('[aria-label="Close repository menu"]').click({ position: { x: 1000, y: 500 } });

    const branchButton = page.getByTestId('wt-branch-menu');
    await branchButton.click();
    await expect(page.getByTestId('wt-branch-menu-popup')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(branchButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(branchButton).toHaveCSS('color', 'rgb(36, 41, 47)');
    await expect
      .poll(() =>
        branchButton.evaluate(button => {
          const box = button.getBoundingClientRect();
          const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return topmost === button || button.contains(topmost);
        })
      )
      .toBe(true);
  });

  test('New branch 打开 GitHub Desktop 的「Create a branch」对话框：写明基于当前分支，空名不能建', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();

    await expect(page.getByTestId('wt-branch-menu-popup')).toHaveCount(0);
    const dialog = page.getByTestId('wt-create-branch-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Create a branch');
    await expect(page.getByTestId('wt-create-branch-name')).toBeFocused();
    await expect(page.getByTestId('wt-create-branch-base')).toHaveText(
      'Your new branch will be based on your currently checked out branch (main). main is the default branch for your repository.'
    );
    await expect(page.getByTestId('wt-create-branch-confirm')).toBeDisabled();
    await page.getByTestId('wt-create-branch-cancel').click();
    await expect(dialog).toHaveCount(0);
  });

  test('桌面工作区：变更筛选与历史文件差异', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    // 面板头没有主题切换按钮（GitHub Desktop 也没有）：主题跟整个 demo 走 localStorage，
    // 切换 = 改 localStorage + 整页刷新。
    await page.evaluate(() => window.localStorage.setItem('theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('working-tree-page')).toHaveCSS('background-color', 'rgb(36, 41, 46)');
    await expect(page.locator('.gd-window-chrome')).toHaveCount(0);
    await expect(page.locator('.gd-sidebar')).toHaveCSS('border-right-width', '0px');
    await expect
      .poll(() => page.getByTestId('wt-aside-resize').evaluate(el => getComputedStyle(el, '::after').width))
      .toBe('1px');
    await page.evaluate(() => window.localStorage.setItem('theme', 'light'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('working-tree-page')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
    // 工具栏蓝（GitHub Desktop 的 $gray-900）：切到亮色主题也不变。
    await expect(page.locator('.gd-toolbar')).toHaveCSS('background-color', 'rgb(36, 41, 46)');
    await writeTodo(page, '界面仿真测试');
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1);
    // 文件头路径 = schema/表名/id（优先 tableName：/todo 页写的是 Task → tasks，表名登记在 demo 的 gd 映射里；schema 是数据的真实命名空间 public）。
    const viewer = page.getByTestId('wt-diff-viewer');
    await expect(viewer.getByText(/\/tasks\//)).toBeVisible();
    // 默认 Split：逐行对齐双栏（side-by-side），没有「改前 / 改后」标签；insert 旧侧留空槽。
    await expect(page.getByTestId('wt-split')).toBeVisible();
    const insertRow = viewer.locator('.gd-split-row').filter({ hasText: '界面仿真测试' });
    await expect(insertRow.getByTestId('wt-split-new')).toContainText('界面仿真测试');
    await expect(insertRow.getByTestId('wt-split-old')).toHaveText('');
    await expect(viewer.locator('.gd-code-side-label')).toHaveCount(0);
    // Diff Settings：两种显示（Unified / Split）+ 两个开关。
    await page.getByTestId('wt-diff-settings').click();
    await expect(page.getByTestId('wt-diff-settings-popup')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Split' })).toBeChecked();
    // 框架差异（React）：选完设置就收面板（Angular 同款交互），而 React 的离散事件是
    // 同步 flush——radio 在 Playwright 的 check() 做点击后核验之前就从 DOM 里没了，
    // 核验会一直等这个不会再出现的元素。改用 click + 后续断言锁同一件事
    // （切到 Unified = wt-split 消失、hunk 出现）。
    await page.getByRole('radio', { name: 'Unified' }).click();
    await expect(page.getByTestId('wt-split')).toHaveCount(0);
    // Unified：逐字段 -/+ 行，增行整行绿底。
    await expect(viewer.locator('.gd-hunk')).toBeVisible();
    await expect(viewer.locator('.gd-diff-row.gd-add').first()).toBeVisible();
    await expect(viewer.locator('.gd-diff-row.gd-add').first()).toHaveCSS('background-color', 'rgb(218, 251, 225)');
    await expect(viewer).toContainText('界面仿真测试');
    // 两个开关：隐藏空白变更 / 自动换行。
    await page.getByTestId('wt-diff-settings').click();
    await expect(page.getByTestId('wt-diff-whitespace')).not.toBeChecked();
    await expect(page.getByTestId('wt-diff-wrap')).toBeChecked();
    // 同上：开关切换也收面板（Angular 同款），uncheck/check 的点击后核验等不到被
    // 同步 flush 移除的 checkbox——用 click + 后续 white-space 断言锁定效果。
    await page.getByTestId('wt-diff-wrap').click();
    await expect(viewer.locator('.gd-diff-content').first()).toHaveCSS('white-space', 'pre');
    await page.getByTestId('wt-diff-settings').click();
    await page.getByTestId('wt-diff-wrap').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wt-diff-settings-popup')).toHaveCount(0);
    await page.getByTestId('wt-change-filter').fill('no-match');
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(0);
    await page.getByTestId('wt-change-filter').fill('tasks');
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1);
    // 类型筛选：漏斗按钮打开菜单（组合筛选框的左侧图标），选中项带 ✓。
    await page.getByTestId('wt-filter-kind').click();
    await expect(page.getByTestId('wt-filter-kind-popup')).toBeVisible();
    await page.getByTestId('wt-filter-kind-update').click();
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(0);
    await page.getByTestId('wt-filter-kind').click();
    await page.getByTestId('wt-filter-kind-all').click();
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1);
    await commit(page, '提交界面测试');
    await openHistory(page);
    await page.getByTestId('wt-commit-item').first().click();
    await expect(page.getByTestId('wt-history-files')).toBeVisible();
    await expect(page.getByTestId('wt-history-diff')).toBeVisible();
    await expect(page.getByTestId('wt-history-files').getByTestId('wt-commit-change-item')).toHaveCount(1);
    await expect(page.getByTestId('wt-history-diff')).toContainText('界面仿真测试');
    await expect(page.getByTestId('wt-history-diff').locator('.gd-hunk').first()).toBeVisible();
    // 折叠 chevron 收的是附加基本信息（描述 + 作者/时间/sha），文件列表与差异栏始终可见。
    await page.getByTestId('wt-detail-collapse').click();
    await expect(page.getByTestId('wt-commit-copy')).toHaveCount(0);
    await expect(page.getByTestId('wt-commit-changes')).toBeVisible();
    await page.getByTestId('wt-detail-collapse').click();
    await expect(page.getByTestId('wt-commit-copy')).toBeVisible();
  });

  test('窄屏工作区保留应用菜单入口', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await page.setViewportSize({ width: 390, height: 844 });
    await openPanel(page);
    await waitForAutoEnabled(page);
    const menuToggle = page.getByRole('button', { name: 'Toggle menu' });
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(page.locator('#layout-main > aside')).toBeVisible();
    await expect(page.locator('.sidebar-overlay')).toBeVisible();
    await expect(page.locator('.gd-toolbar')).toBeVisible();
    await expect(page.getByTestId('wt-aside-resize')).toBeVisible();
    await expect(page.getByTestId('working-tree-page')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
  });

  test('完整 git 流程：提交 → 分支 → 脏工作树拒切 → 合并入工作树 → 恢复', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    // ── 1. main 上首次提交 ─────────────────────────────────
    await writeTodo(page, 'docs: 首页文档');
    await commit(page, 'docs: 首页文档');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    // ── 2. 建分支：「Create a branch」对话框，建完切过去（GitHub Desktop 同款） ──
    await createBranchFromDropdown(page, 'feature/x');

    // 未被检出的分支右键提供复制分支名、新检出位检出与删除；切换是点行，合并在下拉底部。
    await openBranchMenu(page);
    await branchRow(page, 'main').click({ button: 'right' });
    await expect(page.getByRole('menuitem')).toHaveText(['Copy branch name', 'Checkout in new worktree…', 'Delete…']);
    await page.locator('[aria-label="Close context menu"]').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('wt-branch-merge-into')).toHaveText('Choose a branch to merge into feature/x');
    await branchRow(page, 'feature/x').click();
    await expect(page.getByTestId('wt-branch-menu-popup')).toHaveCount(0);

    // ── 3. 分支上的提交（历史继承 main 的父链） ─────────────
    await writeTodo(page, 'feat: 新功能');
    await commit(page, 'feat: 新功能');
    await openHistory(page);
    await expect(page.getByTestId('wt-commits-list')).toContainText('docs: 首页文档');
    await expect(page.getByTestId('wt-commits-list')).toContainText('feat: 新功能');

    // ── 4. 带着未提交改动点别的分支：弹 GitHub Desktop 的「Switch branch」问改动怎么办；Cancel 不切 ──
    await openChanges(page);
    await writeTodo(page, '未完成的草稿');
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    const switchDialog = page.getByTestId('wt-switch-dialog');
    await expect(switchDialog).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('wt-switch-leave-option')).toContainText('Leave my changes on feature/x');
    await page.getByTestId('wt-switch-cancel').click();
    await expect(switchDialog).toHaveCount(0);
    // 取消不等于切换：还留在原分支上
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x');

    // 丢弃后再切就不问了（「留在原分支」那条路见下面的专门用例）。丢弃入口在更改列表的右键菜单里（GitHub Desktop 的 Discard
    // 同样在菜单里，提交框旁没有「丢弃全部」按钮）。回页时 diff 是 idle（面板不自动
    // 重读，见 useWorkingTree 的 TSDoc），先用顶部工具栏的「Fetch origin」
    // （GitHub Desktop 同位置）把列表拉出来再右键。
    //
    // 这里特意留**两条**未提交改动：`discard()` 只有整棵树一种粒度，而入口是某一行上的
    // 右键菜单。只留一条时「丢这一行」与「丢全部」的结果一模一样，菜单许诺错范围这件事
    // 一条用例都碰不到；两条才分得开——右键第一行，第二行也必须跟着消失。
    await writeTodo(page, '另一条未完成的草稿');
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-diff-phase')).toHaveText('success', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(2, { timeout: 10000 });
    await page.getByTestId('wt-diff-item').first().click({ button: 'right' });
    // 范围写在菜单项上，也写在确认框里：不可撤销 + 粒度与右键目标不符，这一步是唯一的拦截点。
    await expect(page.getByTestId('wt-discard')).toHaveText('Discard All Changes');
    await page.getByTestId('wt-discard').click();
    await expect(page.getByTestId('wt-confirm-dialog')).toContainText('all 2 uncommitted changes');
    await page.getByTestId('wt-confirm-ok').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });

    // ── 5. 合并：结果进工作树（git merge --no-commit）；入口在分支下拉底部，在对话框里挑来源 ──
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-merge-into').click();
    await expect(page.getByTestId('wt-merge-confirm')).toBeDisabled();
    await page.locator('[data-testid="wt-merge-branch-item"][data-branch-id="feature/x"]').click();
    await page.getByTestId('wt-merge-confirm').click();
    await expect(page.getByTestId('wt-toast')).toContainText('working tree', { timeout: 10000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });

    await commit(page, 'merge: feature/x');
    await openHistory(page);
    await expect(page.getByTestId('wt-commits-list')).toContainText('merge: feature/x');

    // ── 6. 恢复历史版本：内容回工作树，再提交 ──────────────
    // 历史倒序（最新在前）：merge / docs / 基线（squash 合并把 feat 并进 merge 提交）。
    // 行上没有恢复按钮（GitHub Desktop 同款），恢复入口在行的右键菜单里；
    // 基线的菜单里没有恢复项，最早的用户提交 docs 是最后一个可恢复的。
    const commitRows = page.getByTestId('wt-commit-item');
    const contextMenu = page.locator('.gd-menu[aria-label="Context menu"]');
    await commitRows.last().click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    await expect(page.getByTestId('wt-restore')).toHaveCount(0);
    // 点菜单外（透明背板）关闭。
    await page.locator('[aria-label="Close context menu"]').click({ position: { x: 4, y: 4 } });
    await expect(contextMenu).toHaveCount(0);
    await commitRows.filter({ hasText: 'docs: 首页文档' }).click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    await page.getByTestId('wt-restore').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-restore')).toHaveText('恢复中', { timeout: 10000 });

    await openChanges(page);
    await commit(page, 'revert: 恢复 docs 版本');
    await openHistory(page);
    await expect(page.getByTestId('wt-commits-list')).toContainText('revert: 恢复 docs 版本');
  });

  test('工具栏：仓库段跟左栏同宽，分支 / 获取段可拖宽', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    const measure = async () => {
      const [repo, aside, branch, fetch] = await Promise.all([
        page.getByTestId('wt-repo-menu').boundingBox(),
        page.locator('.gd-sidebar').boundingBox(),
        page.locator('.gd-branch-section').boundingBox(),
        page.getByTestId('wt-refresh-status').boundingBox()
      ]);
      return {
        repo: Math.round(repo!.width),
        aside: Math.round(aside!.width),
        branch: Math.round(branch!.width),
        fetch: Math.round(fetch!.width)
      };
    };
    // 仓库段宽度跟着下面左栏走（初始都是 320），分支 230 / 获取 200 是固定起点。
    await expect.poll(measure).toEqual({ repo: 320, aside: 320, branch: 230, fetch: 200 });

    // 拖动分支段右侧的分隔条 +60px。
    const handle = page.locator('.gd-toolbar-handle').first();
    const box = (await handle.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(measure).toEqual({ repo: 320, aside: 320, branch: 290, fetch: 200 });

    // 左栏分隔条方向键 +16px 后，仓库段跟着变宽。
    await page.getByTestId('wt-aside-resize').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(measure).toEqual({ repo: 336, aside: 336, branch: 290, fetch: 200 });
  });

  test('干净工作树上的提交被拒（empty_commit 走 toast 呈现）', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await page.getByTestId('wt-commit-message').fill('什么都不会发生');
    await page.getByTestId('wt-commit').click();
    // 工作树干净 → CommitValidationError.empty_commit。提交框没有可见错误行
    // （GitHub Desktop 同款），失败走页面 toast——GitHub Desktop 的提交失败是弹框，
    // demo 的对应物就是 toast。
    await expect(page.getByTestId('wt-toast')).toContainText('no changes to commit', { timeout: 30000 });
    // 拒绝不等于提交：摘要草稿还在，工作树还是干净。
    await expect(page.getByTestId('wt-commit-message')).toHaveValue('什么都不会发生');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净');
  });

  test('摘要为空时提交按钮禁用（GitHub Desktop 的 isSummaryBlank 同款）', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    const commitButton = page.getByTestId('wt-commit');
    await expect(commitButton).toBeDisabled();
    // 只有空白也算空（GitHub Desktop 的 isEmptyOrWhitespace 语义）。
    await page.getByTestId('wt-commit-message').fill('   ');
    await expect(commitButton).toBeDisabled();
    await page.getByTestId('wt-commit-message').fill('有摘要了');
    await expect(commitButton).toBeEnabled();
  });

  test('有内容的库不自动启用：手动点击启用仍可用', async ({ page }) => {
    // 用 localStorage 键跳过启动时的自动启用：这样先写内容、再进面板时，
    // 库是「有内容但未启用」——自动初始化的规则对它有内容这一点必须让路。
    await page.addInitScript(() => window.localStorage.setItem('rxdb-e2e-skip-working-tree-auto-enable', '1'));
    await resetE2eState(page);
    await page.goto('/todo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('todo-title-input').fill('自动启用测试');
    await page.getByTestId('todo-add').click();
    await expect(page.getByTestId('todo-row').filter({ hasText: '自动启用测试' })).toBeVisible({ timeout: 15000 });

    // SPA 导航进面板（同 writeTodo 的理由：goto 整页刷新后的写入不经捕获）。
    await page.locator('a[href="/working-tree"]').first().click();
    await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('wt-enabled')).toHaveText('未启用', { timeout: 20000 });
    await expect(page.getByTestId('wt-status-phase')).toHaveText('error', { timeout: 20000 });
    await expect(page.getByTestId('wt-enable')).toBeVisible();

    // 手动路径照旧：点击启用后进入已启用状态。
    await page.getByTestId('wt-enable').click();
    await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
  });
});

test.describe('合并预览与分支对比（US-312）', () => {
  test.describe.configure({ mode: 'serial' });

  test('不切换就看到合并会落什么、会盖掉哪些改动，以及两条分支差在哪', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await divergeBranches(page, {
      branch: 'feature/preview',
      base: 'preview-base',
      onBranch: 'preview-feature',
      onMain: 'preview-main',
      ghost: 'preview-ghost'
    });

    // ── 合并对话框里选了来源就是预览：幽灵操作被压缩掉，只剩改标题这一条，且会盖掉 main 的改动 ──
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-merge-into').click();
    await page.locator('[data-testid="wt-merge-branch-item"][data-branch-id="feature/preview"]').click();
    const summary = page.getByTestId('wt-merge-preview-summary');
    await expect(summary).toContainText(
      'from feature/preview into main. 1 entity overlaps with changes made on main.',
      {
        timeout: 30000
      }
    );
    const items = page.getByTestId('wt-branch-diff-item');
    await expect(items).toHaveCount(1);
    await expect(items).toContainText('"preview-feature"');
    await expect(page.getByTestId('wt-branch-diff-conflict')).toHaveText("Overwrites main's changes to title");

    // 逐条合并连幽灵操作一起记：计数变多，落的条目不变
    const squashed = readCount(await summary.textContent(), '压缩合并的预览摘要');
    await page.getByTestId('wt-merge-strategy-normal').click();
    await expect(summary).toHaveText(new RegExp(`^Merges (?!${squashed} )\\d+ changes from`), { timeout: 30000 });
    expect(readCount(await summary.textContent(), '逐条合并的预览摘要')).toBeGreaterThan(squashed);
    await expect(items).toHaveCount(1);

    // 预览不写任何东西：Escape 关掉对话框，当前分支照旧干净
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wt-merge-dialog')).toHaveCount(0);
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净');

    // ── 对比在 History 顶部（GitHub Desktop 的 Select branch to compare）：字段读作「main 的值 → feature 的值」；
    //    幽灵操作两边都没有，不出条目；对比时收起提交列表 ──
    await openHistory(page);
    await page.getByTestId('wt-compare-select').selectOption('feature/preview');
    await expect(page.getByTestId('wt-compare-summary')).toHaveText(
      '1 entity differs between main and feature/preview.',
      { timeout: 30000 }
    );
    await expect(items).toContainText('"preview-main"');
    await expect(items).toContainText('"preview-feature"');
    await expect(page.getByTestId('wt-commits-list')).toHaveCount(0);

    // 对比底部的「Merge into main」带着这条分支打开合并对话框
    await page.getByTestId('wt-compare-merge').click();
    await expect(
      page.locator('[data-testid="wt-merge-branch-item"][data-branch-id="feature/preview"]')
    ).toHaveAttribute('aria-current', 'true');
    await expect(summary).toContainText('from feature/preview into main.', { timeout: 30000 });
    await page.getByTestId('wt-merge-cancel').click();

    // 清除即回到历史
    await page.getByTestId('wt-compare-clear').click();
    await expect(page.getByTestId('wt-compare-view')).toHaveCount(0);
    await expect(page.getByTestId('wt-commits-list')).toBeVisible();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main');
  });
});

/**
 * 带着未提交改动切分支（GitHub Desktop 的「Switch branch」）：未提交改动按分支保存，「Leave my changes」
 * 就是把它们留在原分支上切过去，切回来原样还在。
 */
test.describe('带着未提交改动切分支', () => {
  test('Leave my changes：切过去的分支是干净的，切回来改动原样还在', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await writeTodo(page, 'leave-base');
    await commit(page, 'add leave-base');
    await createBranchFromDropdown(page, 'feature/leave');

    await writeTodo(page, 'leave-draft');
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-switch-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wt-switch-confirm').click();
    await expect(page.getByTestId('wt-switch-dialog')).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    // main 是干净的，切回去不再问；草稿还在 feature/leave 上
    await openBranchMenu(page);
    await branchRow(page, 'feature/leave').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/leave', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1, { timeout: 30000 });
  });
});

/**
 * 从提交建分支（US-314 阶段 A，GitHub Desktop 的 History 右键「Create branch from commit」）：新分支的 HEAD 就是那个提交，
 * 建完切过去；当前分支有未提交改动时照常问改动怎么办，改动留在原分支上。
 */
test.describe('从提交建分支', () => {
  test('History 右键建分支并切过去：历史停在那个提交上，原分支的草稿还在原地', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await writeTodo(page, 'from-commit-base');
    await commit(page, 'add from-commit-base');
    await writeTodo(page, 'from-commit-later');
    await commit(page, 'add from-commit-later');
    await writeTodo(page, 'from-commit-draft');
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });

    // 菜单照 GitHub Desktop 分组：恢复 / 从提交建分支 / 复制提交 id
    await openHistory(page);
    await page.getByTestId('wt-commit-item').filter({ hasText: 'add from-commit-base' }).click({ button: 'right' });
    await expect(page.getByRole('menuitem')).toHaveText([
      'Restore this version to working tree',
      'Create branch from commit',
      'Copy Commit ID'
    ]);
    await page.getByTestId('wt-commit-create-branch').click();
    const dialog = page.getByTestId('wt-create-branch-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('wt-create-branch-base')).toContainText(
      "Your new branch will be based on the commit 'add from-commit-base'"
    );
    await page.getByTestId('wt-create-branch-name').fill('feature/from-commit');
    await expect(page.getByTestId('wt-create-branch-confirm')).toBeEnabled({ timeout: 30000 });
    await page.getByTestId('wt-create-branch-confirm').click();
    await expect(dialog).toHaveCount(0, { timeout: 30000 });

    // main 上有草稿：切过去之前问改动怎么办，留在 main 上
    await expect(page.getByTestId('wt-switch-dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('wt-switch-leave-option')).toContainText('Leave my changes on main');
    await page.getByTestId('wt-switch-confirm').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/from-commit', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    // HEAD 就是那个提交：历史最上面是它，之后那一个不在
    await openHistory(page);
    await expect(page.getByTestId('wt-commit-item').first()).toContainText('add from-commit-base', { timeout: 30000 });
    await expect(page.getByTestId('wt-commits-list')).not.toContainText('add from-commit-later');

    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
  });
});

/**
 * 新建分支与分支下拉的输入法守卫：组字期间的 Enter 是「上屏」、Escape 是「取消组字」，都属于输入法，
 * 不能被当成提交或关闭吃掉。
 */
test.describe('删分支（US-222）', () => {
  test('分支下拉里删掉一条不是当前的分支，再打开下拉就没有它', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await createBranchFromDropdown(page, 'feature/to-delete');
    // 当前分支删不了（右键菜单里没有删除项）：先切回 main
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });

    await openBranchMenu(page);
    await branchRow(page, 'feature/to-delete').click({ button: 'right' });
    await page.getByTestId('wt-branch-menu-delete').click();
    await expect(page.getByTestId('wt-confirm-dialog')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wt-confirm-ok').click();
    await expect(page.getByTestId('wt-confirm-dialog')).toHaveCount(0);
    // 删完页面会收起分支下拉：等提示出来再打开，否则刚打开的下拉会被它收掉
    await expect(page.getByTestId('wt-toast')).toContainText('Branch "feature/to-delete" deleted.', { timeout: 30000 });

    // 分支列表是分支表的活查询：分支表不写变更日志，删行曾经派不出删除事件，列表里还留着删掉的那条。
    // 先确认下拉里列出了 main，再断言删掉的那条不在：下拉没打开时两条都「找不到」
    await openBranchMenu(page);
    await expect(branchRow(page, 'main')).toHaveCount(1);
    await expect(branchRow(page, 'feature/to-delete')).toHaveCount(0, { timeout: 10000 });
  });
});

test.describe('新建分支与分支下拉：输入法组字', () => {
  test('组字中的回车不提交、Escape 不关对话框与菜单；同一个事件去掉 isComposing 就照常生效', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();
    const dialog = page.getByTestId('wt-create-branch-dialog');
    const branchName = page.getByTestId('wt-create-branch-name');
    await branchName.fill('feature/ime');
    await expect(page.getByTestId('wt-create-branch-confirm')).toBeEnabled({ timeout: 30000 });
    await dispatchKeyDown(branchName, 'Escape', true);
    await expect(dialog).toBeVisible();
    await dispatchKeyDown(branchName, 'Enter', true);
    await expect(dialog).toBeVisible();
    await expect(branchName).toHaveValue('feature/ime');
    await dispatchKeyDown(branchName, 'Enter', false);
    await expect(dialog).toHaveCount(0, { timeout: 30000 });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/ime', { timeout: 30000 });
    await openBranchMenu(page);
    await expect(branchRow(page, 'feature/ime')).toBeVisible();

    // 筛选框里组字中的 Escape 是在取消组字，菜单不收；真的 Escape 才收
    const filter = page.getByLabel('Filter branches');
    await dispatchKeyDown(filter, 'Escape', true);
    await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible();
    await dispatchKeyDown(filter, 'Escape', false);
    await expect(page.getByTestId('wt-branch-menu-popup')).toHaveCount(0);
  });
});
