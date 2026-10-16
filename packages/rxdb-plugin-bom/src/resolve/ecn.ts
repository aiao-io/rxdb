/**
 * @fileoverview ECN 影响面与差异查询（US-515 AC#1/#2）
 *
 * 影响面：ECN 的成员发生项（`ecn_in_id` / `ecn_out_id` 引用本 ECN）归属的头 → 父物料，
 * 按 ECN 生效日（生效后的结构）经 where-used 向上走到无父物料（整机），返回整机列表
 * 与命中路径。差异：按「生效日前一天」与「生效日」两个评估日对涉及的头各解析一次，
 * 按逻辑行对齐对比——新增 / 删除（截止）/ 改量 / 改版（换子件）四类各就其位。
 */

import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor, buildParentsOfItemsSql } from './bom-sql.js';
import type { ResolutionContext, ResolutionResult, ResolvedLineOccurrence } from './resolution.js';
import { resolveBom } from './resolver.js';

/** rawQuery 是接口的可选成员（部分适配器不声明）：缺失即显式拒绝，不静默降级。 */
const rawQuery = async (adapter: BomLocalAdapter, sql: string, params?: unknown[]): Promise<unknown> => {
  if (!adapter.rawQuery) throw new Error(`[rxdb-plugin-bom] 适配器 ${adapter.name} 缺少 rawQuery 读路径`);
  return adapter.rawQuery(sql, params);
};

/** ECN 影响面结果（AC#1）：被改的父物料 + 按 where-used 走到顶的整机与路径。 */
export interface EcnImpactResult {
  ecnId: string;
  ecnNo: string;
  state: string;
  effectiveDate: Date;
  /** 被 ECN 改动的 BOM 的父物料（成员发生项归属头的父物料，去重）。 */
  affectedItemIds: string[];
  /** 顶层整机（无父物料）与命中路径（行发生项 ID 序列）。 */
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

const readEcnRow = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnRow> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const ecnTable = dialect.table('ecn');
  const result = await rawQuery(
    adapter,
    `SELECT "id", "ecnNo", "state", "effectiveDate" FROM ${ecnTable} WHERE "id" = '${ecnId}'`
  );
  const shape = result as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
  const rows = 'results' in shape ? shape.results[0].rows : shape.rows;
  if (rows.length === 0) throw new Error(`[rxdb-plugin-bom] ECN 不存在：${ecnId}`);
  return {
    id: String(rows[0][0]),
    ecnNo: String(rows[0][1]),
    state: String(rows[0][2]),
    effectiveDate: new Date(String(rows[0][3]))
  };
};

/** ECN 成员发生项归属头的父修订集合（影响面 / 差异的起点）。 */
const affectedParentRevisions = async (
  adapter: BomLocalAdapter,
  ecnId: string
): Promise<{ headerId: string; parentRevisionId: string }[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const sql = [
    `SELECT DISTINCT h."id" AS "headerId", h."parentRevisionId" AS "parentRevisionId"`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `WHERE occ."ecnInId" = '${ecnId}' OR occ."ecnOutId" = '${ecnId}'`,
    `UNION`,
    `SELECT DISTINCT h."id" AS "headerId", h."parentRevisionId" AS "parentRevisionId"`,
    `FROM ${line} l JOIN ${header} h ON h."id" = l."headerId"`,
    `WHERE l."ecnInId" = '${ecnId}'`,
    `ORDER BY "headerId"`
  ].join('\n');
  const result = (await rawQuery(adapter, sql)) as unknown as
    { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
  const rows = 'results' in result ? result.results[0].rows : result.rows;
  return rows.map(row => ({ headerId: String(row[0]), parentRevisionId: String(row[1]) }));
};

/**
 * ECN 影响面（AC#1）：成员发生项的头物料按生效日 where-used 走到顶的整机与路径。
 */
export const ecnImpact = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnImpactResult> => {
  const ecn = await readEcnRow(adapter, ecnId);
  const dialect = bomSqlDialectFor(adapter.name);
  const headers = await affectedParentRevisions(adapter, ecnId);
  const affectedItemIds: string[] = [];
  const affectedRevisions: string[] = [];
  for (const { parentRevisionId } of headers) {
    if (affectedRevisions.includes(parentRevisionId)) continue;
    affectedRevisions.push(parentRevisionId);
    const revision = dialect.table('item_revision');
    const row = (await rawQuery(
      adapter,
      `SELECT "itemId" FROM ${revision} WHERE "id" = '${parentRevisionId}'`
    )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
    const rows = 'results' in row ? row.results[0].rows : row.rows;
    if (rows.length > 0) affectedItemIds.push(String(rows[0][0]));
  }
  // 从被改物料出发，where-used 逐层向上到无父物料；命中路径以物料 → 父物料逐层收集
  const context: ResolutionContext = {
    bomType: 'ebom',
    orgId: 'org-x',
    asOfDate: ecn.effectiveDate
  };
  const top = new Map<string, string[][]>();
  // 每个被改物料独立 where-used 一遍（其向上闭包合并到顶层集合）
  for (const itemId of affectedItemIds) {
    let frontier: { itemId: string; path: string[] }[] = [{ itemId, path: [] }];
    const seen = new Set<string>([itemId]);
    while (frontier.length > 0) {
      const next: { itemId: string; path: string[] }[] = [];
      const sql = buildParentsOfItemsSql(dialect, {
        asOfDate: context.asOfDate,
        bomType: context.bomType,
        orgId: context.orgId,
        itemIds: frontier.map(f => f.itemId)
      });
      const result = (await rawQuery(adapter, sql.sql, sql.params)) as unknown as { rows: unknown[][] };
      const parentsByChild = new Map<string, { itemId: string; path: string[] }[]>();
      for (const row of result.rows) {
        const childItemId = String(row[5]);
        const parentItemId = String(row[0]);
        const occurrenceId = String(row[4]);
        const path = frontier.find(f => f.itemId === childItemId)?.path ?? [];
        const list = parentsByChild.get(childItemId) ?? [];
        list.push({ itemId: parentItemId, path: [...path, occurrenceId] });
        parentsByChild.set(childItemId, list);
      }
      for (const f of frontier) {
        const parents = parentsByChild.get(f.itemId) ?? [];
        if (parents.length === 0) {
          // 无父物料 = 顶层整机
          const paths = top.get(f.itemId) ?? [];
          paths.push(f.path);
          top.set(f.itemId, paths);
          continue;
        }
        for (const parent of parents) {
          if (seen.has(parent.itemId)) continue;
          seen.add(parent.itemId);
          next.push(parent);
        }
      }
      frontier = next;
    }
  }
  return {
    ecnId: ecn.id,
    ecnNo: ecn.ecnNo,
    state: ecn.state,
    effectiveDate: ecn.effectiveDate,
    affectedItemIds,
    topItems: [...top.entries()].map(([itemId, paths]) => ({ itemId, paths }))
  };
};

/** 前一天（生效前评估日；不读系统时钟）。 */
const dayBefore = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - 1);
  return copy;
};

/**
 * ECN 差异（AC#2）：按生效前后两个评估日对涉及的头各解析一次，按逻辑行对齐。
 */
export const ecnDiff = async (adapter: BomLocalAdapter, ecnId: string): Promise<EcnDiffResult> => {
  const ecn = await readEcnRow(adapter, ecnId);
  const headers = await affectedParentRevisions(adapter, ecnId);
  const base = { bomType: 'ebom' as const, orgId: 'org-x' as const };
  const diffHeaders: EcnDiffResult['headers'] = [];
  for (const { headerId, parentRevisionId } of headers) {
    const before = await resolveBom(adapter, { ...base, asOfDate: dayBefore(ecn.effectiveDate) }, { parentRevisionId });
    const after = await resolveBom(adapter, { ...base, asOfDate: ecn.effectiveDate }, { parentRevisionId });
    diffHeaders.push({ headerId, entries: alignByLine(before, after) });
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
