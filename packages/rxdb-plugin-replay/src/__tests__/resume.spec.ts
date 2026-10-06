/**
 * @fileoverview 刷新续录（`git show 2e820521:specs/005-us-909-session-replay/data-model.md` §4、research D5）。
 *
 * @remarks
 * 「刷新」= 上一页在 `pagehide` 写下暂存、页面卸载、下一页 `connect()` 时认领。卸载本身不跑插件的拆卸，
 * 所以这里不靠两个纪元串起来，而是直接把上一页留下的东西摆好：录制库里一个 `recording` 会话（落盘目录，跨实例保留），
 * `sessionStorage` 里一份暂存。写暂存的那一半另在同一纪元里断言。
 */

import type { RxDB } from '@aiao/rxdb';
import type { eventWithTime } from '@rrweb/types';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseReplayMarker, REPLAY_MARKER_TAGS } from '../markers.js';
import { rxDBPluginReplay } from '../plugin.js';
import { replayStashKey, type ReplayStash } from '../resume.js';
import { ReplayStore, type ReplayStoredSession } from '../store.js';
import type { ReplayState } from '../types.js';
import { createAppDb, createPersistentRecordingDbFactory, createRecordingDbFactory } from './fixtures/dbs.js';
import { domEvent, fakeRrweb, MemoryStorage, stubPage } from './fixtures/page.js';

const rrweb = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeRrweb> | null }));
vi.mock('rrweb', () => ({
  get record() {
    return rrweb.current?.record;
  }
}));

/** 不让定时冲刷插手：事件一直留在缓冲里，直到 `stop()`。 */
const FLUSH = { intervalMs: 60_000, maxEvents: 1_000 };
const LIMITS = { sessionBytes: 1024 * 1024, storeBytes: 4 * 1024 * 1024 };

let app: RxDB | undefined;
let dataDir: string;

beforeEach(async () => {
  rrweb.current = fakeRrweb();
  dataDir = await mkdtemp(path.join(tmpdir(), 'rxdb-replay-resume-'));
});

afterEach(async () => {
  await app?.destroy();
  app = undefined;
  vi.unstubAllGlobals();
  await rm(dataDir, { recursive: true, force: true });
});

/** 在落盘录制库上直接操作（上一页留下的会话 / 事后检查），用完即销毁实例。 */
const withStore = async <T>(run: (store: ReplayStore) => Promise<T>, limits = LIMITS): Promise<T> => {
  const store = new ReplayStore({ createRecordingDb: createPersistentRecordingDbFactory(dataDir).factory, limits });
  try {
    return await run(store);
  } finally {
    await store.destroy();
  }
};

/** 上一页落了 `written` 条事件（seq 从 0 起，时间戳 100 起）的 `recording` 会话。 */
const seedSession = (written: number, limits = LIMITS): Promise<string> =>
  withStore(async store => {
    const sessionId = await store.createSession(new Date(1_000));
    const entries = Array.from({ length: written }, (_, seq) => ({ seq, event: domEvent(seq, 100 + seq) }));
    if (entries.length > 0) await store.appendBatch(sessionId, entries);
    return sessionId;
  }, limits);

const inspect = (sessionId: string): Promise<{ session: ReplayStoredSession | null; events: eventWithTime[] }> =>
  withStore(async store => ({ session: await store.getSession(sessionId), events: await store.readEvents(sessionId) }));

const connectApp = async (factory = createPersistentRecordingDbFactory(dataDir).factory, limits = LIMITS) => {
  app = createAppDb();
  app.use(rxDBPluginReplay, { createRecordingDb: factory, flush: FLUSH, limits });
  await app.connect('pglite');
  return app;
};

const stateOf = (db: RxDB, kind: ReplayState['kind']) =>
  firstValueFrom(db.replay.state$.pipe(filter(state => state.kind === kind)));

const stashKey = (db: RxDB): string => replayStashKey(db.config.dbName);

/** 摆一份上一页的暂存。键名取决于应用库名，所以先建库、后摆暂存、再 `connect()`。 */
const prepareApp = (storage: MemoryStorage, stash: unknown, limits = LIMITS) => {
  app = createAppDb();
  app.use(rxDBPluginReplay, {
    createRecordingDb: createPersistentRecordingDbFactory(dataDir).factory,
    flush: FLUSH,
    limits
  });
  storage.setItem(stashKey(app), typeof stash === 'string' ? stash : JSON.stringify(stash));
  return app;
};

describe('pagehide 写暂存', () => {
  it('形状照 data-model §4：未落库的事件按 seq 升序，nextSeq 是下一个要分配的号', async () => {
    const page = stubPage();
    const db = await connectApp();
    const sessionId = await db.replay.start();
    rrweb.current?.emitEvents(2);

    page.pagehide();

    const stash = JSON.parse(page.storage.getItem(stashKey(db)) ?? 'null') as ReplayStash;
    expect(stash).toMatchObject({ v: 1, sessionId, nextSeq: 3 });
    expect(stash.events.map(entry => entry.seq)).toEqual([0, 1, 2]);
    expect(stash.gap).toBeUndefined();
  });

  it('完整暂存写不进去（配额）→ 只留计数器的最小暂存，gap: true', async () => {
    const page = stubPage();
    const db = await connectApp();
    const sessionId = await db.replay.start();
    page.storage.failWrites = 'large';

    page.pagehide();

    expect(JSON.parse(page.storage.getItem(stashKey(db)) ?? 'null')).toEqual({
      v: 1,
      sessionId,
      nextSeq: 1,
      events: [],
      gap: true
    });
  });

  it('没在录制时 pagehide 不写；stop() 删掉已写的暂存', async () => {
    const page = stubPage();
    const db = await connectApp();
    page.pagehide();
    expect(page.storage.getItem(stashKey(db))).toBeNull();

    await db.replay.start();
    page.pagehide();
    expect(page.storage.getItem(stashKey(db))).not.toBeNull();

    await db.replay.stop();
    expect(page.storage.getItem(stashKey(db))).toBeNull();
  });

  it('pageshow(persisted) 删暂存（从 bfcache 回来，页面没真卸载）；非 persisted 不动', async () => {
    const page = stubPage();
    const db = await connectApp();
    await db.replay.start();
    page.pagehide();

    page.pageshow(false);
    expect(page.storage.getItem(stashKey(db))).not.toBeNull();

    page.pageshow(true);
    expect(page.storage.getItem(stashKey(db))).toBeNull();
  });
});

describe('安装时认领暂存', () => {
  it('认领即删键；已落库的 seq 被滤掉，其余补写，计数器接着走', async () => {
    const sessionId = await seedSession(2);
    const page = stubPage();
    const events = [0, 1, 2, 3].map(seq => ({ seq, event: domEvent(seq, 100 + seq) }));
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 4, events });

    await db.connect('pglite');
    expect(page.storage.getItem(stashKey(db))).toBeNull();
    expect(await stateOf(db, 'recording')).toEqual({ kind: 'recording', sessionId });

    await db.destroy();
    app = undefined;
    const after = await inspect(sessionId);
    // 上一页 0～3 + 续录后 rrweb 发的第一条（seq 4）
    expect(after.session).toMatchObject({ status: 'stopped', eventCount: 5, nextSeq: 5 });
    expect(after.events.map(event => event.timestamp).slice(0, 4)).toEqual([100, 101, 102, 103]);
  });

  it('最小暂存 → 在会话的 nextSeq 上落一个 gap 标记，计数器取暂存与已写入的较大者', async () => {
    const sessionId = await seedSession(2);
    const page = stubPage();
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 7, events: [], gap: true });

    await db.connect('pglite');
    await stateOf(db, 'recording');
    await db.destroy();
    app = undefined;

    const after = await inspect(sessionId);
    expect(parseReplayMarker(after.events[2] as eventWithTime)).toEqual({
      tag: REPLAY_MARKER_TAGS.gap,
      payload: { reason: 'stash_unavailable' }
    });
    // 0、1、gap(2)，续录从 7 起发一条 → nextSeq 8
    expect(after.session).toMatchObject({ eventCount: 4, nextSeq: 8 });
  });

  it('暂存损坏 → 删键、不续录，state$ 发 error（取得到 sessionId 就带上），不建录制库', async () => {
    const page = stubPage();
    app = createAppDb();
    const { factory, created } = createRecordingDbFactory();
    app.use(rxDBPluginReplay, { createRecordingDb: factory, flush: FLUSH });
    page.storage.setItem(stashKey(app), JSON.stringify({ v: 1, sessionId: 's9' }));

    await app.connect('pglite');

    expect(page.storage.getItem(stashKey(app))).toBeNull();
    expect(await firstValueFrom(app.replay.state$)).toMatchObject({ kind: 'error', sessionId: 's9' });
    expect(created).toHaveLength(0);
  });

  it('JSON 都解析不了 → error 的 sessionId 为 null', async () => {
    const page = stubPage();
    const db = prepareApp(page.storage, '{not json');

    await db.connect('pglite');

    expect(await firstValueFrom(db.replay.state$)).toMatchObject({ kind: 'error', sessionId: null });
  });

  it('会话已不是 recording → 不续录；之后 start() 开的是新会话', async () => {
    const sessionId = await seedSession(1);
    await withStore(store => store.markStopped(sessionId));
    const page = stubPage();
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 3, events: [] });

    await db.connect('pglite');
    const next = await db.replay.start();

    expect(next).not.toBe(sessionId);
    expect(rrweb.current?.record).toHaveBeenCalledTimes(1);
    await db.destroy();
    app = undefined;
    expect((await inspect(sessionId)).session).toMatchObject({ status: 'stopped', eventCount: 1 });
  });

  it('补写就超出单会话上限 → 会话截断，state$ truncated，不再起录制器', async () => {
    const limits = { sessionBytes: 256, storeBytes: 4096 };
    const sessionId = await seedSession(0, limits);
    const page = stubPage();
    const events = Array.from({ length: 4 }, (_, seq) => ({ seq, event: domEvent(seq, 100 + seq) }));
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 4, events }, limits);

    await db.connect('pglite');

    expect(await stateOf(db, 'truncated')).toEqual({ kind: 'truncated', sessionId, code: 'session_limit' });
    expect(rrweb.current?.record).not.toHaveBeenCalled();
  });

  it('start() 等续录落定：续录中的会话还在录时，start() 抛 already_recording', async () => {
    const sessionId = await seedSession(0);
    const page = stubPage();
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 0, events: [] });

    await db.connect('pglite');

    await expect(db.replay.start()).rejects.toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'already_recording' })
    );
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'recording', sessionId });
  });

  it('stop() 等续录落定再停：续录还在后台跑时 stop()，返回后不再采集', async () => {
    const sessionId = await seedSession(0);
    const page = stubPage();
    const db = prepareApp(page.storage, { v: 1, sessionId, nextSeq: 0, events: [] });

    await db.connect('pglite');
    await db.replay.stop();

    expect(rrweb.current?.isRecording()).toBe(false);
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
    expect(await db.replay.listSessions()).toEqual([expect.objectContaining({ id: sessionId, status: 'stopped' })]);
  });
});
