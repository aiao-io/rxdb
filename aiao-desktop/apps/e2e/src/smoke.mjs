/**
 * Aiao Desktop 的浏览器冒烟（ADESK-US-008）：对 web 的正式构建，按行为分成相互独立的检查组，
 * 每个检查组各用一个独立的浏览器上下文（独立的 OPFS、localStorage），外网请求全部拦截，任何页面错误都判失败。
 *
 *   node src/smoke.mjs                      跑全部默认检查组
 *   node src/smoke.mjs --list               列出全部检查组名
 *   node src/smoke.mjs --group=shell,game   只跑指定的检查组（--group=fixtures 跑夹具自检）
 *   node src/smoke.mjs --engine=webkit      换浏览器引擎（chromium 默认；其他引擎只提供入口）
 *   node src/smoke.mjs --parallel=1         串行跑（默认同时跑 3 个检查组，独占的真游戏组除外）
 *   node src/smoke.mjs --dist=<目录>        托管另一份产物
 *
 * 输出：stdout 一行 JSON（全部检查项，键集合见 baseline/smoke-keys-*.json），stderr 是每组的耗时与问题。
 */
import { globSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { outputRoot, startDesktopServer } from './desktop-server.mjs';
import { launchEngine } from './fixtures/engines.mjs';
import { GROUPS } from './groups/index.mjs';
import { USAGE, parseArguments, selectGroups } from './harness/cli.mjs';
import { judgeRun, loadLimitations } from './harness/limitations.mjs';
import { runGroups } from './harness/runner.mjs';

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
if (options.list) {
  for (const group of GROUPS) console.log(group.name);
  process.exit(0);
}
const selected = selectGroups(GROUPS, options.groups);

const root = options.dist ? resolve(options.dist) : outputRoot;
const productionScripts = globSync('**/*.js', { cwd: root });
const devtoolsBundled = productionScripts.filter(file =>
  /@aiao\/rxdb-devtools|__AIAO_RXDB_DEVTOOLS__/.test(readFileSync(join(root, file), 'utf8'))
);
if (devtoolsBundled.length > 0) throw new Error(`生产构建包含 RxDB DevTools：${devtoolsBundled.join(', ')}`);

const desktop = await startDesktopServer({ root });
const browser = await launchEngine(options.engine, { headless: !options.headed });
const startedAt = performance.now();
try {
  const { outcomes, checks } = await runGroups({
    groups: selected,
    browser,
    origin: desktop.origin,
    distRoot: root,
    engine: options.engine,
    parallel: options.parallel,
    onFinish: outcome =>
      console.error(`${outcome.problems.length ? '✗' : '✓'} ${outcome.group}  ${outcome.seconds.toFixed(1)}s`)
  });
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.error(`检查组 ${outcomes.length} 个，总耗时 ${seconds}s（引擎 ${options.engine}，并行 ${options.parallel}）`);
  console.log(JSON.stringify(checks));
  /* 非默认引擎上确实不能通过的项登记在 baseline/limitations-<引擎>.json：登记过的不算失败，过期的限制算失败。 */
  const limitations = loadLimitations(options.engine, './baseline');
  const { unexpected, stale, known } = judgeRun(outcomes, limitations);
  if (known.length > 0)
    console.error(
      `已知限制 ${known.length} 项（${options.engine}，见 baseline/limitations-${options.engine}.json）：\n${known
        .map(item => `  [${item.tier}] ${item.key ?? item.group}：${item.reason}`)
        .join('\n')}`
    );
  const failures = [...unexpected, ...stale];
  if (failures.length > 0) {
    console.error(`冒烟失败：\n${failures.map(problem => `  ${problem}`).join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  desktop.close();
}
