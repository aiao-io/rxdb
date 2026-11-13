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

const describeError = error => (error instanceof Error ? error.message : String(error));

/**
 * 跑一个检查组：给它独立的浏览器上下文（独立的 OPFS 与站点数据），收集页面错误，核对它声明的检查项键。
 * 检查组抛错、缺检查项、多出未声明的检查项、检查项没通过、出现页面错误，都记为 `problems`。
 *
 * @param {object} group 检查组：`{ name, keys, run(session), standins?, timeout? }`
 * @param {{ browser: import('playwright').Browser, origin: string, engine?: string }} environment
 */
export async function runGroup(group, { browser, origin, distRoot, engine = 'chromium' }) {
  const startedAt = performance.now();
  const outcome = { group: group.name, result: {}, problems: [], seconds: 0 };
  const session = await createSession({
    browser,
    origin,
    distRoot,
    engine,
    label: group.name,
    standins: group.standins
  });
  try {
    outcome.result = await withTimeout(group.run(session), group.timeout ?? DEFAULT_TIMEOUT, `检查组 ${group.name}`);
    const { missing, extra } = compareKeys(group.keys, flattenKeys(outcome.result));
    for (const key of missing) outcome.problems.push(`缺少检查项 ${key}`);
    for (const key of extra) outcome.problems.push(`多出未声明的检查项 ${key}`);
    for (const key of failedChecks(outcome.result))
      outcome.problems.push(`检查项未通过：${key} = ${JSON.stringify(valueAt(outcome.result, key))}`);
  } catch (error) {
    outcome.problems.push(`检查组异常：${describeError(error)}`);
  } finally {
    if (session.errors.length) outcome.problems.push(`页面错误：${session.errors.join(' | ')}`);
    await session.close().catch(() => undefined);
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
 * @param {string} options.origin
 * @param {string} [options.distRoot] 被测产物的目录
 * @param {string} [options.engine]
 * @param {number} [options.parallel] 同时跑几个检查组，默认 1
 * @param {(outcome: object) => void} [options.onFinish] 每个检查组结束时回调
 */
export async function runGroups({ groups, browser, origin, distRoot, engine, parallel = 1, onFinish }) {
  const outcomes = new Array(groups.length);
  const byWeight = (a, b) => (groups[b].weight ?? 0) - (groups[a].weight ?? 0);
  const indexes = groups.map((_, index) => index);
  const shared = indexes.filter(index => !groups[index].exclusive).sort(byWeight);
  const exclusive = indexes.filter(index => groups[index].exclusive).sort(byWeight);
  const execute = async index => {
    outcomes[index] = await runGroup(groups[index], { browser, origin, distRoot, engine });
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
