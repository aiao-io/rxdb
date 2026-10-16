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
  type BomSqlDialect
} from './bom-sql.js';
import { BomResolutionError, type ResolutionContext, type ResolutionResult } from './resolution.js';
import { assertContext, columnIndexOf, normalizeDate, type BomQueryExecutor, type ResolveTarget } from './resolver.js';

/** 展开 / 反查预算（US-510 AC#1/#10）：深度、展开数、返回路径数，任一触顶即截断。 */
export interface ExpansionBudgets {
  /** 结果节点距根的最大边数（根 = 0），默认 128。 */
  depth?: number;
  /** 展开次数（每生成一个非根节点计一次），默认 100,000。 */
  expansions?: number;
  /** 返回节点数（含根），默认 100,000。 */
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
  /** 触顶的预算项；null 表示未被截断（完整结果）。 */
  truncated: { reason: TruncationReason } | null;
}

/** where-used 反查目标：给定子件物料。 */
export interface WhereUsedTarget {
  childItemId: string;
}

/** 预算默认值：深度 128（与判环硬上限同阶），展开数与路径数沿用 graph 插件的 100,000 先例。 */
const DEFAULT_BUDGETS: Required<ExpansionBudgets> = { depth: 128, expansions: 100_000, paths: 100_000 };

/** 前沿集合 IN 列表的分块大小（避开两后端的绑定变量上限）。 */
const CHUNK_SIZE = 200;

interface ResolvedBudgets {
  depth: number;
  expansions: number;
  paths: number;
}

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

/** 反查层的一行使用方发生项。 */
interface UsageRow {
  parentItemId: string;
  parentRevisionId: string;
  lineNo: number;
  occurrenceId: string;
  childItemId: string;
  qty: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

const resolveBudgets = (budgets?: ExpansionBudgets): ResolvedBudgets => ({ ...DEFAULT_BUDGETS, ...budgets });

/**
 * 生成新节点前的预算结算（顺序：取消 → 深度 → 返回路径数 → 展开数）。
 *
 * @param baseNodes - 已提交节点数（含根；本层内不变）
 * @param added - 本层已生成但未提交的节点数
 * @param parentDepth - 生成该节点的父节点深度
 * @returns 触顶原因；null = 放行
 */
const checkBudgets = (
  baseNodes: number,
  added: number,
  parentDepth: number,
  budget: ResolvedBudgets,
  signal?: AbortSignal
): TruncationReason | null => {
  if (signal?.aborted) return 'cancelled';
  if (parentDepth + 1 > budget.depth) return 'depth';
  if (baseNodes + added + 1 > budget.paths) return 'paths';
  // 展开数 = 已生成的非根节点数；本节点是第 (baseNodes - 1 + added + 1) 次展开
  if (baseNodes - 1 + added + 1 > budget.expansions) return 'expansions';
  return null;
};

/** 按前沿修订集取一层子件发生项（分块 IN）。 */
const fetchChildren = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  revisionIds: string[]
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
    const result = await query(built.sql, built.params);
    for (const row of result.rows) {
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
  itemIds: string[]
): Promise<UsageRow[]> => {
  const rows: UsageRow[] = [];
  for (let offset = 0; offset < itemIds.length; offset += CHUNK_SIZE) {
    const chunk = itemIds.slice(offset, offset + CHUNK_SIZE);
    const built = buildParentsOfItemsSql(dialect, {
      asOfDate: context.asOfDate,
      bomType: context.bomType,
      orgId: context.orgId,
      itemIds: chunk
    });
    const result = await query(built.sql, built.params);
    for (const row of result.rows) {
      rows.push({
        parentItemId: String(row[columnIndexOf(result.columns, 'parentItemId')]),
        parentRevisionId: String(row[columnIndexOf(result.columns, 'parentRevisionId')]),
        lineNo: Number(row[columnIndexOf(result.columns, 'lineNo')]),
        occurrenceId: String(row[columnIndexOf(result.columns, 'occurrenceId')]),
        childItemId: String(row[columnIndexOf(result.columns, 'childItemId')]),
        qty: String(row[columnIndexOf(result.columns, 'qty')]),
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

/** 下钻一层：把前沿里每个父修订的已解析子件生成新节点。 */
const expandLevel = async (
  query: BomQueryExecutor['query'],
  dialect: BomSqlDialect,
  context: ResolutionContext,
  frontier: { nodeIndex: number; revisionId: string }[],
  nodes: readonly ExpansionNode[],
  budget: ResolvedBudgets,
  signal?: AbortSignal
): Promise<ExpandLevelStep> => {
  const revisionIds = [...new Set(frontier.map(entry => entry.revisionId))];
  const byParent = groupChildrenByParent(await fetchChildren(query, dialect, context, revisionIds));
  const added: ExpansionNode[] = [];
  const next: ExpandLevelStep['next'] = [];
  for (const entry of frontier) {
    for (const child of byParent.get(entry.revisionId) ?? []) {
      const parent = nodes[entry.nodeIndex];
      const reason = checkBudgets(nodes.length, added.length, parent.depth, budget, signal);
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
  signal?: AbortSignal
): Promise<UsageLevelStep> => {
  const itemIds = [...new Set(frontier.map(entry => entry.itemId))];
  const byChild = groupUsageByChild(await fetchParents(query, dialect, context, itemIds));
  const added: ExpansionNode[] = [];
  const next: UsageLevelStep['next'] = [];
  for (const entry of frontier) {
    for (const usage of byChild.get(entry.itemId) ?? []) {
      const parentDepth = entry.nodeIndex === null ? 0 : nodes[entry.nodeIndex].depth;
      const reason = checkBudgets(nodes.length, added.length, parentDepth, budget, signal);
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
 * @param context - 解析上下文（`asOfDate` 生效窗口、`bomType` / `orgId` 作用域；首轮不裁决备选，`alternativeNo` 不参与）
 * @param target - 展开目标（按时点选父修订，或显式修订）
 * @param options - 预算与取消信号
 * @returns BFS 序节点（根节点在首位）+ 截断标记
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
    let frontier: { nodeIndex: number; revisionId: string }[] = [{ nodeIndex: 0, revisionId: parentRevisionId }];
    while (frontier.length > 0) {
      const step = await expandLevel(query, dialect, context, frontier, nodes, budget, options.signal);
      nodes.push(...step.added);
      if (step.truncated !== null) {
        truncated = step.truncated;
        break;
      }
      frontier = step.next;
    }
    return { context, nodes, truncated };
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
    let frontier: { nodeIndex: number | null; itemId: string }[] = [{ nodeIndex: null, itemId: target.childItemId }];
    while (frontier.length > 0) {
      const step = await usageLevel(query, dialect, context, frontier, nodes, budget, options.signal);
      nodes.push(...step.added);
      if (step.truncated !== null) {
        truncated = step.truncated;
        break;
      }
      frontier = step.next;
    }
    return { context, nodes, truncated };
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
  if ('manifest' in result && result.manifest.unresolved.length > 0) {
    throw new BomResolutionError(
      'alternativeNo',
      '存在未裁决的备选：先选 alternativeNo 再交给数量 / 成本 / 导出消费方'
    );
  }
};
