import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * @fileoverview `/worktree` 面板的 git 工作流功能用例。
 *
 * @remarks
 * 本份是 Angular 参考实现（2026-09-18 二版重构为 GitHub Desktop 形态）的移植：
 * 顶部分支栏（分支下拉）+ 左侧「变更 / 历史」标签页 + 右栏详情。面板本身**不造数据**——
 * 实体数据在别的页面（/todo）产生，一条实体记录就是工作树里的一个「文件」；
 * 点行是「立即切换」（demo 要演「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果）。
 * 这份用例按同一条叙事走：
 * 自动初始化（空库在应用启动时自动启用）→ 首次提交 → 建分支 → 分支提交 → 带脏工作树被拒 → 丢弃后切换 → 合并
 * （落进工作树，像 `git merge --no-commit`）→ 提交合并 → 恢复历史版本 → 提交恢复。
 *
 * a11y 与 SC-005 的断言在 `worktree.a11y.spec.ts`，这里只锁行为。
 *
 * 框架差异只在应用壳的选择器：Angular 用 `app-sidebar` / `app-header`，
 * React 壳的侧栏是 `#layout-main > aside`、顶栏是 `#layout-topbar`。
 */

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

const openPanel = async (page: import('@playwright/test').Page): Promise<void> => {
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
  await page.locator('a[href="/worktree"]').first().click();
  await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
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

test.describe('Working Tree 页面功能', () => {
  test('保留应用侧栏，工作树只占路由内容区', async ({ page }) => {
    await openPanel(page);

    const appSidebar = page.locator('#layout-main > aside');
    const workspace = page.getByTestId('worktree-page');
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

  test('创建分支弹层保留内容内边距', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();

    await expect(page.getByTestId('wt-branch-create-popover')).toHaveCSS('padding', '12px');
  });

  test('桌面工作区：变更筛选与历史文件差异', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    // 面板头没有主题切换按钮（GitHub Desktop 也没有）：主题跟整个 demo 走 localStorage，
    // 切换 = 改 localStorage + 整页刷新。
    await page.evaluate(() => window.localStorage.setItem('theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('worktree-page')).toHaveCSS('background-color', 'rgb(36, 41, 46)');
    await expect(page.locator('.gd-window-chrome')).toHaveCount(0);
    await expect(page.locator('.gd-sidebar')).toHaveCSS('border-right-width', '0px');
    await expect
      .poll(() => page.getByTestId('wt-aside-resize').evaluate(el => getComputedStyle(el, '::after').width))
      .toBe('1px');
    await page.evaluate(() => window.localStorage.setItem('theme', 'light'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('worktree-page')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
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
    await expect(page.getByTestId('worktree-page')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
  });

  test('完整 git 流程：提交 → 分支 → 脏工作树拒切 → 合并入工作树 → 恢复', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    // ── 1. main 上首次提交 ─────────────────────────────────
    await writeTodo(page, 'docs: 首页文档');
    await commit(page, 'docs: 首页文档');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    // ── 2. 建分支并切过去（点行即切换，GitHub Desktop 同款） ──
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();
    await page.getByTestId('wt-branch-name').fill('feature/x');
    await page.getByTestId('wt-branch-create-confirm').click();
    await openBranchMenu(page);
    await expect(branchRow(page, 'feature/x')).toBeVisible({ timeout: 10000 });

    // 分支行右键有菜单（GitHub Desktop 同款）：切换 / 合并 / 删除 + 复制分支名。
    await branchRow(page, 'feature/x').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Switch' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Merge into main' })).toBeVisible();
    await page.locator('[aria-label="Close context menu"]').click({ position: { x: 4, y: 4 } });

    await branchRow(page, 'feature/x').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x', { timeout: 30000 });

    // ── 3. 分支上的提交（历史继承 main 的父链） ─────────────
    await writeTodo(page, 'feat: 新功能');
    await commit(page, 'feat: 新功能');
    await openHistory(page);
    await expect(page.getByTestId('wt-commits-list')).toContainText('docs: 首页文档');
    await expect(page.getByTestId('wt-commits-list')).toContainText('feat: 新功能');

    // ── 4. 脏工作树 + requireClean → 切换被拒（点行即切，被拒是行点击的直接结果） ──
    await openChanges(page);
    await writeTodo(page, '未完成的草稿');
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-toast')).toContainText('uncommitted changes', { timeout: 10000 });
    // 拒绝不等于切换：还留在原分支上
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x');

    // 丢弃后重试成功。丢弃入口在更改列表的右键菜单里（GitHub Desktop 的 Discard
    // 同样在菜单里，提交框旁没有「丢弃全部」按钮）。回页时 diff 是 idle（面板不自动
    // 重读，见 useWorktree 的 TSDoc），先用顶部工具栏的「Fetch origin」
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
    const discardPrompt = new Promise<string>(resolve => {
      page.once('dialog', dialog => {
        resolve(dialog.message());
        void dialog.accept();
      });
    });
    await page.getByTestId('wt-discard').click();
    expect(await discardPrompt).toContain('all 2 uncommitted changes');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });

    // ── 5. 合并：结果进工作树（git merge --no-commit）；入口在行的右键菜单里 ──
    await openBranchMenu(page);
    await branchRow(page, 'feature/x').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Merge into main' }).click();
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
    await page.addInitScript(() => window.localStorage.setItem('rxdb-e2e-skip-worktree-auto-enable', '1'));
    await resetE2eState(page);
    await page.goto('/todo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 20000 });
    await page.getByTestId('todo-title-input').fill('自动启用测试');
    await page.getByTestId('todo-add').click();
    await expect(page.getByTestId('todo-row').filter({ hasText: '自动启用测试' })).toBeVisible({ timeout: 15000 });

    // SPA 导航进面板（同 writeTodo 的理由：goto 整页刷新后的写入不经捕获）。
    await page.locator('a[href="/worktree"]').first().click();
    await expect(page.getByTestId('worktree-page')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('wt-enabled')).toHaveText('未启用', { timeout: 20000 });
    await expect(page.getByTestId('wt-status-phase')).toHaveText('error', { timeout: 20000 });
    await expect(page.getByTestId('wt-enable')).toBeVisible();

    // 手动路径照旧：点击启用后进入已启用状态。
    await page.getByTestId('wt-enable').click();
    await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
  });
});

// ── 命名 worktree（US-310）：与 Angular 端 `worktree-utils.ts` 逐字对齐 ──────────

/** 打开顶栏的 worktree 下拉并等它渲染出来。 */
const openWorktreeMenu = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.getByTestId('wt-worktree-menu').click();
  await expect(page.getByTestId('wt-worktree-menu-popup')).toBeVisible({ timeout: 10000 });
};

/** worktree 下拉里按所钉分支取那一行（属性选择器，理由同 `branchRow`）。 */
const worktreeRow = (page: import('@playwright/test').Page, branchId: string) =>
  page.locator(`[data-testid="wt-worktree-item"][data-branch-id="${branchId}"]`);

/** 那一行右端的移除按钮（与行按钮是兄弟，不是子节点）。 */
const worktreeRemove = (page: import('@playwright/test').Page, branchId: string) =>
  page.locator(`[data-testid="wt-worktree-remove"][data-branch-id="${branchId}"]`);

/** 创建弹层的两种来源：新建分支，或钉一条已有分支；label 原样填写（不 trim）。 */
type WorktreeSubmitOptions =
  { readonly newBranch: string; readonly label?: string } | { readonly existing: string; readonly label?: string };

/**
 * 经创建弹层建一个 worktree：`newBranch` 走「New branch」（先 `createBranch`，FR-017：会复制当前
 * 未提交改动，再钉住），`existing` 走「Existing branch」。只点到确认为止，结果由调用方断言。
 */
const submitWorktree = async (page: import('@playwright/test').Page, options: WorktreeSubmitOptions): Promise<void> => {
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

/** 经分支菜单建一条分支（建分支不切换），等创建弹层收起。 */
const createBranchViaMenu = async (page: import('@playwright/test').Page, name: string): Promise<void> => {
  await openBranchMenu(page);
  await page.getByTestId('wt-branch-create').click();
  await page.getByTestId('wt-branch-name').fill(name);
  await page.getByTestId('wt-branch-create-confirm').click();
  await expect(page.getByTestId('wt-branch-create-popover')).toHaveCount(0, { timeout: 10000 });
};

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

/** 页面上 `WorktreeLabelError` 的提示（与 `index.tsx` 的 `LABEL_INVALID_TEXT` 同文）。 */
const LABEL_INVALID_TEXT = "A worktree label can't be only spaces. Leave it empty to show the branch name.";

/** 点 worktree 行切过去，并等 sr-only 状态条换到它钉住的分支。 */
const switchToWorktree = async (page: import('@playwright/test').Page, branchId: string): Promise<void> => {
  await openWorktreeMenu(page);
  await worktreeRow(page, branchId).click();
  await expect(page.getByTestId('wt-status-branch')).toHaveText(branchId, { timeout: 30000 });
};

/**
 * 命名 worktree（US-310）：钉在分支上的命名工作上下文，单 checkout、1:1 钉分支、创建即切换。
 *
 * worktree 之间切换**不带** `requireClean`（git worktree 口径）：未提交改动按分支隔离保存，切走再切回
 * 原样还在。只有移除会拒绝有未提交改动的 worktree。断言锚在 sr-only 读数上：`wt-status-branch`
 * （当前 checkout）与 `wt-worktrees-*`（列表相位 / 行数）；当前所在的 worktree 看触发按钮上的
 * `wt-worktree-current`。
 */
test.describe('命名 worktree（US-310）', () => {
  test('新库自带主 worktree：钉在 main、当前所在、移除按钮禁用', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await expect(page.getByTestId('wt-worktrees-phase')).toHaveText('success', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1');
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('main');

    await openWorktreeMenu(page);
    await expect(page.getByTestId('wt-worktree-item')).toHaveCount(1);
    await expect(worktreeRow(page, 'main')).toContainText('main');
    // 删不掉当前 checkout（git 同款）。
    await expect(worktreeRemove(page, 'main')).toBeDisabled();
  });

  test('从已有分支创建（带 label）→ 切回 → 移除：行消失、分支还在', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    // 先经分支菜单建一条分支：建分支不切换，当前仍在 main。
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();
    await page.getByTestId('wt-branch-name').fill('feature/x');
    await page.getByTestId('wt-branch-create-confirm').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main');

    await submitWorktree(page, { existing: 'feature/x', label: 'Feature X' });
    await expect(page.getByTestId('wt-toast')).toContainText('Created worktree', { timeout: 10000 });
    // 创建即切换：当前 checkout 换到它钉住的分支，触发按钮显示 label。
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/x', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('Feature X');
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('2');

    await openWorktreeMenu(page);
    await expect(worktreeRow(page, 'feature/x')).toContainText('Feature X');
    await expect(worktreeRemove(page, 'feature/x')).toBeDisabled();
    await expect(worktreeRemove(page, 'main')).toBeEnabled();
    await page.keyboard.press('Escape');

    await switchToWorktree(page, 'main');
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('main');

    await openWorktreeMenu(page);
    await worktreeRemove(page, 'feature/x').click();
    await expect(page.getByTestId('wt-toast')).toContainText('Removed worktree', { timeout: 10000 });
    await expect(worktreeRow(page, 'feature/x')).toHaveCount(0);
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1');
    await page.keyboard.press('Escape');

    // 移除 worktree 不是删分支。
    await openBranchMenu(page);
    await expect(branchRow(page, 'feature/x')).toBeVisible();
  });

  test('新建分支并钉住（先建分支再钉，创建即切换）；分支名已被占用时就地报错、不新增行', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await submitWorktree(page, { newBranch: 'feature/y' });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/y', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('feature/y');
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('2');

    await submitWorktree(page, { newBranch: 'feature/y' });
    await expect(page.getByTestId('wt-worktree-create-popover').getByRole('alert')).toContainText('already exists', {
      timeout: 10000
    });
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('2');
    await page.getByTestId('wt-worktree-create-cancel').click();
    await expect(page.getByTestId('wt-worktree-create-popover')).toHaveCount(0);
  });

  test('worktree 之间自由切换：未提交改动留在原 worktree；有改动的 worktree 移除被拒', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    // 先建 worktree 再写：new 模式的 createBranch 会把当前未提交改动复制到新分支（FR-017），顺序反了两边都脏。
    await submitWorktree(page, { newBranch: 'feature/wip' });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/wip', { timeout: 30000 });
    await switchToWorktree(page, 'main');

    await writeTodo(page, 'main 上的草稿');
    // 脏着也能切走：不带 requireClean，草稿留在 main。
    await switchToWorktree(page, 'feature/wip');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });

    await writeTodo(page, 'feature 上的草稿');
    await switchToWorktree(page, 'main');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    // 行上只有实体路径；内容在右栏详情里（唯一的一条自动选中）。
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1, { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('main 上的草稿', { timeout: 10000 });

    // 有未提交改动的 worktree 移除被拒（git 同款），行还在。
    await openWorktreeMenu(page);
    await worktreeRemove(page, 'feature/wip').click();
    await expect(page.getByTestId('wt-toast')).toContainText('uncommitted changes', { timeout: 10000 });
    await expect(worktreeRow(page, 'feature/wip')).toBeVisible();
    await page.keyboard.press('Escape');

    await switchToWorktree(page, 'feature/wip');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(1, { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('feature 上的草稿', { timeout: 10000 });
  });
});

/**
 * 工具栏下拉（分支 / worktree 菜单共用的 ToolbarDropdown）的交互细节：IME 守卫、下拉占位、label 原样保存、
 * 在途守卫、复制未提交改动的提示、打开即聚焦、实时列表。
 *
 * 每条用例都从 `openPanel` 的空库起步、自己造数据；几条都要建分支 / worktree，偏重，串行跑，
 * 免得本地 8 worker 全并行时拖慢别的用例。
 */
test.describe('工具栏下拉：IME / 占位 / label / 在途 / 复制提示 / 焦点 / 实时列表', () => {
  test.describe.configure({ mode: 'serial' });

  test('IME 组字中的回车不提交、Escape 不收菜单；同一个事件去掉 isComposing 就照常生效', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1', { timeout: 30000 });

    // worktree 创建弹层（new 模式的新分支名框）
    await openWorktreeMenu(page);
    await page.getByTestId('wt-worktree-create').click();
    await page.getByTestId('wt-worktree-mode-new').check();
    const newBranchInput = page.getByTestId('wt-worktree-new-branch');
    await newBranchInput.fill('feature/ime');
    await dispatchKeyDown(newBranchInput, 'Enter', true);
    // 回车若被当成提交，页面会立刻置在途、确认按钮随之禁用；三样都必须原样
    await expect(page.getByTestId('wt-worktree-create-popover')).toBeVisible();
    await expect(page.getByTestId('wt-worktree-create-confirm')).toBeEnabled();
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1');
    await dispatchKeyDown(newBranchInput, 'Enter', false);
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/ime', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('2');

    // 分支创建弹层的分支名框
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();
    const branchName = page.getByTestId('wt-branch-name');
    await branchName.fill('feature/ime-branch');
    await dispatchKeyDown(branchName, 'Enter', true);
    await expect(page.getByTestId('wt-branch-create-popover')).toBeVisible();
    await expect(page.getByTestId('wt-branch-create-confirm')).toBeEnabled();
    await dispatchKeyDown(branchName, 'Enter', false);
    await expect(page.getByTestId('wt-branch-create-popover')).toHaveCount(0, { timeout: 10000 });
    await openBranchMenu(page);
    await expect(branchRow(page, 'feature/ime-branch')).toBeVisible();
    await page.keyboard.press('Escape');

    // 筛选框里组字中的 Escape 是在取消组字，菜单不收；真的 Escape 才收
    await openWorktreeMenu(page);
    const filter = page.getByLabel('Filter worktrees');
    await dispatchKeyDown(filter, 'Escape', true);
    await expect(page.getByTestId('wt-worktree-menu-popup')).toBeVisible();
    await dispatchKeyDown(filter, 'Escape', false);
    await expect(page.getByTestId('wt-worktree-menu-popup')).toHaveCount(0);
  });

  test('已有分支下拉：首项是禁用的「Pick a branch…」占位；值为空时 Create 就地报错、不新增行', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await createBranchViaMenu(page, 'feature/pick');

    await openWorktreeMenu(page);
    await page.getByTestId('wt-worktree-create').click();
    const select = page.getByTestId('wt-worktree-branch');
    // 打开时照旧预选第一个候选
    await expect(select).toHaveValue('feature/pick');
    const placeholder = select.locator('option').first();
    await expect(placeholder).toHaveText('Pick a branch…');
    await expect(placeholder).toHaveAttribute('value', '');
    await expect(placeholder).toBeDisabled();

    // 用户点不到禁用的占位：直接改值再派发 change，等价于弹层开着时候选列表变了、选中项落回占位
    await select.evaluate((element: HTMLSelectElement) => {
      element.value = '';
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(select).toHaveValue('');
    await page.getByTestId('wt-worktree-create-confirm').click();
    await expect(page.getByTestId('wt-worktree-create-popover').getByRole('alert')).toHaveText('Pick a branch.');
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1');
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main');
  });

  test('label 原样保存：两端空白保留；全是空白被核心拒绝，不新增行、仍在 main', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await submitWorktree(page, { newBranch: 'feature/label', label: ' Feature X ' });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/label', { timeout: 30000 });
    await openWorktreeMenu(page);
    const labelText = worktreeRow(page, 'feature/label').getByTestId('wt-worktree-label-text');
    // toHaveText 会折叠空白，比 textContent 原文
    await expect.poll(() => labelText.textContent()).toBe(' Feature X ');
    await page.keyboard.press('Escape');
    await switchToWorktree(page, 'main');

    // new 模式下分支已经建好、钉住被拒：提示把两件事都说清楚
    await submitWorktree(page, { newBranch: 'feature/blank', label: '   ' });
    const toast = page.getByTestId('wt-toast');
    await expect(toast).toContainText(LABEL_INVALID_TEXT, { timeout: 10000 });
    await expect(toast).toContainText(`Branch "feature/blank" was created, but the worktree wasn't`);
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('2');
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main');
  });

  test('在途守卫：双击移除只发一次，「Removed worktree」不被「no longer exists」盖掉', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await submitWorktree(page, { newBranch: 'feature/busy' });
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/busy', { timeout: 30000 });
    await switchToWorktree(page, 'main');

    await openWorktreeMenu(page);
    await worktreeRemove(page, 'feature/busy').dblclick();
    const toast = page.getByTestId('wt-toast');
    await expect(toast).toContainText('Removed worktree', { timeout: 10000 });
    await expect(worktreeRow(page, 'feature/busy')).toHaveCount(0);
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1');
    // 第二下若打了出去，它的 WorktreeNotFoundError 会在列表重读前后落地、换掉这条 toast
    await expect(toast).toContainText('Removed worktree');
    await expect(toast).not.toContainText('no longer exists');
  });

  test('new 模式提示会复制未提交改动：干净时没有提示；有一条改动时提示，建好后两边都带着它', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await openWorktreeMenu(page);
    await page.getByTestId('wt-worktree-create').click();
    await page.getByTestId('wt-worktree-mode-new').check();
    await expect(page.getByTestId('wt-worktree-new-branch')).toBeVisible();
    await expect(page.getByTestId('wt-worktree-copy-note')).toHaveCount(0);
    await page.getByTestId('wt-worktree-create-cancel').click();

    await writeTodo(page, '要被复制的草稿');
    await openWorktreeMenu(page);
    await page.getByTestId('wt-worktree-create').click();
    await page.getByTestId('wt-worktree-mode-new').check();
    await expect(page.getByTestId('wt-worktree-copy-note')).toHaveText(
      'The new branch starts with a copy of your 1 uncommitted change.'
    );
    await page.getByTestId('wt-worktree-new-branch').fill('feature/copy');
    await page.getByTestId('wt-worktree-create-confirm').click();

    // 新分支带着这条改动（FR-017 的复制），原来的 main 也还留着它
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/copy', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-entry-count')).toHaveText('1', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('要被复制的草稿', { timeout: 10000 });
    await switchToWorktree(page, 'main');
    await expect(page.getByTestId('wt-status-entry-count')).toHaveText('1', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-viewer')).toContainText('要被复制的草稿', { timeout: 10000 });
  });

  test('创建弹层打开即聚焦：分支名框、分支下拉、新分支名框（切换模式后焦点跟着换）', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();
    await expect(page.getByTestId('wt-branch-name')).toBeFocused();
    await page.getByTestId('wt-branch-name').fill('feature/focus');
    await page.getByTestId('wt-branch-create-confirm').click();
    await expect(page.getByTestId('wt-branch-create-popover')).toHaveCount(0, { timeout: 10000 });

    // 有可钉的已有分支：弹层以 existing 模式打开，焦点在分支下拉上
    await openWorktreeMenu(page);
    await page.getByTestId('wt-worktree-create').click();
    await expect(page.getByTestId('wt-worktree-branch')).toBeFocused();
    await page.getByTestId('wt-worktree-mode-new').check();
    await expect(page.getByTestId('wt-worktree-new-branch')).toBeFocused();
    await page.getByTestId('wt-worktree-mode-existing').check();
    await expect(page.getByTestId('wt-worktree-branch')).toBeFocused();
  });

  test('实时列表：分支菜单切换挪动当前 worktree；右键删掉钉住的分支，worktree 行随之消失', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await submitWorktree(page, { newBranch: 'feature/live', label: 'Live' });
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('Live', { timeout: 30000 });

    // 经分支菜单来回切：页面不重读列表，当前 worktree 的名字照样跟着换
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('main', { timeout: 30000 });
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('main', { timeout: 10000 });
    await openBranchMenu(page);
    await branchRow(page, 'feature/live').click();
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('Live', { timeout: 30000 });
    await openBranchMenu(page);
    await branchRow(page, 'main').click();
    await expect(page.getByTestId('wt-worktree-current')).toHaveText('main', { timeout: 30000 });

    // 经分支行的右键菜单删掉钉住的分支：worktree 随分支一起删，列表自己跟上
    await openBranchMenu(page);
    await branchRow(page, 'feature/live').click({ button: 'right' });
    page.once('dialog', dialog => void dialog.accept());
    await page.getByTestId('wt-branch-menu-delete').click();
    await expect(page.getByTestId('wt-toast')).toContainText('Branch "feature/live" deleted.', { timeout: 10000 });
    await expect(page.getByTestId('wt-worktrees-count')).toHaveText('1', { timeout: 10000 });
    await openWorktreeMenu(page);
    await expect(worktreeRow(page, 'feature/live')).toHaveCount(0);
    await expect(page.getByTestId('wt-worktree-item')).toHaveCount(1);
  });
});
