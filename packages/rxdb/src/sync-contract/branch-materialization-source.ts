/**
 * @packageDocumentation
 * metadata-only 分支首次物化的来源契约（FR-044/049）。
 *
 * @remarks
 * 物化协议有两端：工作树插件持有 durable staging 与提交屏障，同步插件知道远端快照从哪来、
 * 一页怎么变成投影。两个插件互不依赖，所以两端相遇的那张接口、登记它的那一格
 * （{@link RxDB.branchMaterializationSource}），以及两端都要算出同一个值的分页指纹，
 * 只能放在它们共同的依赖——核心——里。
 */
import { sha256Hex } from '../system/sha256.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import type { SwitchVersionActions } from './VersionManager.interface.js';

/**
 * 一次物化的意图：拉到哪为止、拉哪些东西。
 *
 * @remarks
 * 两格都是**冻结值**，由来源方在开拉之前一次性定下（FR-049）。不冻的话，分页中途远端又来了
 * 新数据，第 1 页与第 9 页属于两个不同的时刻——拼出来的基线是一份从未在远端存在过的状态。
 *
 * 它同时是**续用判据**：崩了重来时，意图逐字相同的那份 staging 才接得上。
 */
export interface BranchMaterializationIntent {
  /** 本次冻结的终止水位；形状由来源方定，工作树只做键序无关的比对 */
  readonly frozenRemoteWatermark: Record<string, unknown>;

  /** 本次要物化的完整 sync scope（`namespace:entity`），顺序即分页顺序 */
  readonly syncScope: readonly string[];
}

/** 来源方交出的一页快照：原样落库的 payload 与它的指纹。 */
export interface BranchMaterializationPagePayload {
  /** 这一页的内容；只能含 JSON 可表达的值，落库后原样读回 */
  readonly payload: Record<string, unknown>;

  /** {@link branchMaterializationPageFingerprint} 对 `payload` 算出的值 */
  readonly fingerprint: string;
}

/** 已经落进 staging 的一页；`pageIndex` 是它落库时拿到的页序。 */
export interface BranchMaterializationPage extends BranchMaterializationPagePayload {
  /** 从 0 起的密集页序 */
  readonly pageIndex: number;
}

/** 向来源方要页时交代的事。 */
export interface BranchMaterializationPageRequest {
  /** 要物化的目标分支 id */
  readonly targetBranchId: string;

  /** 本次冻结下来的意图；续用一份旧 staging 时，它与那一行上冻结的逐字相同 */
  readonly intent: BranchMaterializationIntent;

  /**
   * 从第几页开始给；续用时不是 0
   *
   * @remarks
   * 这一格是「可续拉」的全部：不给的话，续用只能从头拉一遍，而崩在第 900 页的那次尝试
   * 留下的 900 页会被原样重写——留得住也就没有意义了。
   */
  readonly fromPageIndex: number;

  /**
   * staging 里最后一页；从头拉时为 `null`
   *
   * @remarks
   * 页序只说「第几页」，说不出「拉到了哪」。游标写在来源方自己的 payload 里，续拉时原样交还，
   * 来源方不必在别处另存一份会与 staging 漂移的进度。
   */
  readonly previousPage: BranchMaterializationPage | null;
}

/** 屏障那笔事务里交给来源方的现场。 */
export interface BranchMaterializationBarrierContext {
  /** 正在物化的目标分支 id */
  readonly targetBranchId: string;

  /** staging 上冻结的那份意图 */
  readonly intent: BranchMaterializationIntent;

  /**
   * 屏障那笔事务的执行器；**必须用它读写**
   *
   * @remarks
   * 自己开事务的实现写下的东西，会在屏障后续任何一步失败时留在库里——用户看见的是
   * 一半目标分支的数据，而 active 还停在来源分支上。
   */
  readonly executor: TransactionExecutor;
}

/** 把一页投影成本地写操作时交给来源方的现场。 */
export interface BranchMaterializationProjectionContext extends BranchMaterializationBarrierContext {
  /** 这一页 */
  readonly page: BranchMaterializationPage;
}

/**
 * 远端快照来源：工作树物化流水线与业务数据之间的唯一接缝。
 *
 * @remarks
 * 成员对应流水线上工作树答不出来的问题：**拉到哪为止**（意图从远端游标来）、**内容是什么**
 * （分页协议是同步层的事）、**冻结之后本地配置变没变**、**一页怎么变成投影**（业务实体
 * 工作树不认识）、**物化之后同步水位落在哪**。除此之外的一切——页序、指纹复核、续用判定、
 * 屏障里的写入与切换——都在工作树里，来源方碰不到。
 *
 * 由官方同步插件在装配时经 {@link RxDB.branchMaterializationSource} 登记，一条连接**至多一个**：
 * 两个来源意味着同一条分支可以被两份互不相识的快照各物化一次，而第二次看到的现场
 * 已经是第一次的结果。
 */
export interface BranchMaterializationSource {
  /**
   * 冻结这次物化的意图。
   *
   * @param targetBranchId - 要物化的目标分支 id
   * @returns 见 {@link BranchMaterializationIntent}
   *
   * @remarks
   * 跑在**任何事务之外**：它要问远端，而网络 I/O 握着写事务不放会把整个库锁到超时。
   */
  freezeIntent(targetBranchId: string): Promise<BranchMaterializationIntent>;

  /**
   * 按页交出这份快照。
   *
   * @param request - 见 {@link BranchMaterializationPageRequest}
   * @returns 从 `fromPageIndex` 那一页起的异步序列；给完即止
   *
   * @remarks
   * 做成 `AsyncIterable` 而不是一次给一个数组：整份快照可能是几十万行，一次性驻留内存
   * 与 FR-044 的分页落库互相抵消。每一页背后是一次请求，所以是异步序列。
   *
   * **每一页由工作树各自开一笔事务落库**，所以序列在第 N 页上抛出时，前 N 页已经在库里了
   * ——下一次切换会接着第 N 页拉。
   */
  pages(request: BranchMaterializationPageRequest): AsyncIterable<BranchMaterializationPagePayload>;

  /**
   * 判定冻结之后本地的同步配置是否已经漂移。
   *
   * @param context - 见 {@link BranchMaterializationBarrierContext}
   * @returns 漂移时返回可读原因；没漂移时返回 `undefined`
   *
   * @remarks
   * 续用旧 staging 之前与屏障复核时各调一次，都只能读本地、**不得问远端**：
   * 屏障里握着写事务。漂移的 staging 不能投影——它是按另一份 scope 或过滤条件拉下来的。
   */
  resolveIntentDrift(context: BranchMaterializationBarrierContext): Promise<string | undefined>;

  /**
   * 把一页快照投影成本地写操作。
   *
   * @param context - 见 {@link BranchMaterializationProjectionContext}
   * @returns 这一页要落到实体表上的增删改
   *
   * @remarks
   * 跑在**屏障那笔事务**里，按页序逐页调；只算不写——写入由工作树经受信调用点统一落库，
   * 来源方不必为屏障里的写另开一张受信入口的票。
   */
  projectPage(context: BranchMaterializationProjectionContext): Promise<SwitchVersionActions>;

  /**
   * 在屏障里结算来源方自己的状态（例如目标分支的同步水位）。
   *
   * @param context - 见 {@link BranchMaterializationBarrierContext}
   *
   * @remarks
   * 与投影同一笔事务：水位先于数据落库，下一次拉取会跳过从未落地的那段变更；
   * 数据先于水位落库，下一次拉取会把整份快照再拉一遍。
   */
  settle(context: BranchMaterializationBarrierContext): Promise<void>;
}

/** 算指纹用的编码器；每次现 new 一个是白白的分配。 */
const textEncoder = new TextEncoder();

/**
 * 把一个 JSON 值折成**键序无关**的字符串——物化协议两端共用的规范形。
 *
 * @param value - 任意 JSON 可表达的值
 * @returns 同一份内容恒得同一个字符串
 *
 * @remarks
 * 直接 `JSON.stringify` 不行：`{a:1,b:2}` 与 `{b:2,a:1}` 是同一份内容，序列化出来却是两个
 * 字符串，于是同一次续用或漂移判定会随对象字面量的书写顺序给出两种答案。
 *
 * 放在核心而不是各写一份：来源方算的分页指纹要与屏障复算的逐字相同，意图也要在两端按同一
 * 口径比对——两份规范化器在任何一侧改版那天就会静默失配。
 *
 * @internal
 */
export const canonicalMaterializationJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalMaterializationJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalMaterializationJson(record[key])}`).join(',')}}`;
};

/**
 * 分页指纹的域分隔前缀。
 *
 * @remarks
 * 与工作树的意图指纹前缀分开：两者算的是同一条链路上的两样东西（一份意图、一页内容），
 * 共用前缀的话，一份恰好等于 scope 清单的 payload 会与那份清单算出同一个指纹。
 */
const MATERIALIZATION_PAGE_FINGERPRINT_DOMAIN = 'rxdb.working-tree.materialization.page.v1';

/**
 * 算一页快照 payload 的指纹——**这是分页指纹的公开口径**（FR-044）。
 *
 * @param payload - 该页原样落库的那份 payload
 * @returns 十六进制 SHA-256
 *
 * @remarks
 * 来源方交页时算一次，屏障投影之前拿存下来的 payload 复算一次再比；口径只存在于某一侧的话，
 * 另一侧只能靠试出来，试出来的那一份会在本函数改版那天静默失配。
 *
 * 只吃 payload，不掺页号、attempt id 或目标分支：掺进去之后，同一页内容在续用一份旧
 * attempt 时会因为页号错位而"变了内容"，而页号是否错位由屏障的密集性检查单独回答。
 * 两件事合进一个值，报出来的成因就永远只有一个。
 *
 * @example
 * ```ts
 * const payload = { repository: 'public:todo', changes: [] };
 * const page = { payload, fingerprint: branchMaterializationPageFingerprint(payload) };
 * ```
 */
export const branchMaterializationPageFingerprint = (payload: Record<string, unknown>): string =>
  sha256Hex(textEncoder.encode(`${MATERIALIZATION_PAGE_FINGERPRINT_DOMAIN} ${canonicalMaterializationJson(payload)}`));
