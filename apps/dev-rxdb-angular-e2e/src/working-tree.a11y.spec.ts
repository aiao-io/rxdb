import AxeBuilder from '@axe-core/playwright';
import { workspaceRoot } from '@nx/devkit';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resetE2eState } from './e2e-utils.js';
import { expect, test } from './fixtures.js';
import { divergeBranches } from './working-tree-branches.js';

/**
 * @fileoverview `/working-tree` 面板的 a11y 与 SC-005 归档用例（T128）。
 *
 * @remarks
 * 2026-09-18 二版重构为 GitHub Desktop 形态（顶部分支栏 + 变更/历史标签页 +
 * 右栏详情）之后，这份 Angular 拷贝仍是**新设计的参考实现**，React / Vue 的
 * 两份拷贝逐条移植自它。契约值不变：live region、
 * 四态 axe 零违规、键盘可达、SC-005 归档。
 *
 * 扫描范围锁在 `[data-testid="working-tree-page"]`：页面外的导航壳由
 * `search.a11y.spec.ts` 那一路覆盖，混进来只会让这份用例因为别处的回归而红。
 * 分支下拉是**内联**渲染（面板 div 内的子节点，见 branch-menu 的 TSDoc——
 * CDK overlay 会把节点追加到 body 末尾，Tab 顺序排在面板之后，键盘走不进去），
 * 因此它在扫描与走查范围里；合并、Switch branch 与 Create a branch 三个模态对话框是 fixed 定位的面板子元素，同样在内。
 *
 * **禁用态只用 `.gd-btn-primary:disabled` 那一套配色**：提交按钮在摘要为空时禁用（GitHub Desktop 的
 * `isSummaryBlank` 同款交互，它的 tooltip 原文 "A commit summary is required to
 * commit"），合并、Switch branch 与 Create a branch 的确认按钮在还不能确认时禁用。daisyUI 的禁用态文字是
 * `base-content/20%`，白底上合成 `#d1d1d1`，对比度 1.52，必然触发 axe 的 `color-contrast`（见
 * `search.a11y.spec.ts` 里记下的同一个坑）；`.gd-btn-primary:disabled` 的配色是专门选过的
 * （白字压 `#6b7280`，≈4.8:1，见 styles.scss），两套主题都过 axe。Create a branch 的 Cancel 只在建分支进行中那一瞬置灰，
 * 扫描不落在那一刻。键盘走查前先填摘要让提交按钮回到可用态（disabled 不进 Tab 序列）。
 *
 * 面板不造数据：写 Todo 走 /todo 页（`writeTodo`），和真实用户流一致。
 */

/** 归档文件里的框架名；三端各写各的一份，互不覆盖。 */
const FRAMEWORK = 'angular';

/**
 * SC-005 的归档目录。
 *
 * contracts/benchmark-report.md §5：首次可见状态耗时**不进** benchmark JSON 的
 * `measurements`（浏览器 OPFS / IDB 不承诺相同绝对数字，混进去会让门禁按一个
 * 没人承诺过的数字判定），但三端 E2E **必须记录**它 —— 单独归档到这里。
 */
const REPORTS_DIR = join(workspaceRoot, 'benchmarks', 'reports');

const PANEL = '[data-testid="working-tree-page"]';

/**
 * 面板里**期望**能用键盘走到的静态控件（「变更」标签页、已启用、工作树干净）。
 *
 * 与旧版面板不同，这里断言的是**超集**而不是精确集合：变更列表的行、历史里的
 * 「恢复」按钮与分支选中后出现的操作按钮数量随数据变化，精确集合会把那些动态控件
 * 数成违规。超集 + 「所有被走到控件都有可见焦点指示」合起来仍是同一强度：
 * 没有任何一个焦点停留处可以没有指示。
 */
const KEYBOARD_REACHABLE = [
  'wt-repo-menu',
  'wt-branch-menu',
  'wt-refresh-status',
  'wt-tab-changes',
  'wt-tab-history',
  'wt-change-filter',
  'wt-commit-message',
  'wt-commit-description',
  'wt-commit'
] as const;

/** 一个控件聚焦时的焦点指示样式。 */
interface FocusIndicator {
  readonly testId: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly boxShadow: string;
}

/** 相位已落定（不再是 idle / loading）。 */
const SETTLED = /^(success|empty|error)$/;

/**
 * 连按 Tab，收集**落在面板内**、带 `data-testid` 的控件及其聚焦样式。
 *
 * @param wanted - 期望收集到的控件数；收齐就停，不必把整页 Tab 完
 *
 * @remarks
 * 步数上限只是防跑飞：导航壳里的链接数量三端不同，写死步数会让这条用例
 * 一改导航就红，而那与工作树面板无关。
 */
const walkPanelWithTab = async (page: Page, wanted: number): Promise<Map<string, FocusIndicator>> => {
  const reached = new Map<string, FocusIndicator>();
  for (let step = 0; step < 80 && reached.size < wanted; step += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      if (element.closest('[data-testid="working-tree-page"]') === null) return null;
      const testId = element.getAttribute('data-testid');
      if (testId === null) return null;
      // 焦点指示也可以画在祖先上：筛选框的环挂在组合盒子的 :focus-within 上
      // （label 或 .gd-filter-combo），input 自身保持 outline:none（内层蓝框是视觉缺陷）。
      // 自己没环时沿祖先链往上找（最多 3 层），谁的环先出现算谁的。
      const indicator = (node: Element): { outlineStyle: string; outlineWidth: string; boxShadow: string } => {
        const style = getComputedStyle(node);
        const outlineStyle =
          style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 ? style.outlineStyle : 'none';
        const outlineWidth = outlineStyle === 'none' ? '0px' : style.outlineWidth;
        const boxShadow = style.boxShadow !== 'none' && style.boxShadow !== '' ? style.boxShadow : 'none';
        return { outlineStyle, outlineWidth, boxShadow };
      };
      const own = indicator(element);
      const hasOwn = own.outlineStyle !== 'none' || own.boxShadow !== 'none';
      if (hasOwn) return { testId, ...own };
      let ancestor = element.parentElement;
      for (
        let level = 0;
        level < 3 && ancestor !== null && ancestor.closest('[data-testid="working-tree-page"]') !== null;
        level += 1
      ) {
        const found = indicator(ancestor);
        if (found.outlineStyle !== 'none' || found.boxShadow !== 'none') {
          return { testId, ...found };
        }
        ancestor = ancestor.parentElement;
      }
      return { testId, ...own };
    });
    if (focused === null) continue;
    reached.set(focused.testId, focused);
  }
  return reached;
};

/** 走查收集结果的通用断言：目标控件都在，且每一个都有可见焦点指示。 */
const expectReachedWithIndicator = (reached: Map<string, FocusIndicator>, wanted: readonly string[]): void => {
  expect([...reached.keys()]).toEqual(expect.arrayContaining([...wanted]));
  const withoutIndicator = [...reached.values()].filter(one => !hasVisibleFocusIndicator(one)).map(one => one.testId);
  expect(withoutIndicator).toEqual([]);
};

/**
 * WCAG 2.4.7：键盘焦点必须有可见指示。
 *
 * 只认两种真实机制 —— 画出来的 outline，或者 box-shadow 式的焦点环；
 * 两者都没有就是「焦点在哪儿全靠猜」。
 */
const hasVisibleFocusIndicator = (indicator: FocusIndicator): boolean => {
  const hasOutline = indicator.outlineStyle !== 'none' && Number.parseFloat(indicator.outlineWidth) > 0;
  const hasRing = indicator.boxShadow !== 'none' && indicator.boxShadow !== '';
  return hasOutline || hasRing;
};

const scanPanel = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).include(PANEL).analyze();
  expect(results.violations).toEqual([]);
};

/**
 * 打开面板并等到挂载那次 `status()` 落定。
 *
 * 等的是**相位**而不是固定时长：面板挂载就发 `isEnabled()` + `status()`，
 * 而「相位还停在 loading」与「相位是 error」是两种完全不同的事，
 * 用 sleep 等会把前者悄悄读成后者。
 */
const openPanel = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(SETTLED, { timeout: 20000 });
};

/** 点「初始化仓库」并等到启用态落定（手动路径，需要先跳过启动时的自动启用）。 */
const clickEnable = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-enable').click();
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

/**
 * 等自动初始化落定。
 *
 * 空库在应用启动时被 `enableIfEmpty()` 自动启用，页面加载后这里只等、不点；
 * 需要「未启用」初始态的用例用 localStorage 键跳过自动启用后走 {@link clickEnable}。
 */
const waitForAutoEnabled = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

/** 注册「跳过启动时的自动启用」的 init script——手动路径用例的起点。 */
const skipAutoEnable = (page: Page) =>
  page.addInitScript(() => window.localStorage.setItem('rxdb-e2e-skip-working-tree-auto-enable', '1'));

/**
 * 到 /todo 页写一条 Todo 再回到工作树页；面板不造数据（与功能用例同一叙事）。
 *
 * 必须走侧栏链接做 SPA 导航而不是 `page.goto`：整页刷新后 /todo 上的写入
 * 不经工作树捕获（实测 2026-09-18），工作树会一直显示「干净」。
 */
const writeTodo = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('wt-repo-menu').click();
  await page.getByTestId('wt-edit-data').click();
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  await page.locator('a[href="/working-tree"]').first().click();
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
};

test.describe('Working Tree Page A11y', () => {
  test('状态变化对读屏可感知：状态胶囊与结果区都挂了 live region', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    // `commit()` / `restore()` 期间不得静默（§4 loading 一栏）：这几块是相位变化的落点，
    // 没有 live region 的话读屏用户拿到的就是「点了按钮，什么都没发生」。
    await expect(page.getByTestId('wt-status')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-status')).toHaveAttribute('aria-live', 'polite');
    // 提交成功的播报是 sr-only 的（GitHub Desktop 同款 "Committed Just now - …"）：
    // 眼睛看不到，读屏必须能听到。
    await expect(page.getByTestId('wt-commit-live')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-commit-live')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('wt-commit-live')).toHaveAttribute('aria-atomic', 'true');
    await expect(page.getByTestId('wt-enabled')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-diff-result')).toHaveAttribute('aria-live', 'polite');

    // 提交历史的结果区在「历史」标签页里：切过去才能断言。
    await page.getByTestId('wt-tab-history').click();
    await expect(page.getByTestId('wt-commits-result')).toHaveAttribute('aria-live', 'polite');
  });

  test('未启用 / 已启用 / 有未提交改动 / 已提交 / 历史页五态都没有 axe 违规', async ({ page }) => {
    // 跳过启动时的自动启用，留住「未启用」这一态：有内容的库（或这里跳过自动启用的
    // 空库）冷启动时挂载那次 `status()` 撞上 WorkingTreeCapabilityDisabledError。
    await skipAutoEnable(page);
    await openPanel(page);

    await expect(page.getByTestId('wt-status-phase')).toHaveText('error');
    await scanPanel(page);

    await clickEnable(page);
    await scanPanel(page);

    await writeTodo(page, 'axe demo');
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-diff-phase')).toHaveText('success', { timeout: 30000 });
    await scanPanel(page);

    // 摘要为空时提交按钮是禁用的（GitHub Desktop 的 isSummaryBlank 同款），
    // 「已提交」态需要一条真实的信息。禁用态配色专为 axe 选过，这一态扫描的就是它。
    await page.getByTestId('wt-commit-message').fill('demo commit');
    await page.getByTestId('wt-commit').click();
    await expect
      .poll(() => page.getByTestId('wt-commit-live').textContent(), { timeout: 30000 })
      .toContain('Committed');
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await scanPanel(page);

    // 历史标签页（含提交行与详情区）也要零违规。
    await page.getByTestId('wt-tab-history').click();
    await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
    await scanPanel(page);
  });

  test('面板里的每个控件都能用键盘走到，且焦点可见', async ({ page }) => {
    // 跳过自动启用：初始化态只有「初始化仓库」与「刷新状态」两个控件这一断言
    // 以「未启用」为起点，而自动启用后的面板是另一套控件树。
    await skipAutoEnable(page);
    await openPanel(page);

    // 初始化态只有「初始化仓库」与「刷新状态」两个控件。
    const initReached = await walkPanelWithTab(page, 2);
    expect(initReached.has('wt-enable'), '初始化态应该能走到 wt-enable').toBe(true);
    const initWithoutIndicator = [...initReached.values()]
      .filter(one => !hasVisibleFocusIndicator(one))
      .map(one => one.testId);
    expect(initWithoutIndicator).toEqual([]);

    await clickEnable(page);

    // 提交按钮在摘要为空时禁用（GitHub Desktop 同款），disabled 不进 Tab 序列——
    // 先填摘要让按钮回到可用态，键盘才走得到 wt-commit。
    await page.getByTestId('wt-commit-message').fill('a11y walk');

    // 超集断言（见 KEYBOARD_REACHABLE 的注释）：所有静态控件都必须走到，
    // 每一个被走到的控件（含动态出现的）都必须有可见焦点指示。
    const reached = await walkPanelWithTab(page, KEYBOARD_REACHABLE.length + 2);
    expectReachedWithIndicator(reached, KEYBOARD_REACHABLE);

    // 分支下拉是内联渲染的：打开后，新建按钮、分支行与底部的合并入口也在 Tab 序列里。
    // 等它可见再走查——zoneless 的变更检测在下一帧，点完立刻 Tab 会打在渲染前的 DOM 上。
    await page.getByTestId('wt-branch-menu').click();
    await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible({ timeout: 10000 });
    // 触屏布局下行尾还有一个 ⋯（`wt-branch-more`），走查多收一个才走得到底部
    const menuReached = await walkPanelWithTab(page, 4);
    expectReachedWithIndicator(menuReached, ['wt-branch-create', 'wt-branch-item', 'wt-branch-merge-into']);
    await page.keyboard.press('Escape');

    // 建一条分支：「Create a branch」对话框，建完切过去（GitHub Desktop 同款）。点行是立即切换，复制分支名与删除收在
    // 行的右键菜单里——菜单项是真按钮，也要能键盘走到。删除只给不是当前分支的行，所以右键 main。
    await page.getByTestId('wt-branch-menu').click();
    await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wt-branch-create').click();
    await page.getByTestId('wt-create-branch-name').fill('feature/a11y');
    await expect(page.getByTestId('wt-create-branch-confirm')).toBeEnabled({ timeout: 30000 });
    await page.getByTestId('wt-create-branch-confirm').click();
    await expect(page.getByTestId('wt-status-branch')).toHaveText('feature/a11y', { timeout: 30000 });
    await page.getByTestId('wt-branch-menu').click();
    await expect(page.getByTestId('wt-branch-menu-popup')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="wt-branch-item"][data-branch-id="main"]').click({ button: 'right' });
    await expect(page.getByTestId('wt-branch-menu-copy')).toBeVisible({ timeout: 10000 });
    // 右键不聚焦行：把焦点锚在菜单背板上（菜单项的前一个 Tab 停靠点），走查才收得到菜单项。
    await page.locator('[aria-label="Close context menu"]').focus();
    const actionsReached = await walkPanelWithTab(page, 2);
    expectReachedWithIndicator(actionsReached, ['wt-branch-menu-copy', 'wt-branch-menu-delete']);
    await page.keyboard.press('Escape');

    // 变更列表的行（数据来自 /todo 页的一条 Todo）要能被走到。
    // 先点筛选框把焦点锚在列表区：导航回来时焦点在 body，Tab 会先停在分支栏上，
    // 走查在收齐 wanted 个控件时就停，够不到列表行。点完要等列表渲染出来再走查——
    // diff 是异步读，立刻 Tab 会打在空列表上。
    await writeTodo(page, 'a11y todo');
    await page.getByTestId('wt-refresh-status').click();
    await expect(page.getByTestId('wt-diff-phase')).toHaveText('success', { timeout: 30000 });
    await expect(page.getByTestId('wt-diff-item').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wt-change-filter').click();
    const diffReached = await walkPanelWithTab(page, 2);
    expectReachedWithIndicator(diffReached, ['wt-diff-item']);

    // 提交后，历史列表的行要能被走到。行上没有恢复按钮（GitHub Desktop 同款），
    // 恢复在右键菜单里，而菜单项本身是 keyboard 可达的真按钮。
    await page.getByTestId('wt-commit-message').fill('a11y commit');
    await page.getByTestId('wt-commit').click();
    await expect
      .poll(() => page.getByTestId('wt-commit-live').textContent(), { timeout: 30000 })
      .toContain('Committed');
    await page.getByTestId('wt-tab-history').click();
    await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
    const historyReached = await walkPanelWithTab(page, 2);
    expectReachedWithIndicator(historyReached, ['wt-commit-item']);
  });

  test('分支下拉：非模态 dialog 结构，列表与「Create a branch」对话框打开时 axe 零违规', async ({ page }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);

    const trigger = page.getByTestId('wt-branch-menu');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-controls', 'wt-branch-menu-popup');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const popup = page.getByTestId('wt-branch-menu-popup');
    await expect(popup).toBeVisible({ timeout: 10000 });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // 列表弹层里还有筛选框与新建按钮，`role="menu"` 只许装菜单项（axe aria-required-children）：
    // 它是非模态 dialog，id 对上触发按钮的 aria-controls。
    await expect(popup).toHaveAttribute('role', 'dialog');
    await expect(popup).toHaveAttribute('id', 'wt-branch-menu-popup');
    await expect(popup).toHaveAttribute('aria-label', 'Branch list');
    await expect(popup).not.toHaveAttribute('aria-modal');
    // 行是 <ul>/<li> 里的普通按钮：没有 role；当前分支那一行带 aria-current="true"。
    const current = page.locator('[data-testid="wt-branch-item"][data-branch-id="main"]');
    await expect(current).not.toHaveAttribute('role');
    await expect(current).toHaveAttribute('aria-current', 'true');
    await scanPanel(page);

    // New branch 收起下拉、打开模态对话框；焦点进名字框，Escape 关闭
    await page.getByTestId('wt-branch-create').click();
    const dialog = page.getByTestId('wt-create-branch-dialog');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('wt-create-branch-name')).toBeFocused();
    await expect(page.getByTestId('wt-create-branch-confirm')).toBeDisabled();
    await scanPanel(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('合并对话框（选来源、预览与覆盖说明）、History 的分支对比与 Switch branch 对话框：axe 零违规，焦点进对话框，Escape 关闭', async ({
    page
  }) => {
    await openPanel(page);
    await waitForAutoEnabled(page);
    await divergeBranches(page, {
      branch: 'feature/axe',
      base: 'axe-base',
      onBranch: 'axe-feature',
      onMain: 'axe-main'
    });

    // 合并入口在分支下拉底部；预览里要有一行覆盖说明：它用的是警示色，对比度也在扫描范围里
    await page.getByTestId('wt-branch-menu').click();
    await page.getByTestId('wt-branch-merge-into').click();
    const mergeDialog = page.getByTestId('wt-merge-dialog');
    await expect(mergeDialog).toBeFocused();
    await expect(mergeDialog).toHaveAccessibleName('Merge into main');
    await scanPanel(page);
    await page.locator('[data-testid="wt-merge-branch-item"][data-branch-id="feature/axe"]').click();
    await expect(page.getByTestId('wt-branch-diff-conflict')).toBeVisible({ timeout: 30000 });
    await scanPanel(page);
    await page.keyboard.press('Escape');
    await expect(mergeDialog).toHaveCount(0);

    // History 顶部的对比：原生下拉有可读名；差异列表是可聚焦的滚动区，Tab 走得进去
    await page.getByTestId('wt-tab-history').click();
    const compareSelect = page.getByTestId('wt-compare-select');
    await expect(compareSelect).toHaveAccessibleName('Select branch to compare');
    await compareSelect.selectOption('feature/axe');
    await expect(page.getByTestId('wt-compare-summary')).toBeVisible({ timeout: 30000 });
    await scanPanel(page);
    await compareSelect.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('wt-compare-clear')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('region', { name: 'Differences between main and feature/axe' })).toBeFocused();
    await page.getByTestId('wt-compare-clear').click();
    await expect(page.getByTestId('wt-compare-view')).toHaveCount(0);

    // 带着未提交改动点别的分支：Switch branch 对话框
    await writeTodo(page, 'axe-switch-draft');
    await page.getByTestId('wt-branch-menu').click();
    await page.locator('[data-testid="wt-branch-item"][data-branch-id="feature/axe"]').click();
    const switchDialog = page.getByTestId('wt-switch-dialog');
    await expect(switchDialog).toBeFocused({ timeout: 10000 });
    await expect(switchDialog).toHaveAccessibleName('Switch branch');
    await scanPanel(page);
    await page.keyboard.press('Escape');
    await expect(switchDialog).toHaveCount(0);
  });

  test('记录首次可见状态耗时并归档（SC-005）', async ({ page }) => {
    await openPanel(page);

    const raw = await page.getByTestId('wt-first-visible-ms').textContent();
    const text = raw?.trim() ?? '';
    // 读不出来直接红，不折成 0：`0 ms` 恰好是这条指标最想看到的数字，
    // 用它兜底等于让「面板没渲染」伪装成「快到测不出来」。空串要在 `Number()` 之前单独拦掉——
    // `Number('')` 就是 0，而 0 是有限数：元素挂上了、一个字都没渲染的那一刻，
    // 下面那条 `Number.isFinite` 照样绿，归档的还是一份「0 ms」的假成绩。
    expect(text, `读不出首次可见状态耗时：${JSON.stringify(raw)}`).not.toBe('');
    const firstVisibleMs = Number(text);
    expect(Number.isFinite(firstVisibleMs), `首次可见状态耗时不是数字：${JSON.stringify(raw)}`).toBe(true);
    expect(firstVisibleMs).toBeGreaterThanOrEqual(0);

    const firstPhase = (await page.getByTestId('wt-status-phase').textContent())?.trim() ?? '';

    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(
      join(REPORTS_DIR, `working-tree-ui-first-visible-${FRAMEWORK}.json`),
      `${JSON.stringify(
        // 键按字母序写：仓库的 prettier 用 `prettier-plugin-sort-json` 把 JSON 排成字母序，写入序与它不同的话，
        // 每跑一次 e2e，提交进仓库的这份归档就过不了 `nx format:check`
        {
          // 空库在应用启动时已被自动启用，第一个可见状态因此通常是 `success` / `empty`；
          // 一并记下来，免得后来人把这个数字读成「读一次 status 要多久」。
          firstPhase,
          firstVisibleMs,
          framework: FRAMEWORK,
          metric: 'working-tree-panel-first-visible-state',
          note: 'SC-005：浏览器不承诺绝对数字，本指标不进 benchmark JSON 的 measurements，单独归档',
          recordedAt: new Date().toISOString(),
          route: '/working-tree'
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  });
});
