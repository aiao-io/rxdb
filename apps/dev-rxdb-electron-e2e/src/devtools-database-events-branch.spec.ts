import { _electron as electron, ElectronApplication, expect, Page, test } from '@playwright/test';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, PANEL_BUDGET_MS, panelEvaluate, readPanel } from './devtools-panel-driver';
import { clearWireTap, installWireTap, readWireTap } from './devtools-wire-tap';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

/**
 * US-904 阶段 D AC#46：面板读到的数据、全部事件类型与 branch 都与应用一致，且无 OPFS/IDB fallback。
 *
 * @remarks
 * 三路证据各自独立，合起来才是这条 AC：
 *
 * 1. **数据**：后端确实是 `sqlite-electron`（不是探测失败后落到 wa-sqlite），面板 Database 页
 *    读到 `DesktopLaunch` 的真实行。
 * 2. **全部 `RXDB_EVENT_TYPES`**：本 demo 没有远端，`SYNC_*` / `CONFLICT_*` / `REPOSITORY_SYNC_*` /
 *    `ENTITY_REMOTE_*` / `MERGE_BRANCH_*` 靠真实操作永远不会发生。所以走应用自己的
 *    `RxDB.dispatchEvent()`（`devtools-event-probe.ts`）逐类派发一遍，再核对面板 Events 页
 *    **一类不少**。派发口是公开成员、不是测试后门；从 connector 的 25 条订阅往后全程生产链路。
 * 3. **branch**：在面板里建分支、切分支，再回到**应用自己**的读数上核对
 *    （首页 `rxdb-current-branch`，直接来自 `versionManager.getCurrentBranch()`）。
 *    只看面板自己的选中项证明不了应用真的切过去了——两条路互为对照才算数。
 *
 * 另加一条否定判据：全程结束后 WebView 自有存储（`File System` / `IndexedDB`）里
 * **一个文件都不该有**——桌面后端下 OPFS/IndexedDB fallback 不该被创建，也不该被查询。
 *
 * ⚠️ 依赖打包产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：`--serve` 起的 http renderer。 */
const INSPECTED = 'http://localhost' as const;

/** 桌面适配器注册名，与适配器包的 `ELECTRON_ADAPTER_NAME` 一致。 */
const DESKTOP_ADAPTER_NAME = 'sqlite-electron';

/** Chromium 自有存储目录，与 `storage-persistence.spec.ts` 同源。 */
const WEB_STORAGE_DIRS = ['File System', 'IndexedDB'];

/** 本用例在面板里建的分支名。 */
const PROBE_BRANCH = 'ac46-branch';

/**
 * `RXDB_EVENT_TYPES` 全集，与 `packages/rxdb-devtools/src/connector-events.ts` 的
 * `RXDB_EVENT_SUBSCRIPTIONS` 一致（值为 `true` 的键）。
 *
 * @remarks
 * 写死而不 import：本项目 `tsconfig.json` 的 `rootDir: '.'` 不允许引工作区源码
 * （同 `devtools-wire-tap.ts` 的说明）。上游新增事件类型时这里不会自动跟上，
 * 但**不会静默放行**：`connector-events.ts` 那份清单有 `satisfies Record<keyof RxDBEventMap, boolean>`
 * 的编译期契约兜底，而探针会把新类型也派发出来，于是面板上多出一类、下面的等值断言直接红。
 */
const EXPECTED_EVENT_TYPES = [
  'ENTITY_LOCAL_NEW',
  'ENTITY_LOCAL_CREATE',
  'ENTITY_LOCAL_UPDATE',
  'ENTITY_LOCAL_REMOVE',
  'ENTITY_REMOTE_CREATE',
  'ENTITY_REMOTE_UPDATE',
  'ENTITY_REMOTE_REMOVE',
  'TRANSACTION_BEGIN',
  'TRANSACTION_COMMIT',
  'TRANSACTION_ROLLBACK',
  'SWITCH_BRANCH_BEGIN',
  'SWITCH_BRANCH_COMMIT',
  'SWITCH_BRANCH_ROLLBACK',
  'MERGE_BRANCH_BEGIN',
  'MERGE_BRANCH_COMMIT',
  'MERGE_BRANCH_FAILED',
  'SYNC_BEGIN',
  'SYNC_COMPLETE',
  'SYNC_ERROR',
  'CONFLICT_DETECTED',
  'CONFLICT_PENDING',
  'REPOSITORY_SYNC_BEGIN',
  'REPOSITORY_SYNC_COMPLETE',
  'REPOSITORY_SYNC_ERROR',
  'REMOTE_ENTITY_INVALIDATED'
] as const;

function launchApp(userDataDir: string, port: number): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: resolveDesktopDevExtension(),
      // 建分支 / 切分支要 `full`（见 `DEVTOOLS_OPERATION_REQUIRED_CAPABILITY`）。
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
    }
  });
}

/** 确认首页选中的确实是桌面 SQLite 后端，而不是探测失败后落到 wa-sqlite。 */
async function expectDesktopBackend(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/home';
  });
  const status = page.getByTestId('rxdb-status');
  await expect(status).not.toHaveText(/连接中/, { timeout: 60000 });
  const failure = page.getByTestId('rxdb-error');
  if (await failure.count()) throw new Error(`本地适配器连接失败：${await failure.textContent()}`);
  await expect(status).toHaveText(/已连接/);
  await expect(page.getByTestId('rxdb-backend')).toHaveText(DESKTOP_ADAPTER_NAME);
}

/** WebView 自有存储里的文件清单；桌面后端下应当恒为空。 */
function webStorageEntries(userDataDir: string): string[] {
  return WEB_STORAGE_DIRS.flatMap(directory => {
    const root = join(userDataDir, directory);
    if (!existsSync(root)) return [];
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => join(directory, entry.name));
  });
}

/**
 * 读面板 Events 页工具栏上那个「N 事件」计数。
 *
 * @returns 面板自己数出来的事件条数；读不到返回 `-1`（由调用方断言，不在这里兜底）。
 *
 * @remarks
 * **为什么判据取计数而不是列表行。** 事件列表是 `cdk-virtual-scroll-viewport`，只有可见行在
 * DOM 里；而在 Electron 的 dock DevTools 里实测该视口 `clientHeight` 为 **0**、
 * `scrollHeight` 只有 96～160px，于是 CDK 只渲染三五条最小缓冲，`querySelectorAll('.badge')`
 * 恒定只读到那几条——面板自报 63 条事件的同时 DOM 里只有 3 个徽章。拿 DOM 当判据会把
 * 「面板没收到」和「面板没渲染」混成一个结论，而实测这两件事恰好相反。
 *
 * 计数读的是 `eventIndexes().length`（`events.page.ts` 的工具栏），那是**面板状态**，
 * 不受虚拟滚动影响。
 */
async function panelEventCount(app: ElectronApplication): Promise<number> {
  return panelEvaluate<number>(
    app,
    INSPECTED,
    `(() => {
      const matched = document.body.innerText.match(/(\\d+) 事件/);
      return matched ? Number.parseInt(matched[1], 10) : -1;
    })()`
  );
}

/** 清空面板的事件列表，让计数从 0 起算。 */
async function clearPanelEvents(app: ElectronApplication): Promise<void> {
  await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '清空');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`
  );
}

/** 从被检查页的 wire 旁路里读出 connector 发往面板的事件类型。 */
async function wireEventTypes(page: Page): Promise<string[]> {
  const frames = await readWireTap(page);
  const types = frames
    .filter(frame => frame.type === 'EVENT')
    .map(frame => (frame.payload as { eventType?: unknown } | null)?.eventType)
    .filter((type): type is string => typeof type === 'string');
  return [...new Set(types)];
}

/** 轮询 wire 旁路，直到全部期望类型都出现过（或预算耗尽后交出现状）。 */
async function waitForWireEventTypes(page: Page, budgetMs: number): Promise<string[]> {
  const deadline = Date.now() + budgetMs;
  let seen: string[] = [];
  while (Date.now() < deadline) {
    seen = await wireEventTypes(page);
    if (EXPECTED_EVENT_TYPES.every(type => seen.includes(type))) return seen;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return seen;
}

/** 在面板的分支下拉里建一个分支。 */
async function createBranchInPanel(app: ElectronApplication, name: string): Promise<void> {
  const opened = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const button = document.querySelector('[data-branch-popover] button');
      if (!button) return false;
      button.click();
      return true;
    })()`
  );
  expect(opened, '面板里找不到「创建分支」按钮——分支选择器可能整个没渲染（branches 为空）').toBe(true);

  const typed = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const input = document.querySelector('#new-branch-name');
      if (!input) return false;
      input.value = ${JSON.stringify(name)};
      // Angular 的 (input) 绑定读的是事件里的 target.value：只赋值不派发，
      // 「创建」会因为 [disabled]="!newBranchName().trim()" 一直点不动。
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`
  );
  expect(typed, '创建分支的输入框没出现').toBe(true);

  const created = await panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === '创建');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`
  );
  expect(created, '「创建」按钮不可点（分支名没进信号？）').toBe(true);
}

/** 在面板的分支下拉里切到某个分支。 */
async function switchBranchInPanel(app: ElectronApplication, branchId: string): Promise<boolean> {
  return panelEvaluate<boolean>(
    app,
    INSPECTED,
    `(() => {
      const select = document.querySelector('select.select');
      if (!select) return false;
      const option = [...select.options].find(el => el.value === ${JSON.stringify(branchId)});
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
}

test.describe('面板的数据、事件全集与 branch 都与应用一致（US-904 阶段 D AC#46）', () => {
  test.describe.configure({ timeout: 420000 });

  test('desktop SQLite 下读到真实行、25 类事件一类不少、branch 切换与应用同步，且无 OPFS/IDB fallback', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac46-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port);

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      // 必须在开 DevTools 之前装：事件帧从握手那一刻起就开始走，晚装会漏掉前面的。
      await installWireTap(page);
      await expectDesktopBackend(page);
      await attachPanel(app, INSPECTED);

      // ---------- ① 数据 ----------
      const launches = await readPanel(app, {
        inspected: INSPECTED,
        hash: '#/database',
        clickText: 'DesktopLaunch',
        awaitPattern: 'startedAt',
        budgetMs: PANEL_BUDGET_MS
      });
      expect(launches, `面板 Database 页没读到 DesktopLaunch 数据：《${launches}》`).toContain('startedAt');

      // ---------- ② 全部 RXDB_EVENT_TYPES ----------
      // 先切到 Events 页并清空，让计数从 0 起算——应用启动本身会产生十几条事件，
      // 不清掉的话「面板多了几条」证明不了多的就是探针那些。
      await readPanel(app, { inspected: INSPECTED, hash: '#/events', awaitPattern: '事件', budgetMs: PANEL_BUDGET_MS });
      await clearPanelEvents(app);
      expect(await panelEventCount(app), '清空之后面板的事件计数不为 0').toBe(0);
      await clearWireTap(page);

      await page.getByTestId('rxdb-dispatch-events').click();
      await expect(page.getByTestId('rxdb-dispatched-count')).toHaveText(String(EXPECTED_EVENT_TYPES.length));

      // 判据一：**类型全集**取自 wire——connector 发往面板的每一条 v2 `EVENT` 帧都经过
      // 被检查页的 window 总线，旁路录得到。这是唯一能逐类核对的观测点（DOM 不行，见
      // panelEventCount 的说明）。
      const seen = await waitForWireEventTypes(page, PANEL_BUDGET_MS);
      const missing = EXPECTED_EVENT_TYPES.filter(type => !seen.includes(type));
      expect(missing, `connector 没把这些类型发给面板；发出去的是：${seen.join(', ')}`).toEqual([]);

      // 判据二：**面板真的收下了**。计数是面板自己的状态（`eventIndexes().length`），
      // 不受虚拟滚动影响；清空后只增不减，所以「至少 25 类各一条」是下界。
      await expect
        .poll(() => panelEventCount(app), { timeout: PANEL_BUDGET_MS })
        .toBeGreaterThanOrEqual(EXPECTED_EVENT_TYPES.length);

      // ---------- ③ branch ----------
      // 起始分支必须**不是**探针分支，否则下面那条「切过去了」的断言从一开始就成立、
      // 失去区分力。用 web-first 断言而不是读 textContent：读一次快照会在页面还没
      // 填好读数时拿到空串，那同样满足「不等于探针分支」。
      await expect(page.getByTestId('rxdb-current-branch')).not.toHaveText(PROBE_BRANCH);
      await createBranchInPanel(app, PROBE_BRANCH);
      // 建分支后面板会重新拉一次列表；等它出现在下拉里再切。
      await expect.poll(() => switchBranchInPanel(app, PROBE_BRANCH), { timeout: PANEL_BUDGET_MS }).toBe(true);

      // 判据落在**应用自己**的读数上：面板显示切过去了只说明面板这么认为。
      await expect(page.getByTestId('rxdb-current-branch')).toHaveText(PROBE_BRANCH, { timeout: PANEL_BUDGET_MS });

      // ---------- ④ 无 OPFS / IndexedDB fallback ----------
      expect(
        webStorageEntries(userDataDir),
        '桌面后端下 WebView 自有存储不该有任何文件——出现即说明创建或查询过 OPFS/IndexedDB fallback'
      ).toEqual([]);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
