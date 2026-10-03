import type { CdpConnection } from './cdp.js';

interface TargetInfo {
  readonly targetId: string;
  readonly type: string;
  readonly title: string;
}

interface FrameTree {
  readonly frame: { readonly id: string; readonly url: string };
  readonly childFrames?: readonly FrameTree[];
}

interface ExecutionContext {
  readonly id: number;
  readonly auxData?: { readonly frameId?: string; readonly isDefault?: boolean };
}

interface EvaluateResult {
  readonly result: { readonly value?: unknown };
  readonly exceptionDetails?: unknown;
}

/** 探针报告：只声明定位用的两个字段，其余按 `toMatchObject` 断言。 */
export interface ProbeReport {
  readonly [field: string]: unknown;
  readonly schema: string;
  readonly startedAt: string;
}

/** 模拟器 webview 的标题（开发者工具 3.10.15 实测）。 */
const SIMULATOR_TITLE = 'Lyra Simulator';
/** 逻辑层所在 frame 的脚本名：`file:///appx-ng/af-appx.worker.min.js`。 */
const LOGIC_LAYER_FRAME = 'af-appx.worker';
const STOP_TITLE = '停止编译';
const START_TITLE = '启动编译';
const POLL_INTERVAL_MS = 2000;
const TOGGLE_POLL_MS = 500;
const TOGGLE_TIMEOUT_MS = 15_000;

/**
 * 工具栏的编译开关：运行中标题是「停止编译」，停下后是「启动编译」。
 *
 * 不点「普通编译」：那只是编译模式下拉里的选项，点了不触发编译。
 */
const READ_TOGGLE = `(() => {
  const icon = document.querySelector('[data-toolbar-action-id="simulator-toolbar-start"] [title]');
  if (!icon) return null;
  const rect = icon.getBoundingClientRect();
  return { title: icon.getAttribute('title'), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
})()`;

const READ_PAGE = `(() => {
  const page = getCurrentPages()[0];
  return page ? { status: page.data.status, reportText: page.data.reportText } : null;
})()`;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function targets(cdp: CdpConnection): Promise<readonly TargetInfo[]> {
  const { targetInfos } = await cdp.send<{ targetInfos: TargetInfo[] }>('Target.getTargets');
  return targetInfos;
}

async function withSession<T>(
  cdp: CdpConnection,
  targetId: string,
  run: (sessionId: string) => Promise<T>
): Promise<T> {
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  try {
    return await run(sessionId);
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId });
  }
}

async function evaluate(
  cdp: CdpConnection,
  sessionId: string,
  expression: string,
  contextId?: number
): Promise<unknown> {
  const params = {
    expression,
    returnByValue: true,
    awaitPromise: true,
    ...(contextId === undefined ? {} : { contextId })
  };
  const { result, exceptionDetails } = await cdp.send<EvaluateResult>('Runtime.evaluate', params, sessionId);
  if (exceptionDetails !== undefined) throw new Error(`求值抛错：${JSON.stringify(exceptionDetails)}`);
  return result.value;
}

function findFrame(tree: FrameTree, urlPart: string): FrameTree['frame'] | undefined {
  if (tree.frame.url.includes(urlPart)) return tree.frame;
  return (tree.childFrames ?? []).map(child => findFrame(child, urlPart)).find(frame => frame !== undefined);
}

interface CompileToggle {
  readonly title: string;
  readonly x: number;
  readonly y: number;
}

async function readToggle(cdp: CdpConnection, sessionId: string): Promise<CompileToggle | null> {
  return (await evaluate(cdp, sessionId, READ_TOGGLE)) as CompileToggle | null;
}

/** 用真实鼠标事件点开关：实测 `Input.dispatchMouseEvent` 点得动，DOM `click()` 没验证过。 */
async function clickToggle(cdp: CdpConnection, sessionId: string, { x, y }: CompileToggle): Promise<void> {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId);
  }
}

async function waitForToggle(cdp: CdpConnection, sessionId: string, title: string): Promise<CompileToggle> {
  const deadline = Date.now() + TOGGLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const toggle = await readToggle(cdp, sessionId);
    if (toggle?.title === title) return toggle;
    await delay(TOGGLE_POLL_MS);
  }
  throw new Error(`${TOGGLE_TIMEOUT_MS}ms 内编译开关没变成「${title}」`);
}

/** 停掉正在跑的模拟器（如果在跑），再启动编译：开发者工具会从磁盘重读项目、重开模拟器。 */
async function restartCompile(cdp: CdpConnection, sessionId: string, toggle: CompileToggle): Promise<void> {
  if (toggle.title === STOP_TITLE) await clickToggle(cdp, sessionId, toggle);
  await clickToggle(cdp, sessionId, await waitForToggle(cdp, sessionId, START_TITLE));
}

/** 在开发者工具的项目窗口里重启编译。找不到编译开关说明 IDE 没打开任何项目。 */
export async function recompile(cdp: CdpConnection): Promise<void> {
  for (const target of (await targets(cdp)).filter(item => item.type === 'page')) {
    const restarted = await withSession(cdp, target.targetId, async sessionId => {
      const toggle = await readToggle(cdp, sessionId);
      if (!toggle) return false;
      await restartCompile(cdp, sessionId, toggle);
      return true;
    });
    if (restarted) return;
  }
  throw new Error(`没找到编译开关（「${STOP_TITLE}」/「${START_TITLE}」）：开发者工具没有打开探针项目`);
}

/**
 * 在模拟器逻辑层的默认执行上下文里求值。
 *
 * 逻辑层 frame 不存在时抛错——编译失败（语法超出 IDE 编译器支持）就是这个症状，去看 IDE 的错误面板。
 */
export async function evaluateInLogicLayer(cdp: CdpConnection, expression: string): Promise<unknown> {
  const simulator = (await targets(cdp)).find(item => item.type === 'webview' && item.title === SIMULATOR_TITLE);
  if (!simulator) throw new Error(`没找到模拟器 target「${SIMULATOR_TITLE}」`);
  return withSession(cdp, simulator.targetId, async sessionId => {
    const { frameTree } = await cdp.send<{ frameTree: FrameTree }>('Page.getFrameTree', {}, sessionId);
    const frame = findFrame(frameTree, LOGIC_LAYER_FRAME);
    if (!frame) throw new Error(`模拟器里没有逻辑层 frame（${LOGIC_LAYER_FRAME}）：多半是编译失败，看 IDE 的错误面板`);
    const contexts: ExecutionContext[] = [];
    const stop = cdp.on((method, params) => {
      if (method === 'Runtime.executionContextCreated')
        contexts.push((params as { context: ExecutionContext }).context);
    });
    await cdp.send('Runtime.enable', {}, sessionId);
    stop();
    const context = contexts.find(item => item.auxData?.frameId === frame.id && item.auxData.isDefault === true);
    if (!context) throw new Error('逻辑层 frame 没有默认执行上下文');
    return evaluate(cdp, sessionId, expression, context.id);
  });
}

async function readPage(cdp: CdpConnection): Promise<{ status: string; reportText: string } | null> {
  return (await evaluateInLogicLayer(cdp, READ_PAGE)) as { status: string; reportText: string } | null;
}

function finishedReport(page: { status: string; reportText: string } | null): ProbeReport | undefined {
  if (!page || page.reportText === '') return undefined;
  if (!page.status.startsWith('完成') && !page.status.startsWith('实验没能跑完')) return undefined;
  return JSON.parse(page.reportText) as ProbeReport;
}

/**
 * 重新编译并等新一轮探针跑完，返回它的报告。
 *
 * 用 `startedAt` 区分新旧报告：编译前页面上可能挂着上一轮的结果。编译期间逻辑层会短暂消失，
 * 轮询把这段当作「还没好」，超时时带上最后一次的错误。
 */
export async function runProbeOnSimulator(cdp: CdpConnection, timeoutMs: number): Promise<ProbeReport> {
  const previous = finishedReport(await readPage(cdp).catch(() => null))?.startedAt;
  await recompile(cdp);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    const report = await readPage(cdp).then(finishedReport, (error: unknown) => {
      lastError = error;
      return undefined;
    });
    if (report && report.startedAt !== previous) return report;
  }
  throw new Error(`${timeoutMs}ms 内没等到新一轮报告；最后一次读取错误：${String(lastError)}`);
}
