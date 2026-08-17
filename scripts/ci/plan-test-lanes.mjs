/**
 * scripts/ci/plan-test-lanes.mjs
 *
 * 把「本次要跑 test 的项目」分到若干条 CI lane（一条 lane = 一个并行 GitHub job），
 * 输出可直接喂给 `strategy.matrix` 的 JSON。
 *
 * 为什么需要它：
 *   公开仓库的 Actions 分钟数不要钱，稀缺的是墙钟时间。把全部 test 任务塞进
 *   一个 job 串行跑（旧 CI 的做法）要 17 分钟，其中最后 8 分钟只有 pglite 一个
 *   任务在跑。横向铺开成 N 个 job 是唯一免费的加速手段。
 *
 * 为什么是脚本而不是在 workflow 里写死项目名：
 *   写死的清单会在新增包时静默漏测 —— 新包既不在任何 lane 里，CI 也不会报错。
 *   这里从 `nx show projects` 的实际输出分桶，并断言每个项目恰好落在一条 lane。
 *
 * 用法：
 *   node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4]
 *   → {"include":[{"lane":"supabase","label":"supabase","projects":"...","supabase":true},...]}
 *
 * `lane` 与 `label` 是两个东西，别合并：
 *   lane  —— 机器用的稳定 id（`t1`…/`supabase`），进 artifact 名 `coverage-lane-<lane>`，
 *            必须是文件名安全字符。
 *   label —— 人看的 job 名（`test (<label>)`），允许空格和 `+`。
 */

import { pathToFileURL } from 'node:url';

/**
 * 非 Supabase 任务铺开的 lane 上限。
 *
 * 4 有两个独立的理由，任一成立就不该往上调：
 *   1. 并发位：免费额度上限 20，实测峰值并发已经是 16。
 *   2. 更根本的 —— 墙钟被 `rxdb-adapter-pglite` 一个任务卡死在 238s（见 WEIGHTS）。
 *      按实测权重装箱，4 条非 Supabase lane 的负载是 242 / 242 / 242 / 242，已经
 *      贴着这个下界。开到 5、6 条只会多出几条 200s 的空转 lane，一秒都省不下来。
 */
export const LANE_COUNT = 4;

/**
 * 需要本地 Supabase Docker 栈的项目。
 * 钉死在同一条 lane：起一次 Supabase 约 60s，散在多条 lane 上就要交多次这笔税。
 */
export const SUPABASE_PROJECTS = ['rxdb-adapter-supabase', 'dev-rxdb-supabase'];

/**
 * 各项目 test 任务的实测耗时（秒），用于装箱时估算 lane 负载。
 * 只影响**分桶是否均衡**，不影响正确性 —— 填错了 CI 还是全跑，只是慢。
 *
 * 数据来源：main 上的 run 31874082535（run-many 全量、全部 Cache Miss，即冷跑真值）。
 * 提取方式：每条 lane 都以 `--parallel=1` 串行执行，于是同一条 lane 的日志里
 * 相邻两条 vitest `Duration` 行的时间差就是后一个项目的净耗时。
 * （不能用「项目首行到末行」的时间跨度 —— 那会把 Nx 的调度输出算进去。）
 *
 * 上一版这张表是从更早一轮 CI 的 Nx 汇总表抄的，两处离谱偏差正是那轮
 * 四条 lane 跑出 469s / 331s / 322s / 313s（最重比最轻多 50%）的原因：
 *   dev-rxdb-angular  55 → 116   低估 2.1 倍
 *   utils              1 →  26   低估 26 倍（当轮命中了缓存，旧表填的是缓存后的耗时）
 * 教训：命中缓存的那轮数据不能用来填这张表，宁可缺项走 DEFAULT_WEIGHT。
 *
 * `website` / `benchmarks` 原先不在表里。run 31945480551（PR #10）把它们
 * 放进了 test 集，DEFAULT_WEIGHT=60 把两个轻量脚本测抬成种子，LPT 单独开出
 * `benchmarks +9`，剩下的中等包全堆到 `dev-rxdb-angular`。Test step 墙钟变成
 * 445 / 370 / 241 / 186（最重是最轻的 2.4 倍）。这两项的值不是那轮 Duration
 * （job 日志要登录），是按 target 形态估的：website 是三个 `node --test`
 * 脚本，benchmarks 是分析/工具 vitest。**不要**用那轮 Test step 总和去改
 * pglite / angular —— 那是 Nx + `^build` 的墙钟，和本表的 Duration 口径不是一回事。
 *
 * `rxdb-adapter-pglite`（238s）是唯一的长尾，比第二名（116s）大一倍。
 * 它一个人就是 test 阶段的墙钟下界：LPT 会给它一条几乎独占的 lane，其余三条
 * 各摊 ~242s。**因此把 LANE_COUNT 从 4 调大不会更快** —— 想压 test 阶段只能拆
 * pglite 自己的用例。（本地 M 系列上同样配置只要 72s，别拿本地数据填这张表。）
 *
 * `code-editor` 那轮没打出 Duration 行（它的 test 只有 type-only 的桩），
 * 保留旧估值 2 而不是填 0 —— 填 0 会让它在冷跑时被当成免费的。
 */
export const WEIGHTS = {
  'rxdb-adapter-pglite': 238,
  'dev-rxdb-angular': 116,
  'rxdb-client-generator': 90,
  'dev-rxdb-tauri': 49,
  'rxdb-devtools-extension': 46,
  rxdb: 45,
  'dev-rxdb-supabase': 43,
  'rxdb-adapter-wa-sqlite': 41,
  'rxdb-adapter-sqlite-wasm': 38,
  benchmarks: 18,
  'rxdb-adapter-supabase': 36,
  'angular-todo': 33,
  'rxdb-adapter-sqlite-core': 29,
  'rxdb-adapter-sqlite': 27,
  'rxdb-adapter-sqliteai': 27,
  utils: 26,
  'rxdb-plugin-graph': 22,
  // US-207 E2/E3 把 `rxdb-adapter-desktop` 拆成了下面两个包。21 原样留给 electron：
  // 整套 host / 加密 / 客户端用例都跟着 `node:sqlite` 留在了那边，形态没变。
  'rxdb-adapter-electron': 21,
  // tauri 侧只剩传输层与 JSON codec 两个 spec，**尚无 CI Duration**；这里填的是按
  // 形态估的下界，不是实测值。缺项会走 DEFAULT_WEIGHT=60，把一个两文件的包抬成
  // 表里第三重的种子，比估低更糟。首次跑完 CI 后请用真实 Duration 覆盖。
  'rxdb-adapter-tauri': 3,
  'rxdb-angular': 10,
  'dev-rxdb-vue': 9,
  website: 4,
  'dev-rxdb-react': 9,
  angular: 8,
  'code-editor-angular': 6,
  'rxdb-plugin-search': 6,
  'rxdb-plugin-workspace': 6,
  'rxdb-react': 5,
  'rxdb-test': 5,
  'code-editor-vue': 4,
  'rxdb-vue': 4,
  'rxdb-devtools': 4,
  'rxdb-adapter-encrypted': 4,
  'rxdb-adapter-miniprogram': 4,
  'code-editor': 2,
  'code-editor-react': 2,
  'rxdb-plugin-search-angular': 2,
  'rxdb-plugin-search-react': 2,
  'rxdb-plugin-search-vue': 2,
  'dev-rxdb-electron': 2,
  'rxdb-plugin-storage': 2
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
 * lane 的展示名：最重的那个项目 + 「还有几个」，例如 `rxdb-adapter-pglite +8`。
 *
 * 为什么不直接用 `t1`：序号在 PR 的 checks 列表里等于没说 —— 红了必须点进去
 * 才知道是哪个包。最重的项目既是这条 lane 的耗时主因，也是它最可能红的地方。
 * 序号仍留在 `lane` 字段里（artifact 名要用），两者的映射写进 job summary。
 *
 * @param {string[]} names 按权重降序排列的项目名（packLanes 的插入顺序）
 * @returns {string}
 */
const laneLabel = names => (names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0]);

/**
 * 把项目分到 lane 上，产出 GitHub Actions matrix。
 *
 * @param {object} options
 * @param {string[]} options.projects 本次要跑 test 的项目名
 * @param {number} [options.laneCount] 非 Supabase lane 的上限
 * @param {Record<string, number>} [options.weights] 项目名 → 实测耗时（秒）
 * @param {string[]} [options.supabaseProjects] 需要 Supabase 栈、钉在独立 lane 的项目
 * @param {(names: string[]) => void} [options.warn] 权重缺失时的告警出口（测试里可替换）
 * @returns {{ include: { lane: string, label: string, projects: string, supabase: boolean }[] }}
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
    label: laneLabel(lane.names),
    projects: [...lane.names].sort().join(','),
    supabase: false
  }));

  // Supabase lane 不套 laneLabel：它的看点不是最重的包，而是「这条要起 Docker」。
  if (needsSupabase.length > 0) {
    include.unshift({ lane: 'supabase', label: 'supabase', projects: needsSupabase.join(','), supabase: true });
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
