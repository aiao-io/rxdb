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
 *   node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4] [--memory-projects=x]
 *   → {"include":[{"lane":"supabase","label":"supabase","projects":"...","target":"test","supabase":true,"coverage":true},...]}
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
 *   1. 并发位：免费额度上限 20，实测峰值并发是 16，内存 lane 再占 1 个。
 *   2. 墙钟的下界是单个最重的任务：`rxdb-adapter-pglite`（667s，见 WEIGHTS）。按 PR #101
 *      的实测权重装箱，4 条 lane 的负载约 720s 一条，离这个下界只差 1 分钟；开到 5 条省下的
 *      也就这 1 分钟，换来的是峰值并发顶到 18 以上、PR 一多就排队。
 */
export const LANE_COUNT = 4;

/**
 * 需要本地 Supabase Docker 栈的项目。
 * 钉死在同一条 lane：起一次 Supabase 约 60s，散在多条 lane 上就要交多次这笔税。
 */
export const SUPABASE_PROJECTS = ['rxdb-adapter-supabase', 'dev-rxdb-supabase'];

/**
 * 内存用例的 target 名。有这个 target 的项目（`--memory-projects`）另开一条 lane 跑它。
 *
 * 按子进程常驻内存判「不随库线性增长」的用例要独占整台机器、串行执行（`fileParallelism: false`），
 * 与别的文件并行时操作系统换页会让测量值飘出几百 MiB。放在 `test` 里时它们排在最后，
 * 一个项目就把整条 lane 拖成长尾：PR #101 上 `rxdb-adapter-electron` 的两份内存用例串行 469s，
 * 那条 lane 的 Test step 跑了 29 分钟。拆成独立 target 后它与常规用例并行，且不带覆盖率——
 * v8 插桩本身就会抬高 RSS。
 */
export const MEMORY_TARGET = 'test-memory';

/**
 * test 目标不采集覆盖率的项目：`website` 跑的是 `node --test` 脚本测，不经 vitest，
 * `--coverage` 对它不起作用，也不在覆盖率门禁的范围里（门禁只看 packages/）。
 *
 * 它和别的包同 lane 时无所谓；但只改 website 的 PR 会让它单独成 lane，此时 lane
 * 一个覆盖率文件都没有，上传步骤的 `if-no-files-found: error` 必红（PR #89）。
 * 所以按 lane 标 `coverage`：整条 lane 都在这张表里才标 false，上传步骤据此跳过；
 * 混进任何一个 vitest 项目就标 true，照旧严格要求产物 —— 不把 error 放宽成 warn。
 */
export const NO_COVERAGE_PROJECTS = ['website'];

/**
 * 各项目 test 任务的实测耗时（秒），用于装箱时估算 lane 负载。
 * 只影响**分桶是否均衡**，不影响正确性 —— 填错了 CI 还是全跑，只是慢。
 *
 * 数据来源：PR #101 的 run 37850537027（affected 冷跑，被测的 58 个项目全部 Cache Miss）。
 * 提取方式：每条 lane 都以 `--parallel=1` 串行执行，于是同一条 lane 的日志里
 * 相邻两条 vitest `Duration` 行的时间差就是后一个项目的净耗时；一个 nx 项目里有多个
 * vitest project 时（pglite、electron）按项目求和。
 * （不能用「项目首行到末行」的时间跨度 —— 那会把 Nx 的调度输出算进去。）
 * 那一轮没测到的 10 项（supabase 两项在独立 lane、website / utils / code-editor 等未受影响）保留上一版的值。
 *
 * 上一版取自 main 的 run 31874082535，此后几个项目的用例量翻了几倍，表没有跟着更新：
 *   rxdb-adapter-electron   21 → 840（含内存组 469，拆到 `test-memory` 后按 371 计）
 *   rxdb-adapter-pglite    238 → 667
 *   dev-rxdb-miniprogram-alipay-probe、rxdb-model-angular 缺项（走 DEFAULT_WEIGHT=60，实测 185 / 99）
 * LPT 拿着 21s 的 electron 把它和 alipay-probe、dev-rxdb-angular、rxdb-model-angular 装进了同一条 lane，
 * 那条 lane 的 Test step 跑了 29 分钟，其余 lane 在 3～17 分钟内结束。
 * 教训不变：命中缓存的那轮数据不能用来填这张表；本地 M 系列的数据也不能（同配置约快 3 倍）。
 * 每当某条 lane 的 Test step 明显长于其它 lane，先拿那一轮的日志按上面的口径重算这张表。
 */
export const WEIGHTS = {
  'rxdb-adapter-pglite': 667,
  'rxdb-adapter-electron': 371,
  'dev-rxdb-angular': 188,
  'dev-rxdb-miniprogram-alipay-probe': 185,
  'rxdb-client-generator': 117,
  'rxdb-adapter-sqliteai': 116,
  'rxdb-model-angular': 99,
  'rxdb-plugin-replay': 94,
  'rxdb-adapter-sqlite': 93,
  rxdb: 88,
  'dev-rxdb-http-server': 84,
  'rxdb-devtools-panel': 77,
  'dev-rxdb-tauri': 62,
  'rxdb-adapter-sqlite-wasm': 61,
  'rxdb-adapter-wa-sqlite': 61,
  'angular-todo': 52,
  'rxdb-adapter-sqlite-core': 49,
  'dev-rxdb-supabase': 43,
  'rxdb-devtools-extension': 38,
  'rxdb-adapter-supabase': 36,
  utils: 26,
  'rxdb-plugin-search': 24,
  'rxdb-plugin-graph': 23,
  'rxdb-plugin-working-tree': 21,
  'rxdb-plugin-sync': 19,
  'dev-rxdb-electron': 18,
  'rxdb-model-react': 16,
  'rxdb-plugin-history': 16,
  'dev-rxdb-react': 15,
  'dev-rxdb-vue': 15,
  'rxdb-devtools': 15,
  'rxdb-model': 13,
  'rxdb-model-vue': 13,
  'rxdb-angular': 12,
  'rxdb-plugin-replay-angular': 11,
  'rxdb-plugin-working-tree-angular': 11,
  'dev-rxdb-http': 10,
  'rxdb-plugin-search-angular': 10,
  'rxdb-plugin-tree-angular': 10,
  'rxdb-adapter-miniprogram': 9,
  'rxdb-plugin-querycache': 9,
  'rxdb-react': 8,
  angular: 7,
  'rxdb-plugin-storage': 7,
  'code-editor-angular': 6,
  'dev-rxdb-miniprogram-douyin-spike': 6,
  'rxdb-plugin-workspace': 6,
  'rxdb-test': 6,
  'rxdb-vue': 6,
  'rxdb-adapter-encrypted': 5,
  benchmarks: 4,
  'code-editor-vue': 4,
  'rxdb-adapter-http': 4,
  website: 4,
  'rxdb-plugin-search-react': 3,
  'rxdb-plugin-search-vue': 3,
  'rxdb-plugin-tree-react': 3,
  'rxdb-plugin-working-tree-react': 3,
  'code-editor': 2,
  'code-editor-react': 2,
  'recipes-domain': 2,
  'rxdb-adapter-tauri': 2,
  'rxdb-plugin-replay-react': 2,
  'rxdb-plugin-replay-vue': 2,
  'rxdb-plugin-tree': 2,
  'rxdb-plugin-tree-vue': 2,
  'rxdb-plugin-working-tree-vue': 2,
  'rxdb-taro': 2
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
 * @param {string[]} [options.noCoverageProjects] test 目标不采集覆盖率的项目
 * @param {string[]} [options.memoryProjects] 有 {@link MEMORY_TARGET} target 的项目，另开一条 lane 跑它
 * @param {(names: string[]) => void} [options.warn] 权重缺失时的告警出口（测试里可替换）
 * @returns {{ include: { lane: string, label: string, projects: string, target: string, supabase: boolean, coverage: boolean }[] }}
 */
export function planTestLanes({
  projects,
  laneCount = LANE_COUNT,
  weights = WEIGHTS,
  supabaseProjects = SUPABASE_PROJECTS,
  noCoverageProjects = NO_COVERAGE_PROJECTS,
  memoryProjects = [],
  warn = warnUnweighted
}) {
  const unique = [...new Set(projects)].filter(Boolean);
  const unweighted = unique.filter(name => weights[name] === undefined).sort();
  if (unweighted.length > 0) warn(unweighted);

  const weightOf = name => weights[name] ?? DEFAULT_WEIGHT;
  const needsSupabase = unique.filter(name => supabaseProjects.includes(name)).sort();
  const rest = unique.filter(name => !supabaseProjects.includes(name));
  const collectsCoverage = names => names.some(name => !noCoverageProjects.includes(name));

  const include = packLanes(rest, laneCount, weightOf).map((lane, index) => ({
    lane: `t${index + 1}`,
    label: laneLabel(lane.names),
    projects: [...lane.names].sort().join(','),
    target: 'test',
    supabase: false,
    coverage: collectsCoverage(lane.names)
  }));

  // Supabase lane 不套 laneLabel：它的看点不是最重的包，而是「这条要起 Docker」。
  if (needsSupabase.length > 0) {
    include.unshift({
      lane: 'supabase',
      label: 'supabase',
      projects: needsSupabase.join(','),
      target: 'test',
      supabase: true,
      coverage: collectsCoverage(needsSupabase)
    });
  }

  // 内存 lane 只收本次 test 集里的项目：affected 没算到的项目，它的内存用例也不该跑。
  const memory = [...new Set(memoryProjects)].filter(name => unique.includes(name)).sort();
  if (memory.length > 0) {
    include.push({
      lane: 'memory',
      label: `${laneLabel(memory)} (${MEMORY_TARGET})`,
      projects: memory.join(','),
      target: MEMORY_TARGET,
      supabase: false,
      coverage: false
    });
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
    console.error('用法: node scripts/ci/plan-test-lanes.mjs --projects=a,b,c [--lanes=4] [--memory-projects=x]');
    process.exit(1);
  }

  const plan = planTestLanes({
    projects: raw.split(',').map(name => name.trim()),
    laneCount: parseLaneCount(readFlag(argv, 'lanes')),
    memoryProjects: (readFlag(argv, 'memory-projects') ?? '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  });

  process.stdout.write(`${JSON.stringify(plan)}\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
