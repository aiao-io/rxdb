import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * @fileoverview `/working-tree` 面板的 git 工作流功能用例。
 *
 * @remarks
 * 面板二版重构（2026-09-18）为 GitHub Desktop 形态：顶部分支栏（分支下拉）+
 * 左侧「变更 / 历史」标签页 + 右栏详情。面板本身**不造数据**——实体数据在别的
 * 页面（/todo）产生，一条实体记录就是工作树里的一个「文件」；分支行是
 * 「选中 → 操作按钮」而不是立即切换（demo 要演「脏工作树被拒」这一步）。
 * 这份用例按同一条叙事走：
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
 * `wt-commit-live` 出「已提交」，底部状态条跟着翻成「干净」。
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

    const appSidebar = page.locator('app-sidebar');
    const workspace = page.getByTestId('working-tree-page');
    await expect(appSidebar).toBeVisible();
    await expect(appSidebar).toHaveCSS('width', '240px');
    await expect(page.locator('app-header')).toBeVisible();
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
    await enablePanel(page);

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
    await enablePanel(page);
    await openBranchMenu(page);
    await page.getByTestId('wt-branch-create').click();

    await expect(page.getByTestId('wt-branch-create-popover')).toHaveCSS('padding', '12px');
  });

  test('桌面工作区：变更筛选与历史文件差异', async ({ page }) => {
    await openPanel(page);
    await enablePanel(page);
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
    // 文件头路径 = schema/表名/id（优先 tableName：Todo → todos；schema 是数据的真实命名空间 public）。
    const viewer = page.getByTestId('wt-diff-viewer');
    await expect(viewer.getByText(/\/todos\//)).toBeVisible();
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
    await page.getByRole('radio', { name: 'Unified' }).check();
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
    await page.getByTestId('wt-diff-wrap').uncheck();
    await expect(viewer.locator('.gd-diff-content').first()).toHaveCSS('white-space', 'pre');
    await page.getByTestId('wt-diff-settings').click();
    await page.getByTestId('wt-diff-wrap').check();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wt-diff-settings-popup')).toHaveCount(0);
    await page.getByTestId('wt-change-filter').fill('no-match');
    await expect(page.getByTestId('wt-diff-item')).toHaveCount(0);
    await page.getByTestId('wt-change-filter').fill('todos');
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
    await enablePanel(page);
    const menuToggle = page.getByRole('button', { name: 'Toggle menu' });
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(page.locator('app-sidebar')).toBeVisible();
    await expect(page.locator('.sidebar-overlay')).toBeVisible();
    await expect(page.locator('.gd-toolbar')).toBeVisible();
    await expect(page.getByTestId('wt-aside-resize')).toBeVisible();
    await expect(page.getByTestId('working-tree-page')).toHaveCSS('background-color', 'rgb(246, 248, 250)');
  });

  test('完整 git 流程：提交 → 分支 → 脏工作树拒切 → 合并入工作树 → 恢复', async ({ page }) => {
    await openPanel(page);
    await enablePanel(page);

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
    await enablePanel(page);

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
    await enablePanel(page);

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
    await enablePanel(page);

    const commitButton = page.getByTestId('wt-commit');
    await expect(commitButton).toBeDisabled();
    // 只有空白也算空（GitHub Desktop 的 isEmptyOrWhitespace 语义）。
    await page.getByTestId('wt-commit-message').fill('   ');
    await expect(commitButton).toBeDisabled();
    await page.getByTestId('wt-commit-message').fill('有摘要了');
    await expect(commitButton).toBeEnabled();
  });
});
