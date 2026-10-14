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
  /** 备选方案选择；未给且存在多个备选时结果标 `unresolved` 并列候选（AC#11）。 */
  alternativeNo?: number;
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
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** 备选选择不唯一时的候选（调用方裁决，不擅自挑）。 */
export interface UnresolvedAlternative {
  parentItemId: string;
  parentRevisionId: string;
  candidates: { headerId: string; alternativeNo: number }[];
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
