/**
 * @fileoverview 体积上限（`git show 2e820521:specs/005-us-909-session-replay/research.md` D4，owner 2026-10-02）。
 *
 * @remarks
 * 判定与写入在同一个事务里，超限时整批不写，只在本批首个 `seq` 上落一条 `truncated` 标记。
 * 插件绝不自动删除会话：释放空间只有 `deleteSession()` 一条路，所以最后一条用例专门断言「超限后旧会话还在」。
 */

import type { eventWithTime } from '@rrweb/types';
import { afterEach, describe, expect, it } from 'vitest';
import { createReplayMarkerEvent, eventBytes, REPLAY_MARKER_TAGS } from '../markers.js';
import { ReplayStore } from '../store.js';
import { createRecordingDbFactory } from './fixtures/dbs.js';

/** 每条事件恰好 `EVENT_BYTES` 字节（payload 用定长字符串撑开）。 */
const event = (seq: number): eventWithTime =>
  ({
    type: 5,
    data: { tag: 'test:event', payload: { pad: 'x'.repeat(64), seq: seq % 10 } },
    timestamp: 1000 + seq
  }) as eventWithTime;
const EVENT_BYTES = eventBytes(event(0));

const entries = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ seq: from + i, event: event(from + i) }));

const stores: ReplayStore[] = [];

const createStore = (limits: { sessionBytes: number; storeBytes: number }) => {
  const store = new ReplayStore({ createRecordingDb: createRecordingDbFactory().factory, limits });
  stores.push(store);
  return store;
};

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.destroy()));
});

describe('appendBatch：上限判定', () => {
  it('刚好等于会话上限不截断', async () => {
    const store = createStore({ sessionBytes: EVENT_BYTES * 3, storeBytes: EVENT_BYTES * 10 });
    const id = await store.createSession(new Date());

    expect(await store.appendBatch(id, entries(0, 3))).toEqual({ kind: 'written', nextSeq: 3 });
  });

  it('单会话超限：整批不写，首个 seq 上写 truncated 标记，会话 truncated / session_limit', async () => {
    const limitBytes = EVENT_BYTES * 3;
    const store = createStore({ sessionBytes: limitBytes, storeBytes: EVENT_BYTES * 10 });
    const id = await store.createSession(new Date());
    await store.appendBatch(id, entries(0, 2));

    const result = await store.appendBatch(id, entries(2, 2));

    const marker = createReplayMarkerEvent(REPLAY_MARKER_TAGS.truncated, { code: 'session_limit', limitBytes }, 1002);
    expect(result).toEqual({ kind: 'truncated', code: 'session_limit', limitBytes });
    expect(await store.readEvents(id)).toEqual([event(0), event(1), marker]);
    expect(await store.getSession(id)).toMatchObject({
      status: 'truncated',
      truncatedCode: 'session_limit',
      eventCount: 3,
      bytes: EVENT_BYTES * 2 + eventBytes(marker),
      nextSeq: 3
    });
  });

  it('总量超限（会话本身未超）→ store_limit', async () => {
    const storeBytes = EVENT_BYTES * 4;
    const store = createStore({ sessionBytes: EVENT_BYTES * 3, storeBytes });
    const first = await store.createSession(new Date());
    await store.appendBatch(first, entries(0, 3));
    const second = await store.createSession(new Date());

    const result = await store.appendBatch(second, entries(0, 2));

    expect(result).toEqual({ kind: 'truncated', code: 'store_limit', limitBytes: storeBytes });
    expect(await store.getSession(second)).toMatchObject({ status: 'truncated', truncatedCode: 'store_limit' });
  });

  it('已非 recording 的会话不再接受事件（内部不变式，不是公开错误码）', async () => {
    const store = createStore({ sessionBytes: EVENT_BYTES * 3, storeBytes: EVENT_BYTES * 10 });
    const id = await store.createSession(new Date());
    await store.markStopped(id);

    await expect(store.appendBatch(id, entries(0, 1))).rejects.toThrow(/is stopped, not recording/);
  });
});

describe('createSession：总量门槛', () => {
  it('合计 ≥ storeBytes → store_limit，且不建会话', async () => {
    const store = createStore({ sessionBytes: EVENT_BYTES * 2, storeBytes: EVENT_BYTES * 2 });
    const id = await store.createSession(new Date());
    await store.appendBatch(id, entries(0, 2));

    await expect(store.createSession(new Date())).rejects.toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'store_limit' })
    );
    expect(await store.listSessions()).toHaveLength(1);
  });

  it('从不自动删除；deleteSession 腾出空间后可以再开', async () => {
    const store = createStore({ sessionBytes: EVENT_BYTES * 2, storeBytes: EVENT_BYTES * 2 });
    const id = await store.createSession(new Date());
    await store.appendBatch(id, entries(0, 2));
    await expect(store.createSession(new Date())).rejects.toThrow();
    expect(await store.getSession(id)).not.toBeNull();

    await store.deleteSession(id);

    await expect(store.createSession(new Date())).resolves.toEqual(expect.any(String));
  });
});
