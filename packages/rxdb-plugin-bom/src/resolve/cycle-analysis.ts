/**
 * @fileoverview 环错误的 union_only 补充标记（US-509 AC#9）
 *
 * 触发器只回答「并集里能不能到」，报同一个环错误码与路径；插件在 API 层接住错误后，
 * 读路径上各条边（物料对）的发生项区间，路径上不存在所有边同时生效的时点即附 `unionOnly`。
 * 它只解释被报告的那条路径——并集里可能还有别的环，不在本故事。直连 SQL 被拒时只有
 * 错误码与路径，没有这个标记（有意的）。
 */

import { firstValueFrom } from 'rxjs';
import type { RxDB } from '@aiao/rxdb';
import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor } from './bom-sql.js';
import { BomCycleError } from '../types.js';

/** 一条边的发生项区间集合（半开 `[from, to)`，端点 NULL 无界）。 */
interface EffectiveInterval {
  from: number | null;
  to: number | null;
}

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

/** 两条并集区间列表是否相交（存在共同生效时点）。 */
const unionIntersects = (a: EffectiveInterval[], b: EffectiveInterval[]): boolean =>
  a.some(x => b.some(y => overlaps(x, y)));

/** 读一条物料边的发生项区间（并集图口径：不过滤头状态与日期）。 */
const readEdgeIntervals = async (
  adapter: BomLocalAdapter,
  parentItemId: string,
  childItemId: string
): Promise<EffectiveInterval[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const revision = dialect.table('item_revision');
  const sql = [
    `SELECT occ."effectiveFrom" AS "from", occ."effectiveTo" AS "to"`,
    `FROM ${occurrence} occ JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId" JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `WHERE r."itemId" = ${dialect.placeholder(0)} AND occ."childItemId" = ${dialect.placeholder(1)}`
  ].join('\n');
  // rawQuery 在接口上可选：本地适配器必有；缺席按无界处理（读不到区间就不标 unionOnly）
  if (!adapter.rawQuery) return [{ from: null, to: null }];
  const result = (await adapter.rawQuery(sql, [
    dialect.encode(parentItemId),
    dialect.encode(childItemId)
  ])) as { columns: string[]; rows: unknown[][] } | { results: { columns: string[]; rows: unknown[][] }[] };
  const shape = 'results' in result ? result.results[0] : result;
  const fromIndex = shape?.columns.indexOf('from') ?? -1;
  const toIndex = shape?.columns.indexOf('to') ?? -1;
  return (shape?.rows ?? []).map(row => ({
    from: row[fromIndex] === null ? null : new Date(String(row[fromIndex])).getTime(),
    to: row[toIndex] === null ? null : new Date(String(row[toIndex])).getTime()
  }));
};

/**
 * 给 {@link BomCycleError} 附 `unionOnly` 标记：路径上不存在所有边同时生效的时点。
 *
 * @param rxdb - RxDB 实例（经 localAdapter$ 取本地适配器）
 * @param error - 已归一的环错误
 * @param attempted - 被拒写入的区间（闭合边未落库，其生效区间取尝试写入的值）
 * @returns 附标记后的环错误（`unionOnly` 命中时是新实例）；自环或读取失败时原样返回
 */
export const attachUnionOnlyMark = async (
  rxdb: RxDB,
  error: BomCycleError,
  attempted?: EffectiveInterval
): Promise<BomCycleError> => {
  if (error.path.length < 2) return error;
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  // 环路径上每条边的并集区间
  const edgeUnions: EffectiveInterval[][] = [];
  for (let index = 0; index < error.path.length; index++) {
    const parent = error.path[index];
    const child = error.path[(index + 1) % error.path.length];
    const stored = merged(await readEdgeIntervals(adapter, parent, child));
    // 闭合边（最后一段）未落库时用尝试写入的区间；其余边无存储记录即整段缺失，按无界处理
    if (stored.length === 0 && index === error.path.length - 1 && attempted) {
      edgeUnions.push([attempted]);
    } else if (stored.length === 0) {
      edgeUnions.push([{ from: null, to: null }]);
    } else {
      edgeUnions.push(stored);
    }
  }
  // 全部边依次求交集：任一交集为空即不存在共同生效时点
  let common = edgeUnions[0];
  for (let index = 1; index < edgeUnions.length; index++) {
    if (!unionIntersects(common, edgeUnions[index])) {
      // unionOnly 是只读字段：命中时返回新实例
      return new BomCycleError(error.path, true);
    }
    // 收缩交集（取每对相交区间的最大下界与最小上界）
    const narrowed: EffectiveInterval[] = [];
    for (const a of common) {
      for (const b of edgeUnions[index]) {
        if (!overlaps(a, b)) continue;
        const from = Math.max(a.from ?? -Infinity, b.from ?? -Infinity);
        const to = Math.min(a.to ?? Infinity, b.to ?? Infinity);
        narrowed.push({
          from: from === -Infinity ? null : from,
          to: to === Infinity ? null : to
        });
      }
    }
    common = merged(narrowed);
  }
  return error;
};
