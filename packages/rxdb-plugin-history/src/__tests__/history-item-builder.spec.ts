import { getRxDBEntityIdentityKey, type RxDBChange, type UUID } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { convertChangesToHistories, createHistoryItem, generateHistoryDescription } from '../history-item-builder.js';

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
      fingerprint: `INSERT:${getRxDBEntityIdentityKey('todo-3')}:${createdAt.getTime()}:8`,
      type: 'INSERT',
      count: 2,
      createdAt,
      namespace: 'public',
      entity: 'Todo',
      reverted: false,
      redoInvalidated: false
    });
  });

  // createdAt 不保证唯一：同一实体两次独立 UPDATE 落在同一毫秒时，指纹仍要分得开（HistoryItem.fingerprint 的契约是唯一）
  it('同实体同毫秒的两次独立变更指纹不同', () => {
    const createdAt = new Date('2026-07-10T02:00:00.000Z');
    const first = createHistoryItem([createChange({ id: 1, type: 'UPDATE', createdAt })]);
    const second = createHistoryItem([createChange({ id: 2, type: 'UPDATE', createdAt })]);

    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('跨命名空间同 id 同毫秒的变更指纹不同', () => {
    const createdAt = new Date('2026-07-10T03:00:00.000Z');
    const publicItem = createHistoryItem([createChange({ id: 4, createdAt })]);
    const tenantItem = createHistoryItem([createChange({ id: 5, namespace: 'tenant', createdAt })]);

    expect(publicItem.fingerprint).not.toBe(tenantItem.fingerprint);
  });

  it('同一批变更重读出来的指纹不变', () => {
    const createdAt = new Date('2026-07-10T04:00:00.000Z');
    const changes = [createChange({ id: 7, createdAt }), createChange({ id: 6, createdAt })];

    expect(createHistoryItem([...changes]).fingerprint).toBe(createHistoryItem([...changes]).fingerprint);
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
