/**
 * @fileoverview BOM 视图解析的类型（US-508 首轮）
 *
 * 一个显式的解析上下文 {@link ResolutionContext} 解析出唯一一份有效行集：
 * `asOfDate` 必填、不读系统时钟；头限 `released`；发生项限 `[effectiveFrom, effectiveTo)`
 * 含评估日；precise 行锁版、imprecise 行取评估日前已发布的最新修订。结果附 manifest
 * （命中的头、发生项 ID、解析所得子件修订与上下文），供下游审计与比对。
 */

/** BOM 类型轴（与 {@link import('../entities.js').BomHeader} 的 `bomType` 一致）。 */
export type BomType = 'ebom' | 'mbom' | 'sales';

/**
 * 解析上下文：类型、组织、评估日与备选选择。
 *
 * @remarks
 * `asOfDate` 必填——缺失即拒绝，不读系统时钟、不默认今天（US-508 AC#7/#8）。
 * [US-512] 的替代组选择、[US-517] 的配置与 [US-518] 的序列/批次在各自落地时扩入同一上下文，
 * 不另开第二套入参。
 */
export interface ResolutionContext {
  bomType: BomType;
  orgId: string;
  asOfDate: Date;
  /** 配置选择（US-517）：特征 code → 选中值集合；未给的特征按「未选择」求值。 */
  configSelection?: Record<string, string[]>;
  /** 序列号（US-518）：整数；未给且行有按序列区分的多候选时标 `unresolved`。 */
  unit?: number;
  /** 批次（US-518）：精确匹配；未给 = 全部批次。 */
  lot?: string;
  /**
   * 根修订的备选方案选择（US-508 AC#3/#11），四个引擎同一口径：
   *
   * - **只裁决根修订**的备选头：一个编号无法对任意子装配做有意义的选择（同 SAP CS11）；
   * - 指定且命中 → 用该备选；指定但根修订在上下文下没有该编号 → 解析 / 展开 / 数量 / 成本
   *   全部显式拒绝（{@link BomResolutionError}，字段 `alternativeNo`；成本经 BomCostError 包装），不返回空结果；
   * - 未指定且根有多个已发布备选 → 解析与展开标 `unresolved` 列候选、不展开也不合并任何备选的发生项，
   *   数量与成本拒绝；
   * - 子装配修订有多个已发布备选头 → 展开对该子节点标 `unresolved`、不下钻，数量与成本拒绝
   *   （本字段不裁决子头，须先消除子装配的歧义）。where-used 反查不受本字段约束（列出全部备选中的使用）。
   */
  alternativeNo?: number;
  /**
   * 替代组的手动选择 / 分配（US-512，键 = 组 ID；兼容按组 code 选择，ID 优先）：
   * `memberKey` = 唯一选择（manual × allow_mix=false）；`allocation` = 按成员物料 id 的
   * primary 需求分配（manual × allow_mix=true）。未给且组 strategy=manual → unresolved。
   */
  substituteSelections?: Record<string, { memberKey?: string; allocation?: Record<string, string> }>;
  /**
   * priority 组的成员可用量上限（US-512 AC#4）：只在 priority 且最高者不足时起作用；
   * 值 + 单位按十进制值合同承载，键 = 成员物料 id。
   */
  substituteAvailabilities?: Record<string, { value: string; uom: string }>;
}

/** 解析出的一行发生项（已按上下文过滤与修订解析）。 */
export interface ResolvedLineOccurrence {
  lineId: string;
  lineNo: number;
  occurrenceId: string;
  childItemId: string;
  /** precise 锁版；NULL = imprecise（跟随评估日已发布的最新修订）。 */
  childRevisionId: string | null;
  /**
   * imprecise 行解析所得的子件修订（precise 行与 `childRevisionId` 相同）；
   * imprecise 且评估日前无已发布修订时为 `null`（该子件按叶子处理，不再下钻）。
   */
  resolvedChildRevisionId: string | null;
  /** 规范十进制串；公式行的 qty 为空（US-511 阶段 A）。 */
  qty: string | null;
  /** 公式行的表达式；普通数量行不增加此字段。 */
  qtyFormula?: string;
  /** 公式行使用的语法版本。 */
  formulaGrammarVersion?: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** 备选选择不唯一时的候选（调用方裁决，不擅自挑）。 */
export interface UnresolvedAlternative {
  parentItemId: string;
  parentRevisionId: string;
  reason?: 'unit' | 'lot';
  lineId?: string;
  candidates: {
    headerId: string;
    alternativeNo: number;
    occurrenceId?: string;
    childItemId?: string;
    unitFrom?: number | null;
    unitTo?: number | null;
    lotCodes?: string[] | null;
  }[];
}

/** 解析 manifest：命中的头、发生项 ID、每条发生项解析所得子件修订与上下文。 */
export interface ResolutionManifest {
  context: ResolutionContext;
  parentItemId: string;
  parentRevisionId: string;
  headerIds: string[];
  occurrenceIds: string[];
  /** 每条发生项解析所得的子件修订（子件没有 BOM 头也记）。 */
  childRevisions: { occurrenceId: string; childItemId: string; revisionId: string }[];
  unresolved: UnresolvedAlternative[];
}

/** 一次解析的结果：有效行集 + manifest。 */
export interface ResolutionResult {
  manifest: ResolutionManifest;
  occurrences: ResolvedLineOccurrence[];
}

/** 解析 API 违约（缺 `as_of_date`、父修订未发布等）。 */
export class BomResolutionError extends Error {
  constructor(
    /** 违约的上下文字段（如 `asOfDate`）。 */
    readonly field: string | undefined,
    message: string
  ) {
    super(`[rxdb-plugin-bom] 解析违约${field ? `（${field}）` : ''}：${message}`);
    this.name = 'BomResolutionError';
    Object.setPrototypeOf(this, BomResolutionError.prototype);
  }
}
