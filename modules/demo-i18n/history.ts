import type { HistoryItem } from '@aiao/rxdb';
import type { I18n, MessageCatalog } from '@aiao/rxdb-i18n';

export const historyZhMessages = {
  'history.open': '历史记录',
  'history.title': '操作历史',
  'history.close': '关闭历史',
  'history.empty': '暂无操作历史',
  'history.database': '数据库',
  'history.repository': '仓库',
  'history.entity': '实体',
  'history.undone': '已撤销',
  'history.invalidated': '已失效',
  'history.INSERT': '创建 {entity}',
  'history.UPDATE': '更新 {entity}',
  'history.DELETE': '删除 {entity}',
  'history.TRANSACTION': '事务: {summary}',
  'history.insertCount': '创建{count, number}条',
  'history.updateCount': '更新{count, number}条',
  'history.deleteCount': '删除{count, number}条'
} as const;

export const historyEnMessages = {
  'history.open': 'History',
  'history.title': 'Activity history',
  'history.close': 'Close history',
  'history.empty': 'No activity yet',
  'history.database': 'Database',
  'history.repository': 'Repository',
  'history.entity': 'Entity',
  'history.undone': 'Undone',
  'history.invalidated': 'Redo unavailable',
  'history.INSERT': 'Created {entity}',
  'history.UPDATE': 'Updated {entity}',
  'history.DELETE': 'Deleted {entity}',
  'history.TRANSACTION': 'Transaction: {summary}',
  'history.insertCount': '{count, plural, one {# insert} other {# inserts}}',
  'history.updateCount': '{count, plural, one {# update} other {# updates}}',
  'history.deleteCount': '{count, plural, one {# deletion} other {# deletions}}'
} satisfies Record<keyof typeof historyZhMessages, string>;

export const historyCatalogs: readonly MessageCatalog[] = [
  { locale: 'zh-Hans', namespace: 'app', messages: historyZhMessages },
  { locale: 'en', namespace: 'app', messages: historyEnMessages }
];

export const historyTimeOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3
};

export function describeHistory(item: HistoryItem, t: I18n['t']): string {
  if (item.changes.length === 1) {
    const [change] = item.changes;
    return t(`history.${change.type}`, { entity: change.entity });
  }
  const counts = { INSERT: 0, UPDATE: 0, DELETE: 0 };
  for (const change of item.changes) counts[change.type]++;
  const operations = [
    ['history.insertCount', counts.INSERT],
    ['history.updateCount', counts.UPDATE],
    ['history.deleteCount', counts.DELETE]
  ] as const;
  const summary = operations
    .filter(([, count]) => count > 0)
    .map(([key, count]) => t(key, { count }))
    .join(', ');
  return t('history.TRANSACTION', { summary });
}
