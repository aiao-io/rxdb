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
const COMPILE_BUTTON_TEXT = '普通编译';
const POLL_INTERVAL_MS = 2000;

/** 点叶子节点上的「普通编译」：开发者工具会从磁盘重读项目并重启模拟器。 */
const CLICK_COMPILE = `(() => {
  const button = [...document.querySelectorAll('*')].find(
    element => element.children.length === 0 && element.textContent.trim() === ${JSON.stringify(COMPILE_BUTTON_TEXT)}
  );
  if (!button) return false;
  button.click();
  return true;
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

async function withSession<T>(cdp: CdpConnection, targetId: string, run: (sessionId: string) => Promise<T>): Promise<T> {
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  try {
    return await run(sessionId);
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId });
  }
}

async function evaluate(cdp: CdpConnection, sessionId: string, expression: string, contextId?: number): Promise<unknown> {
  const params = { expression, returnByValue: true, awaitPromise: true, ...(contextId === undefined ? {} : { contextId }) };
  const { result, exceptionDetails } = await cdp.send<EvaluateResult>('Runtime.evaluate', params, sessionId);
  if (exceptionDetails !== undefined) throw new Error(`求值抛错：${JSON.stringify(exceptionDetails)}`);
  return result.value;
}

function findFrame(tree: FrameTree, urlPart: string): FrameTree['frame'] | undefined {
  if (tree.frame.url.includes(urlPart)) return tree.frame;
  return (tree.childFrames ?? []).map(child => findFrame(child, urlPart)).find(frame => frame !== undefined);
}

/** 在开发者工具的项目窗口里点「普通编译」。找不到按钮说明 IDE 没打开任何项目。 */
export async function recompile(cdp: CdpConnection): Promise<void> {
  for (const target of (await targets(cdp)).filter(item => item.type === 'page')) {
    const clicked = await withSession(cdp, target.targetId, sessionId => evaluate(cdp, sessionId, CLICK_COMPILE));
    if (clicked === true) return;
  }
  throw new Error(`没找到「${COMPILE_BUTTON_TEXT}」按钮：开发者工具没有打开探针项目`);
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
      if (method === 'Runtime.executionContextCreated') contexts.push((params as { context: ExecutionContext }).context);
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
