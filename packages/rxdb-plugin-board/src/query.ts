import { firstValueFrom, type Observable } from 'rxjs';

/**
 * 查询辅助（US-526 / US-527 / US-528 共用）。
 *
 * @remarks
 * 门面仓储的 `find` 返回活查询 Observable（手动排序实体的默认排序
 * 由引擎补成「分组字段 asc, sortOrder asc, id asc」），executor 仓储的
 * `find` 返回 Promise；`firstValueFrom` 对两者通用，取首个快照后即完成。
 */

/** `field = value` 规则。 */
export const eq = (field: string, value: string) => ({ field, operator: '=' as const, value });

/** `field IN [...]` 规则。 */
export const inRule = (field: string, values: readonly string[]) => ({ field, operator: 'in' as const, value: [...values] });

/** 匹配全部行的空规则组。 */
export const matchAll = () => ({ combinator: 'and' as const, rules: [] });

/** 读取查询的首个快照，返回数组拷贝（门面活查询与 executor 仓储查询通用）。 */
export const readFirst = async <T>(query: Observable<readonly T[]> | Promise<T[]>): Promise<T[]> => [
  ...(await firstValueFrom(query))
];

/** `field = value` 规则组。 */
export const whereEq = (field: string, value: string) => ({ combinator: 'and' as const, rules: [eq(field, value)] });
