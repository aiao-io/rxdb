/**
 * @fileoverview 环错误的 union_only 补充标记（US-509 AC#9）
 *
 * 触发器只回答「并集里能不能到」，报同一个环错误码与路径；插件在 API 层接住错误后，
 * 读路径上各条边（物料对）的发生项区间，路径上不存在所有边同时生效的时点即附 `unionOnly`。
 * 区间与判环触发器读同一张图：被拒写入所在头的 `(bom_type, org_id)` 作用域内的 consume 发生项
 * （排除被拒写入自身——UPDATE 时它的旧值仍在表里），闭合边的区间并集恒含被拒写入本身。
 * 它只解释被报告的那条路径——并集里可能还有别的环，不在本故事。直连 SQL 被拒时只有
 * 错误码与路径，没有这个标记（有意的）。
 */

import type { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { BomCycleError } from '../types.js';
import { bomSqlDialectFor, type BomSqlDialect } from './bom-sql.js';

/** 一条边的发生项区间集合（半开 `[from, to)`，端点 NULL 无界）。 */
interface EffectiveInterval {
  from: number | null;
  to: number | null;
}

/** 被拒的发生项写入：所在逻辑行（定作用域）、自身 id（UPDATE 时排除旧值）与尝试写入的区间。 */
export interface AttemptedOccurrence extends EffectiveInterval {
  lineId: string;
  id?: string;
}

/** 判环作用域：被拒写入所在头的类型与组织。 */
interface CycleScope {
  bomType: string;
  orgId: string;
}

/** 绑定参数的直连读（结果两形状归一）。 */
type ReadRows = (sql: string, params: unknown[]) => Promise<{ columns: string[]; rows: unknown[][] }>;

/** 区间是否相交（NULL 无界）。 */
const overlaps = (a: EffectiveInterval, b: EffectiveInterval): boolean =>
  (a.to === null || b.from === null || a.to > b.from) && (b.to === null || a.from === null || b.to > a.from);

/** 区间列表的并集（合并相交区间后取交集用）。 */
const merged = (intervals: EffectiveInterval[]): EffectiveInterval[] => {
  const sorted = [...intervals].sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
  const result: EffectiveInterval[] = [];
  for (const interval of sorted) {
    const last = result[result.length - 1];
    if (last && overlaps(last, interval)) {
      last.to = last.to === null || interval.to === null ? null : Math.max(last.to, interval.to);
    } else {
      result.push({ ...interval });
    }
  }
  return result;
};

/** 两条并集区间列表的交集（每对相交区间取最大下界与最小上界）。 */
const intersection = (left: EffectiveInterval[], right: EffectiveInterval[]): EffectiveInterval[] =>
  merged(
    left.flatMap(a =>
      right
        .filter(b => overlaps(a, b))
        .map(b => {
          const from = Math.max(a.from ?? -Infinity, b.from ?? -Infinity);
          const to = Math.min(a.to ?? Infinity, b.to ?? Infinity);
          return { from: from === -Infinity ? null : from, to: to === Infinity ? null : to };
        })
    )
  );

/** 被拒写入所在头的作用域；读不到（逻辑行不存在）为 null。 */
const readScope = async (read: ReadRows, dialect: BomSqlDialect, lineId: string): Promise<CycleScope | null> => {
  const { rows } = await read(
    `SELECT h."bomType", h."orgId" FROM ${dialect.table('bom_line')} l JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId" WHERE l."id" = ${dialect.placeholder(0)}`,
    [lineId]
  );
  return rows[0] === undefined ? null : { bomType: String(rows[0][0]), orgId: String(rows[0][1]) };
};

/** 读一条物料边在作用域内的 consume 发生项区间（并集图口径：不过滤头状态与日期，排除被拒写入自身）。 */
const readEdgeIntervals = async (
  read: ReadRows,
  dialect: BomSqlDialect,
  scope: CycleScope,
  edge: { parentItemId: string; childItemId: string },
  excludedId: string | undefined
): Promise<EffectiveInterval[]> => {
  const sql = [
    `SELECT occ."effectiveFrom" AS "from", occ."effectiveTo" AS "to"`,
    `FROM ${dialect.table('bom_line_occurrence')} occ JOIN ${dialect.table('bom_line')} l ON l."id" = occ."lineId"`,
    `JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId" JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"`,
    `WHERE r."itemId" = ${dialect.placeholder(0)} AND occ."childItemId" = ${dialect.placeholder(1)}`,
    `  AND h."bomType" = ${dialect.placeholder(2)} AND h."orgId" = ${dialect.placeholder(3)} AND occ."flowDirection" = 'consume'`,
    ...(excludedId === undefined ? [] : [`  AND occ."id" <> ${dialect.placeholder(4)}`])
  ].join('\n');
  const params = [edge.parentItemId, edge.childItemId, scope.bomType, scope.orgId];
  const { columns, rows } = await read(sql, excludedId === undefined ? params : [...params, excludedId]);
  const fromIndex = columns.indexOf('from');
  const toIndex = columns.indexOf('to');
  return rows.map(row => ({
    from: row[fromIndex] === null ? null : new Date(String(row[fromIndex])).getTime(),
    to: row[toIndex] === null ? null : new Date(String(row[toIndex])).getTime()
  }));
};

/**
 * 给 {@link BomCycleError} 附 `unionOnly` 标记：路径上不存在所有边同时生效的时点。
 *
 * @param rxdb - RxDB 实例（经 localAdapter$ 取本地适配器）
 * @param error - 已归一的环错误
 * @param attempted - 被拒的发生项写入（闭合边未落库，其生效区间取尝试写入的值）
 * @returns 附标记后的环错误（`unionOnly` 命中时是新实例）；自环、缺被拒写入或读不到作用域时原样返回
 */
export const attachUnionOnlyMark = async (
  rxdb: RxDB,
  error: BomCycleError,
  attempted?: AttemptedOccurrence
): Promise<BomCycleError> => {
  if (error.path.length < 2 || attempted === undefined) return error;
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  // rawQuery 在接口上可选：本地适配器必有；缺席即读不到区间，不标 unionOnly
  const rawQuery = adapter.rawQuery?.bind(adapter);
  if (rawQuery === undefined) return error;
  const dialect = bomSqlDialectFor(adapter.name);
  const read: ReadRows = async (sql, params) => {
    const result = (await rawQuery(
      sql,
      params.map(value => dialect.encode(value))
    )) as { columns: string[]; rows: unknown[][] } | { results: { columns: string[]; rows: unknown[][] }[] };
    return 'results' in result ? result.results[0] : result;
  };
  const scope = await readScope(read, dialect, attempted.lineId);
  if (scope === null) return error;
  // 环路径上每条边的并集区间；闭合边（最后一段）恒并入被拒写入的区间
  const edgeUnions: EffectiveInterval[][] = [];
  for (let index = 0; index < error.path.length; index++) {
    const edge = { parentItemId: error.path[index], childItemId: error.path[(index + 1) % error.path.length] };
    const stored = await readEdgeIntervals(read, dialect, scope, edge, attempted.id);
    const closing = index === error.path.length - 1 ? [{ from: attempted.from, to: attempted.to }] : [];
    const intervals = [...stored, ...closing];
    // 其余边在作用域内无存储记录（触发器的见证边不会如此）即无法证明互斥，按无界处理
    edgeUnions.push(intervals.length === 0 ? [{ from: null, to: null }] : merged(intervals));
  }
  // 全部边依次求交集：任一交集为空即不存在共同生效时点（unionOnly 是只读字段：命中时返回新实例）
  let common = edgeUnions[0];
  for (const union of edgeUnions.slice(1)) {
    common = intersection(common, union);
    if (common.length === 0) return new BomCycleError(error.path, true);
  }
  return error;
};
