import type { FindOptions, RuleGroup } from '@aiao/rxdb';
import type { LocalImageWork } from './browser-media';

/** 本机图片作品的元数据筛选与 SQL 分页参数。 */
export interface LocalWorkQuery {
  search?: string;
  model?: string;
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}
export type LocalWorkFilters = Pick<LocalWorkQuery, 'search' | 'model' | 'from' | 'to'>;

function localDay(value: string | undefined): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) throw new Error('作品日期必须使用有效的 YYYY-MM-DD 格式。');
  const [year, month, day] = parts.slice(1).map(Number),
    date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (year < 1 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    throw new Error('作品日期不是有效的本地日历日。');
  return date;
}

/** 筛选条件由页查询和原生计数共用；日期终点采用本地次日零点。 */
export function libraryWhere(filters: LocalWorkFilters = {}): RuleGroup<LocalImageWork> {
  const from = localDay(filters.from),
    to = localDay(filters.to);
  if (from && to && from.getTime() > to.getTime()) throw new Error('作品起始日期不能晚于结束日期。');
  const rules: RuleGroup<LocalImageWork>['rules'] = [{ field: 'stage', operator: 'in', value: ['ready', 'broken'] }];
  const search = filters.search?.trim(),
    model = filters.model?.trim();
  if (search) rules.push({ field: 'prompt', operator: 'contains', value: search });
  if (model) rules.push({ field: 'modelId', operator: 'contains', value: model });
  if (from) rules.push({ field: 'createdAt', operator: '>=', value: from });
  if (to) {
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);
    rules.push({ field: 'createdAt', operator: '<', value: to });
  }
  return { combinator: 'and', rules };
}

/** 将显式页查询交给原生仓库执行，保留唯一 ID 作为排序终点。 */
export function libraryQuery(query: LocalWorkQuery): FindOptions<typeof LocalImageWork> {
  const limit = query.limit === undefined ? 24 : query.limit,
    offset = query.offset === undefined ? 0 : query.offset;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0)
    throw new Error('作品分页参数必须是有效整数，页大小大于零且偏移量不能为负。');
  return {
    where: libraryWhere(query),
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ],
    limit,
    offset
  };
}
