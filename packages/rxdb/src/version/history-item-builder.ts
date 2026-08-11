import { isNil } from '@aiao/utils';
import { UUID } from '../entity/entity.interface.js';
import { getRxDBEntityIdentityKey } from '../system/change-codec.js';
import { RxDBChange } from '../system/change.js';
import { HistoryItem } from './VersionManager.interface.js';

/**
 * 生成历史项的描述文本
 *
 * 规则：
 * - 单条 INSERT/UPDATE/DELETE → 「创建 Foo」「更新 Foo」「删除 Foo」
 * - 事务（多条变更）→ 「事务: 创建2条, 更新3条」
 */
export function generateHistoryDescription(changes: RxDBChange[]): string {
  if (changes.length === 1) {
    const change = changes[0];
    const action =
      change.type === 'INSERT' ? '创建'
      : change.type === 'UPDATE' ? '更新'
      : '删除';
    return `${action} ${change.entity}`;
  }

  const operations: Record<string, number> = {};
  for (const change of changes) {
    const key = change.type.toLowerCase();
    operations[key] = (operations[key] ?? 0) + 1;
  }

  const parts: string[] = [];
  if (operations['insert']) parts.push(`创建${operations['insert']}条`);
  if (operations['update']) parts.push(`更新${operations['update']}条`);
  if (operations['delete']) parts.push(`删除${operations['delete']}条`);

  return `事务: ${parts.join(', ')}`;
}

/**
 * 从一组同事务的变更构造单个 HistoryItem
 *
 * @param changes - 属于同一事务的变更记录（至少一条）
 * @returns 结构化的历史项，包含描述、类型、状态等信息
 */
export function createHistoryItem(changes: RxDBChange[]): HistoryItem {
  const first_change = changes[0]!;
  const count = changes.length;
  const transactionId = first_change.transactionId ?? null;
  const createdAt = first_change.createdAt!;
  const namespace = first_change.namespace;
  const entity = first_change.entity;
  const type = transactionId ? 'TRANSACTION' : first_change.type;
  const fingerprint = [type, getRxDBEntityIdentityKey(first_change.entityId), createdAt.getTime()].join(':');
  const reverted = changes.some(c => isNil(c.revertChangeId) === false);
  const redoInvalidated = changes.some(c => isNil(c.redoInvalidatedAt) === false);

  return {
    transactionId,
    changeId: changes.reduce((max, c) => (c.id > max ? c.id : max), changes[0].id),
    fingerprint,
    changes,
    type,
    count,
    createdAt,
    description: generateHistoryDescription(changes),
    namespace,
    entity,
    reverted,
    redoInvalidated
  };
}

/**
 * 把按 id 降序排列的变更列表，转换为按事务分组的 HistoryItem 数组
 *
 * 转换逻辑：
 * - 相同 transactionId 的连续变更合并为一个 HistoryItem
 * - 无 transactionId 的变更单独成为一个 HistoryItem
 */
export function convertChangesToHistories(changes: RxDBChange[]): HistoryItem[] {
  const histories: HistoryItem[] = [];
  const next_transaction: RxDBChange[] = [];
  let _transaction_id: UUID | undefined | null = undefined;

  changes.forEach(d => {
    if (d.transactionId && d.transactionId === _transaction_id) {
      next_transaction.push(d);
    } else {
      _transaction_id = d.transactionId;
      if (next_transaction.length) {
        histories.push(createHistoryItem([...next_transaction]));
        next_transaction.length = 0;
      }
      if (d.transactionId) {
        next_transaction.push(d);
      } else {
        histories.push(createHistoryItem([d]));
      }
    }
  });
  if (next_transaction.length) {
    histories.push(createHistoryItem([...next_transaction]));
  }

  return histories;
}
