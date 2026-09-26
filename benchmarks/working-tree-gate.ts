/**
 * @fileoverview 工作树 benchmark 的门禁判定：运行环境画像、reference 的读取与选择、相对门禁、冻结准入。
 *
 * @remarks
 * 与 `bench-stats.ts` 同一个理由单独成文件：`working-tree.bench.ts` 顶层就开跑，`import` 它等于
 * 跑一遍 benchmark；而这里的判定既要被 bench 与冻结脚本共用，又要能被单测直接调用。
 *
 * **为什么 reference 按「比值画像」分份。** 契约 §0 假设「机器快一倍时分子分母一起快一倍，
 * ratio 不动」。换一种 CPU 时这一点并不成立：CI run 36070569734 上同一提交在 AMD EPYC 7763 上
 * `status` = 2.515，在冻结基线的 M1 Max 上 = 2.101，在 Intel Xeon 8573C 上 = 1.960；而且读项
 * （status / diff）与写项（restore / commit）朝相反方向偏，不是一个整体系数能校正的。
 * `ubuntu-latest` 随机分配这几种 CPU，只有一份 reference 时，PR 能不能过要看这一次分到哪种。
 *
 * 于是每种画像各冻一份，门禁只和同画像的比；本机画像没有 reference 时判
 * `benchmark_environment_mismatch`，**不降级为通过**——那等于在 reference 没覆盖到的机器上
 * 关掉门禁，而 CI 恰恰大多数时候跑在这种机器上。
 *
 * **画像不是 `runnerProfileHash`。** 后者七个字段全参与、含主机名，GitHub 托管 runner 每个 job
 * 的主机名都不同，按它分组等于每个 job 一份 reference。画像只取决定 ratio 的三样：系统/架构、
 * CPU 型号、Node 主版本（V8 的大版本才会改变 JIT 的相对开销；CI 跟 `.nvmrc` 的 `26`
 * 浮动到 26.10，本机是 26.7，两者必须算同一画像）。
 *
 * @see docs/working-tree/contracts/benchmark-report.md §3
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { availableParallelism, cpus, hostname, totalmem, type } from 'node:os';
import { join } from 'node:path';

import type { BenchEnvironment, BenchMeasurement, BenchReference } from './working-tree-report.ts';
import { RELATIVE_GATE_TOLERANCES } from './working-tree-report.ts';

// ---------------------------------------------------------------------------
// 运行环境
// ---------------------------------------------------------------------------

/** 参与 `runnerProfileHash` 的七个字段。 */
export type RunnerProfileFields = Omit<BenchEnvironment, 'runnerProfileHash' | 'ratioProfile'>;

/**
 * 由环境七字段算出 profile hash。
 *
 * @param environment - 见 {@link RunnerProfileFields}
 * @returns 64 位十六进制摘要
 *
 * @remarks
 * 按固定顺序逐行喂而不是 `JSON.stringify` 整个对象：后者的键序由对象字面量的书写顺序决定，
 * 将来有人调整字段顺序就会让同一台机器算出新 hash，而绝对门禁会把它读成「换了 runner」。
 *
 * `ratioProfile` 不参与：它由其中三个字段导出，喂进来只会让已签入 reference 的 hash 全部失效。
 */
export const computeRunnerProfileHash = (environment: RunnerProfileFields): string =>
  createHash('sha256')
    .update(
      [
        `runtime=${environment.runtime}`,
        `os=${environment.os}`,
        `cpuModel=${environment.cpuModel}`,
        `logicalCores=${environment.logicalCores}`,
        `memoryBytes=${environment.memoryBytes}`,
        `runnerId=${environment.runnerId}`,
        `concurrency=${environment.concurrency}`
      ].join('\n')
    )
    .digest('hex');

/**
 * 由系统/架构、CPU 型号与 Node 主版本算出比值画像。
 *
 * @param environment - 只读其中三个字段
 * @returns 形如 `Linux linux x64 / AMD EPYC 7763 64-Core Processor / node 26`
 * @throws `Error` `runtime` 不是 `node X.Y.Z` 的形状
 *
 * @remarks
 * 型号里的空白折叠成单个空格：部分 Linux 内核给出的型号串带尾随空格或连续空格，同一种 CPU
 * 不该因此成为两个画像。
 */
export const computeRatioProfile = (environment: Pick<BenchEnvironment, 'runtime' | 'os' | 'cpuModel'>): string => {
  const major = /^node (\d+)\./.exec(environment.runtime)?.[1];
  if (major === undefined) throw new Error(`runtime 不是 "node X.Y.Z" 的形状：${environment.runtime}`);
  const cpuModel = environment.cpuModel.trim().replace(/\s+/g, ' ');
  return `${environment.os} / ${cpuModel} / node ${major}`;
};

/**
 * 采集当前运行环境。
 *
 * @returns 见 {@link BenchEnvironment}
 * @throws `Error` 取不到 CPU 型号
 *
 * @remarks
 * `runnerId` 优先取 CI 注入的 runner 名，退回到主机名——固定性能 runner 上前者稳定，
 * 开发机上后者稳定，两者都稳定正是 profile hash 能当准入判据的前提。
 *
 * `memoryBytes` 取物理内存而不是进程堆：换一台内存规格不同的机器，PGlite 的页缓存行为
 * 就不是同一件事，而绝对门禁的合法性依赖「这台机器与冻结时那台是同一种」。
 *
 * 取不到 CPU 型号时抛错，不记成 `unknown`：型号是画像的一部分，所有取不到型号的机器会共用
 * 一份名叫 `unknown` 的 reference，而它们彼此之间的 ratio 毫无可比性。
 */
export const collectEnvironment = (): BenchEnvironment => {
  const cpuList = cpus();
  const cpuModel = cpuList[0]?.model;
  if (cpuModel === undefined) throw new Error('os.cpus() 返回空：取不到 CPU 型号，就选不出同画像的 reference');
  const base: RunnerProfileFields = {
    runtime: `node ${process.versions.node}`,
    os: `${type()} ${process.platform} ${process.arch}`,
    cpuModel,
    logicalCores: cpuList.length,
    memoryBytes: totalmem(),
    runnerId: process.env.RUNNER_NAME ?? process.env.HOSTNAME ?? hostname(),
    concurrency: availableParallelism()
  };
  return { ...base, runnerProfileHash: computeRunnerProfileHash(base), ratioProfile: computeRatioProfile(base) };
};

// ---------------------------------------------------------------------------
// reference
// ---------------------------------------------------------------------------

/**
 * 由画像导出 reference 的文件名。
 *
 * @param profile - 见 {@link computeRatioProfile}
 * @returns 小写、非字母数字折成 `-` 的 slug，带 `.json`
 *
 * @remarks
 * 全小写：macOS 默认文件系统大小写不敏感，大小写不同的两个名字在那里是同一个文件。
 */
export const ratioProfileFileName = (profile: string): string =>
  `${profile
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}.json`;

/**
 * 读并校验一份 reference 文件。
 *
 * @throws `Error` 不是合法 JSON、缺 `ratioProfile`，或文件名与自报的画像对不上
 *
 * @remarks
 * 文件名必须等于 {@link ratioProfileFileName}(`ratioProfile`)：两者对不上时，按文件名选和按内容选
 * 会选出不同的基线，而这里不替人决定信哪一个。这条同时保证了一个目录里同一画像只可能有一份。
 */
const readReferenceFile = async (directory: string, name: string): Promise<BenchReference> => {
  const raw = await readFile(join(directory, name), 'utf8');
  let parsed: Partial<BenchReference>;
  try {
    parsed = JSON.parse(raw) as Partial<BenchReference>;
  } catch (error) {
    throw new Error(`reference ${name} 不是合法 JSON`, { cause: error });
  }
  if (typeof parsed.ratioProfile !== 'string') throw new Error(`reference ${name} 缺少 ratioProfile`);
  const expected = ratioProfileFileName(parsed.ratioProfile);
  if (expected !== name) {
    throw new Error(`reference ${name} 自报画像「${parsed.ratioProfile}」，文件名应为 ${expected}`);
  }
  return parsed as BenchReference;
};

/**
 * 读出目录下全部 reference。
 *
 * @param directory - 见 `REFERENCE_DIR`
 * @returns 目录不存在时返回空数组（一份都还没冻结）
 * @throws `Error` 任一文件不合法（见 {@link readReferenceFile}）——坏掉的 reference 必须让门禁变红，
 *   不能当成「没冻结」
 */
export const readReferences = async (directory: string): Promise<BenchReference[]> => {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const references: BenchReference[] = [];
  for (const name of names.filter(entry => entry.endsWith('.json')).sort()) {
    references.push(await readReferenceFile(directory, name));
  }
  return references;
};

/**
 * 选出与本机同画像的 reference。
 *
 * @param references - 见 {@link readReferences}
 * @param profile - 本机画像
 * @returns 没有同画像的时返回 `null`
 */
export const selectReference = (references: readonly BenchReference[], profile: string): BenchReference | null =>
  references.find(reference => reference.ratioProfile === profile) ?? null;

// ---------------------------------------------------------------------------
// 相对门禁（契约 §3.1）
// ---------------------------------------------------------------------------

/** 一个测点的相对门禁判定。 */
export interface RatioVerdict {
  readonly id: string;
  readonly ratio: number;
  /** reference median；reference 里没有这一项时为 `null`，该项判失败 */
  readonly referenceRatio: number | null;
  /** 本项容差倍数，见 `RELATIVE_GATE_TOLERANCES`；表里没有这一项时为 `null`，该项判失败 */
  readonly tolerance: number | null;
  /** `referenceRatio × tolerance`；两者任一为 `null` 时为 `null` */
  readonly budget: number | null;
  readonly passed: boolean;
}

/**
 * 相对门禁的三种结局。
 *
 * - `unfrozen`：一份 reference 都没有——首个绿色实现得先跑出数字才有东西可冻
 * - `mismatch`：有 reference，但没有与本机同画像的（`benchmark_environment_mismatch`，判失败）
 * - `evaluated`：拿同画像的那一份逐项比过
 */
export type RelativeGateDecision =
  | { readonly kind: 'unfrozen' }
  | { readonly kind: 'mismatch'; readonly profile: string; readonly known: readonly string[] }
  | {
      readonly kind: 'evaluated';
      readonly reference: BenchReference;
      readonly passed: boolean;
      readonly verdicts: readonly RatioVerdict[];
    };

/**
 * 判一个测点。
 *
 * @remarks
 * reference 里缺这个测点时判**失败**而不是跳过：新增测点（如 T109 的 `restore`）必须伴随一次
 * 重新冻结，静默跳过等于让新测点在没有基线的情况下长期不设防。容差表里缺这个测点时同理，
 * 不借用别项的倍数。
 */
const judgeRatio = (measurement: BenchMeasurement, reference: BenchReference): RatioVerdict => {
  const referenceRatio = reference.medianRatios[measurement.id] ?? null;
  const tolerance = RELATIVE_GATE_TOLERANCES[measurement.id] ?? null;
  const base = { id: measurement.id, ratio: measurement.ratio, referenceRatio, tolerance };
  if (referenceRatio === null || tolerance === null) return { ...base, budget: null, passed: false };
  const budget = referenceRatio * tolerance;
  return { ...base, budget, passed: measurement.ratio <= budget };
};

/**
 * 相对门禁：同画像下各项 ratio ≤ reference median × 该项容差（读项 130%，写项 110%）。
 *
 * @param references - 见 {@link readReferences}
 * @param profile - 本机画像
 * @param measurements - 本次测量
 * @returns 见 {@link RelativeGateDecision}
 */
export const decideRelativeGate = (
  references: readonly BenchReference[],
  profile: string,
  measurements: readonly BenchMeasurement[]
): RelativeGateDecision => {
  if (references.length === 0) return { kind: 'unfrozen' };
  const reference = selectReference(references, profile);
  if (reference === null) {
    return { kind: 'mismatch', profile, known: references.map(candidate => candidate.ratioProfile) };
  }
  const verdicts = measurements.map(measurement => judgeRatio(measurement, reference));
  return { kind: 'evaluated', reference, passed: verdicts.every(verdict => verdict.passed), verdicts };
};

// ---------------------------------------------------------------------------
// 冻结准入（契约 §3.1）
// ---------------------------------------------------------------------------

/** 冻结脚本的两个理由参数；没给时为 `null`。 */
export interface FreezeFlags {
  /** `--regenerate "理由"`：覆盖本画像已有的那一份 */
  readonly regenerate: string | null;
  /** `--new-profile "理由"`：只为还没有 reference 的画像冻结 */
  readonly newProfile: string | null;
}

/** 冻结脚本该做什么：冻（带或不带理由）、跳过、或拒绝。 */
export type FreezeDecision =
  | { readonly kind: 'freeze'; readonly reason: string | null }
  | { readonly kind: 'skip' }
  | { readonly kind: 'refuse'; readonly message: string };

/** 本画像已有 reference 时的准入。 */
const decideForFrozenProfile = (profile: string, flags: FreezeFlags): FreezeDecision => {
  if (flags.newProfile !== null) return { kind: 'skip' };
  if (flags.regenerate !== null) return { kind: 'freeze', reason: flags.regenerate };
  return {
    kind: 'refuse',
    message:
      `画像「${profile}」已有 reference。契约 §3.1：失败后重算基线 = 门禁自证其绿，禁止。` +
      '若测点集合确实变了（例如 T109 加入 restore），或旧基线冻结时机器带着负载（所在提交须先在旧基线上过门禁），' +
      '用 --regenerate "理由" 显式重冻，理由里写明依据。'
  };
};

/** 本画像还没有 reference 时的准入。 */
const decideForNewProfile = (
  references: readonly BenchReference[],
  profile: string,
  flags: FreezeFlags
): FreezeDecision => {
  if (flags.regenerate !== null) {
    return {
      kind: 'refuse',
      message: `画像「${profile}」还没有 reference，--regenerate 没有可覆盖的；新画像用 --new-profile "理由"。`
    };
  }
  if (flags.newProfile !== null) return { kind: 'freeze', reason: flags.newProfile };
  if (references.length === 0) return { kind: 'freeze', reason: null };
  return {
    kind: 'refuse',
    message:
      `画像「${profile}」还没有 reference；已冻结的画像：${references.map(r => `「${r.ratioProfile}」`).join('、')}。` +
      '为新画像冻结需 --new-profile "理由"，理由里写明所在提交已在某个已冻结画像上通过相对门禁（契约 §3.1）。'
  };
};

/**
 * 冻结准入：把契约 §3.1 的「失败后重算基线 = 门禁自证其绿，禁止」写进工具本身。
 *
 * @param references - 见 {@link readReferences}
 * @param profile - 本机画像
 * @param flags - 见 {@link FreezeFlags}
 * @returns 见 {@link FreezeDecision}
 * @throws `Error` 两个参数同时给出
 *
 * @remarks
 * 首次冻结之外合法的只有三种：本画像测点集合变了（`--regenerate`）；本画像旧基线冻结时机器带着
 * 已知负载、所在提交已在旧基线上过相对门禁（`--regenerate`，理由写负载证据）；为一个还没有
 * reference 的画像冻结（`--new-profile`）。前两种是否属实只有人能判断，工具只要求理由非空并把它
 * 记进文件。`--new-profile` **不能覆盖**已有的一份：CI 的冻结 workflow 开几个并行槽位去碰不同的
 * CPU，分到已冻结画像的槽位必须原样跳过，否则那次运行就成了一次「顺手重算」。
 */
export const decideFreeze = (
  references: readonly BenchReference[],
  profile: string,
  flags: FreezeFlags
): FreezeDecision => {
  if (flags.regenerate !== null && flags.newProfile !== null) {
    throw new Error(
      '--regenerate 与 --new-profile 互斥：前者覆盖本画像已有的 reference，后者只为没有 reference 的画像冻结'
    );
  }
  if (selectReference(references, profile) !== null) return decideForFrozenProfile(profile, flags);
  return decideForNewProfile(references, profile, flags);
};
