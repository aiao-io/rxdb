/**
 * @fileoverview T097 —— 冻结工作树 benchmark 的相对门禁基线（契约 §3.1 / §4）。
 *
 * @remarks
 * 跑 **10 次独立运行**，对每个测点取 median ratio，连同 `commit` 的绝对预算一起写进
 * `reports/working-tree-reference/<本机比值画像>.json`。此后每次 `bench-working-tree` 都拿与
 * 自己同画像的那一份做相对门禁——那是 PR CI 的**唯一**硬门禁。画像的定义与「为什么按画像分份」
 * 见 `working-tree-gate.ts`。
 *
 * **「独立运行」= 独立进程，不是同一进程里跑十遍。** 每次运行都要重新建库、重新灌 fixture、
 * 重新预热。同进程跑十遍的话，第二遍起面对的是一个已经被跑热的 V8 与一个长起来的 WASM 堆，
 * 十个样本里只有第一个是「冷启动后的第一次运行」——而 CI 上每次跑的都是那一个。
 *
 * **十次运行必须来自同一份 fixture 与同一台机器**，否则中位数取自十个不同的总体。两项都在
 * 收集时逐次核对（`contentHash` / `runnerProfileHash`），不一致就停，不取中位数。
 *
 * **失败之后不许回来重跑。** 契约 §3.1 的原话是「失败后重算基线 = 门禁自证其绿，禁止」。
 * 这个脚本因此只在四种时刻跑：首次冻结；本画像测点集合发生变化（如加入 `restore` 测点）后的
 * 重新冻结（`--regenerate`）；本画像旧基线冻结时机器带着已知负载，而所在提交已在旧基线上过
 * 相对门禁（`--regenerate`，理由写负载证据）；为一个还没有 reference 的画像冻结（`--new-profile`，
 * 所在提交须先在已冻结画像上过相对门禁）。候选版本没过门禁时，该动的是实现或者 epic-006
 * 「reference 的冻结与复冻」里 commit 的预算例外，不是这里。
 * 准入规则见 `decideFreeze`，理由会被记进文件。
 *
 * **`frozenAbsolute.commit` 取十次 p95 的中位数，不加余量。** 契约 §4 说的是「由首个绿色
 * 实现的 reference 中位数冻结」——中位数就是中位数。往上放宽等于在这里替 review 做决定，
 * 而 §4 把这个决定明确留给了 review（「review 不接受该中位数时，改本节的例外或改设计」）。
 *
 * 运行：
 *   node --experimental-strip-types benchmarks/freeze-working-tree-reference.ts [--runs N]
 *     [--regenerate "理由" | --new-profile "理由"]
 *
 * `--new-profile` 在本画像已有 reference 时以 0 退出、什么都不跑：CI 的冻结 workflow
 * （`.github/workflows/bench-freeze.yml`）开几个并行槽位去碰不同的 CPU，落到已冻结画像的槽位靠它跳过。
 *
 * @see requirements/epics/epic-006-working-tree-commits.md「reference 的冻结与复冻」（现行规则）
 * @see `git show f9528e8f:specs/001-working-tree-commits/contracts/benchmark-report.md` §3.1 / §4（文中的「契约 §N」）
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { median } from './bench-stats.ts';
import { collectEnvironment, decideFreeze, ratioProfileFileName, readReferences } from './working-tree-gate.ts';
import type { BenchReference, WorkingTreeBenchReport } from './working-tree-report.ts';
import { LATEST_PATH, REFERENCE_DIR, SAMPLES, WARMUP } from './working-tree-report.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 契约 §3.1 钉死的运行次数；`--runs` 只为本地试跑，冻结产物必须是 10。 */
const CONTRACT_RUNS = 10;

/** 被反复启动的那个脚本。 */
const BENCH_SCRIPT = resolve(__dirname, 'working-tree.bench.ts');

/** 一次运行收下来的东西：报告本体，加上用于一致性核对的三个身份。 */
interface CollectedRun {
  readonly report: WorkingTreeBenchReport;
  readonly contentHash: string;
  readonly runnerProfileHash: string;
  readonly ratioProfile: string;
}

/** 读回 {@link LATEST_PATH}；拆成独立函数只为让「读」这一步在类型上自证。 */
const readLatest = async (): Promise<CollectedRun> => {
  const report = JSON.parse(await readFile(LATEST_PATH, 'utf8')) as WorkingTreeBenchReport;
  if (report.measurements.length === 0) throw new Error(`${LATEST_PATH} 里一个测量都没有`);
  return {
    report,
    contentHash: report.fixture.contentHash,
    runnerProfileHash: report.environment.runnerProfileHash,
    ratioProfile: report.environment.ratioProfile
  };
};

/**
 * 跑一次 benchmark，并读回它写下的报告。
 *
 * @param index - 第几次，从 1 起，只用于日志
 * @returns 见 {@link CollectedRun}
 * @throws `Error` 子进程非零退出，或报告里一个测量都没有
 *
 * @remarks
 * 带 `--no-gate`：重新冻结时旧 reference 还在盘上，不关掉的话第一次运行就会拿旧基线去判
 * 新基线——正是 §3.1 禁止的那件事的镜像。
 *
 * `stdio: 'inherit'` 让子进程的进度点直接落到终端：一次冻结是十次三分钟的运行，中途没有
 * 任何输出的话，分不出「在跑」和「卡住了」。
 */
const runOnce = async (index: number): Promise<CollectedRun> => {
  console.log(`\n[freeze] === 第 ${index} 次运行 ===`);
  execFileSync(process.execPath, ['--experimental-strip-types', BENCH_SCRIPT, '--no-gate'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  return readLatest();
};

/**
 * 核对十次运行确实来自同一份 fixture、同一台机器、同一套采样口径，且就是开跑前准入的那个画像。
 *
 * @param runs - 收集到的全部运行
 * @param profile - 开跑前算出、据以准入与定文件名的画像
 * @throws `Error` 任何一项在运行之间不一致，或子进程报出的画像与 `profile` 不同
 *
 * @remarks
 * 不核对的话，中途换了机器或改了 fixture 只会让中位数悄悄变成一个没有总体的数——而它接下来
 * 会以「基线」的身份约束每一个 PR。
 *
 * 采样口径（`WARMUP` / `SAMPLES`）也核对：契约 §1 把它们钉成 5 / 50，一份用 10 / 500 跑出来的
 * reference 与 CI 上跑出的 ratio 不可比。
 *
 * 画像单独核对：准入与文件名都按父进程算出的画像定，子进程若报出别的画像（例如被换了 Node），
 * 写下去的就是一份文件名与内容对不上的 reference。
 */
const assertHomogeneous = (runs: readonly CollectedRun[], profile: string): void => {
  const [first] = runs;
  for (const [index, run] of runs.entries()) {
    if (run.ratioProfile !== profile) {
      throw new Error(`第 ${index + 1} 次运行报出画像「${run.ratioProfile}」，开跑前准入的是「${profile}」`);
    }
    if (run.contentHash !== first.contentHash) {
      throw new Error(`第 ${index + 1} 次运行的 fixture contentHash 与第 1 次不同：十次必须是同一份 fixture`);
    }
    if (run.runnerProfileHash !== first.runnerProfileHash) {
      throw new Error(`第 ${index + 1} 次运行的 runnerProfileHash 与第 1 次不同：十次必须在同一台机器上`);
    }
    const { warmup, samples } = run.report.sampling;
    if (warmup !== WARMUP || samples !== SAMPLES) {
      throw new Error(`第 ${index + 1} 次运行的采样口径是 ${warmup}/${samples}，契约 §1 要求 ${WARMUP}/${SAMPLES}`);
    }
  }
  const ids = new Set(first.report.measurements.map(measurement => measurement.id));
  for (const [index, run] of runs.entries()) {
    const current = run.report.measurements.map(measurement => measurement.id);
    if (current.length !== ids.size || current.some(id => !ids.has(id))) {
      throw new Error(`第 ${index + 1} 次运行的测点集合与第 1 次不同：${current.join(',')}`);
    }
  }
};

/** 取当前 HEAD 的 sha；reference 要记下自己是在哪棵树上冻的。 */
const currentCommit = (): string =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();

/**
 * 从十次运行算出 reference。
 *
 * @param runs - 见 {@link assertHomogeneous}，调用前已核对同质
 * @returns 见 `BenchReference`
 *
 * @remarks
 * 测点 id 取自第一次运行而不是写死三个：T109 会加入 `restore`，而那时要改的应该只有 bench
 * 本身。`assertHomogeneous` 已经保证十次的 id 集合相同。
 */
const buildReference = (runs: readonly CollectedRun[]): Omit<BenchReference, 'regeneratedBecause'> => {
  const ids = runs[0].report.measurements.map(measurement => measurement.id);
  const ratioOf = (id: string, run: CollectedRun): number => {
    const found = run.report.measurements.find(measurement => measurement.id === id);
    if (found === undefined) throw new Error(`测点 ${id} 在某次运行里缺失`);
    return found.ratio;
  };
  const p95Of = (id: string, run: CollectedRun): number => {
    const found = run.report.measurements.find(measurement => measurement.id === id);
    if (found === undefined) throw new Error(`测点 ${id} 在某次运行里缺失`);
    return found.p95;
  };

  const medianRatios: Record<string, number> = {};
  for (const id of ids) medianRatios[id] = median(runs.map(run => ratioOf(id, run)));

  return {
    commit: currentCommit(),
    runs: runs.length,
    medianRatios,
    frozenAbsolute: { commit: median(runs.map(run => p95Of('commit', run))) },
    runnerProfileHash: runs[0].runnerProfileHash,
    ratioProfile: runs[0].ratioProfile
  };
};

/** 解析 `--runs N`；缺省即契约规定的 10。 */
const parseRuns = (): number => {
  const flag = process.argv.indexOf('--runs');
  if (flag < 0) return CONTRACT_RUNS;
  const value = Number(process.argv[flag + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--runs 需要一个正整数，收到 ${process.argv[flag + 1]}`);
  return value;
};

/**
 * 解析 `--regenerate "理由"` / `--new-profile "理由"`；两种冻结都必须给出理由，它会被记进 reference 文件。
 *
 * @param flag - 参数名
 * @param example - 报错时给出的示例理由
 */
const parseReason = (flag: string, example: string): string | null => {
  const position = process.argv.indexOf(flag);
  if (position < 0) return null;
  const reason = process.argv[position + 1];
  if (reason === undefined || reason.startsWith('--') || reason.trim() === '') {
    throw new Error(`${flag} 必须带一句理由，例如 ${flag} "${example}"`);
  }
  return reason.trim();
};

const runs = parseRuns();
const flags = {
  regenerate: parseReason('--regenerate', 'T109 新增 restore 测点'),
  newProfile: parseReason('--new-profile', '<提交> 已在 M1 画像上过相对门禁，为 CI 的 EPYC 画像冻结')
};

const { ratioProfile: profile } = collectEnvironment();
const target = join(REFERENCE_DIR, ratioProfileFileName(profile));
const decision = decideFreeze(await readReferences(REFERENCE_DIR), profile, flags);
console.log(`[freeze] 本机画像：${profile}`);
if (decision.kind === 'skip') {
  console.log(`[freeze] 本画像已有 reference（${target}），--new-profile 不覆盖，跳过。`);
  process.exit(0);
}
if (decision.kind === 'refuse') {
  console.error(`[freeze] ${decision.message}`);
  process.exit(1);
}
if (runs !== CONTRACT_RUNS) {
  console.warn(`[freeze] ⚠ --runs ${runs} 不是契约规定的 ${CONTRACT_RUNS}；这样产出的文件不得签入。`);
}

console.log(`[freeze] 将跑 ${runs} 次独立运行；单次约数分钟，全程请勿在本机跑其他重负载。`);
const collected: CollectedRun[] = [];
for (let index = 1; index <= runs; index++) collected.push(await runOnce(index));

assertHomogeneous(collected, profile);
const reference = buildReference(collected);

console.log('\n[freeze] === 冻结结果 ===');
console.log(`  reference commit : ${reference.commit}`);
console.log(`  runs             : ${reference.runs}`);
console.log(`  runnerProfileHash: ${reference.runnerProfileHash}`);
console.log(`  ratioProfile     : ${reference.ratioProfile}`);
for (const [id, ratio] of Object.entries(reference.medianRatios)) {
  const series = collected.map(run => run.report.measurements.find(m => m.id === id)?.ratio ?? Number.NaN);
  console.log(
    `  [${id}] median ratio=${ratio.toFixed(3)}  (${series.length} 次: ${series.map(value => value.toFixed(2)).join(', ')})`
  );
}
console.log(
  `  frozenAbsolute.commit = ${reference.frozenAbsolute.commit.toFixed(2)}ms（契约 §4：中位数即预算，未加余量）`
);

if (runs !== CONTRACT_RUNS) {
  console.error(`\n[freeze] ✗ --runs ${runs} ≠ ${CONTRACT_RUNS}，不落盘。`);
  process.exit(1);
}

const payload: BenchReference = {
  ...reference,
  ...(decision.reason === null ? {} : { regeneratedBecause: decision.reason })
};
await mkdir(REFERENCE_DIR, { recursive: true });
await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`\n[freeze] ✓ 已写入 ${target}`);
console.log(
  '[freeze] 本文件必须先于发布候选签入（契约 §3.1）；review 不接受该中位数时改 epic-006「reference 的冻结与复冻」' +
    '里 commit 的预算例外或改设计，不得重跑本脚本。'
);
