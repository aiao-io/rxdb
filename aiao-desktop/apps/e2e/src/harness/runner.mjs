import { compareKeys, failedChecks, flattenKeys, valueAt } from './keys.mjs';
import { createSession } from './session.mjs';

/** 一个检查组的默认时限；超过就判失败，免得挂死整次运行。 */
const DEFAULT_TIMEOUT = 300_000;

function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${milliseconds / 1000} 秒仍未完成`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 异常消息加上检查组文件里出错的位置，一眼看出是哪一步。 */
function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const where = error.stack?.match(/(groups\/[\w-]+\.mjs:\d+)/)?.[1];
  return where ? `${error.message}（${where}）` : error.message;
}

/**
 * 跑一个检查组：给它独立的浏览器上下文（独立的 OPFS 与站点数据），收集页面错误，核对它声明的检查项键。
 * 检查组抛错、缺检查项、多出未声明的检查项、检查项没通过、出现页面错误，都记为 `problems`。
 *
 * @param {object} group 检查组：`{ name, keys, run(session), standins?, context?, timeout? }`（`context` 是该组要求的浏览器上下文选项，例如窄屏视口与触屏）
 * 每个检查组默认有自己的桌面服务器（`serve`，各自的端口 = 各自的来源）：浏览器按来源隔离站点数据，
 * 所以检查组之间互不可见。这对 WebKit 尤其要紧——Playwright 的 WebKit 持久上下文即使用不同的 `userDataDir`，
 * 同一来源的 OPFS 也是共享的（实测），共用一个来源时并行的检查组会同时打开同一个库，顺序执行的检查组会看到上一组留下的库。
 * 给定固定的 `origin` 时（夹具自检要让两次运行共享来源）不另起服务器。
 *
 * @param {{ browser: import('playwright').Browser, origin?: string, serve?: () => Promise<{ origin: string, close: () => void }>, distRoot?: string, engine?: string }} environment
 */
export async function runGroup(group, { browser, origin, serve, distRoot, engine = 'chromium' }) {
  const startedAt = performance.now();
  const server = serve ? await serve() : null;
  const outcome = {
    group: group.name,
    result: {},
    problems: [],
    /* 结构化的问题（已知限制的判定用）：未通过的键、缺失的键、检查组异常、页面错误。 */
    failedKeys: [],
    missingKeys: [],
    extraKeys: [],
    crashed: null,
    pageErrors: [],
    seconds: 0
  };
  const session = await createSession({
    browser,
    origin: server?.origin ?? origin,
    distRoot,
    engine,
    label: group.name,
    standins: group.standins,
    context: group.context
  });
  try {
    outcome.result = await withTimeout(group.run(session), group.timeout ?? DEFAULT_TIMEOUT, `检查组 ${group.name}`);
    const { missing, extra } = compareKeys(group.keys, flattenKeys(outcome.result));
    outcome.missingKeys.push(...missing);
    outcome.extraKeys.push(...extra);
    for (const key of missing) outcome.problems.push(`缺少检查项 ${key}`);
    for (const key of extra) outcome.problems.push(`多出未声明的检查项 ${key}`);
    for (const key of failedChecks(outcome.result)) {
      outcome.failedKeys.push(key);
      outcome.problems.push(`检查项未通过：${key} = ${JSON.stringify(valueAt(outcome.result, key))}`);
    }
  } catch (error) {
    outcome.crashed = describeError(error);
    outcome.missingKeys.push(...group.keys);
    outcome.problems.push(`检查组异常：${outcome.crashed}`);
  } finally {
    outcome.pageErrors.push(...session.errors);
    if (session.errors.length) outcome.problems.push(`页面错误：${session.errors.join(' | ')}`);
    await session.close().catch(() => undefined);
    server?.close();
    outcome.seconds = (performance.now() - startedAt) / 1000;
  }
  return outcome;
}

/**
 * 依次或并行跑一批检查组。并行时每个检查组仍是各自的浏览器上下文，互不共享状态；
 * 耗时长的检查组（`weight` 大）先开始，缩短总时长。合并后的输出按检查组声明的顺序排列，与执行顺序无关。
 *
 * 标了 `exclusive` 的检查组（真游戏的软件 WebGL 会占满 GPU 进程与多个核）独占运行：
 * 先并行跑完其余检查组，再逐个单独跑它们，免得它们拖慢别的检查组的时序检查。
 *
 * @param {object} options
 * @param {readonly object[]} options.groups
 * @param {import('playwright').Browser} options.browser
 * @param {string} [options.origin] 固定来源（与 `serve` 二选一）
 * @param {() => Promise<{ origin: string, close: () => void }>} [options.serve] 每个检查组各起一个桌面服务器
 * @param {string} [options.distRoot] 被测产物的目录
 * @param {string} [options.engine]
 * @param {number} [options.parallel] 同时跑几个检查组，默认 1
 * @param {(outcome: object) => void} [options.onFinish] 每个检查组结束时回调
 */
export async function runGroups({ groups, browser, origin, serve, distRoot, engine, parallel = 1, onFinish }) {
  const outcomes = new Array(groups.length);
  const byWeight = (a, b) => (groups[b].weight ?? 0) - (groups[a].weight ?? 0);
  const indexes = groups.map((_, index) => index);
  const shared = indexes.filter(index => !groups[index].exclusive).sort(byWeight);
  const exclusive = indexes.filter(index => groups[index].exclusive).sort(byWeight);
  const execute = async index => {
    outcomes[index] = await runGroup(groups[index], { browser, origin, serve, distRoot, engine });
    onFinish?.(outcomes[index]);
  };
  const pool = async (queue, size) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) await execute(queue[cursor++]);
    };
    await Promise.all(Array.from({ length: Math.min(size, queue.length) }, worker));
  };
  await pool(shared, parallel);
  await pool(exclusive, 1);
  return {
    outcomes,
    checks: Object.assign({}, ...outcomes.map(outcome => outcome.result)),
    problems: outcomes.flatMap(outcome => outcome.problems.map(problem => `[${outcome.group}] ${problem}`))
  };
}
