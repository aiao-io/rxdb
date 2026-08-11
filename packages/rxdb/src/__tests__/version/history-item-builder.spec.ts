import { describe, expect, it } from 'vitest';
import type { UUID } from '../../entity/entity.interface.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';
import type { RxDBChange } from '../../system/change.js';
import {
  convertChangesToHistories,
  createHistoryItem,
  generateHistoryDescription
} from '../../version/history-item-builder.js';

const createChange = (overrides: Partial<RxDBChange> = {}): RxDBChange =>
  ({
    id: 1,
    namespace: 'public',
    entity: 'Todo',
    entityId: 'todo-1' as UUID,
    branchId: 'main',
    transactionId: null,
    type: 'INSERT',
    patch: null,
    inversePatch: null,
    remoteId: null,
    revertChangeId: null,
    redoInvalidatedAt: null,
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides
  }) as unknown as RxDBChange;

describe('history-item-builder', () => {
  it.each([
    ['INSERT', '创建 Todo'],
    ['UPDATE', '更新 Todo'],
    ['DELETE', '删除 Todo']
  ] as const)('describes a single %s change', (type, description) => {
    expect(generateHistoryDescription([createChange({ type })])).toBe(description);
  });

  it('summarizes every operation in a transaction', () => {
    const changes = [
      createChange({ type: 'INSERT' }),
      createChange({ type: 'INSERT' }),
      createChange({ type: 'UPDATE' }),
      createChange({ type: 'DELETE' })
    ];

    expect(generateHistoryDescription(changes)).toBe('事务: 创建2条, 更新1条, 删除1条');
  });

  it('creates a standalone history item from the newest change id', () => {
    const createdAt = new Date('2026-07-10T01:00:00.000Z');
    const changes = [
      createChange({ id: 3, createdAt, entityId: 'todo-3' as UUID }),
      createChange({ id: 8, createdAt, entityId: 'todo-8' as UUID })
    ];

    const item = createHistoryItem(changes);

    expect(item).toMatchObject({
      transactionId: null,
      changeId: 8,
      fingerprint: `INSERT:${getRxDBEntityIdentityKey('todo-3')}:${createdAt.getTime()}`,
      type: 'INSERT',
      count: 2,
      createdAt,
      namespace: 'public',
      entity: 'Todo',
      reverted: false,
      redoInvalidated: false
    });
  });

  it('marks a transaction reverted and redo-invalidated when any change is marked', () => {
    const transactionId = 'transaction-1' as UUID;
    const changes = [
      createChange({ id: 1, transactionId }),
      createChange({
        id: 2,
        transactionId,
        revertChangeId: 20,
        redoInvalidatedAt: new Date('2026-07-10T02:00:00.000Z')
      })
    ];

    expect(createHistoryItem(changes)).toMatchObject({
      transactionId,
      type: 'TRANSACTION',
      changeId: 2,
      description: '事务: 创建2条',
      reverted: true,
      redoInvalidated: true
    });
  });

  it('returns no histories for no changes', () => {
    expect(convertChangesToHistories([])).toEqual([]);
  });

  it('groups only consecutive changes sharing a transaction id', () => {
    const transactionA = 'transaction-a' as UUID;
    const transactionB = 'transaction-b' as UUID;
    const changes = [
      createChange({ id: 9, transactionId: transactionA }),
      createChange({ id: 8, transactionId: transactionA, type: 'UPDATE' }),
      createChange({ id: 7, entityId: 'standalone' as UUID }),
      createChange({ id: 6, transactionId: transactionA, type: 'DELETE' }),
      createChange({ id: 5, transactionId: transactionB }),
      createChange({ id: 4, transactionId: transactionB, type: 'UPDATE' })
    ];

    const histories = convertChangesToHistories(changes);

    expect(histories).toHaveLength(4);
    expect(histories.map(item => item.changes.map(change => change.id))).toEqual([[9, 8], [7], [6], [5, 4]]);
    expect(histories.map(item => item.transactionId)).toEqual([transactionA, null, transactionA, transactionB]);
  });
});
