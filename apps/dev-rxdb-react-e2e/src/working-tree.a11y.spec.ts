import AxeBuilder from '@axe-core/playwright';
import { workspaceRoot } from '@nx/devkit';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resetE2eState } from './e2e-utils.js';

/**
 * @fileoverview `/working-tree` 面板的 a11y 与 SC-005 归档用例（T128）。
 *
 * @remarks
 * 三端各一份，断言逐条对齐 —— 面板的 `data-testid` 与 ARIA 属性在
 * Angular / React / Vue 上完全同名，**任何一端的差异都必须在这里变成红**，
 * 而不是留给用户去发现（contracts/tri-framework-api.md §4）。
 *
 * 扫描范围锁在 `[data-testid="working-tree-page"]`：页面外的导航壳由
 * `search.a11y.spec.ts` 那一路覆盖，混进来只会让这份用例因为别处的回归而红。
 *
 * **面板上没有 disabled 按钮**，这是设计决定而不是疏漏：daisyUI 的禁用态文字是
 * `base-content/20%`，白底上合成 `#d1d1d1`，对比度 1.52，必然触发 axe 的
 * `color-contrast`（见 `search.a11y.spec.ts` 里记下的同一个坑）。前置条件不满足时
 * 面板改用 `role="alert"` 的提示行说明原因。
 */

/** 归档文件里的框架名；三端各写各的一份，互不覆盖。 */
const FRAMEWORK = 'react';

/**
 * SC-005 的归档目录。
 *
 * contracts/benchmark-report.md §5：首次可见状态耗时**不进** benchmark JSON 的
 * `measurements`（浏览器 OPFS / IDB 不承诺相同绝对数字，混进去会让门禁按一个
 * 没人承诺过的数字判定），但三端 E2E **必须记录**它 —— 单独归档到这里。
 */
const REPORTS_DIR = join(workspaceRoot, 'benchmarks', 'reports');

const PANEL = '[data-testid="working-tree-page"]';

/** 面板里**期望**能用键盘走到的控件；面板上没有 disabled 控件，所以这张表就是全集。 */
const KEYBOARD_REACHABLE = [
  'wt-enable',
  'wt-refresh-status',
  'wt-todo-title',
  'wt-write-todo',
  'wt-diff',
  'wt-commit-message',
  'wt-commit',
  'wt-discard',
  'wt-list-commits'
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
      const style = getComputedStyle(element);
      return {
        testId,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow
      };
    });
    if (focused === null) continue;
    reached.set(focused.testId, focused);
  }
  return reached;
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

test.describe('Working Tree Page A11y', () => {
  test('状态变化对读屏可感知：三块结果区都挂了 live region', async ({ page }) => {
    await openPanel(page);

    // `commit()` / `restore()` 期间不得静默（§4 loading 一栏）：这三块是相位变化的落点，
    // 没有 live region 的话读屏用户拿到的就是「点了按钮，什么都没发生」。
    await expect(page.getByTestId('wt-status')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('wt-commit-result')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-commit-result')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('wt-enabled')).toHaveAttribute('role', 'status');
    await expect(page.getByTestId('wt-diff-result')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId('wt-commits-result')).toHaveAttribute('aria-live', 'polite');
  });

  test('未启用 / 已启用 / 有未提交改动 / 已提交四态都没有 axe 违规', async ({ page }) => {
    await openPanel(page);

    // 冷启动的库没有提交能力，挂载那次 `status()` 撞上 WorkingTreeCapabilityDisabledError。
    // 这不是用例没准备好，而是**默认状态**：v1 的启用是数据库级的显式开关。
    await expect(page.getByTestId('wt-status-phase')).toHaveText('error');
    await scanPanel(page);

    await page.getByTestId('wt-enable').click();
    await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
    await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
    await scanPanel(page);

    await page.getByTestId('wt-write-todo').click();
    await expect(page.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await page.getByTestId('wt-diff').click();
    await expect(page.getByTestId('wt-diff-phase')).toHaveText('success', { timeout: 30000 });
    await scanPanel(page);

    await page.getByTestId('wt-commit').click();
    await expect(page.getByTestId('wt-commit-outcome')).toHaveText(/已提交/, { timeout: 30000 });
    await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
    await page.getByTestId('wt-list-commits').click();
    await expect(page.getByTestId('wt-commits-phase')).toHaveText('success', { timeout: 30000 });
    await scanPanel(page);
  });

  test('面板里的每个控件都能用键盘走到，且焦点可见', async ({ page }) => {
    await openPanel(page);

    const reached = await walkPanelWithTab(page, KEYBOARD_REACHABLE.length);
    expect([...reached.keys()].sort()).toEqual([...KEYBOARD_REACHABLE].sort());

    const withoutIndicator = [...reached.values()].filter(one => !hasVisibleFocusIndicator(one)).map(one => one.testId);
    expect(withoutIndicator).toEqual([]);
  });

  test('记录首次可见状态耗时并归档（SC-005）', async ({ page }) => {
    await openPanel(page);

    const raw = await page.getByTestId('wt-first-visible-ms').textContent();
    const firstVisibleMs = Number(raw?.trim());
    // 读不出来直接红，不折成 0：`0 ms` 恰好是这条指标最想看到的数字，
    // 用它兜底等于让「面板没渲染」伪装成「快到测不出来」。
    expect(Number.isFinite(firstVisibleMs), `读不出首次可见状态耗时：${JSON.stringify(raw)}`).toBe(true);
    expect(firstVisibleMs).toBeGreaterThanOrEqual(0);

    const firstPhase = (await page.getByTestId('wt-status-phase').textContent())?.trim() ?? '';

    await mkdir(REPORTS_DIR, { recursive: true });
    await writeFile(
      join(REPORTS_DIR, `working-tree-ui-first-visible-${FRAMEWORK}.json`),
      `${JSON.stringify(
        {
          metric: 'working-tree-panel-first-visible-state',
          framework: FRAMEWORK,
          route: '/working-tree',
          // 冷启动的库还没启用提交能力，第一个可见状态因此通常是 `error`。
          // 一并记下来，免得后来人把这个数字读成「读一次 status 要多久」。
          firstPhase,
          firstVisibleMs,
          recordedAt: new Date().toISOString(),
          note: 'SC-005：浏览器不承诺绝对数字，本指标不进 benchmark JSON 的 measurements，单独归档'
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  });
});
