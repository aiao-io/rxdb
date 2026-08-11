/**
 * @fileoverview PGL-008：NOTIFY 批量窗口不得被持续写入饿死，积压不得无界
 *
 * 原实现是纯 trailing debounce：每条 NOTIFY 都 clearTimeout + setTimeout(16ms)。
 * 写入间隔小于 16ms 时定时器永远重置，事件一条也派发不出去，
 * `#pendingEvents` 同时无上限、无去重地增长。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGliteClient } from '../PGliteClient.js';
import { type PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';

describe('PGL-008 NOTIFY 批量窗口', () => {
  let client: PGliteClient;
  let dbSeq = 0;

  // 每个用例一个独立 client：第一个用例会打出数千条 NOTIFY，
  // 它们在用例结束后仍会陆续到达，共用 client 时会污染后续断言。
  beforeEach(async () => {
    client = new PGliteClient();
    await client.init(`pglite-notify-backpressure-${Date.now()}-${dbSeq++}`, { store: 'memory' });
  });

  afterEach(async () => {
    if (client) await client.disconnect();
  });

  const notify = (ids: string[]) =>
    client.exec(`NOTIFY rxdb_change_notify, '${JSON.stringify({ operation: 'INSERT', ids })}';`);

  it('持续写入期间必须有事件派发，不能等到写入停止才一次性放出来', async () => {
    const received: PGliteChangeEvent[] = [];
    const listener = (event: PGliteChangeEvent) => received.push(event);
    client.addEventListener(PGliteChangeType.INSERT, listener);

    try {
      // 连续写入 300ms，每条间隔远小于 16ms 的防抖窗口
      const startedAt = Date.now();
      let seq = 0;
      while (Date.now() - startedAt < 300) {
        await notify([`row-${seq++}`]);
      }

      // 循环**期间**必须已经派发过 —— 这正是 max-wait 的意义
      expect(received.length).toBeGreaterThan(0);
      expect(seq).toBeGreaterThan(1);
    } finally {
      client.removeEventListener(PGliteChangeType.INSERT, listener);
    }
  });

  it('同一 (type, table, id) 在一个窗口内只算一次', async () => {
    const received: PGliteChangeEvent[] = [];
    const listener = (event: PGliteChangeEvent) => received.push(event);
    client.addEventListener(PGliteChangeType.INSERT, listener);

    try {
      await notify(['dup', 'dup', 'dup']);
      await notify(['dup']);
      await client.flushPendingNotifications();

      const rowIds = received.flatMap(event => event.rowIds);
      expect(rowIds).toEqual(['dup']);
    } finally {
      client.removeEventListener(PGliteChangeType.INSERT, listener);
    }
  });

  it('不同 id 仍然全部保留，不会因为去重而丢行', async () => {
    const received: PGliteChangeEvent[] = [];
    const listener = (event: PGliteChangeEvent) => received.push(event);
    client.addEventListener(PGliteChangeType.INSERT, listener);

    try {
      await notify(['a', 'b']);
      await notify(['b', 'c']);
      await client.flushPendingNotifications();

      const rowIds = received.flatMap(event => event.rowIds).sort();
      expect(rowIds).toEqual(['a', 'b', 'c']);
    } finally {
      client.removeEventListener(PGliteChangeType.INSERT, listener);
    }
  });
});
