/**
 * scripts/ci/plan-test-lanes.mjs
 *
 * 把「本次要跑 test 的项目」分到若干条 CI lane（一条 lane = 一个并行 GitHub job），
 * 输出可直接喂给 `strategy.matrix` 的 JSON。
 *
 * 为什么需要它：
 *   公开仓库的 Actions 分钟数不要钱，稀缺的是墙钟时间。把 37 个 test 任务塞进
 *   一个 job 串行跑（旧 CI 的做法）要 17 分钟，其中最后 8 分钟只有 pglite 一个
 *   任务在跑。横向铺开成 N 个 job 是唯一免费的加速手段。
 *
 * 为什么是脚本而不是在 workflow 里写死项目名：
 *   写死的清单会在新增包时静默漏测 —— 新包既不在任何 lane 里，CI 也不会报错。
 *   这里从 `nx show projects` 的实际输出分桶，并断言每个项目恰好落在一条 lane。
 *
 * 用法：
 *   node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4]
 *   → {"include":[{"lane":"supabase","projects":"...","supabase":true},...]}
 */

import { pathToFileURL } from 'node:url';

/** 非 Supabase 任务铺开的 lane 上限。4 = 在 20 个并发 job 的免费额度里给 e2e/lint/build 留足位置。 */
export const LANE_COUNT = 4;

/**
 * 需要本地 Supabase Docker 栈的项目。
 * 钉死在同一条 lane：起一次 Supabase 约 60s，散在多条 lane 上就要交多次这笔税。
 */
export const SUPABASE_PROJECTS = ['rxdb-adapter-supabase', 'dev-rxdb-supabase'];

/**
 * 各项目 test 任务的实测耗时（秒），用于装箱时估算 lane 负载。
 *
 * 数据来源：并行化改造后第一轮 CI（run 85622186464）5 条 lane 的 Nx 汇总表，
 * 全部 Cache Miss，即冷跑真值。只影响**分桶是否均衡**，不影响正确性。
 *
 * `rxdb-adapter-pglite` 是唯一的长尾：开 fileParallelism 后从 455s 降到 261s，
 * 但仍比第二名（76s）大 3.4 倍 —— 它一个人就是 test 阶段的下界，LPT 会给它单独一条
 * lane。想再压只能继续拆它自己的用例，调 lane 数没用。
 * （本地 M 系列上同样配置只要 72s，别拿本地数据填这张表。）
 *
 * 少数几个当轮命中远端缓存、拿不到真实耗时的项目（utils / code-editor*），
 * 保留改造前的旧估值，不填 0 —— 填 0 会让它们在冷跑时被当成免费的。
 */
export const WEIGHTS = {
  'rxdb-adapter-pglite': 261,
  'rxdb-client-generator': 76,
  'dev-rxdb-angular': 55,
  'dev-rxdb-tauri': 47,
  'dev-rxdb-supabase': 45,
  rxdb: 41,
  'rxdb-adapter-wa-sqlite': 38,
  'rxdb-adapter-sqlite-wasm': 37,
  'rxdb-devtools-extension': 34,
  'rxdb-adapter-supabase': 32,
  'rxdb-adapter-sqlite-core': 28,
  'rxdb-adapter-sqliteai': 25,
  'rxdb-plugin-graph': 21,
  'rxdb-adapter-sqlite': 20,
  'angular-todo': 16,
  'rxdb-angular': 10,
  'dev-rxdb-react': 8,
  angular: 7,
  'code-editor-angular': 7,
  'rxdb-plugin-search': 6,
  'rxdb-plugin-workspace': 6,
  'rxdb-react': 5,
  'dev-rxdb-vue': 5,
  'code-editor-vue': 4,
  'rxdb-adapter-miniprogram': 3,
  'rxdb-devtools': 3,
  'code-editor': 2,
  'code-editor-react': 2,
  'dev-rxdb-electron': 2,
  'rxdb-adapter-encrypted': 2,
  'rxdb-plugin-search-angular': 2,
  'rxdb-plugin-search-react': 2,
  'rxdb-test': 2,
  'rxdb-vue': 2,
  'rxdb-plugin-search-vue': 1,
  'rxdb-plugin-storage': 1,
  utils: 1
};

/** 权重表里没登记的新包按这个值估算。宁可高估，避免新包把一条 lane 拖成长尾。 */
const DEFAULT_WEIGHT = 60;

const warnUnweighted = names => {
  console.error(`⚠️  以下项目不在 scripts/ci/plan-test-lanes.mjs 的 WEIGHTS 里，按 ${DEFAULT_WEIGHT}s 估算：`);
  console.error(`   ${names.join(', ')}`);
  console.error('   分桶可能失衡。跑一轮 CI 后把实测耗时补进 WEIGHTS。');
};

/**
 * LPT（longest processing time）装箱：重的先放，每个都放进当前最轻的 lane。
 * 先按 (权重降序, 名字升序) 排序，保证输入顺序不影响结果 —— matrix 必须可复现。
 */
const packLanes = (projects, laneCount, weightOf) => {
  const lanes = Array.from({ length: laneCount }, () => ({ names: [], load: 0 }));
  const ordered = [...projects].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));

  for (const name of ordered) {
    const target = lanes.reduce((lightest, lane) => (lane.load < lightest.load ? lane : lightest));
    target.names.push(name);
    target.load += weightOf(name);
  }

  return lanes.filter(lane => lane.names.length > 0);
};

/**
 * 把项目分到 lane 上，产出 GitHub Actions matrix。
 *
 * @param {object} options
 * @param {string[]} options.projects 本次要跑 test 的项目名
 * @param {number} [options.laneCount] 非 Supabase lane 的上限
 * @param {Record<string, number>} [options.weights] 项目名 → 实测耗时（秒）
 * @param {string[]} [options.supabaseProjects] 需要 Supabase 栈、钉在独立 lane 的项目
 * @param {(names: string[]) => void} [options.warn] 权重缺失时的告警出口（测试里可替换）
 * @returns {{ include: { lane: string, projects: string, supabase: boolean }[] }}
 */
export function planTestLanes({
  projects,
  laneCount = LANE_COUNT,
  weights = WEIGHTS,
  supabaseProjects = SUPABASE_PROJECTS,
  warn = warnUnweighted
}) {
  const unique = [...new Set(projects)].filter(Boolean);
  const unweighted = unique.filter(name => weights[name] === undefined).sort();
  if (unweighted.length > 0) warn(unweighted);

  const weightOf = name => weights[name] ?? DEFAULT_WEIGHT;
  const needsSupabase = unique.filter(name => supabaseProjects.includes(name)).sort();
  const rest = unique.filter(name => !supabaseProjects.includes(name));

  const include = packLanes(rest, laneCount, weightOf).map((lane, index) => ({
    lane: `t${index + 1}`,
    projects: [...lane.names].sort().join(','),
    supabase: false
  }));

  if (needsSupabase.length > 0) {
    include.unshift({ lane: 'supabase', projects: needsSupabase.join(','), supabase: true });
  }

  return { include };
}

const readFlag = (argv, name) => {
  const hit = argv.find(arg => arg.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 3);
};

/**
 * 解析 `--lanes`。必须显式校验：`Number('abc')` 是 NaN，
 * `Array.from({ length: NaN })` 是空数组 —— 打错一个字就会静默产出空 matrix，
 * CI 上表现为「test job 一个都没起，但全绿」。
 * @param {string | undefined} raw
 * @returns {number}
 */
const parseLaneCount = raw => {
  if (raw === undefined) return LANE_COUNT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--lanes 必须是正整数，收到 ${JSON.stringify(raw)}`);
    process.exit(1);
  }
  return value;
};

const main = argv => {
  const raw = readFlag(argv, 'projects');
  if (raw === undefined) {
    console.error('用法: node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4]');
    process.exit(1);
  }

  const plan = planTestLanes({
    projects: raw.split(',').map(name => name.trim()),
    laneCount: parseLaneCount(readFlag(argv, 'lanes'))
  });

  process.stdout.write(`${JSON.stringify(plan)}\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
