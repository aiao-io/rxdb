import { parseArgs } from 'node:util';

import { ENGINES } from '../fixtures/engines.mjs';

export const USAGE = `用法：node src/smoke.mjs [选项]

  --list                列出全部检查组名（每行一个）后退出
  --group=<名>[,<名>]   只跑指定的检查组；可重复给出。省略时跑全部默认检查组
  --engine=<引擎>       chromium（默认）| firefox | webkit
  --parallel=<数>       同时跑几个检查组（每组各自的浏览器上下文），默认 3；独占的检查组（真游戏）总是单独跑
  --dist=<目录>         托管另一份 web 产物（默认 dist/aiao-desktop/apps/web/browser；也可用环境变量 AIAO_DESKTOP_DIST）
  --report=<文件>       保存环境、产物摘要、逐项结果与已知限制的 JSON 报告
  --headed              显示浏览器窗口
  --help                显示本说明`;

/**
 * 解析冒烟入口的命令行参数。未知参数、未知引擎与非法并行数直接报错，不静默忽略。
 *
 * @param {readonly string[]} argv
 */
export function parseArguments(argv) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      list: { type: 'boolean', default: false },
      group: { type: 'string', multiple: true },
      engine: { type: 'string', default: 'chromium' },
      parallel: { type: 'string', default: '3' },
      dist: { type: 'string' },
      report: { type: 'string' },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false }
    },
    strict: true
  });
  if (!Object.keys(ENGINES).includes(values.engine))
    throw new Error(`未知的浏览器引擎：${values.engine}（可选：${Object.keys(ENGINES).join('、')}）`);
  const parallel = Number(values.parallel);
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 8)
    throw new Error(`--parallel 必须是 1～8 的整数，收到：${values.parallel}`);
  const groups = values.group?.flatMap(value => value.split(',')).filter(Boolean);
  return {
    list: values.list,
    help: values.help,
    groups: groups?.length ? groups : null,
    engine: values.engine,
    parallel,
    dist: values.dist,
    headed: values.headed,
    report: values.report
  };
}

/**
 * 按名字选检查组：不指定时是全部默认检查组；指定了未知的名字直接报错并列出可选项。
 *
 * @template {{ name: string, default?: boolean }} G
 * @param {readonly G[]} all
 * @param {readonly string[] | null} names
 * @returns {G[]}
 */
export function selectGroups(all, names) {
  if (!names) return all.filter(group => group.default !== false);
  const known = new Set(all.map(group => group.name));
  const unknown = names.filter(name => !known.has(name));
  if (unknown.length) throw new Error(`未知的检查组：${unknown.join('、')}（可选：${[...known].join('、')}）`);
  return all.filter(group => names.includes(group.name));
}
