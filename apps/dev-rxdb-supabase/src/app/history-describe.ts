import type { HistoryItem, RxDBChange } from '@aiao/rxdb';
import { entityLabelOf } from './entity-labels';

const OPERATION_LABELS: Readonly<Record<RxDBChange['type'], string>> = {
  INSERT: '新建',
  UPDATE: '修改',
  DELETE: '删除'
};

/**
 * 一条变更的说法
 *
 * @param change - 变更
 * @returns 「操作 + 实体的中文叫法」，如「新建客户」
 */
export function describeChange(change: Pick<RxDBChange, 'type' | 'entity'>): string {
  return `${OPERATION_LABELS[change.type]}${entityLabelOf(change.entity).name}`;
}

/**
 * 一个历史项的说法
 *
 * @param item - 操作历史或待推送清单里的一项
 * @returns 一条变更直接说它；一个事务列出前三条，其余写「等 N 条」
 */
export function describeHistoryItem(item: Pick<HistoryItem, 'changes'>): string {
  const [first, ...rest] = item.changes;
  if (!first) return '空的事务';
  if (rest.length === 0) return describeChange(first);
  const shown = item.changes.slice(0, 3).map(describeChange).join('、');
  const more = item.changes.length > 3 ? ` 等 ${item.changes.length} 条` : '';
  return `一次写入：${shown}${more}`;
}

/**
 * 历史项所在的页面
 *
 * @param item - 历史项
 * @returns 第一条变更的实体所在的页面
 */
export function pageOfHistoryItem(item: Pick<HistoryItem, 'changes'>): string {
  const [first] = item.changes;
  return first ? entityLabelOf(first.entity).page : '其他';
}
