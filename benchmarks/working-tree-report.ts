/**
 * @fileoverview 工作树 benchmark 的报告契约：常量、JSON 类型与两份产物的路径。
 *
 * @remarks
 * 单独成文件，因为有**两个**脚本读它：跑数字的 `working-tree.bench.ts` 与冻结基线的
 * `freeze-working-tree-reference.ts`。而前者是个顶层就开跑的脚本，`import` 它等于跑一遍
 * benchmark——共享的定义因此不能住在那里。
 *
 * 契约本体在 specs/001-working-tree-commits/contracts/benchmark-report.md §2 / §3。
 * 本文件是它的 TypeScript 投影，字段集必须逐条对齐；改这里之前先改那里。
 *
 * @see specs/001-working-tree-commits/contracts/benchmark-report.md
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 报告 JSON 的版本（契约 §2）；改字段集必须同时推进它。 */
export const SCHEMA_VERSION = 1;

/** 预热轮数（契约 §1），不计入统计。 */
export const WARMUP = 5;

/** 计入统计的采样数（契约 §1）。 */
export const SAMPLES = 50;

/** 相对门禁的容差：ratio 不得超过 reference median 的 110%（契约 §3.1）。 */
export const RELATIVE_GATE_TOLERANCE = 1.1;

/** 绝对门禁里 `status` / `diff` 的 p95 上限，毫秒（契约 §3.2，SC-001 / SC-002）。 */
export const ABSOLUTE_BUDGET_MS = 100;

/**
 * 绝对门禁里 `restore` 的 p95 上限，毫秒（契约 §3.2，SC-004）。
 *
 * @remarks
 * 单列一个常数而不是复用 {@link ABSOLUTE_BUDGET_MS}：契约给 `restore` 的是 1 s，比
 * `status` / `diff` 宽十倍，因为它要在一个事务里把 100 个单元的逆向 patch 写成工作树条目。
 * 两者共用一个名字的话，将来任何一方调整都会悄悄把另一方一起调走。
 *
 * 与 `commit` 那条（冻结中位数）也不同：`commit` 是已批准的宪法例外（契约 §4），
 * 上限由 reference 冻结；`restore` 的 1 s 是契约直接写死的硬数字，不吃 reference。
 */
export const RESTORE_ABSOLUTE_BUDGET_MS = 1_000;

/** reference 文件路径；T097 冻结它，本文件只读。 */
export const REFERENCE_PATH = resolve(__dirname, 'reports', 'working-tree-reference.json');

/**
 * 每次运行都覆盖的最新报告；T097 的冻结脚本按这个稳定路径收集十次运行。
 *
 * @remarks
 * 只有这一个固定名，不另存带时间戳的副本。`reports/` 不在 `.gitignore` 里，而冻结要跑
 * **十次**——留副本就是往版本库里扔十个只有一次会被读到的文件。需要保留某一次运行时，
 * 把这个文件复制走即可。
 */
export const LATEST_PATH = resolve(__dirname, 'reports', 'working-tree-latest.json');

/** `runnerProfileHash` 对不上时的稳定错误码（契约 §3.2）。 */
export const ENVIRONMENT_MISMATCH_CODE = 'benchmark_environment_mismatch';

// ---------------------------------------------------------------------------
// 报告契约（contracts/benchmark-report.md §2）
// ---------------------------------------------------------------------------

/** 报告里的 fixture 段；逐字段取自 {@link WorkingTreeFixturePlan}。 */
export interface BenchFixture {
  readonly entities: number;
  readonly commits: number;
  readonly unitsPerCommit: number;
  readonly uncommittedUnits: number;
  /** 内容 hash，不是行数 hash */
  readonly contentHash: string;
}

/** 运行环境；最后一个字段由前七个算出。 */
export interface BenchEnvironment {
  readonly runtime: string;
  readonly os: string;
  readonly cpuModel: string;
  readonly logicalCores: number;
  readonly memoryBytes: number;
  readonly runnerId: string;
  readonly concurrency: number;
  /** 绝对门禁的准入判据；见 {@link computeRunnerProfileHash} */
  readonly runnerProfileHash: string;
}

/** 采样口径。 */
export interface BenchSampling {
  readonly warmup: number;
  readonly samples: number;
}

/** 一项测量：被测统计量 + 同轮 control 的 p95 + 两者之比。 */
export interface BenchMeasurement {
  /** 测点 id，同时是 reference `medianRatios` 的键 */
  readonly id: string;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  /** 同轮 control 的形状标识 */
  readonly controlId: string;
  readonly controlP95: number;
  /** `p95 ÷ controlP95` */
  readonly ratio: number;
}

/** 冻结的 reference（T097 产出）。 */
export interface BenchReference {
  /** 归档 reference 的那个 commit sha */
  readonly commit: string;
  /** 独立运行次数，契约 §3.1 规定为 10 */
  readonly runs: number;
  /** 各测点的 median ratio */
  readonly medianRatios: Readonly<Record<string, number>>;
  /** `commit` 的绝对预算，毫秒；由首个绿色实现的中位数冻结（契约 §4） */
  readonly frozenAbsolute: { readonly commit: number };
  /** 冻结时的 runner profile；绝对门禁只在相等时评估 */
  readonly runnerProfileHash: string;
}

/** 一次运行的完整报告。 */
export interface WorkingTreeBenchReport {
  readonly schemaVersion: number;
  readonly fixture: BenchFixture;
  readonly environment: BenchEnvironment;
  readonly sampling: BenchSampling;
  readonly measurements: readonly BenchMeasurement[];
  /** 本次比对的 reference；还没冻结时为 `null` */
  readonly reference: BenchReference | null;
}
