/**
 * @fileoverview `rxdb.replay` 门面（`git show 2e820521:specs/005-us-909-session-replay/contracts/replay-plugin.md` §2、data-model §3.2）。
 *
 * @remarks
 * 走真插件、真录制库（PGlite memory），只把 rrweb 换成假的：录制状态机、错误码与纪元释放时的收尾都是插件自己的事，
 * 与 rrweb 怎么采 DOM 无关。真 rrweb 在浏览器用例里。
 */

import type { RxDB } from '@aiao/rxdb';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RxDBReplayErrorCode } from '../errors.js';
import type { ReplayRecordingDbFactory, RxDBReplayOptions } from '../options.js';
import { rxDBPluginReplay } from '../plugin.js';
import { replayStashKey } from '../resume.js';
import type { ReplayState } from '../types.js';
import { createAppDb, createPersistentRecordingDbFactory, createRecordingDbFactory } from './fixtures/dbs.js';
import { domEvent, fakeRrweb, stubPage } from './fixtures/page.js';

const rrweb = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeRrweb> | null }));
vi.mock('rrweb', () => ({
  get record() {
    return rrweb.current?.record;
  }
}));

const FLUSH = { intervalMs: 60_000, maxEvents: 1_000 };

// 前缀由 RxDBReplayError 自己加：调用方再写一遍就成了双前缀
const replayError = (code: RxDBReplayErrorCode) =>
  expect.objectContaining({
    name: 'RxDBReplayError',
    code,
    message: expect.stringMatching(/^\[rxdb-plugin-replay\] (?!\[rxdb-plugin-replay\])/)
  });

let app: RxDB | undefined;

beforeEach(() => {
  rrweb.current = fakeRrweb();
});

afterEach(async () => {
  await app?.destroy();
  app = undefined;
  vi.unstubAllGlobals();
});

const connectApp = async (options: Partial<RxDBReplayOptions> = {}) => {
  app = createAppDb();
  app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory, flush: FLUSH, ...options });
  await app.connect('pglite');
  return app;
};

const stateOf = (db: RxDB, kind: ReplayState['kind']) =>
  firstValueFrom(db.replay.state$.pipe(filter(state => state.kind === kind)));

/** 把录制库工厂卡在门闩上：`entered` 兑现时工厂已被调用，`open()` 之后才往下走。 */
const gatedFactory = (inner: ReplayRecordingDbFactory) => {
  let open!: () => void;
  let enter!: () => void;
  const gate = new Promise<void>(resolve => (open = resolve));
  const entered = new Promise<void>(resolve => (enter = resolve));
  const factory: ReplayRecordingDbFactory = async entities => {
    enter();
    await gate;
    return inner(entities);
  };
  return { factory, entered, open };
};

describe('start()', () => {
  it('没有 document → no_dom，状态不动', async () => {
    const db = await connectApp();

    await expect(db.replay.start()).rejects.toThrow(replayError('no_dom'));
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
  });

  it('开一个 recording 会话，state$ 转 recording；rrweb 收到合并后的脱敏选项', async () => {
    stubPage();
    const db = await connectApp({ record: { blockSelector: '.secret' } });

    const sessionId = await db.replay.start();

    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'recording', sessionId });
    expect(await db.replay.listSessions()).toEqual([expect.objectContaining({ id: sessionId, status: 'recording' })]);
    expect(rrweb.current?.record).toHaveBeenCalledWith(
      expect.objectContaining({ maskAllInputs: true, blockSelector: '.secret, [data-rxdb-replay-block]' })
    );
  });

  it('已在录制 → already_recording；并发两次 start() 只有一个成功', async () => {
    stubPage();
    const db = await connectApp();

    const results = await Promise.allSettled([db.replay.start(), db.replay.start()]);

    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    await expect(db.replay.start()).rejects.toThrow(replayError('already_recording'));
    expect(await db.replay.listSessions()).toHaveLength(1);
  });

  it('rrweb 没起来 → start() 抛错，会话随即置 stopped，状态仍 idle，可以再开', async () => {
    stubPage();
    const db = await connectApp();
    if (rrweb.current) vi.mocked(rrweb.current.record).mockReturnValueOnce(undefined);

    await expect(db.replay.start()).rejects.toThrow(/did not start/);

    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
    expect(await db.replay.listSessions()).toEqual([expect.objectContaining({ status: 'stopped' })]);
    await expect(db.replay.start()).resolves.toEqual(expect.any(String));
  });

  it('总量已达上限 → store_limit，状态不动', async () => {
    stubPage();
    // 每会话只有 rrweb 起录时那一条（约 100 字节）：第二个会话的那一条就越过总量，会话以 store_limit 截断
    const db = await connectApp({ limits: { sessionBytes: 150, storeBytes: 200 }, flush: { maxEvents: 1 } });
    await db.replay.start();
    await db.replay.stop();
    const second = await db.replay.start();
    const truncated = await stateOf(db, 'truncated');
    expect(truncated).toEqual({ kind: 'truncated', sessionId: second, code: 'store_limit' });

    await expect(db.replay.start()).rejects.toThrow(replayError('store_limit'));
    expect(await firstValueFrom(db.replay.state$)).toEqual(truncated);
    expect(await db.replay.listSessions()).toHaveLength(2);
  });

  it('没有 sessionStorage 也照常录制（只是没有刷新续录）', async () => {
    vi.stubGlobal('document', {});
    const db = await connectApp();

    const sessionId = await db.replay.start();
    await db.replay.stop();

    expect(await db.replay.readEvents(sessionId)).toHaveLength(1);
  });
});

describe('stop()', () => {
  it('冲刷缓冲 → 会话 stopped、state$ 回 idle、rrweb 停', async () => {
    stubPage();
    const db = await connectApp();
    const sessionId = await db.replay.start();
    rrweb.current?.emitEvents(2);

    await db.replay.stop();

    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
    expect(rrweb.current?.stopRecording).toHaveBeenCalledOnce();
    expect(await db.replay.listSessions()).toEqual([
      expect.objectContaining({ id: sessionId, status: 'stopped', eventCount: 3 })
    ]);
  });

  it('没在录制时是空操作；并发 stop() 共用同一次收尾', async () => {
    stubPage();
    const db = await connectApp();
    await expect(db.replay.stop()).resolves.toBeUndefined();

    await db.replay.start();
    await Promise.all([db.replay.stop(), db.replay.stop()]);

    expect(rrweb.current?.stopRecording).toHaveBeenCalledOnce();
  });

  it('start() 还在建录制库时 stop()：等它落定再停，stop() 返回后不再采集', async () => {
    stubPage();
    const recording = gatedFactory(createRecordingDbFactory().factory);
    const db = await connectApp({ createRecordingDb: recording.factory });

    const starting = db.replay.start();
    await recording.entered;
    const stopping = db.replay.stop();
    recording.open();
    const sessionId = await starting;
    await stopping;

    expect(rrweb.current?.isRecording()).toBe(false);
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
    expect(await db.replay.listSessions()).toEqual([expect.objectContaining({ id: sessionId, status: 'stopped' })]);
  });

  it('start() 失败时等着它的 stop() 照常返回，不悬挂', async () => {
    stubPage();
    const recording = gatedFactory(() => {
      throw new Error('recording db down');
    });
    const db = await connectApp({ createRecordingDb: recording.factory });

    const starting = db.replay.start();
    await recording.entered;
    const stopping = db.replay.stop();
    recording.open();

    await expect(starting).rejects.toThrow();
    await expect(stopping).resolves.toBeUndefined();
    expect(rrweb.current?.isRecording()).toBe(false);
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
  });
});

describe('单会话超限', () => {
  it('录制中超限 → state$ truncated / session_limit，rrweb 停，暂存清掉', async () => {
    const page = stubPage();
    const db = await connectApp({ limits: { sessionBytes: 256, storeBytes: 4096 }, flush: { maxEvents: 1 } });
    const sessionId = await db.replay.start();
    page.pagehide();

    rrweb.current?.emitEvents(4);

    expect(await stateOf(db, 'truncated')).toEqual({ kind: 'truncated', sessionId, code: 'session_limit' });
    expect(rrweb.current?.isRecording()).toBe(false);
    expect(page.storage.getItem(replayStashKey(db.config.dbName))).toBeNull();
    expect(await db.replay.listSessions()).toEqual([
      expect.objectContaining({ status: 'truncated', truncatedCode: 'session_limit' })
    ]);
  });
});

describe('读取与管理', () => {
  it('readEvents 按 seq 升序，区间读只给区间内的', async () => {
    stubPage();
    const db = await connectApp();
    const sessionId = await db.replay.start();
    rrweb.current?.emitEvents(3);
    await db.replay.stop();

    const events = await db.replay.readEvents(sessionId);
    const timestamps = events.map(event => event.timestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(await db.replay.readEvents(sessionId, { from: timestamps[1] ?? 0, to: timestamps[2] ?? 0 })).toEqual(
      events.slice(1, 3)
    );
  });

  it('exportSession 给出 format / version / 会话概要 / 全部事件；不存在 → session_not_found', async () => {
    stubPage();
    const db = await connectApp();
    const sessionId = await db.replay.start();
    await db.replay.stop();

    const exported = await db.replay.exportSession(sessionId);

    expect(exported).toEqual({
      format: 'aiao-rxdb-replay-session',
      version: 1,
      session: expect.objectContaining({ id: sessionId, status: 'stopped', eventCount: 1 }),
      events: [domEvent(0, 1_000)]
    });
    await expect(db.replay.exportSession('missing')).rejects.toThrow(replayError('session_not_found'));
  });

  it('deleteSession：录制中 → session_recording；停了之后可删，用量随之归零', async () => {
    stubPage();
    const db = await connectApp({ limits: { sessionBytes: 1024, storeBytes: 4096 } });
    const sessionId = await db.replay.start();

    await expect(db.replay.deleteSession(sessionId)).rejects.toThrow(replayError('session_recording'));
    await db.replay.stop();
    expect((await db.replay.usage()).bytes).toBeGreaterThan(0);

    await db.replay.deleteSession(sessionId);

    expect(await db.replay.usage()).toEqual({
      bytes: 0,
      sessionCount: 0,
      limits: { sessionBytes: 1024, storeBytes: 4096 }
    });
    await expect(db.replay.deleteSession(sessionId)).rejects.toThrow(replayError('session_not_found'));
  });

  it('没装工作树插件时 restoreToCommit → working_tree_unavailable', async () => {
    const db = await connectApp();

    await expect(db.replay.restoreToCommit('c1')).rejects.toThrow(replayError('working_tree_unavailable'));
  });
});

describe('纪元释放', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'rxdb-replay-manager-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('断连时停录制并冲刷缓冲；重连后会话是 stopped，事件都在', async () => {
    stubPage();
    const db = await connectApp({ createRecordingDb: createPersistentRecordingDbFactory(dataDir).factory });
    const sessionId = await db.replay.start();
    rrweb.current?.emitEvents(2);

    await db.disconnectAll();
    expect(rrweb.current?.isRecording()).toBe(false);

    await db.connect('pglite');
    expect(await firstValueFrom(db.replay.state$)).toEqual({ kind: 'idle' });
    expect(await db.replay.listSessions()).toEqual([
      expect.objectContaining({ id: sessionId, status: 'stopped', eventCount: 3 })
    ]);
  });

  it('断连之后 pagehide 不再写暂存（页面事件随纪元摘掉）', async () => {
    const page = stubPage();
    const db = await connectApp();
    await db.replay.start();

    await db.disconnectAll();
    page.pagehide();

    expect(page.storage.getItem(replayStashKey(db.config.dbName))).toBeNull();
  });
});
