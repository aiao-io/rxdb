import type { MergeView, RecordCheck } from '../checks.js';
import type { Commit, CommitMeta, DataRow, Records, Resolution, SchemaManifest, StoredCandidate } from '../model.js';
import type { IndexedKey, SharedChange } from './store.js';

/** 一个已解决的必须处理线程需要的历史候选行：该候选的最终结果里这些记录的取值。 */
export interface Reopen {
  candidate: StoredCandidate;
  recordIds: string[];
}

/** 上传的提交链里推导父内容要用的部分：每个提交的 ID 与声明的父提交。 */
export interface ChainLink {
  id: string;
  parent: string | null;
}
/**
 * 上传与另存分叉要核对的父内容：任务的共同起点 `base`、任务头 `head`、共享头 `shared`，
 * 以及新提交改动到的记录 `touched`——只按这些记录推导父内容，成本只与任务分叉以来的改动有关。
 */
export interface ParentContent {
  shared: string | null;
  base: string | null;
  head: string | null;
  touched: string[];
}

/**
 * 命令执行前需要预加载什么：引擎在授权与状态校验之后，按命令类型声明所需数据，仓储据此读取，再把 {@link Facts} 交回引擎。
 * 声明里只带读取所需的最少信息，成本因此只取决于命令涉及的内容。
 */
export type Plan =
  /** 命令不需要提交或记录数据。 */
  | { type: 'none' }
  /** 上传：命令里的提交 ID 中哪些已存在，以及任务头时被改动记录的内容（新提交要能应用到它上面）。 */
  | { type: 'upload'; ids: string[]; content: ParentContent }
  /**
   * 另存分叉：同上，另外还要原任务头到共同起点（含）的路径，用来确认分叉起点与已有祖先的归属；
   * 父内容取第一个新提交的父提交时的内容（它必须在这条路径上）。
   */
  | { type: 'fork'; ids: string[]; chain: ChainLink[]; content: ParentContent }
  /**
   * 候选与合并：合并基以来任一侧改动过的记录在 B、S、T 三处的取值，以及按清单做跨记录检查要用到的 T 里的记录与唯一键；
   * 候选另需重新打开线程要比较的历史候选行。`resolutions` 的自定义取值也要参与唯一与关联检查。
   */
  | {
      type: 'inputs';
      head: string | null;
      base: string | null;
      source: string;
      reopen: Reopen[];
      resolutions: Resolution[];
      schema: SchemaManifest;
    }
  /** 登记新的数据模式版本：共享分支当前的全部记录，新清单必须让它们全部通过检查。 */
  | { type: 'records' }
  /** 评论锚点：某条记录在候选结果、来源与目标三处的取值。 */
  | { type: 'anchor'; head: string | null; candidate: StoredCandidate; recordId: string }
  /** 在线状态：某条记录是否存在于共享数据，或存在于 PR 来源任务的头。 */
  | {
      type: 'presence';
      head: string | null;
      recordId: string;
      task: { head: string | null; base: string | null } | null;
    };

/**
 * 合并的三方输入，只含合并基以来任一侧改动过的记录（`touched`）：共同起点 B、来源 S 与目标 T 在这些记录上的取值；
 * 其余记录三方相同，合并结果就是 T。另带定向检查要用到的 T 里的记录与唯一键（见 `checks.ts` 的 {@link MergeView}）。
 */
export interface MergeInputs extends Omit<MergeView, 'merged'> {
  base: Records;
  source: Records;
  target: Records;
}
/** 评论锚点所在记录在三处的取值；某处没有这条记录时为 undefined。 */
export interface AnchorRows {
  candidate: DataRow | undefined;
  source: DataRow | undefined;
  target: DataRow | undefined;
}

/**
 * 仓储按 {@link Plan} 预加载、交给引擎的数据。引擎只读它，不访问存储；没有声明过的数据保持缺省，
 * 引擎读取到缺省的必需数据说明仓储与引擎不同步，按内部错误处理。
 */
export interface Facts {
  /** 命令里已存在的提交的元数据，键为提交 ID。 */
  existing: ReadonlyMap<string, CommitMeta> | undefined;
  /** 原任务头到共同起点（含）路径上的提交 ID：另存分叉时按路径加载；上传的起点就是任务头，已存在的提交都不属于新链，为空。 */
  path: ReadonlySet<string> | undefined;
  /** 上传或分叉的父内容（新提交改动到的记录）；找不到可信共同起点时为 null，没有声明时为 undefined。 */
  content: Records | null | undefined;
  /** B、S、T；找不到可信共同起点时为 null，没有声明时为 undefined。 */
  inputs: MergeInputs | null | undefined;
  /** 共享分支当前的全部记录（登记新清单时）。 */
  records: Records | undefined;
  /** 历史候选在所需记录上的最终取值，键为候选 ID。 */
  previous: Readonly<Record<string, Records>>;
  /** 评论锚点所在记录的三处取值。 */
  anchor: AnchorRows | undefined;
  /** 记录是否存在于共享数据 / PR 来源任务的头。 */
  presence: { shared: boolean; task: boolean } | undefined;
}
/** 不需要任何预加载数据的命令使用的空事实。 */
export const noFacts: Facts = {
  existing: undefined,
  path: undefined,
  content: undefined,
  inputs: undefined,
  records: undefined,
  previous: {},
  anchor: undefined,
  presence: undefined
};

/** 引擎新建的提交：上传的提交已带核验过的指纹，服务端生成的合并提交没有，由仓储在写入前补算。 */
export type NewCommit = Omit<Commit, 'fingerprint'> & { fingerprint?: string };
/** 合并改动的一条记录：合并前后的整行，新增时 `before` 为 null、删除时 `after` 为 null。 */
export interface MergedRecord {
  id: string;
  before: DataRow | null;
  after: DataRow | null;
}
/** 一次合并写进逐记录变更日志（admin_changes）的内容：合并提交 ID 与改动到的记录。 */
export interface MergeLog {
  head: string;
  records: MergedRecord[];
}
/** 命令除工作区状态变化之外要落到存储的效果。 */
export interface Effects {
  /** 新建的提交，按追加顺序。 */
  commits: NewCommit[];
  /** 合并对共享记录的改动（连同改动记录在键索引里的新键）；没有合并时为 null。 */
  shared: SharedChange | null;
  /** 登记新清单后按新清单重建的整份键索引；没有登记时为 null。 */
  reindex: IndexedKey[] | null;
  /**
   * 合并的逐记录变更日志；没有合并时为 null。它只由变更表承载，不进命令结果、回执与审计详情，
   * 审计因此不随单次合并的改动量增长。
   */
  log: MergeLog | null;
}
/** 没有任何效果的命令使用的空效果；每次执行都要新建一份，不能共用同一个对象。 */
export const noEffects = (): Effects => ({ commits: [], shared: null, reindex: null, log: null });
/** 引擎执行一条命令时携带的预加载数据、效果收集器，以及部署注入的特殊业务检查（没有时为 undefined）。 */
export interface Run {
  facts: Facts;
  effects: Effects;
  checks: RecordCheck | undefined;
}

/** 取出预加载的数据；仓储没有按声明预加载说明仓储与引擎不同步，按内部错误处理，不当作「没有数据」。 */
export function preloaded<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`The ${name} were not preloaded`);
  return value;
}
