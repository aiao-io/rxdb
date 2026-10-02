/**
 * @fileoverview commit 标记（`specs/005-us-909-session-replay/contracts/replay-plugin.md` §3、AC#14）。
 *
 * @remarks
 * 应用库上真装 `@aiao/rxdb-plugin-working-tree` 并真提交：标记靠门面的 `commits$` 打，按时间戳反查 commit 是被明令禁止的形态，
 * 所以这里要的是「每次真写进新 commit 恰好一个标记，`commitId` 与 `listCommits()` 对得上」，替身给不出这个保证。
 */

import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree, type CommitResult } from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote } from '@aiao/rxdb-plugin-working-tree/testing';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_MARKER_TAGS } from '../markers.js';
import { rxDBPluginReplay } from '../plugin.js';
import { createAppDb, createPgliteDb, createRecordingDbFactory } from './fixtures/dbs.js';
import { fakeRrweb, stubPage } from './fixtures/page.js';

const rrweb = vi.hoisted(() => ({ current: null as ReturnType<typeof fakeRrweb> | null }));
vi.mock('rrweb', () => ({
  get record() {
    return rrweb.current?.record;
  }
}));

const FLUSH = { intervalMs: 60_000, maxEvents: 1_000 };

let app: RxDB | undefined;

beforeEach(() => {
  rrweb.current = fakeRrweb();
  stubPage();
});

afterEach(async () => {
  await app?.destroy();
  app = undefined;
  vi.unstubAllGlobals();
});

/** 装了工作树（已启用）与录制插件的应用库。工作树贡献系统表，必须排在 `connect()` 之前 `use()`。 */
const connectWorkingTreeApp = async (): Promise<RxDB> => {
  app = createPgliteDb(`replay-wt-${randomUUID()}`, [ConformanceNote]);
  app.use(rxDBPluginWorkingTree);
  app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory, flush: FLUSH });
  await app.connect('pglite');
  await app.workingTree.enable();
  return app;
};

/** 改一行业务数据（让工作树变脏），再拿刚读到的凭据提交一次。 */
const editAndCommit = async (db: RxDB, title: string): Promise<CommitResult & { ok: true }> => {
  const adapter = await firstValueFrom(db.localAdapter$);
  const note = new ConformanceNote();
  note.title = title;
  note.body = null;
  await adapter.transaction(executor => executor.getRepository(ConformanceNote).create(note));
  const status = await db.workingTree.status();
  const result = await db.workingTree.commit(title, {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision,
    authorId: 'replay-test',
    operationId: randomUUID()
  });
  if (!result.ok) throw new Error(`期望提交成功，实际冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

describe('录制中提交 → commit 标记', () => {
  it('两次提交 → 两个标记，commitId 与 listCommits() 一致、按提交先后排列', async () => {
    const db = await connectWorkingTreeApp();
    const sessionId = await db.replay.start();

    const first = await editAndCommit(db, '第一次');
    const second = await editAndCommit(db, '第二次');
    await db.replay.stop();

    const markers = await db.replay.listCommitMarkers(sessionId);
    const { branchId, entries } = await db.workingTree.listCommits();
    expect(markers.map(marker => marker.commitId)).toEqual([first.commitId, second.commitId]);
    // listCommits() 最新在前，最末一条是 enable() 的基线
    expect(
      entries
        .slice(0, 2)
        .map(entry => entry.commitId)
        .reverse()
    ).toEqual([first.commitId, second.commitId]);
    expect(markers.every(marker => marker.branchId === branchId)).toBe(true);
    expect(markers.map(marker => marker.seq)).toEqual([...markers.map(marker => marker.seq)].sort((a, b) => a - b));
  });

  it('标记经 rrweb 的 addCustomEvent 写成 Custom 事件，落在回放时间轴上', async () => {
    const db = await connectWorkingTreeApp();
    const sessionId = await db.replay.start();

    const { commitId } = await editAndCommit(db, '一次提交');
    await db.replay.stop();

    expect(rrweb.current?.record.addCustomEvent).toHaveBeenCalledWith(REPLAY_MARKER_TAGS.commit, {
      commitId,
      branchId: expect.any(String)
    });
    const [marker] = await db.replay.listCommitMarkers(sessionId);
    const events = await db.replay.readEvents(sessionId);
    expect(events.find(event => event.timestamp === marker?.timestamp)).toMatchObject({
      type: 5,
      data: { tag: REPLAY_MARKER_TAGS.commit, payload: { commitId } }
    });
  });

  it('没在录制时提交不写标记；停录之后的提交不进上一个会话', async () => {
    const db = await connectWorkingTreeApp();
    await editAndCommit(db, '录制前');
    const sessionId = await db.replay.start();
    const during = await editAndCommit(db, '录制中');
    await db.replay.stop();

    await editAndCommit(db, '录制后');

    expect(rrweb.current?.record.addCustomEvent).toHaveBeenCalledOnce();
    expect((await db.replay.listCommitMarkers(sessionId)).map(marker => marker.commitId)).toEqual([during.commitId]);
  });
});

describe('没装工作树插件', () => {
  it('录制照常，listCommitMarkers 为空', async () => {
    app = createAppDb();
    app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory, flush: FLUSH });
    await app.connect('pglite');

    const sessionId = await app.replay.start();
    await app.replay.stop();

    expect(await app.replay.listCommitMarkers(sessionId)).toEqual([]);
    expect(await app.replay.readEvents(sessionId)).toHaveLength(1);
  });

  it('listCommitMarkers 对不存在的会话 → session_not_found', async () => {
    app = createAppDb();
    app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory, flush: FLUSH });
    await app.connect('pglite');

    await expect(app.replay.listCommitMarkers('missing')).rejects.toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'session_not_found' })
    );
  });
});
