import { describe, expect, it, vi } from 'vitest';
import type { PGliteChangeEvent } from '../pglite.interface.js';
import { PGliteChangeType } from '../pglite.interface.js';
import { PGliteNotificationBatcher } from './notification-batcher.js';

const payload = (operation: PGliteChangeType, ids: Array<string | number>): string =>
  JSON.stringify({ operation, table: 'rxdb_change', ids });

function createBatcher(overrides: Partial<ConstructorParameters<typeof PGliteNotificationBatcher>[0]> = {}) {
  const emitted: PGliteChangeEvent[] = [];
  const batcher = new PGliteNotificationBatcher({
    resolveDbName: () => 'demo',
    emit: event => emitted.push(event),
    ...overrides
  });
  return { batcher, emitted };
}

describe('PGliteNotificationBatcher', () => {
  it('把同一窗口内的多行聚合成一条事件', () => {
    const { batcher, emitted } = createBatcher();

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a', 'b']));
    batcher.flush();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: PGliteChangeType.INSERT,
      dbName: 'demo',
      tableName: 'rxdb_change',
      rowIds: ['a', 'b']
    });
  });

  it('按 type + table + id 去重', () => {
    const { batcher, emitted } = createBatcher();

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a']));
    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a', 'b']));
    batcher.flush();

    expect(emitted[0].rowIds).toEqual(['a', 'b']);
  });

  it('不同操作类型各自成一条事件', () => {
    const { batcher, emitted } = createBatcher();

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a']));
    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.DELETE, ['a']));
    batcher.flush();

    expect(emitted.map(event => event.type)).toEqual([PGliteChangeType.INSERT, PGliteChangeType.DELETE]);
  });

  it('容量到顶时同步冲刷，不等定时器', () => {
    // 紧凑的 await 循环会把宏任务队列饿死，定时器根本不到期——所以上限必须同步判定。
    const { batcher, emitted } = createBatcher({ maxPendingEvents: 2 });

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a', 'b']));

    expect(emitted).toHaveLength(1);
    expect(batcher.pendingCount).toBe(0);
    expect(batcher.hasScheduledFlush).toBe(false);
  });

  it('窗口硬上限到期时同步冲刷', () => {
    const { batcher, emitted } = createBatcher({ maxBatchWait: 0 });

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.UPDATE, ['a']));

    expect(emitted).toHaveLength(1);
  });

  it('未到上限时排一次 trailing 防抖', async () => {
    const { batcher, emitted } = createBatcher({ batchTimeout: 1 });

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a']));
    expect(emitted).toHaveLength(0);
    expect(batcher.hasScheduledFlush).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 5));
    expect(emitted).toHaveLength(1);
  });

  it('clear 丢弃窗口内事件且取消定时器', async () => {
    const { batcher, emitted } = createBatcher({ batchTimeout: 1 });

    batcher.accept('rxdb_change_notify', payload(PGliteChangeType.INSERT, ['a']));
    batcher.clear();

    await new Promise(resolve => setTimeout(resolve, 5));
    expect(emitted).toHaveLength(0);
    expect(batcher.pendingCount).toBe(0);
  });

  it('payload 不是 JSON 时上报而不是抛出', () => {
    const onParseError = vi.fn();
    const { batcher, emitted } = createBatcher({ onParseError });

    batcher.accept('rxdb_change_notify', '{not json');

    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(0);
  });

  it('空 payload 直接忽略', () => {
    const onParseError = vi.fn();
    const { batcher } = createBatcher({ onParseError });

    batcher.accept('rxdb_change_notify', '   ');

    expect(onParseError).not.toHaveBeenCalled();
    expect(batcher.pendingCount).toBe(0);
  });
});
