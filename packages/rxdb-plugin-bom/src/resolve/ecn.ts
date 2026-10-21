/**
 * @fileoverview ECN 影响面与差异查询（US-515 AC#1/#2）
 *
 * 影响面：ECN 的成员发生项（`ecn_in_id` / `ecn_out_id` 引用本 ECN）归属的头 → 父物料，
 * 按 ECN 生效日（生效后的结构）在**该头自己的作用域** `(bom_type, org_id)` 内经 where-used 向上走到
 * 无父物料（整机），返回整机列表与命中路径。差异：按「生效日前一天」与「生效日」两个评估日对涉及的头
 * 各解析一次（作用域与备选号取该头自身），按逻辑行对齐对比——新增 / 删除（截止）/ 改量 / 改版（换子件）
 * 四类各就其位；涉及的逻辑行解析不出唯一发生项时差异无法判定，显式拒绝。全部 SQL 走方言占位符绑定。
 */

import { BomTruncationError } from '../types.js';
import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor, buildParentsOfItemsSql } from './bom-sql.js';
import { DEFAULT_EXPANSION_BUDGETS } from './expansion.js';
import {
  BomResolutionError,
  type BomType,
  type ResolutionContext,
  type ResolutionResult,
  type ResolvedLineOccurrence
} from './resolution.js';
import { resolveBom } from './resolver.js';

/** rawQuery 是接口的可选成员（部分适配器不声明）：缺失即显式拒绝，不静默降级；结果按列名取值。 */
const queryRecords = async (
  adapter: BomLocalAdapter,
  sql: string,
  params: unknown[] = []
): Promise<Record<string, unknown>[]> => {
  if (!adapter.rawQuery) throw new Error(`[rxdb-plugin-bom] 适配器 ${adapter.name} 缺少 rawQuery 读路径`);
  const dialect = bomSqlDialectFor(adapter.name);
  const result = (await adapter.rawQuery(
    sql,
    params.map(value => dialect.encode(value))
  )) as {
    columns: string[];
    rows: unknown[][];
  };
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
};

/** ECN 影响面结果（AC#1）：被改的父物料 + 按 where-used 走到顶的整机与路径。 */
export interface EcnImpactResult {
  ecnId: string;
  ecnNo: string;
  state: string;
  effectiveDate: Date;
  /** 被 ECN 改动的 BOM 的父物料（成员发生项归属头的父物料，去重）。 */
  affectedItemIds: string[];
  /** 顶层整机（在被改头的作用域内无父物料）与命中路径（行发生项 ID 序列，子件 → 整机；经不同路径到达各一条）。 */
  topItems: { itemId: string; paths: string[][] }[];
}

/** ECN 差异的一行（AC#2）：按逻辑行对齐的生效前后对比。 */
export interface EcnDiffEntry {
  kind: 'added' | 'removed' | 'qty_changed' | 'child_changed';
  lineId: string;
  lineNo: number;
  before: ResolvedLineOccurrence | null;
  after: ResolvedLineOccurrence | null;
}

/** ECN 差异结果（AC#2）。 */
export interface EcnDiffResult {
  ecnId: string;
  ecnNo: string;
  effectiveDate: Date;
  /** 涉及的每个头一份对比；按逻辑行对齐。 */
  headers: { headerId: string; entries: EcnDiffEntry[] }[];
}

/** ECN 行（影响面 / 差异的公共输入）。 */
interface EcnRow {
  id: string;
  ecnNo: string;
  state: string;
  effectiveDate: Date;
}

/** ECN 成员发生项归属的头：父修订 / 父物料，与该头的状态、作用域和备选号。 */
interface AffectedHeader {
  headerId: string;
  parentRevisionId: string;
  parentItemId: string;
  state: string;
  bomType: BomType;
  orgId: string;
  alternativeNo: number;
}

const readEcnRow = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnRow> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRecords(
    adapter,
    `SELECT "id", "ecnNo", "state", "effectiveDate" FROM ${dialect.table('ecn')} WHERE "id" = ${dialect.placeholder(0)}`,
    [ecnId]
  );
  if (rows.length === 0) throw new Error(`[rxdb-plugin-bom] ECN 不存在：${ecnId}`);
  const row = rows[0];
  return {
    id: String(row['id']),
    ecnNo: String(row['ecnNo']),
    state: String(row['state']),
    effectiveDate: row['effectiveDate'] instanceof Date ? row['effectiveDate'] : new Date(String(row['effectiveDate']))
  };
};

/** ECN 成员（发生项引入 / 截止、新建逻辑行）归属的头，带作用域（影响面 / 差异的起点）。 */
const affectedHeaders = async (adapter: BomLocalAdapter, ecnId: string): Promise<AffectedHeader[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const line = dialect.table('bom_line');
  const sql = [
    `SELECT h."id" AS "headerId", h."parentRevisionId" AS "parentRevisionId", r."itemId" AS "parentItemId",`,
    `  h."state" AS "state", h."bomType" AS "bomType", h."orgId" AS "orgId", h."alternativeNo" AS "alternativeNo"`,
    `FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"`,
    `WHERE EXISTS (SELECT 1 FROM ${line} l JOIN ${dialect.table('bom_line_occurrence')} occ ON occ."lineId" = l."id"`,
    `  WHERE l."headerId" = h."id" AND (occ."ecnInId" = ${dialect.placeholder(0)} OR occ."ecnOutId" = ${dialect.placeholder(1)}))`,
    `OR EXISTS (SELECT 1 FROM ${line} l WHERE l."headerId" = h."id" AND l."ecnInId" = ${dialect.placeholder(2)})`,
    `ORDER BY h."id"`
  ].join('\n');
  return (await queryRecords(adapter, sql, [ecnId, ecnId, ecnId])).map(row => ({
    headerId: String(row['headerId']),
    parentRevisionId: String(row['parentRevisionId']),
    parentItemId: String(row['parentItemId']),
    state: String(row['state']),
    bomType: String(row['bomType']) as BomType,
    orgId: String(row['orgId']),
    alternativeNo: Number(row['alternativeNo'])
  }));
};

/** 数组值 Map 的追加（缺键即建）。 */
const appendTo = <V>(map: Map<string, V[]>, key: string, values: V[]): void => {
  const list = map.get(key);
  if (list) list.push(...values);
  else map.set(key, [...values]);
};

/** 按作用域 `(bom_type, org_id)` 分组被改物料（同一物料在两个作用域里各算一次）。 */
const itemsByScope = (headers: AffectedHeader[]): { bomType: BomType; orgId: string; itemIds: string[] }[] => {
  const groups = new Map<string, { bomType: BomType; orgId: string; itemIds: string[] }>();
  for (const header of headers) {
    const key = JSON.stringify([header.bomType, header.orgId]);
    const group = groups.get(key) ?? { bomType: header.bomType, orgId: header.orgId, itemIds: [] };
    if (!group.itemIds.includes(header.parentItemId)) group.itemIds.push(header.parentItemId);
    groups.set(key, group);
  }
  return [...groups.values()];
};

/** 一层反查：前沿物料在作用域内的使用方（父物料 + 到达它的发生项）。 */
const parentsOf = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  itemIds: string[]
): Promise<Map<string, { parentItemId: string; occurrenceId: string }[]>> => {
  const built = buildParentsOfItemsSql(bomSqlDialectFor(adapter.name), {
    asOfDate: context.asOfDate,
    bomType: context.bomType,
    orgId: context.orgId,
    itemIds
  });
  const parents = new Map<string, { parentItemId: string; occurrenceId: string }[]>();
  for (const row of await queryRecords(adapter, built.sql, built.params)) {
    appendTo(parents, String(row['childItemId']), [
      { parentItemId: String(row['parentItemId']), occurrenceId: String(row['occurrenceId']) }
    ]);
  }
  return parents;
};

/** 反查前沿的一条路径：当前物料、到达它的命中路径（发生项 id，子件 → 整机序）与路径上的物料（判环用）。 */
interface ImpactPath {
  itemId: string;
  path: string[];
  items: ReadonlySet<string>;
}

/** 已生成的路径数（影响面路径预算的计数器）。 */
interface PathBudget {
  generated: number;
}

/**
 * 一条路径向上一跳（新路径追加进 `next`）：每个使用方各成一条新路径（钻石的每条路都保留）；
 * 回到本路径已有物料的边跳过——非 consume 流向不入存储层判环，反查可能成环。深度与路径数沿用
 * where-used 默认预算；影响面没有截断标记，触顶即拒绝，不把部分影响面当完整结果。
 */
const climb = (
  entry: ImpactPath,
  parents: readonly { parentItemId: string; occurrenceId: string }[],
  budget: PathBudget,
  next: ImpactPath[]
): void => {
  for (const parent of parents.filter(candidate => !entry.items.has(candidate.parentItemId))) {
    if (entry.path.length + 1 > DEFAULT_EXPANSION_BUDGETS.depth) throw new BomTruncationError('depth');
    budget.generated += 1;
    if (budget.generated > DEFAULT_EXPANSION_BUDGETS.paths) throw new BomTruncationError('paths');
    next.push({
      itemId: parent.parentItemId,
      path: [...entry.path, parent.occurrenceId],
      items: new Set([...entry.items, parent.parentItemId])
    });
  }
};

/**
 * 从被改物料在作用域内 where-used 逐层向上到无父物料（整机）；命中路径以「物料 → 父物料」逐跳
 * 追加到达父物料的发生项 id。按路径而非物料去重：同一整机经不同路径到达时每条路径各记一次。
 */
const topItemsOf = async (
  adapter: BomLocalAdapter,
  context: ResolutionContext,
  itemId: string
): Promise<Map<string, string[][]>> => {
  const top = new Map<string, string[][]>();
  const budget: PathBudget = { generated: 0 };
  let frontier: ImpactPath[] = [{ itemId, path: [], items: new Set([itemId]) }];
  while (frontier.length > 0) {
    const parentsByChild = await parentsOf(adapter, context, [...new Set(frontier.map(entry => entry.itemId))]);
    const next: ImpactPath[] = [];
    for (const entry of frontier) {
      const parents = parentsByChild.get(entry.itemId) ?? [];
      if (parents.length === 0) appendTo(top, entry.itemId, [entry.path]);
      climb(entry, parents, budget, next);
    }
    frontier = next;
  }
  return top;
};

/**
 * ECN 影响面（AC#1）：成员发生项的头物料按生效日、在该头自己的作用域内 where-used 走到顶的整机与路径。
 *
 * @throws {@link BomTruncationError} 命中路径超出 where-used 默认预算（深度 128 / 路径 100,000）
 */
export const ecnImpact = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnImpactResult> => {
  const ecn = await readEcnRow(adapter, ecnId);
  const headers = await affectedHeaders(adapter, ecnId);
  const top = new Map<string, string[][]>();
  for (const scope of itemsByScope(headers)) {
    const context: ResolutionContext = { bomType: scope.bomType, orgId: scope.orgId, asOfDate: ecn.effectiveDate };
    for (const itemId of scope.itemIds) {
      for (const [topItemId, paths] of await topItemsOf(adapter, context, itemId)) appendTo(top, topItemId, paths);
    }
  }
  return {
    ecnId: ecn.id,
    ecnNo: ecn.ecnNo,
    state: ecn.state,
    effectiveDate: ecn.effectiveDate,
    affectedItemIds: [...new Set(headers.map(header => header.parentItemId))],
    topItems: [...top.entries()].map(([itemId, paths]) => ({ itemId, paths }))
  };
};

/** 前一天（生效前评估日；不读系统时钟）。 */
const dayBefore = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - 1);
  return copy;
};

/** 未裁决的逻辑行 → 候选发生项集合（无逻辑行的未裁决记在空键下）。 */
const ambiguousLines = (result: ResolutionResult): Map<string, string> =>
  new Map(
    result.manifest.unresolved.map(entry => [
      entry.lineId ?? '',
      entry.candidates
        .map(candidate => candidate.occurrenceId ?? candidate.headerId)
        .sort()
        .join(',')
    ])
  );

/**
 * 差异可判定（M7）：逻辑行在两个评估日都解析不出唯一发生项、但候选集相同即未变，不入差异；
 * 候选集不同（含一侧唯一、一侧多候选）就是变了却无法按行对齐，拒绝并点名，不给出漏行的差异。
 */
const assertDiffable = (
  ecn: EcnRow,
  header: AffectedHeader,
  before: ResolutionResult,
  after: ResolutionResult
): void => {
  const beforeLines = ambiguousLines(before);
  const afterLines = ambiguousLines(after);
  for (const lineId of new Set([...beforeLines.keys(), ...afterLines.keys()])) {
    if (beforeLines.get(lineId) === afterLines.get(lineId)) continue;
    const entry = [...before.manifest.unresolved, ...after.manifest.unresolved].find(
      unresolved => (unresolved.lineId ?? '') === lineId
    );
    throw new BomResolutionError(
      entry?.reason ?? 'alternativeNo',
      `ECN ${ecn.ecnNo} 差异无法判定：头 ${header.headerId} 的逻辑行 ${lineId || '（备选）'} 在生效前后解析不出唯一发生项`
    );
  }
};

/**
 * ECN 差异（AC#2）：按生效前后两个评估日对涉及的已发布头各解析一次（作用域与备选号取该头自身），
 * 按逻辑行对齐。草稿头不入解析结果，没有生效前后之分，不列。
 */
export const ecnDiff = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnDiffResult> => {
  const ecn = await readEcnRow(adapter, ecnId);
  const diffHeaders: EcnDiffResult['headers'] = [];
  const released = (await affectedHeaders(adapter, ecnId)).filter(header => header.state === 'released');
  for (const header of released) {
    const scope = { bomType: header.bomType, orgId: header.orgId, alternativeNo: header.alternativeNo };
    const target = { parentRevisionId: header.parentRevisionId };
    const before = await resolveBom(adapter, { ...scope, asOfDate: dayBefore(ecn.effectiveDate) }, target);
    const after = await resolveBom(adapter, { ...scope, asOfDate: ecn.effectiveDate }, target);
    assertDiffable(ecn, header, before, after);
    diffHeaders.push({ headerId: header.headerId, entries: alignByLine(before, after) });
  }
  return { ecnId: ecn.id, ecnNo: ecn.ecnNo, effectiveDate: ecn.effectiveDate, headers: diffHeaders };
};

/** 按逻辑行对齐两个时点的行集：新增 / 删除 / 改量 / 改版。 */
const alignByLine = (before: ResolutionResult, after: ResolutionResult): EcnDiffEntry[] => {
  const beforeByLine = new Map<string, ResolvedLineOccurrence[]>();
  const afterByLine = new Map<string, ResolvedLineOccurrence[]>();
  for (const occurrence of before.occurrences) {
    const list = beforeByLine.get(occurrence.lineId) ?? [];
    list.push(occurrence);
    beforeByLine.set(occurrence.lineId, list);
  }
  for (const occurrence of after.occurrences) {
    const list = afterByLine.get(occurrence.lineId) ?? [];
    list.push(occurrence);
    afterByLine.set(occurrence.lineId, list);
  }
  const entries: EcnDiffEntry[] = [];
  const allLines = new Set([...beforeByLine.keys(), ...afterByLine.keys()]);
  for (const lineId of allLines) {
    const beforeRows = beforeByLine.get(lineId) ?? [];
    const afterRows = afterByLine.get(lineId) ?? [];
    const beforeRow = beforeRows[0] ?? null;
    const afterRow = afterRows[0] ?? null;
    const lineNo = afterRow?.lineNo ?? beforeRow?.lineNo ?? 0;
    if (beforeRows.length === 0) {
      entries.push({ kind: 'added', lineId, lineNo, before: null, after: afterRow });
    } else if (afterRows.length === 0) {
      entries.push({ kind: 'removed', lineId, lineNo, before: beforeRow, after: null });
    } else if (
      beforeRow?.childItemId !== afterRow?.childItemId ||
      beforeRow?.resolvedChildRevisionId !== afterRow?.resolvedChildRevisionId
    ) {
      entries.push({ kind: 'child_changed', lineId, lineNo, before: beforeRow, after: afterRow });
    } else if (beforeRow?.qty !== afterRow?.qty) {
      entries.push({ kind: 'qty_changed', lineId, lineNo, before: beforeRow, after: afterRow });
    }
  }
  return entries.sort((a, b) => a.lineNo - b.lineNo);
};
