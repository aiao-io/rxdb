/** @fileoverview 实例安装记录的历史展开与追溯，只读取实际事实。 */

import type { BomLocalAdapter } from './resolve/bom-adapter.js';
import { bomSqlDialectFor, type BomSqlDialect } from './resolve/bom-sql.js';
import { BomInstanceError } from './types.js';

/** 实例查询时点与预算；没有时点表示读取历史。 */
export interface BomInstanceQueryOptions {
  asOfDate?: Date;
  maxDepth?: number;
  maxNodes?: number;
}

/** 一次安装的实际事实，物料与修订名称来自实际修订。 */
export interface BomInstanceNodeView {
  id: string;
  itemRevisionId: string;
  itemId: string;
  itemNo: string;
  revisionNo: string;
  parentInstanceId: string | null;
  sourceOccurrenceId: string | null;
  serialNumber: string | null;
  lotCode: string | null;
  installedAt: Date;
  removedAt: Date | null;
}

/** 展开节点；路径包含根与自身的安装记录标识。 */
export interface BomInstanceTreeNode extends BomInstanceNodeView {
  depth: number;
  path: string[];
}

/** 按层稳定排序的实例树；预算不足时明确标记截断。 */
export interface BomInstanceTreeResult {
  rootId: string;
  nodes: BomInstanceTreeNode[];
  truncated: boolean;
}

/** 至少一个非空过滤条件；多个条件同时满足才匹配。 */
export interface BomInstanceTraceTarget {
  serialNumber?: string;
  lotCode?: string;
  itemRevisionId?: string;
}

/** 命中的安装记录、所属整机与根到命中的完整事实路径。 */
export interface BomInstanceTraceMatch {
  node: BomInstanceNodeView;
  root: BomInstanceNodeView;
  path: BomInstanceNodeView[];
}

/** 实例反查结果；路径未追到根时不产出不完整命中。 */
export interface BomInstanceTraceResult {
  matches: BomInstanceTraceMatch[];
  truncated: boolean;
}

interface ResolvedOptions {
  asOfDate?: Date;
  maxDepth: number;
  maxNodes: number;
}

interface QueryContext {
  query(sql: string, params?: unknown[]): Promise<{ columns: string[]; rows: unknown[][] }>;
  dialect: BomSqlDialect;
  options: ResolvedOptions;
}

type Predicate = (bind: (value: unknown) => string) => string;

const resolvedOptions = (options: BomInstanceQueryOptions): ResolvedOptions => {
  if (options === null || typeof options !== 'object') throw new BomInstanceError('查询选项必须是对象');
  const maxDepth = options.maxDepth ?? 64;
  const maxNodes = options.maxNodes ?? 10_000;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new BomInstanceError('maxDepth 必须是非负安全整数');
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new BomInstanceError('maxNodes 必须是正安全整数');
  if (
    options.asOfDate !== undefined &&
    (!(options.asOfDate instanceof Date) || Number.isNaN(options.asOfDate.getTime()))
  ) {
    throw new BomInstanceError('asOfDate 必须是有效日期');
  }
  return { asOfDate: options.asOfDate, maxDepth, maxNodes };
};

const textOrNull = (value: unknown): string | null => (value === null ? null : String(value));

const storedDate = (value: unknown): Date => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BomInstanceError(`存储的安装日期无效：${String(value)}`);
  return date;
};

const nodeView = (row: unknown[]): BomInstanceNodeView => ({
  id: String(row[0]),
  itemRevisionId: String(row[1]),
  itemId: String(row[2]),
  itemNo: String(row[3]),
  revisionNo: String(row[4]),
  parentInstanceId: textOrNull(row[5]),
  sourceOccurrenceId: textOrNull(row[6]),
  serialNumber: textOrNull(row[7]),
  lotCode: textOrNull(row[8]),
  installedAt: storedDate(row[9]),
  removedAt: row[10] === null ? null : storedDate(row[10])
});

const readNodes = async (
  context: QueryContext,
  predicate: Predicate,
  limit: number
): Promise<BomInstanceNodeView[]> => {
  const { dialect, options } = context;
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(dialect.encode(value));
    return dialect.placeholder(params.length - 1);
  };
  const filters = [predicate(bind)];
  if (options.asOfDate !== undefined) {
    filters.push(`n."installedAt" <= ${bind(options.asOfDate)}`);
    filters.push(`(n."removedAt" IS NULL OR n."removedAt" > ${bind(options.asOfDate)})`);
  }
  const sql = [
    `SELECT n."id", n."itemRevisionId", r."itemId", i."itemNo", r."revisionNo",`,
    `n."parentInstanceId", n."sourceOccurrenceId", n."serialNumber", n."lotCode", n."installedAt", n."removedAt"`,
    `FROM ${dialect.table('bom_instance_node')} n`,
    `JOIN ${dialect.table('item_revision')} r ON r."id" = n."itemRevisionId"`,
    `JOIN ${dialect.table('item')} i ON i."id" = r."itemId"`,
    `WHERE ${filters.join(' AND ')}`,
    `ORDER BY n."installedAt" ASC, n."id" ASC LIMIT ${bind(limit)}`
  ].join('\n');
  return (await context.query(sql, params)).rows.map(nodeView);
};

const readNode = async (context: QueryContext, id: string): Promise<BomInstanceNodeView | undefined> =>
  (await readNodes(context, bind => `n."id" = ${bind(id)}`, 1))[0];

const readChildren = async (
  context: QueryContext,
  parents: string[],
  limit: number
): Promise<BomInstanceNodeView[]> => {
  const rows: BomInstanceNodeView[] = [];
  for (let offset = 0; offset < parents.length && rows.length < limit; offset += 200) {
    const chunk = parents.slice(offset, offset + 200);
    rows.push(
      ...(await readNodes(
        context,
        bind => `n."parentInstanceId" IN (${chunk.map(id => bind(id)).join(', ')})`,
        limit - rows.length
      ))
    );
  }
  return rows;
};

const treeEntry = (child: BomInstanceNodeView, indexed: Map<string, BomInstanceTreeNode>): BomInstanceTreeNode => {
  if (indexed.has(child.id)) throw new BomInstanceError(`实例图成环：${child.id}`);
  const parent = indexed.get(child.parentInstanceId as string);
  if (parent === undefined) throw new BomInstanceError(`父实例缺失：${child.parentInstanceId}`);
  return { ...child, depth: parent.depth + 1, path: [...parent.path, child.id] };
};

/**
 * 展开实例安装树；无时点查历史，有时点按装拆半开区间过滤整条路径。
 *
 * @param adapter - 本地适配器，全部读取位于同一快照
 * @param rootId - 根安装记录标识
 * @param options - 时点与深度、节点预算
 * @returns 稳定排序的事实节点与显式截断标记
 */
export const expandInstance = async (
  adapter: BomLocalAdapter,
  rootId: string,
  options: BomInstanceQueryOptions = {}
): Promise<BomInstanceTreeResult> => {
  const resolved = resolvedOptions(options);
  if (typeof rootId !== 'string' || rootId.trim().length === 0) throw new BomInstanceError('根实例标识不能为空');
  const dialect = bomSqlDialectFor(adapter.name);
  return adapter.transaction(async executor => {
    const context: QueryContext = { query: executor.query.bind(executor), dialect, options: resolved };
    const root = await readNode(context, rootId);
    const nodes: BomInstanceTreeNode[] = root === undefined ? [] : [{ ...root, depth: 0, path: [root.id] }];
    const indexed = new Map(nodes.map(value => [value.id, value]));
    let frontier = nodes.slice();
    while (frontier.length > 0) {
      const remaining = resolved.maxNodes - nodes.length;
      const atDepthLimit = frontier[0].depth >= resolved.maxDepth;
      const children = await readChildren(
        context,
        frontier.map(value => value.id),
        atDepthLimit ? 1 : remaining + 1
      );
      if (atDepthLimit) return { rootId, nodes, truncated: children.length > 0 };
      const next: BomInstanceTreeNode[] = [];
      for (const child of children.slice(0, remaining)) {
        const entry = treeEntry(child, indexed);
        nodes.push(entry);
        indexed.set(entry.id, entry);
        next.push(entry);
      }
      if (children.length > remaining) return { rootId, nodes, truncated: true };
      frontier = next;
    }
    return { rootId, nodes, truncated: false };
  }, false);
};

const traceFilters = (target: BomInstanceTraceTarget): [keyof BomInstanceTraceTarget, string][] => {
  if (target === null || typeof target !== 'object' || Array.isArray(target))
    throw new BomInstanceError('反查目标必须是对象');
  const filters: [keyof BomInstanceTraceTarget, string][] = [];
  for (const field of ['serialNumber', 'lotCode', 'itemRevisionId'] as const) {
    const value = target[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length === 0)
      throw new BomInstanceError(`反查条件 ${field} 不能为空`);
    filters.push([field, value]);
  }
  if (filters.length === 0) throw new BomInstanceError('反查至少需要一个非空目标');
  return filters;
};

interface TraceContext {
  query: QueryContext;
  loaded: Map<string, BomInstanceNodeView>;
  visited: Set<string>;
  truncated: boolean;
}

const readParent = async (context: TraceContext, id: string): Promise<BomInstanceNodeView | undefined> => {
  const cached = context.loaded.get(id);
  if (cached !== undefined) return cached;
  if (context.visited.size >= context.query.options.maxNodes) {
    context.truncated = true;
    return undefined;
  }
  const parent = await readNode(context.query, id);
  if (parent !== undefined) context.loaded.set(id, parent);
  return parent;
};

const tracePath = async (
  context: TraceContext,
  node: BomInstanceNodeView
): Promise<BomInstanceNodeView[] | undefined> => {
  const path: BomInstanceNodeView[] = [];
  const inPath = new Set<string>();
  let current: BomInstanceNodeView | undefined = node;
  while (current !== undefined) {
    if (inPath.has(current.id)) throw new BomInstanceError(`实例图成环：${current.id}`);
    if (!context.visited.has(current.id) && context.visited.size >= context.query.options.maxNodes) {
      context.truncated = true;
      return undefined;
    }
    context.visited.add(current.id);
    inPath.add(current.id);
    path.push(current);
    if (current.parentInstanceId === null) return path.reverse();
    if (path.length - 1 >= context.query.options.maxDepth) {
      context.truncated = true;
      return undefined;
    }
    current = await readParent(context, current.parentInstanceId);
  }
  return undefined;
};

/**
 * 按实际序列号、批次或实际修订反查完整祖先路径；组合条件按 AND 匹配。
 *
 * @param adapter - 本地适配器，命中与路径读取共享一个快照
 * @param target - 至少一个非空精确匹配条件
 * @param options - 时点与路径、节点预算
 * @returns 命中事实、顶层根与完整路径，预算不足显式截断
 */
export const whereUsedInstance = async (
  adapter: BomLocalAdapter,
  target: BomInstanceTraceTarget,
  options: BomInstanceQueryOptions = {}
): Promise<BomInstanceTraceResult> => {
  const resolved = resolvedOptions(options);
  const filters = traceFilters(target);
  const dialect = bomSqlDialectFor(adapter.name);
  return adapter.transaction(async executor => {
    const query: QueryContext = { query: executor.query.bind(executor), dialect, options: resolved };
    const candidates = await readNodes(
      query,
      bind => filters.map(([field, value]) => `n."${field}" = ${bind(value)}`).join(' AND '),
      resolved.maxNodes + 1
    );
    const context: TraceContext = {
      query,
      loaded: new Map(candidates.map(value => [value.id, value])),
      visited: new Set(),
      truncated: candidates.length > resolved.maxNodes
    };
    const matches: BomInstanceTraceMatch[] = [];
    for (const node of candidates.slice(0, resolved.maxNodes)) {
      const path = await tracePath(context, node);
      if (path !== undefined) matches.push({ node, root: path[0], path });
    }
    return { matches, truncated: context.truncated };
  }, false);
};
