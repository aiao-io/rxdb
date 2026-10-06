/**
 * @fileoverview 录制库存取（`git show 2e820521:specs/005-us-909-session-replay/data-model.md` §1、research D2 / D3 / D4）。
 *
 * @remarks
 * 会话行的 `bytes` / `eventCount` / `nextSeq` / `lastEventAt` 与事件行同进同退是续录的前提：刷新后只看会话行的
 * `nextSeq` 就知道在途那批落没落。所以这里专门有一条「重复 `seq` 被拒时会话行也不动」。
 */

import type { RxDB } from '@aiao/rxdb';
import type { eventWithTime } from '@rrweb/types';
import { afterEach, describe, expect, it } from 'vitest';
import { eventBytes } from '../markers.js';
import { ReplayStore } from '../store.js';
import { createRecordingDbFactory } from './fixtures/dbs.js';

const LIMITS = { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 };

const event = (i: number, timestamp = 1000 + i): eventWithTime =>
  ({ type: 5, data: { tag: 'test:event', payload: { i } }, timestamp }) as eventWithTime;

const entries = (seqs: readonly number[]) => seqs.map(seq => ({ seq, event: event(seq) }));

const stores: ReplayStore[] = [];

const createStore = (createRecordingDb = createRecordingDbFactory().factory) => {
  const store = new ReplayStore({ createRecordingDb, limits: LIMITS });
  stores.push(store);
  return store;
};

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.destroy()));
});

describe('ReplayStore：会话与事件', () => {
  it('createSession 建出 recording 会话，计数全为 0', async () => {
    const store = createStore();
    const startedAt = new Date('2026-10-02T00:00:00Z');

    const id = await store.createSession(startedAt);

    expect(await store.listSessions()).toEqual([
      { id, startedAt, lastEventAt: null, status: 'recording', truncatedCode: null, eventCount: 0, bytes: 0 }
    ]);
    expect((await store.getSession(id))?.nextSeq).toBe(0);
  });

  it('appendBatch 写事件行，并在同一事务推进会话行', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());
    const batch = entries([0, 1, 2]);

    const result = await store.appendBatch(id, batch);

    const expectedBytes = batch.reduce((sum, entry) => sum + eventBytes(entry.event), 0);
    expect(result).toEqual({ kind: 'written', nextSeq: 3 });
    expect(await store.getSession(id)).toMatchObject({
      eventCount: 3,
      bytes: expectedBytes,
      nextSeq: 3,
      lastEventAt: new Date(1002)
    });
  });

  it('空批不碰库', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());

    expect(await store.appendBatch(id, [])).toEqual({ kind: 'written', nextSeq: 0 });
  });

  it('readEvents 按 seq 升序返回整条事件；给区间只返回区间内的', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());
    await store.appendBatch(id, entries([0, 1]));
    await store.appendBatch(id, entries([2, 3, 4]));

    expect(await store.readEvents(id)).toEqual([0, 1, 2, 3, 4].map(i => event(i)));
    expect(await store.readEvents(id, { from: 1001, to: 1003 })).toEqual([1, 2, 3].map(i => event(i)));
  });

  it('readCustomEntries 只返回 Custom 事件，带 seq，按 seq 升序', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());
    const dom = { type: 3, data: { source: 0 }, timestamp: 1001 } as unknown as eventWithTime;
    await store.appendBatch(id, [
      { seq: 0, event: event(0) },
      { seq: 1, event: dom },
      { seq: 2, event: event(2) }
    ]);

    expect(await store.readCustomEntries(id)).toEqual([
      { seq: 0, event: event(0) },
      { seq: 2, event: event(2) }
    ]);
    await expect(store.readCustomEntries('nope')).rejects.toThrow(
      expect.objectContaining({ code: 'session_not_found' })
    );
  });

  it('listSessions 按 startedAt 倒序', async () => {
    const store = createStore();
    const older = await store.createSession(new Date('2026-10-01T00:00:00Z'));
    const newer = await store.createSession(new Date('2026-10-02T00:00:00Z'));

    expect((await store.listSessions()).map(session => session.id)).toEqual([newer, older]);
  });

  it('markStopped 把会话改为 stopped', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());

    await store.markStopped(id);

    expect((await store.getSession(id))?.status).toBe('stopped');
  });

  it('deleteSession 删掉事件行与会话行，用量随之减少', async () => {
    const store = createStore();
    const keep = await store.createSession(new Date());
    const drop = await store.createSession(new Date());
    await store.appendBatch(keep, entries([0]));
    await store.appendBatch(drop, entries([0, 1]));

    await store.deleteSession(drop);

    expect(await store.getSession(drop)).toBeNull();
    await expect(store.readEvents(drop)).rejects.toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'session_not_found' })
    );
    expect(await store.usage()).toEqual({ bytes: eventBytes(event(0)), sessionCount: 1 });
  });

  it('不存在的会话：readEvents / deleteSession / appendBatch 抛 session_not_found，getSession 为 null', async () => {
    const store = createStore();
    const notFound = expect.objectContaining({ code: 'session_not_found' });

    expect(await store.getSession('nope')).toBeNull();
    await expect(store.readEvents('nope')).rejects.toThrow(notFound);
    await expect(store.deleteSession('nope')).rejects.toThrow(notFound);
    await expect(store.appendBatch('nope', entries([0]))).rejects.toThrow(notFound);
  });

  it('重复 seq 被主键拒绝，且整批回滚、会话行不动', async () => {
    const store = createStore();
    const id = await store.createSession(new Date());
    await store.appendBatch(id, entries([0, 1]));
    const before = await store.getSession(id);

    await expect(store.appendBatch(id, entries([2, 1]))).rejects.toThrow();

    expect(await store.getSession(id)).toEqual(before);
    expect(await store.readEvents(id)).toHaveLength(2);
  });
});

describe('ReplayStore：按会话 + 时间区间查询走索引（故事 AC#11）', () => {
  it('20 个会话各 250 条、ANALYZE 后，readEvents 的区间谓词命中 (sessionId, timestamp) 复合索引', async () => {
    const { factory, created } = createRecordingDbFactory();
    const store = createStore(factory);
    const seqs = Array.from({ length: 250 }, (_, seq) => seq);
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = await store.createSession(new Date());
      await store.appendBatch(id, entries(seqs));
      ids.push(id);
    }
    const db = created[0];
    if (!db) throw new Error('recording db missing');
    const adapter = await db.getAdapter('pglite');
    if (!adapter.rawQuery) throw new Error('pglite adapter has no rawQuery');
    await adapter.rawQuery('ANALYZE replay.replay_event');

    // 谓词与排序照抄 ReplayStore.readEvents（sessionId 等值 + timestamp 闭区间，seq 升序）
    const { rows } = await adapter.rawQuery(
      'EXPLAIN SELECT * FROM replay.replay_event WHERE "sessionId" = $1 AND "timestamp" >= $2 AND "timestamp" <= $3 ORDER BY seq ASC',
      [ids[7], 1100, 1110]
    );
    const plan = rows.map(row => String(row[0])).join('\n');

    expect(plan).toMatch(/Index Scan on idx_replay_event_replay_event_session_timestamp/);
    expect(plan).not.toMatch(/Seq Scan/);
  });
});

describe('ReplayStore：录制库生命周期', () => {
  it('懒建：第一次存储调用才调工厂，同一实例只调一次', async () => {
    const { factory, created } = createRecordingDbFactory();
    const store = createStore(factory);
    expect(created).toHaveLength(0);

    await Promise.all([store.listSessions(), store.usage()]);
    await store.listSessions();

    expect(created).toHaveLength(1);
  });

  it('工厂抛错 → recording_db_unavailable（cause 为原错误），下一次调用重新调工厂', async () => {
    const boom = new Error('idb blocked');
    const { factory, created } = createRecordingDbFactory();
    let calls = 0;
    const store = createStore(entities => {
      calls += 1;
      if (calls === 1) throw boom;
      return factory(entities);
    });

    await expect(store.listSessions()).rejects.toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'recording_db_unavailable', cause: boom })
    );
    expect(await store.listSessions()).toEqual([]);
    expect(created).toHaveLength(1);
  });

  it('工厂返回的库连不上（没注册适配器）→ recording_db_unavailable', async () => {
    const { factory } = createRecordingDbFactory();
    const store = createStore(entities => {
      const db: RxDB = factory(entities);
      db.adapter('pglite', () => Promise.reject(new Error('no storage')));
      return db;
    });

    await expect(store.listSessions()).rejects.toThrow(expect.objectContaining({ code: 'recording_db_unavailable' }));
  });

  it('destroy 销毁录制库；之后的调用抛 not_installed；没建过库时 destroy 不调工厂', async () => {
    const { factory, created } = createRecordingDbFactory();
    const idle = createStore(factory);
    await idle.destroy();
    expect(created).toHaveLength(0);

    const store = createStore(factory);
    await store.listSessions();
    await store.destroy();

    await expect(created[0]?.connect('pglite')).rejects.toThrow(/destroyed/);
    await expect(store.listSessions()).rejects.toThrow(expect.objectContaining({ code: 'not_installed' }));
  });
});

describe('ReplayStore：两个写入者共用一个录制库', () => {
  /** 两个标签页 = 两个 `ReplayStore`，录制库是同一个（工厂两次都给同一个库）。 */
  const sharedStores = (limits = LIMITS) => {
    const { factory, created } = createRecordingDbFactory();
    let shared: RxDB | undefined;
    const createRecordingDb = (entities: Parameters<typeof factory>[0]): RxDB => (shared ??= factory(entities));
    const open = () => {
      const store = new ReplayStore({ createRecordingDb, limits });
      stores.push(store);
      return store;
    };
    return { first: open(), second: open(), created };
  };

  it('各开一个会话交替写，usage().bytes 等于两会话之和，两边读到的一致', async () => {
    const { first, second, created } = sharedStores();
    const a = await first.createSession(new Date(1_000));
    const b = await second.createSession(new Date(2_000));

    await first.appendBatch(a, entries([0, 1]));
    await second.appendBatch(b, entries([0]));
    await first.appendBatch(a, entries([2]));
    await second.appendBatch(b, entries([1, 2, 3]));

    const bytesOf = (seqs: readonly number[]) => seqs.reduce((sum, seq) => sum + eventBytes(event(seq)), 0);
    const expected = bytesOf([0, 1, 2]) + bytesOf([0, 1, 2, 3]);
    expect(created).toHaveLength(1);
    expect(await first.usage()).toEqual({ bytes: expected, sessionCount: 2 });
    expect(await second.usage()).toEqual(await first.usage());
    expect(await second.getSession(a)).toMatchObject({ eventCount: 3, nextSeq: 3 });
    expect(await first.getSession(b)).toMatchObject({ eventCount: 4, nextSeq: 4 });
  });

  it('总量判定看得见另一个写入者已落的字节：一边写满，另一边 createSession → store_limit', async () => {
    const one = eventBytes(event(0));
    const { first, second } = sharedStores({ sessionBytes: one * 4, storeBytes: one * 4 });
    const a = await first.createSession(new Date(1_000));

    await first.appendBatch(a, entries([0, 1, 2, 3]));

    await expect(second.createSession(new Date(2_000))).rejects.toThrow(
      expect.objectContaining({ code: 'store_limit' })
    );
    expect((await second.listSessions()).map(session => session.id)).toEqual([a]);
  });
});
