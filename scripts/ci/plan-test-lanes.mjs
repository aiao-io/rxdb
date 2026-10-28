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
 *   这里从 `nx show projects` 的实际输出分桶，并断言每个项目的 `test` 恰好落在一条 lane；
 *   有内存用例的项目（`--memory-projects`）另在内存 lane 跑它的 `test-memory`，所以会出现两次。
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
 * main 的两轮冷测按当前权重装箱，四条 lane 约 761s，离最重的 PGlite（709s）仅差 52s。
 * 再加 lane 收益有限，却多占一个并发位；多条 PR 同跑时排队已经是主要瓶颈。
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
 * test 目标不采集覆盖率的项目：`website` 与 `e2e-parity`（三端对拍的共享归一化）跑的是
 * `node --test` 脚本测，不经 vitest，`--coverage` 对它们不起作用，也不在覆盖率门禁的范围里
 * （门禁只看 packages/）。
 *
 * 它和别的包同 lane 时无所谓；但只改 website 的 PR 会让它单独成 lane，此时 lane
 * 一个覆盖率文件都没有，上传步骤的 `if-no-files-found: error` 必红（PR #89）。
 * 所以按 lane 标 `coverage`：整条 lane 都在这张表里才标 false，上传步骤据此跳过；
 * 混进任何一个 vitest 项目就标 true，照旧严格要求产物 —— 不把 error 放宽成 warn。
 */
export const NO_COVERAGE_PROJECTS = ['website', 'e2e-parity'];

/**
 * 各项目 test 任务的实测耗时（秒），只用于 lane 装箱。
 *
 * 来源：main 成功运行 40493402982、40453820388（2026-10-27），取可用冷测均值向上取整。
 * 只量 Test step 内相邻串行任务的起始时间差；最后一个量到 Nx 完成行。
 * 排除缓存回放与 build/typecheck，项目内 test-node/test-env 的实测时间合并进 test 权重。
 * dev-rxdb-angular 已从 188s 增至 350s，alipay-probe 从 185s 降至 21s；旧权重会让四条
 * lane 的实测负载落在 534–887s，更新后约 760–761s。不要拿缓存命中或本地机器耗时回填。
 */
export const WEIGHTS = {
  'rxdb-adapter-pglite': 709,
  'rxdb-adapter-electron': 393,
  'dev-rxdb-angular': 350,
  'rxdb-adapter-sqliteai': 125,
  'rxdb-model-angular': 111,
  'rxdb-adapter-sqlite': 107,
  'rxdb-plugin-replay': 105,
  'rxdb-client-generator': 98,
  'rxdb-adapter-wa-sqlite': 86,
  'rxdb-devtools-panel': 83,
  'dev-rxdb-http-server': 75,
  'rxdb-adapter-sqlite-wasm': 71,
  'dev-rxdb-tauri': 59,
  rxdb: 55,
  'angular-todo': 54,
  'rxdb-adapter-sqlite-core': 47,
  'rxdb-adapter-supabase': 37,
  'dev-rxdb-supabase': 35,
  'rxdb-devtools-extension': 34,
  'rxdb-plugin-search': 27,
  'rxdb-plugin-graph': 24,
  'rxdb-plugin-working-tree': 24,
  utils: 24,
  'dev-rxdb-vue': 22,
  'dev-rxdb-miniprogram-alipay-probe': 21,
  'dev-rxdb-react': 21,
  'dev-rxdb-electron': 18,
  'rxdb-model-react': 18,
  'rxdb-devtools': 16,
  'rxdb-plugin-sync': 16,
  'rxdb-model': 15,
  'rxdb-plugin-history': 15,
  'rxdb-angular': 13,
  'rxdb-model-vue': 12,
  'rxdb-plugin-replay-angular': 12,
  'rxdb-plugin-working-tree-angular': 12,
  'rxdb-plugin-search-angular': 11,
  'dev-rxdb-http': 10,
  'rxdb-plugin-tree-angular': 10,
  'rxdb-adapter-miniprogram': 9,
  'rxdb-plugin-querycache': 8,
  'rxdb-react': 8,
  angular: 7,
  'rxdb-plugin-workspace': 7,
  'rxdb-test': 7,
  benchmarks: 6,
  'code-editor-angular': 6,
  'dev-rxdb-miniprogram-douyin-spike': 6,
  'rxdb-plugin-storage': 6,
  'rxdb-adapter-encrypted': 5,
  'rxdb-adapter-http': 5,
  'rxdb-vue': 5,
  'code-editor-vue': 4,
  'rxdb-plugin-search-react': 4,
  'rxdb-plugin-search-vue': 4,
  'rxdb-plugin-tree': 4,
  'code-editor-react': 3,
  'dev-rxdb-admin': 3,
  'recipes-domain': 3,
  'rxdb-adapter-tauri': 3,
  'rxdb-plugin-tree-react': 3,
  'rxdb-plugin-tree-vue': 3,
  'rxdb-plugin-working-tree-react': 3,
  'rxdb-plugin-working-tree-vue': 3,
  'rxdb-taro': 3,
  'code-editor': 2,
  'dev-rxdb-miniprogram': 2,
  'rxdb-plugin-replay-react': 2,
  'rxdb-plugin-replay-vue': 2,
  wujie: 2,
  'e2e-parity': 1,
  website: 1
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
    const byWeight = [...memory].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b));
    include.push({
      lane: 'memory',
      label: `${laneLabel(byWeight)} (${MEMORY_TARGET})`,
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
