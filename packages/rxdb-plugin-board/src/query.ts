import { firstValueFrom, from, type Observable } from 'rxjs';

/**
 * 查询辅助（US-534 / US-535 / US-536 共用）。
 *
 * @remarks
 * 门面仓储的 `find` 返回活查询 Observable（手动排序实体的默认排序
 * 由引擎补成「分组字段 asc, sortOrder asc, id asc」），executor 仓储的
 * `find` 返回 Promise；经 `from` 统一后，取首个快照即完成。
 */

/**
 * `field = value` 规则（泛型收窄字段与值类型）。
 * 值只收字符串：看板按列过滤的字段全是 UUID / 文本，出现按数字、布尔或日期列查询的调用方时再放宽。
 */
export const eq = <F extends string, V extends string>(field: F, value: V) => ({
  field,
  operator: '=' as const,
  value
});

/** `field IN [...]` 规则。 */
export const inRule = <F extends string, V extends string>(field: F, values: readonly V[]) => ({
  field,
  operator: 'in' as const,
  value: [...values]
});

/** 匹配全部行的空规则组。 */
export const matchAll = () => ({ combinator: 'and' as const, rules: [] });

/** 读取查询的首个快照，返回数组拷贝（门面活查询与 executor 仓储查询通用）。 */
export const readFirst = async <T>(query: Observable<readonly T[]> | Promise<T[]>): Promise<T[]> => {
  const result = await firstValueFrom(from(query));
  return [...result];
};

/**
 * 两组 id 作为集合是否相等（顺序与重复都不计）：删除清单与详情快照的复核共用同一判据。
 */
export const sameIdSet = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every(id => right.has(id));
};

/** `field = value` 规则组。 */
export const whereEq = <F extends string, V extends string>(field: F, value: V) => ({
  combinator: 'and' as const,
  rules: [eq(field, value)]
});
