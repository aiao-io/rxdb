/**
 * @fileoverview 多级展开与 where-used 反查（US-510 阶段 A）
 *
 * 下钻：从父修订出发逐层取解析后的发生项（released 头 + 生效窗口 + 子件修订解析，
 * 与 US-508 的解析同口径）；反查：从子件物料出发逐层取使用方发生项。路径是**行发生项
 * id 序列**（根→本节点），同一子装配经两条路径出现即两个结果节点。
 *
 * 预算结算在 TS 侧按 BFS 层推进：递归 CTE 在 PG 的递归项里不能带 LIMIT（SQLite 的
 * LIMIT 也只限每迭代层宽，限不住总行数），AC#10 的百万路径结构必须能提前停。每层一条
 * 按前沿集合的 SQL，生成新节点前依次结算「取消 → 深度 → 返回路径数 → 展开数」，任一
 * 触顶即停止并标 {@link ExpansionResult.truncated}（附触顶项）。
 */

import { BomTruncationError, type TruncationReason } from '../types.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import {
  bomSqlDialectFor,
  buildChildrenOfRevisionsSql,
  buildParentRevisionSql,
  buildParentsOfItemsSql,
  buildRevisionHeadersSql,
  type BomSqlDialect
} from './bom-sql.js';
import { filterResolutionRows } from './config-validate.js';
import {
  BomResolutionError,
  type ResolutionContext,
  type ResolutionResult,
  type UnresolvedAlternative
} from './resolution.js';
import {
  assertContext,
  columnIndexOf,
  normalizeDate,
  selectRootAlternatives,
  type BomQueryExecutor,
  type ResolveTarget
} from './resolver.js';

/**
 * 展开 / 反查预算（US-510 AC#1/#10）：深度、展开数、返回路径数，任一触顶即截断。
 * 数量展开（`explodeBom`）复用同一结算，节点即它生成的路径节点（需求行与虚拟件穿透）。
 */
export interface ExpansionBudgets {
  /** 结果节点距根的最大边数（根 = 0），默认 128。 */
  depth?: number;
  /** 展开次数（每生成一个非根节点计一次，根不计），默认 100,000。 */
  expansions?: number;
  /** 返回节点数：结果里的全部节点（下钻含根；反查没有根节点），默认 100,000。 */
  paths?: number;
}

/** 展开 / 反查选项。 */
export interface ExpansionOptions {
  budgets?: ExpansionBudgets;
  /** 调用方取消：批次间与节点间检查，触顶原因 `cancelled`。 */
  signal?: AbortSignal;
}

/** 展开 / 反查的一个结果节点（BFS 序）。 */
export interface ExpansionNode {
  /** 行发生项 id 序列（根→本节点；根节点与反查前导为空数组）。 */
  path: string[];
  /** 距根的发生项边数（根 = 0；反查时距被查子件的边数，一级使用方 = 1）。 */
  depth: number;
  /** 本节点物料 id（下钻 = 子件；反查 = 使用方父件）。 */
  itemId: string;
  /** 解析所得修订 id（反查 = 头的父修订）；下钻 imprecise 且评估日前无已发布修订时为 null（叶子，不下钻）。 */
  revisionId: string | null;
  /** 到达本节点的发生项 id；根节点为 null。 */
  occurrenceId: string | null;
  /** 到达本节点发生项的用量；根节点与公式行为 null。 */
  qty: string | null;
  /** 到达本节点发生项所在逻辑行的位号；根节点为 null。 */
  lineNo: number | null;
  /** 到达本节点发生项的生效起点；根节点为 null。 */
  effectiveFrom: Date | null;
  /** 到达本节点发生项的生效终点（开区间）；根节点为 null。 */
  effectiveTo: Date | null;
}

/** 展开 / 反查结果：BFS 序节点 + 截断标记（null = 完整）。 */
export interface ExpansionResult {
  context: ResolutionContext;
  nodes: ExpansionNode[];
  unresolved?: UnresolvedAlternative[];
  /** 触顶的预算项；null 表示未被截断（完整结果）。 */
  truncated: { reason: TruncationReason } | null;
}

/** where-used 反查目标：给定子件物料。 */
export interface WhereUsedTarget {
  childItemId: string;
}

/** 预算默认值：深度 128（与判环硬上限同阶），展开数与路径数沿用 graph 插件的 100,000 先例（ECN 影响面同口径）。 */
export const DEFAULT_EXPANSION_BUDGETS: Readonly<Required<ExpansionBudgets>> = {
  depth: 128,
  expansions: 100_000,
  paths: 100_000
};

/** 前沿集合 IN 列表的分块大小（避开两后端的绑定变量上限）。 */
const CHUNK_SIZE = 200;

type ResolvedBudgets = Readonly<Required<ExpansionBudgets>>;

/** 一层下钻的结果：本层新节点 + 下一层前沿 + 触顶标记。 */
interface ExpandLevelStep {
  added: ExpansionNode[];
  next: { nodeIndex: number; revisionId: string }[];
  truncated: { reason: TruncationReason } | null;
}

/** 一层反查的结果：本层新节点 + 下一层前沿 + 触顶标记。 */
interface UsageLevelStep {
  added: ExpansionNode[];
  next: { nodeIndex: number; itemId: string }[];
  truncated: { reason: TruncationReason } | null;
}

/** 下钻层的一行发生项。 */
interface ChildRow {
  parentRevisionId: string;
  lineNo: number;
  occurrenceId: string;
  childItemId: string;
  resolvedChildRevisionId: string | null;
  qty: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** 前沿修订的一张已发布头（备选裁决的输入）。 */
interface RevisionHeader {
  headerId: string;
  parentRevisionId: string;
  parentItemId: string;
  alternativeNo: number;
}

/** 反查层的一行使用方发生项。 */
interface UsageRow {
  parentItemId: string;
  parentRevisionId: string;
  lineNo: number;
  occurrenceId: string;
  childItemId: string;
  /** 公式行为 null（与下钻同口径）。 */
  qty: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

const resolveBudgets = (budgets?: ExpansionBudgets): ResolvedBudgets => ({ ...DEFAULT_EXPANSION_BUDGETS, ...budgets });

/**
 * 生成新节点前的预算结算（顺序：取消 → 深度 → 返回路径数 → 展开数），下钻、反查与数量展开（US-511）共用：
 * 展开数只数生成的非根节点（根不是一次展开），返回路径数是结果里的全部节点——下钻与数量展开的结果含根，
 * 反查没有根节点。三处按同一口径截断，触顶即停，不静默超预算。
 *
 * @param usage - 已生成的非根节点数（含本层已生成未提交的）与结果是否含根节点
 * @param parentDepth - 生成该节点的父节点深度
 * @returns 触顶原因；null = 放行
 */
export const checkBudgets = (
  usage: { generated: number; withRoot: boolean },
  parentDepth: number,
  budget: ResolvedBudgets,
  signal?: AbortSignal
): TruncationReason | null => {
  if (signal?.aborted) return 'cancelled';
  if (parentDepth + 1 > budget.depth) return 'depth';
  // 计入本节点后的展开数；返回节点数再加上结果里的根
  const generated = usage.generated + 1;
  if (generated + (usage.withRoot ? 1 : 0) > budget.paths) return 'paths';
  if (generated > budget.expansions) return 'expansions';
  return null;
};

const filteredQueryRows = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  result: { columns: string[]; rows: unknown[][] },
  unresolved: UnresolvedAlternative[]
): Promise<unknown[][]> => {
  const read = (row: unknown[], name: string): unknown => row[columnIndexOf(result.columns, name)];
  const nullableNumber = (row: unknown[], name: string): number | null =>
    read(row, name) === null ? null : Number(read(row, name));
  const nullableString = (row: unknown[], name: string): string | null =>
    read(row, name) === null ? null : String(read(row, name));
  const filtered = await filterResolutionRows(
    query,
    dialect,
    context,
    result.rows.map(row => ({
      row,
      headerId: String(read(row, 'headerId')),
      alternativeNo: Number(read(row, 'alternativeNo')),
      parentItemId: String(read(row, 'parentItemId')),
      parentRevisionId: String(read(row, 'parentRevisionId')),
      lineId: String(read(row, 'lineId')),
      occurrenceId: String(read(row, 'occurrenceId')),
      childItemId: String(read(row, 'childItemId')),
      unitFrom: nullableNumber(row, 'unitFrom'),
      unitTo: nullableNumber(row, 'unitTo'),
      lotCodes: nullableString(row, 'lotCodes'),
      selectionConditionId: nullableString(row, 'selectionConditionId')
    })),
    unresolved
  );
  return filtered.map(row => row.row);
};

/** 按前沿修订集取已发布头（分块 IN），按修订分组。 */
const fetchRevisionHeaders = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  revisionIds: string[]
): Promise<Map<string, RevisionHeader[]>> => {
  const byRevision = new Map<string, RevisionHeader[]>();
  for (let offset = 0; offset < revisionIds.length; offset += CHUNK_SIZE) {
    const built = buildRevisionHeadersSql(dialect, {
      bomType: context.bomType,
      orgId: context.orgId,
      revisionIds: revisionIds.slice(offset, offset + CHUNK_SIZE)
    });
    const result = await query(built.sql, built.params);
    const read = (row: unknown[], name: string): unknown => row[columnIndexOf(result.columns, name)];
    for (const row of result.rows) {
      const header: RevisionHeader = {
        headerId: String(read(row, 'headerId')),
        parentRevisionId: String(read(row, 'parentRevisionId')),
        parentItemId: String(read(row, 'parentItemId')),
        alternativeNo: Number(read(row, 'alternativeNo'))
      };
      const list = byRevision.get(header.parentRevisionId) ?? [];
      list.push(header);
      byRevision.set(header.parentRevisionId, list);
    }
  }
  return byRevision;
};

/**
 * 每个前沿修订可下钻的头（`alternativeNo` 只裁决根头，与解析 / 数量 / 成本同口径）：
 * 根按 {@link selectRootAlternatives} 裁决，子装配只认唯一已发布头；仍有多个候选的修订标
 * unresolved（列候选，同一修订只记一次），不下钻、也不合并任何备选的发生项。
 */
const selectExpandableHeaders = (
  revisionIds: readonly string[],
  byRevision: ReadonlyMap<string, RevisionHeader[]>,
  context: ResolutionContext,
  rootRevisionId: string,
  unresolved: UnresolvedAlternative[]
): Set<string> => {
  const allowed = new Set<string>();
  for (const revisionId of revisionIds) {
    const headers = byRevision.get(revisionId) ?? [];
    const candidates = revisionId === rootRevisionId ? selectRootAlternatives(headers, context, revisionId) : headers;
    if (candidates.length === 1) allowed.add(candidates[0].headerId);
    if (candidates.length < 2) continue;
    if (unresolved.some(group => group.reason === undefined && group.parentRevisionId === revisionId)) continue;
    unresolved.push({
      parentItemId: candidates[0].parentItemId,
      parentRevisionId: revisionId,
      candidates: candidates.map(header => ({ headerId: header.headerId, alternativeNo: header.alternativeNo }))
    });
  }
  return allowed;
};

/** 按前沿修订集取一层子件发生项（分块 IN）；只保留可下钻头的发生项，再过序列 / 批次 / 配置。 */
const fetchChildren = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  revisionIds: string[],
  allowedHeaders: ReadonlySet<string>,
  unresolved: UnresolvedAlternative[]
): Promise<ChildRow[]> => {
  const rows: ChildRow[] = [];
  for (let offset = 0; offset < revisionIds.length; offset += CHUNK_SIZE) {
    const chunk = revisionIds.slice(offset, offset + CHUNK_SIZE);
    const built = buildChildrenOfRevisionsSql(dialect, {
      asOfDate: context.asOfDate,
      bomType: context.bomType,
      orgId: context.orgId,
      revisionIds: chunk
    });
    const fetched = await query(built.sql, built.params);
    const headerIndex = columnIndexOf(fetched.columns, 'headerId');
    const result = {
      columns: fetched.columns,
      rows: fetched.rows.filter(row => allowedHeaders.has(String(row[headerIndex])))
    };
    for (const row of await filteredQueryRows(query, dialect, context, result, unresolved)) {
      rows.push({
        parentRevisionId: String(row[columnIndexOf(result.columns, 'parentRevisionId')]),
        lineNo: Number(row[columnIndexOf(result.columns, 'lineNo')]),
        occurrenceId: String(row[columnIndexOf(result.columns, 'occurrenceId')]),
        childItemId: String(row[columnIndexOf(result.columns, 'childItemId')]),
        resolvedChildRevisionId:
          row[columnIndexOf(result.columns, 'resolvedChildRevisionId')] === null ?
            null
          : String(row[columnIndexOf(result.columns, 'resolvedChildRevisionId')]),
        qty:
          row[columnIndexOf(result.columns, 'qty')] === null ? null : String(row[columnIndexOf(result.columns, 'qty')]),
        effectiveFrom: normalizeDate(row[columnIndexOf(result.columns, 'effectiveFrom')]) as Date,
        effectiveTo: normalizeDate(row[columnIndexOf(result.columns, 'effectiveTo')])
      });
    }
  }
  return rows;
};

/** 按前沿物料集取一层使用方发生项（分块 IN）。 */
const fetchParents = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  itemIds: string[],
  unresolved: UnresolvedAlternative[]
): Promise<UsageRow[]> => {
  const rows: UsageRow[] = [];
  const unresolvedLines = new Set(unresolved.map(entry => entry.lineId));
  for (let offset = 0; offset < itemIds.length; offset += CHUNK_SIZE) {
    const chunk = itemIds.slice(offset, offset + CHUNK_SIZE);
    const built = buildParentsOfItemsSql(dialect, {
      asOfDate: context.asOfDate,
      bomType: context.bomType,
      orgId: context.orgId,
      itemIds: chunk,
      includeLineCandidates: true
    });
    const result = await query(built.sql, built.params);
    const targets = new Set(chunk);
    const pending: UnresolvedAlternative[] = [];
    const selected = await filteredQueryRows(query, dialect, context, result, pending);
    for (const entry of pending) {
      if (
        unresolvedLines.has(entry.lineId) ||
        !entry.candidates.some(candidate => candidate.childItemId !== undefined && targets.has(candidate.childItemId))
      )
        continue;
      unresolvedLines.add(entry.lineId);
      unresolved.push(entry);
    }
    for (const row of selected.filter(row => targets.has(String(row[columnIndexOf(result.columns, 'childItemId')])))) {
      rows.push({
        parentItemId: String(row[columnIndexOf(result.columns, 'parentItemId')]),
        parentRevisionId: String(row[columnIndexOf(result.columns, 'parentRevisionId')]),
        lineNo: Number(row[columnIndexOf(result.columns, 'lineNo')]),
        occurrenceId: String(row[columnIndexOf(result.columns, 'occurrenceId')]),
        childItemId: String(row[columnIndexOf(result.columns, 'childItemId')]),
        qty:
          row[columnIndexOf(result.columns, 'qty')] === null ? null : String(row[columnIndexOf(result.columns, 'qty')]),
        effectiveFrom: normalizeDate(row[columnIndexOf(result.columns, 'effectiveFrom')]) as Date,
        effectiveTo: normalizeDate(row[columnIndexOf(result.columns, 'effectiveTo')])
      });
    }
  }
  return rows;
};

/** 把一层发生项按父修订分组。 */
const groupChildrenByParent = (rows: ChildRow[]): Map<string, ChildRow[]> => {
  const byParent = new Map<string, ChildRow[]>();
  for (const row of rows) {
    const list = byParent.get(row.parentRevisionId);
    if (list) list.push(row);
    else byParent.set(row.parentRevisionId, [row]);
  }
  return byParent;
};

/** 把一层使用方发生项按子件物料分组。 */
const groupUsageByChild = (rows: UsageRow[]): Map<string, UsageRow[]> => {
  const byChild = new Map<string, UsageRow[]>();
  for (const row of rows) {
    const list = byChild.get(row.childItemId);
    if (list) list.push(row);
    else byChild.set(row.childItemId, [row]);
  }
  return byChild;
};

/** 下钻一层：先按修订裁决备选头，再把前沿里每个父修订的已解析子件生成新节点。 */
const expandLevel = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  rootRevisionId: string,
  frontier: { nodeIndex: number; revisionId: string }[],
  nodes: readonly ExpansionNode[],
  budget: ResolvedBudgets,
  signal: AbortSignal | undefined,
  unresolved: UnresolvedAlternative[]
): Promise<ExpandLevelStep> => {
  const revisionIds = [...new Set(frontier.map(entry => entry.revisionId))];
  const byRevision = await fetchRevisionHeaders(query, dialect, context, revisionIds);
  const allowedHeaders = selectExpandableHeaders(revisionIds, byRevision, context, rootRevisionId, unresolved);
  const expandable = revisionIds.filter(revisionId =>
    (byRevision.get(revisionId) ?? []).some(header => allowedHeaders.has(header.headerId))
  );
  const byParent = groupChildrenByParent(
    await fetchChildren(query, dialect, context, expandable, allowedHeaders, unresolved)
  );
  const added: ExpansionNode[] = [];
  const next: ExpandLevelStep['next'] = [];
  for (const entry of frontier) {
    for (const child of byParent.get(entry.revisionId) ?? []) {
      const parent = nodes[entry.nodeIndex];
      // 下钻结果以根开头：已生成的非根节点 = 已提交节点去掉根 + 本层已生成
      const generated = nodes.length - 1 + added.length;
      const reason = checkBudgets({ generated, withRoot: true }, parent.depth, budget, signal);
      if (reason !== null) return { added, next, truncated: { reason } };
      added.push({
        path: [...parent.path, child.occurrenceId],
        depth: parent.depth + 1,
        itemId: child.childItemId,
        revisionId: child.resolvedChildRevisionId,
        occurrenceId: child.occurrenceId,
        qty: child.qty,
        lineNo: child.lineNo,
        effectiveFrom: child.effectiveFrom,
        effectiveTo: child.effectiveTo
      });
      if (child.resolvedChildRevisionId !== null) {
        next.push({ nodeIndex: nodes.length + added.length - 1, revisionId: child.resolvedChildRevisionId });
      }
    }
  }
  return { added, next, truncated: null };
};

/** 反查一层：把前沿里每个物料的使用方发生项生成新节点（路径前插，保持根→节点序）。 */
const usageLevel = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  frontier: { nodeIndex: number | null; itemId: string }[],
  nodes: readonly ExpansionNode[],
  budget: ResolvedBudgets,
  signal: AbortSignal | undefined,
  unresolved: UnresolvedAlternative[]
): Promise<UsageLevelStep> => {
  const itemIds = [...new Set(frontier.map(entry => entry.itemId))];
  const byChild = groupUsageByChild(await fetchParents(query, dialect, context, itemIds, unresolved));
  const added: ExpansionNode[] = [];
  const next: UsageLevelStep['next'] = [];
  for (const entry of frontier) {
    for (const usage of byChild.get(entry.itemId) ?? []) {
      const parentDepth = entry.nodeIndex === null ? 0 : nodes[entry.nodeIndex].depth;
      // 反查结果没有根节点：已提交与本层已生成的都是使用方节点
      const generated = nodes.length + added.length;
      const reason = checkBudgets({ generated, withRoot: false }, parentDepth, budget, signal);
      if (reason !== null) return { added, next, truncated: { reason } };
      const parentPath = entry.nodeIndex === null ? [] : nodes[entry.nodeIndex].path;
      added.push({
        path: [usage.occurrenceId, ...parentPath],
        depth: parentDepth + 1,
        itemId: usage.parentItemId,
        revisionId: usage.parentRevisionId,
        occurrenceId: usage.occurrenceId,
        qty: usage.qty,
        lineNo: usage.lineNo,
        effectiveFrom: usage.effectiveFrom,
        effectiveTo: usage.effectiveTo
      });
      next.push({ nodeIndex: nodes.length + added.length - 1, itemId: usage.parentItemId });
    }
  }
  return { added, next, truncated: null };
};

/**
 * 多级展开（下钻）：从父修订出发，返回各级子件、层级与路径（行发生项 id 序列）。
 *
 * @param adapter - 本地适配器（全部读取在一个读事务里）
 * @param context - 解析上下文（`asOfDate` 生效窗口、`bomType` / `orgId` 作用域；`alternativeNo` 只裁决根头，
 *   多备选未裁决的根 / 子装配标 `unresolved` 且不下钻，见 {@link ResolutionContext.alternativeNo}）
 * @param target - 展开目标（按时点选父修订，或显式修订）
 * @param options - 预算与取消信号
 * @returns BFS 序节点（根节点在首位）+ 截断标记 + 未裁决备选
 * @throws {@link BomResolutionError} 指定的 `alternativeNo` 在根修订上不存在
 */
export const expandBom = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: ResolveTarget,
  options: ExpansionOptions = {}
): Promise<ExpansionResult> => {
  assertContext(context);
  if (target.parentItemId === undefined && target.parentRevisionId === undefined) {
    throw new BomResolutionError('parent', '需要 parentItemId 或 parentRevisionId 之一');
  }
  const dialect = bomSqlDialectFor(adapter.name);
  const budget = resolveBudgets(options.budgets);
  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);
    const parentSql = buildParentRevisionSql(dialect, {
      itemId: target.parentItemId ?? '',
      asOfDate: context.asOfDate,
      explicitRevisionId: target.parentRevisionId
    });
    const parentResult = await query(parentSql.sql, parentSql.params);
    const parentRow = parentResult.rows[0];
    if (!parentRow) {
      throw new BomResolutionError(
        'parentRevisionId',
        target.parentRevisionId !== undefined ? '父修订不存在' : '评估日前没有已发布的最新修订'
      );
    }
    const parentRevisionId = String(parentRow[columnIndexOf(parentResult.columns, 'revisionId')]);
    const parentItemId = String(parentRow[columnIndexOf(parentResult.columns, 'itemId')]);
    if (parentRow[columnIndexOf(parentResult.columns, 'state')] !== 'released') {
      throw new BomResolutionError('parentRevisionId', '父修订未发布，草稿不入展开结果');
    }
    const nodes: ExpansionNode[] = [
      {
        path: [],
        depth: 0,
        itemId: parentItemId,
        revisionId: parentRevisionId,
        occurrenceId: null,
        qty: null,
        lineNo: null,
        effectiveFrom: null,
        effectiveTo: null
      }
    ];
    let truncated: ExpansionResult['truncated'] = null;
    const unresolved: UnresolvedAlternative[] = [];
    let frontier: { nodeIndex: number; revisionId: string }[] = [{ nodeIndex: 0, revisionId: parentRevisionId }];
    while (frontier.length > 0) {
      const step = await expandLevel(
        query,
        dialect,
        context,
        parentRevisionId,
        frontier,
        nodes,
        budget,
        options.signal,
        unresolved
      );
      nodes.push(...step.added);
      if (step.truncated !== null) {
        truncated = step.truncated;
        break;
      }
      frontier = step.next;
    }
    return { context, nodes, truncated, ...(unresolved.length > 0 ? { unresolved } : {}) };
  }, false);
};

/**
 * where-used 反查：从子件物料出发，返回所有（直接与间接）使用它的父件与路径。
 *
 * @param adapter - 本地适配器（全部读取在一个读事务里）
 * @param context - 解析上下文（与下钻同一套生效窗口与作用域规则）
 * @param target - 被反查的子件物料
 * @param options - 预算与取消信号
 * @returns BFS 序节点（一级使用方 depth = 1；无根节点）+ 截断标记
 */
export const whereUsed = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  target: WhereUsedTarget,
  options: ExpansionOptions = {}
): Promise<ExpansionResult> => {
  assertContext(context);
  if (!target.childItemId) throw new BomResolutionError('childItemId', '必填');
  const dialect = bomSqlDialectFor(adapter.name);
  const budget = resolveBudgets(options.budgets);
  return adapter.transaction(async executor => {
    const query = (executor as unknown as BomQueryExecutor).query.bind(executor);
    const nodes: ExpansionNode[] = [];
    let truncated: ExpansionResult['truncated'] = null;
    const unresolved: UnresolvedAlternative[] = [];
    let frontier: { nodeIndex: number | null; itemId: string }[] = [{ nodeIndex: null, itemId: target.childItemId }];
    while (frontier.length > 0) {
      const step = await usageLevel(query, dialect, context, frontier, nodes, budget, options.signal, unresolved);
      nodes.push(...step.added);
      if (step.truncated !== null) {
        truncated = step.truncated;
        break;
      }
      frontier = step.next;
    }
    return { context, nodes, truncated, ...(unresolved.length > 0 ? { unresolved } : {}) };
  }, false);
};

/**
 * 完整性守卫（US-510 AC#11）：截断结果与未裁决备选不是完整结果，
 * 数量 / 成本 / 导出等消费方必须先过此守卫，不得把部分结果当完整结构。
 *
 * @param result - 解析或展开 / 反查结果
 */
export const assertCompleteResolution = (result: ResolutionResult | ExpansionResult): void => {
  if ('truncated' in result && result.truncated !== null) {
    throw new BomTruncationError(result.truncated.reason);
  }
  const unresolved = 'manifest' in result ? result.manifest.unresolved : (result.unresolved ?? []);
  if (unresolved.length > 0) {
    const reason = unresolved.find(entry => entry.reason !== undefined)?.reason;
    if (reason !== undefined) throw new BomResolutionError(reason, `存在未解析的序列 / 批次候选：请先指定 ${reason}`);
    throw new BomResolutionError(
      'alternativeNo',
      '存在未裁决的备选：根头先指定 alternativeNo（只裁决根头），子装配多备选先消除歧义，再交给数量 / 成本 / 导出消费方'
    );
  }
};
