import type { Page } from '@playwright/test';
import { readCount, readRequiredAttribute, resetE2eState } from './e2e-utils.js';
import { expect, test } from './fixtures.js';
import { commit, openHistory, waitForAutoEnabled, writeTodo } from './working-tree-utils.js';

/**
 * @fileoverview 会话录制回放（US-909 阶段 C）的 demo 闭环：AC#10～14、AC#16（research D11）。
 *
 * @remarks
 * 录制默认关；每个用例在首次加载前写开关键。录制经页内测试 API `window.__rxdbReplay`（仿阶段 B）直接驱动，
 * 回放与 commit 标记走 `/replay` 页上的 `<ao-replayer>`。
 *
 * `readEvents()` 不暴露 `seq`：AC#11 的「`seq` 连续」改为断言事件数与会话 `eventCount` 一致、时间戳不倒退、
 * 刷新最多留下一条 `gap` 标记（库层的 `seq` 连续性由 `resume.spec.ts` 覆盖）。
 */

const REPLAY_ENABLED_KEY = 'rxdb-demo-replay-enabled';
const MARKER_TAG = { commit: 'rxdb-replay:commit', gap: 'rxdb-replay:gap' } as const;
// rrweb EventType：FullSnapshot = 2，Custom = 5
const FULL_SNAPSHOT = 2;
const CUSTOM = 5;

interface ReplayEvent {
  readonly type: number;
  readonly timestamp: number;
  readonly data: unknown;
}

interface ReplaySession {
  readonly id: string;
  readonly status: 'recording' | 'stopped' | 'truncated';
  readonly eventCount: number;
}

interface ReplayCommitMarker {
  readonly timestamp: number;
  readonly commitId: string;
}

/** demo 挂的页内测试 API（`apps/dev-rxdb-angular/src/app/rxdb/replay-recording.ts`）里用例用到的部分。 */
interface ReplayDemoApi {
  readonly dbName: string;
  readonly replay: {
    readonly state$: {
      subscribe(next: (state: { kind: string; sessionId?: string }) => void): { unsubscribe(): void };
    };
    start(): Promise<string>;
    stop(): Promise<void>;
    listSessions(): Promise<ReplaySession[]>;
    readEvents(sessionId: string): Promise<ReplayEvent[]>;
    listCommitMarkers(sessionId: string): Promise<ReplayCommitMarker[]>;
  };
}

declare global {
  interface Window {
    __rxdbReplay?: ReplayDemoApi;
  }
}

const enableReplay = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.addInitScript(key => window.localStorage.setItem(key, '1'), REPLAY_ENABLED_KEY);
};

/** 等 setup 把录制插件装好（它在 `db.init()` 之后异步加载）。 */
const waitForReplay = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => window.__rxdbReplay?.dbName !== undefined, undefined, { timeout: 30000 });
};

const startRecording = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const api = window.__rxdbReplay;
    if (!api) throw new Error('window.__rxdbReplay is not installed');
    return api.replay.start();
  });

const stopRecording = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const api = window.__rxdbReplay;
    if (!api) throw new Error('window.__rxdbReplay is not installed');
    return api.replay.stop();
  });

/** 等 `state$` 进入录制同一会话（刷新后续录由插件安装时认领暂存完成）。 */
const waitForRecording = (page: Page, sessionId: string): Promise<void> =>
  page.evaluate(
    id =>
      new Promise<void>((resolve, reject) => {
        const api = window.__rxdbReplay;
        if (!api) throw new Error('window.__rxdbReplay is not installed');
        const timer = window.setTimeout(() => reject(new Error(`session ${id} did not resume recording`)), 20000);
        const subscription = api.replay.state$.subscribe(state => {
          if (state.kind !== 'recording' || state.sessionId !== id) return;
          window.clearTimeout(timer);
          queueMicrotask(() => subscription.unsubscribe());
          resolve();
        });
      }),
    sessionId
  );

const readSessions = (page: Page): Promise<ReplaySession[]> =>
  page.evaluate(() => {
    const api = window.__rxdbReplay;
    if (!api) throw new Error('window.__rxdbReplay is not installed');
    return api.replay.listSessions();
  });

const readEvents = (page: Page, sessionId: string): Promise<ReplayEvent[]> =>
  page.evaluate(id => {
    const api = window.__rxdbReplay;
    if (!api) throw new Error('window.__rxdbReplay is not installed');
    return api.replay.readEvents(id);
  }, sessionId);

const readMarkers = (page: Page, sessionId: string): Promise<ReplayCommitMarker[]> =>
  page.evaluate(id => {
    const api = window.__rxdbReplay;
    if (!api) throw new Error('window.__rxdbReplay is not installed');
    return api.replay.listCommitMarkers(id);
  }, sessionId);

const markerTag = (event: ReplayEvent): string | undefined =>
  event.type === CUSTOM ? (event.data as { tag?: string }).tag : undefined;

const isNonDecreasing = (values: readonly number[]): boolean => values.every((v, i) => i === 0 || v >= values[i - 1]);

const addTodo = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
};

const openTodo = async (page: Page): Promise<void> => {
  await page.goto('/todo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 20000 });
  await waitForReplay(page);
};

const openWorkingTree = async (page: Page): Promise<void> => {
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await waitForAutoEnabled(page);
  await waitForReplay(page);
};

const entryCount = async (page: Page): Promise<number> =>
  readCount(await page.getByTestId('wt-status-entry-count').textContent(), '工作树条目数');

/** SPA 导航到 `/replay`（整页刷新会丢掉工作树捕获路径，见 `writeTodo`）。 */
const gotoReplayPage = async (page: Page): Promise<void> => {
  await page.locator('a[href="/replay"]').first().click();
  await expect(page.getByTestId('replay-page')).toHaveAttribute('data-phase', 'ready', { timeout: 20000 });
};

const selectSession = async (page: Page, sessionId: string): Promise<void> => {
  await page.locator(`tr[data-session-id="${sessionId}"]`).getByTestId('replay-select').click();
  await expect(page.locator('.rxdb-replayer__stage iframe')).toBeAttached({ timeout: 20000 });
};

const readText = async (page: Page, testId: string): Promise<string> => {
  const text = (await page.getByTestId(testId).textContent())?.trim();
  if (!text) throw new Error(`${testId} 没有文本`);
  return text;
};

const replayFrame = (page: Page) => page.frameLocator('.rxdb-replayer__stage iframe');

test.describe('会话录制回放', () => {
  test('刷新后续录同一会话，事件数与会话一致、时间不倒退（AC#10 / AC#11）', async ({ page }) => {
    await enableReplay(page);
    await openTodo(page);
    const sessionId = await startRecording(page);
    await addTodo(page, '录制 A');
    await addTodo(page, '录制 B');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForReplay(page);
    await waitForRecording(page, sessionId);
    await expect(page.getByTestId('todo-row')).toHaveCount(2, { timeout: 20000 });
    await addTodo(page, '录制 C');
    await stopRecording(page);

    const sessions = await readSessions(page);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: sessionId, status: 'stopped' });
    const events = await readEvents(page, sessionId);
    expect(events).toHaveLength(sessions[0].eventCount);
    expect(isNonDecreasing(events.map(event => event.timestamp))).toBe(true);
    // 每次页面加载各一个全量快照
    expect(events.filter(event => event.type === FULL_SNAPSHOT)).toHaveLength(2);
    expect(events.filter(event => markerTag(event) === MARKER_TAG.gap).length).toBeLessThanOrEqual(1);
  });

  test('录制不进被录应用库：工作树条目数与不录制时相同（AC#12）', async ({ page }) => {
    await enableReplay(page);
    await openWorkingTree(page);
    const baseline = await entryCount(page);

    await writeTodo(page, '不录制');
    const withoutRecording = (await entryCount(page)) - baseline;
    await commit(page, 'chore: 对照');

    const afterCommit = await entryCount(page);
    await startRecording(page);
    await writeTodo(page, '录制中');
    const withRecording = (await entryCount(page)) - afterCommit;
    await stopRecording(page);

    expect(withoutRecording).toBeGreaterThan(0);
    expect(withRecording).toBe(withoutRecording);
    await expect(page.getByTestId('wt-status-entry-count')).toHaveText(String(afterCommit + withRecording));
  });

  test('commit 标记与提交历史一致，点标记跳到提交时刻并恢复工作树（AC#13 / AC#14）', async ({ page }) => {
    await enableReplay(page);
    await openWorkingTree(page);
    const sessionId = await startRecording(page);
    await writeTodo(page, '标记 A');
    await commit(page, 'feat: 标记 A');
    await writeTodo(page, '标记 B');
    await commit(page, 'feat: 标记 B');
    await stopRecording(page);

    const markers = await readMarkers(page, sessionId);
    expect(markers).toHaveLength(2);
    await openHistory(page);
    const historyIds = await page
      .getByTestId('wt-commits-list')
      .locator('[data-commit-id]')
      .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-commit-id')));
    // 历史列表新的在前
    expect(historyIds.slice(0, 2).reverse()).toEqual(markers.map(marker => marker.commitId));

    await gotoReplayPage(page);
    await selectSession(page, sessionId);
    const markerButtons = page.getByRole('list', { name: 'Commits' }).getByRole('button');
    await expect(markerButtons).toHaveCount(2, { timeout: 20000 });
    await markerButtons.first().click();

    // 第一个 commit 的时刻 B 还没写：回放画面里只有 A 的待提交改动
    await expect(replayFrame(page).locator('body')).toContainText('标记 A', { timeout: 20000 });
    await expect(replayFrame(page).locator('body')).not.toContainText('标记 B');
    await expect(page.locator('.rxdb-replayer [role=status]')).toContainText('Restored', { timeout: 20000 });
  });

  test('输入框遮蔽、block 区块只录占位（AC#16）', async ({ page }) => {
    const secret = 'hunter2-secret';
    await enableReplay(page);
    await page.goto('/replay', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('replay-page')).toHaveAttribute('data-phase', 'ready', { timeout: 30000 });
    const blockText = await readText(page, 'replay-block-demo');

    await page.getByTestId('replay-start').click();
    await expect(page.getByTestId('replay-state')).toHaveText('recording');
    await page.getByTestId('replay-mask-input').pressSequentially(secret);
    await page.getByTestId('replay-stop').click();
    await expect(page.getByTestId('replay-state')).toHaveText('idle');

    const [session] = await readSessions(page);
    const serialized = JSON.stringify(await readEvents(page, session.id));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(blockText);
    expect(serialized).toContain('*'.repeat(secret.length));

    await selectSession(page, session.id);
    // 跳到末尾：此时输入框里已是完整的遮蔽值
    const timeline = page.locator('.rxdb-replayer input[aria-label=Timeline]');
    await timeline.fill(await readRequiredAttribute(timeline, 'max', '回放时间轴'));
    await expect(replayFrame(page).locator('#replay-mask-input')).toHaveValue('*'.repeat(secret.length), {
      timeout: 20000
    });
    await expect(replayFrame(page).locator('body')).not.toContainText(blockText);
  });
});
