import { _electron as electron, ElectronApplication, expect, Page, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPanel, closePanel, PANEL_BUDGET_MS, readPanel } from './devtools-panel-driver';
import {
  clearWireTap,
  installWireTap,
  postToConnector,
  requestFrame,
  waitForFrame,
  waitForSessionId
} from './devtools-wire-tap';
import { launchEnv, resolveDesktopDevExtension, resolveExecutable, serveRendererDist } from './packaged-app';

/**
 * US-904 阶段 D AC#51：session A 结束后资源释放，session B 拒绝 A 的身份。
 *
 * @remarks
 * AC 的操作栏是「**关闭/刷新**后建立 session B 并投递 A 消息」——两条路径本文件各占一条用例。
 * 判据相同，都要三件事成立：
 *
 * 1. B 的 `sessionId` 是一个新的 UUID v4，不等于 A；
 * 2. 投一帧带 A 身份的 `REQUEST`，得到 session 级 `session_invalid`（`requestId` 为 `null`），
 *    **且没有任何一帧按该 requestId 作答**——后半句才是「没被当成 B 的请求处理」的判据，
 *    只断言「拿到了一个错误」在「照常处理但顺手报了个错」的实现下同样为真；
 * 3. 重开后的面板不带 A 的实体行与错误残留。
 *
 * A 的 host session 与资源释放由第 2 条**传递性**证明：`session_invalid` 只可能来自
 * `#route` 的第二道闸（`!session.accepts(A)`），而它成立的前提就是当前 session 已经不是 A。
 *
 * ## 「只关闭不刷新」这条曾经根本走不通（2026-09-04 修复）
 *
 * 这条用例第一次写出来时是红的，而且卡在**三处**互相独立的缺陷上——三处都修掉之后它才绿：
 *
 * 1. **中继不把「面板没了」告诉页面**：`background-core.ts` 的 `port.onDisconnect` 只做
 *    `ports.delete(tabId)`，于是 connector 的 session A 一直 `open`，订阅与计时器全都活着。
 *    现在它会用该 tab 真实协商出的 session 补发一条 v2 `DISCONNECT`。
 * 2. **端点对协商帧重复回错**：`endpoint.ts` 的 `#route` 没有跳过 `NEGOTIATION_OWNED_TYPES`
 *    （而紧邻的 `#rejectMalformed` 跳了）。新面板的 `PROTOCOL_HELLO` 的 `sessionId` 必为
 *    `null`，撞在 `session.accepts` 上被回 `session_invalid`——本该由协商机自己处置。
 * 3. **协商机停在 `v2`，且 sessionId 在构造时就铸死**：光关 session 不够，下一个面板拿到的会是
 *    **同一个** sessionId。所以 connector 现在在 session 由开转关时**整个换一个端点**，
 *    与面板侧 `DevToolsEndpointService` 按 `connectionEpoch` 换端点的做法对称。
 *
 * 三处任缺其一，表征都一样且都极具误导性：面板静默退回 v1 车道，连接守卫照样显示「已连接」，
 * 但 v2 数据面已经不属于它了。**以前没被抓到**是因为唯一覆盖「关 DevTools 再重开」的既有用例
 * （`devtools-mv3-feasibility.spec.ts` 的 AC#4b）在两步之间刷新了页面——刷新会连 connector
 * 一起重建，恰好把三条全盖住。本文件第一条用例走的正是那条被盖住的路径。
 *
 * ⚠️ 依赖打包产物。跑之前：
 *   pnpm nx run rxdb-devtools-extension:build-desktop-dev
 *   pnpm nx run dev-rxdb-electron:electron-package-dir
 */

/** 被检查窗口：`--serve` 起的 http renderer。 */
const INSPECTED = 'http://localhost' as const;

/** 一次应答/拒绝的预算。 */
const ANSWER_BUDGET_MS = 15000;

/**
 * 判「没有发生」用的预算。
 *
 * @remarks
 * 与 {@link ANSWER_BUDGET_MS} 同量级是有意的：短预算下的「没等到」只说明还没到，
 * 不说明被拒绝了。`devtools-native-files-mutation.spec.ts` 的 readonly 负对照同一手法。
 */
const SILENCE_BUDGET_MS = 15000;

/** UUID v4，与 `v2/ids.ts` 生成的形状一致。 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function launchApp(userDataDir: string, port: number): Promise<ElectronApplication> {
  return electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`, '--serve', `--port=${String(port)}`],
    env: {
      ...launchEnv(),
      DEV_RXDB_DEVTOOLS: '1',
      DEV_RXDB_DEVTOOLS_EXTENSION: resolveDesktopDevExtension(),
      DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
      DEV_RXDB_DEVTOOLS_MUTATION: 'allow'
    }
  });
}

/** 一帧是不是「针对某条请求的应答」。 */
const answersRequest =
  (requestId: string) =>
  (frame: { type?: string; payload?: unknown }): boolean => {
    if (frame.type !== 'RESPONSE' && frame.type !== 'ERROR') return false;
    const payload = frame.payload as { requestId?: unknown } | null;
    return payload !== null && typeof payload === 'object' && payload.requestId === requestId;
  };

/** 一帧是不是 session 级的 `session_invalid`（`requestId` 为 `null`）。 */
const isSessionInvalid = (frame: { type?: string; payload?: unknown }): boolean => {
  if (frame.type !== 'ERROR') return false;
  const payload = frame.payload as { requestId?: unknown; error?: { code?: unknown } } | null;
  return payload?.requestId === null && payload.error?.code === 'session_invalid';
};

/** 建立 session A，并让它真的有状态（订阅、请求、渲染都发生过）。 */
async function establishSessionA(app: ElectronApplication, page: Page): Promise<string> {
  await installWireTap(page);
  await attachPanel(app, INSPECTED);
  const sessionA = await waitForSessionId(page, PANEL_BUDGET_MS);
  expect(sessionA, `session A 的 id 不是 UUID v4：${sessionA}`).toMatch(UUID_V4);

  const underA = await readPanel(app, {
    inspected: INSPECTED,
    hash: '#/database',
    clickText: 'DesktopLaunch',
    awaitPattern: 'startedAt',
    budgetMs: PANEL_BUDGET_MS
  });
  expect(underA, `session A 下面板没读到数据：《${underA}》`).toContain('startedAt');
  return sessionA;
}

/**
 * B 建立之后的三条判据：新身份、拒绝 A、面板无残留。
 *
 * @returns session B 的 id，供调用方在用例体里再断一次（否则 lint 认为用例没有断言）。
 */
async function expectSessionBRejectsA(app: ElectronApplication, page: Page, sessionA: string): Promise<string> {
  const sessionB = await waitForSessionId(page, PANEL_BUDGET_MS);
  expect(sessionB, `session B 的 id 不是 UUID v4：${sessionB}`).toMatch(UUID_V4);
  expect(sessionB, '重开之后 session id 没有换——B 复用了 A 的身份').not.toBe(sessionA);

  await clearWireTap(page);
  await postToConnector(page, requestFrame(sessionA, 'ac51-stale', 'database', 'inspect'));

  const rejected = await waitForFrame(page, isSessionInvalid, ANSWER_BUDGET_MS);
  expect(rejected, 'B 之下投 A 的身份没有拿到 session_invalid').not.toBeNull();

  // 而且**不能**有一条针对该 requestId 的应答：结构化拒绝是 session 级的（requestId 为 null），
  // 一旦出现按请求作答的帧，就说明这一帧被当成 B 的请求处理了。给足与「拿到拒绝」同样的
  // 预算再判「没有」——短预算下的「还没出现」不是「没被处理」。
  const servedAnyway = await waitForFrame(page, answersRequest('ac51-stale'), SILENCE_BUDGET_MS);
  expect(servedAnyway, `A 的旧身份帧仍被当作请求处理了：${JSON.stringify(servedAnyway)}`).toBeNull();

  // A 的 host session 与资源释放由上面两条**传递性**证明：`session_invalid` 只可能来自
  // `#route` 的第二道闸（`!session.accepts(A)`），成立的前提就是当前 session 已经不是 A ——
  // 协商 B 时旧 session 被 `#closeSession()` 关掉，订阅、计时器与在途传输随之释放。

  // 重开后的面板是新加载的 panel.html：没人点实体之前不应该已经有行，也不该带着 A 的错误残留。
  const freshB = await readPanel(app, {
    inspected: INSPECTED,
    hash: '#/database',
    awaitPattern: '.',
    budgetMs: PANEL_BUDGET_MS
  });
  expect(freshB, `session B 一打开就显示了 A 的实体行：《${freshB}》`).not.toContain('startedAt');
  expect(freshB, `session B 带着 A 的错误残留：《${freshB}》`).not.toContain('session_invalid');
  return sessionB;
}

test.describe('session 轮换后旧身份被拒、旧资源已释放（US-904 阶段 D AC#51）', () => {
  test.describe.configure({ timeout: 420000 });

  test('刷新被检查页后重开 DevTools：B 是新身份，A 的帧被结构化拒绝，面板无残留', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac51-reload-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port);

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      const sessionA = await establishSessionA(app, page);

      await closePanel(app, INSPECTED);
      // 刷新会连 connector 一起重建，session A 随页面一起消失——这是今天唯一能真正拿到
      // session B 的路径。录制器挂在 window 上，刷新后必须重装。
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await installWireTap(page);
      await attachPanel(app, INSPECTED);

      const sessionB = await expectSessionBRejectsA(app, page, sessionA);
      expect(sessionB, 'session B 与 A 同一个身份').not.toBe(sessionA);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });

  test('只关闭再重开、不刷新页面：B 同样是新身份，A 的帧同样被拒', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'ac51-noreload-'));
    const renderer = await serveRendererDist(createServer);
    const app = await launchApp(userDataDir, renderer.port);

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      const sessionA = await establishSessionA(app, page);

      await closePanel(app, INSPECTED);
      await clearWireTap(page);
      await attachPanel(app, INSPECTED);

      // 今天卡在这里：connector 仍持有 A，新面板的 PROTOCOL_HELLO 被回 session_invalid，
      // 于是 waitForSessionId 抛「没有录到 v2 HANDSHAKE」。
      const sessionB = await expectSessionBRejectsA(app, page, sessionA);
      expect(sessionB, 'session B 与 A 同一个身份').not.toBe(sessionA);
    } finally {
      await app.close();
      await renderer.close();
      rmSync(userDataDir, { force: true, recursive: true });
    }
  });
});
