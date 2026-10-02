/**
 * @fileoverview 页面包与核心包之间的契约。
 *
 * 核心包（`spike-core.js`）引 adapter 主入口，进而拉进 sqlite-core；页面包只引 `/runtime`。
 * 拆开是为了核心包加载失败时，页面包里的其余实验照样能跑完并出报告。
 * 这里只放类型与常量，两边都能安全引用。
 */
import type { MiniProgramHost } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { DescribedError } from './describe-error.js';
import type { DouyinFileSystemManager, DouyinWasmRuntime } from './douyin-api.js';
import type { Probe } from './probe.js';
import type { RealmProbeRecord } from './realm-probe.js';

/** 配额实验的写入计划：每行一个 `zeroblob(blobBytes)`，最多 `maxRows` 行。 */
export interface QuotaPlan {
  readonly blobBytes: number;
  readonly maxRows: number;
}

/** 真机默认计划：512 KiB × 40 = 20 MiB，按文档 10M 上限一定撞到。 */
export const DEFAULT_QUOTA_PLAN: QuotaPlan = { blobBytes: 512 * 1024, maxRows: 40 };

/** 核心实验的输入。 */
export interface CoreExperimentInput {
  readonly host: MiniProgramHost;
  readonly fileSystem: DouyinFileSystemManager;
  /** 不传 `wasmPath`：adapter 自己按 `host.defaultWasmPath` 取，核心包只记录实际加载的路径。 */
  readonly wasmRuntime: DouyinWasmRuntime;
  /** 数据库目录，位于实验根目录之下，收尾时整个删掉。 */
  readonly databaseRoot: string;
  readonly quotaPlan: QuotaPlan;
}

/** 可序列化的一格 SQL 值。 */
export type JsonCell = string | number | null;

/** 预检能力的一行，与 adapter 的 `MiniProgramRuntimeCapability` 同形。 */
export interface CapabilityRow {
  readonly name: string;
  readonly available: boolean;
  readonly source?: string;
}

/** 某一步失败时停在哪、错误是什么。 */
export interface StageFailure {
  readonly stage: string;
  readonly error: DescribedError;
}

/** 数据库目录下的一个文件。 */
export interface DatabaseFile {
  readonly path: string;
  readonly size: number;
}

/** 实验 ①：写入、关闭、重开、读回。 */
export interface PersistenceReport {
  readonly status: 'passed' | 'failed';
  /** adapter 实际交给 `instantiate` 的路径；没走到加载 WASM 时为 `null`。 */
  readonly wasmPath: string | null;
  readonly failure?: StageFailure;
  readonly writtenRows?: readonly (readonly JsonCell[])[];
  readonly reopenedRows?: readonly (readonly JsonCell[])[];
  /** `PRAGMA integrity_check` 的第一格。 */
  readonly integrity?: JsonCell;
  /** 关闭后数据库目录下的文件与大小。 */
  readonly files?: readonly DatabaseFile[];
}

/** 实验 ④ 撞配额之后：同一连接能否继续读、关掉重开能否读到全部已提交行。 */
export interface QuotaAfterFailure {
  readonly sameConnectionCount: Probe<JsonCell>;
  readonly disconnect: Probe<null>;
  /** 关闭之后、重开之前的库文件：关闭失败时看有没有留下 `-journal`（热日志会让重开先回滚）。 */
  readonly filesAfterDisconnect: Probe<readonly DatabaseFile[]>;
  readonly reopenCount: Probe<JsonCell>;
  readonly reopenIntegrity: Probe<JsonCell>;
}

/** 实验 ④：持续写 blob 直到撞配额；撞了不清理任何文件，直接重开读回。 */
export interface QuotaReport {
  readonly status: 'triggered' | 'not-triggered' | 'failed';
  readonly plan: QuotaPlan;
  readonly insertedRows: number;
  /** 撞配额那一条 INSERT 的错误。 */
  readonly failure?: { readonly atRow: number; readonly error: DescribedError };
  readonly afterFailure?: QuotaAfterFailure;
  /** 不是因为配额而中止（建表或关闭失败）时停在哪一步。 */
  readonly stageFailure?: StageFailure;
}

/** 核心包跑出来的全部结果。 */
export interface CoreExperimentReport {
  readonly capabilities: Probe<readonly CapabilityRow[]>;
  readonly persistence: PersistenceReport;
  readonly quota: QuotaReport;
}

/** 核心包的导出面。 */
export interface SpikeCore {
  /** 核心包自己的 realm 探测记录；源码级运行时为 `null`。 */
  readonly realmProbe: RealmProbeRecord | null;
  /**
   * 构建包装接住的模块顶层错误，只在顶层抛错时存在（包装照样把错误再抛出去）。
   * iOS 真机的 `require` 会吞掉这个错误、返回半成品导出，页面包靠它拿到原始错误。
   */
  readonly initError?: unknown;
  runCoreExperiments(input: CoreExperimentInput): Promise<CoreExperimentReport>;
}
