import type { RxDB } from '@aiao/rxdb';
import {
  rxDBPluginWorktree,
  type WorktreeDiffEntry,
  type WorktreeStatus
} from '@aiao/rxdb-plugin-worktree';
import { ConformanceNote } from '@aiao/rxdb-plugin-worktree/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { rxDBPluginReplay } from '../plugin.js';
import { createPgliteDb, createRecordingDbFactory } from './fixtures/dbs.js';

const apps: RxDB[] = [];

const createApp = async (): Promise<RxDB> => {
  const db = createPgliteDb(`review-replay-restore-${crypto.randomUUID()}`, [ConformanceNote]);
  apps.push(db);
  db.use(rxDBPluginWorktree);
  db.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory });
  await db.connect('pglite');
  await db.worktree.enable();
  return db;
};

const createAndCommit = async (
  db: RxDB,
  title: string
): Promise<{ commitId: string; noteId: ConformanceNote['id'] }> => {
  const note = db.entityManager.instantiate(ConformanceNote);
  note.title = title;
  note.body = null;
  await note.save();
  const status = await db.worktree.status();
  const committed = await db.worktree.commit(title, {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorktreeRevision: status.workingTreeRevision,
    authorId: 'review-plugins',
    operationId: crypto.randomUUID()
  });
  if (!committed.ok) throw new Error(`复验夹具提交失败：${JSON.stringify(committed)}`);
  return { commitId: committed.commitId, noteId: note.id };
};

const credentialsOf = (status: WorktreeStatus) => ({
  expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
  expectedHeadRevision: status.headRevision,
  expectedWorktreeRevision: status.workingTreeRevision
});

const contentOf = (entry: WorktreeDiffEntry) => ({
  namespace: entry.namespace,
  entity: entry.entity,
  entityId: entry.entityId,
  operation: entry.operation,
  patch: entry.patch,
  inversePatch: entry.inversePatch,
  origin: entry.origin
});

const projectionOf = async (db: RxDB) => {
  const adapter = await firstValueFrom(db.localAdapter$);
  return adapter.transaction(async executor => {
    const result = await executor.query(
      `SELECT "id", "title" FROM ${executor.tableRef(ConformanceNote)} ORDER BY "id"`
    );
    return result.rows.map(row => ({ id: row[0], title: row[1] }));
  }, false);
};

const noteIds = async (db: RxDB): Promise<string[]> => {
  const adapter = await firstValueFrom(db.localAdapter$);
  return adapter.transaction(async executor => {
    const rows = await executor.getRepository(ConformanceNote).find({ where: { combinator: 'and', rules: [] } });
    return rows.map(row => row.id).sort();
  }, false);
};

afterEach(async () => {
  for (const db of apps.splice(0)) await db.destroy();
});

describe('并行评审：replay 恢复走真实 PGlite 工作树事务', () => {
  it('目标单元写入工作树而非业务投影，replay 与直接 restore 对照一致且可 discard 退场', async () => {
    const db = await createApp();
    const first = await createAndCommit(db, 'first');
    const second = await createAndCommit(db, 'second');
    const adapter = await firstValueFrom(db.localAdapter$);
    const [note] = await firstValueFrom(
      db.entityManager.getRepository(ConformanceNote).find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: first.noteId }] }
      })
    );
    if (!note) throw new Error('复验夹具首条 note 缺失');
    note.title = 'changed';
    await note.save();
    const changed = await db.worktree.status();
    const committed = await db.worktree.commit('changed', {
      expectedBranch: { branchId: changed.branchId, activationRevision: changed.activationRevision },
      expectedHeadRevision: changed.headRevision,
      expectedWorktreeRevision: changed.workingTreeRevision,
      authorId: 'review-plugins',
      operationId: crypto.randomUUID()
    });
    expect(committed.ok).toBe(true);
    const before = await db.worktree.status();
    const history = await db.worktree.listCommits();
    const target = await db.worktree.commitChanges(first.commitId);
    const projectionBefore = await projectionOf(db);
    expect(before).toMatchObject({ clean: true, entryCount: 0, restoring: false, conflicted: false });
    expect((await db.worktree.diff()).entries).toEqual([]);
    expect(await db.worktree.restoreSession()).toBeNull();
    expect(target.entries).toHaveLength(1);
    expect(target.entries[0]).toMatchObject({ entityId: first.noteId, operation: 'insert', patch: { title: 'first' } });
    expect(projectionBefore.find(row => row.id === first.noteId)?.title).toBe('changed');
    const restored = await db.replay.restoreToCommit(first.commitId);
    expect(restored).toMatchObject({ ok: true, restoredCount: 1 });
    expect(await noteIds(db)).toEqual([first.noteId, second.noteId].sort());
    const restoredNotes = await adapter.transaction(
      executor =>
        executor.getRepository(ConformanceNote).find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: first.noteId }] }
        }),
      false
    );
    const diff = await db.worktree.diff();
    expect(diff.entries.map(contentOf)).toEqual(target.entries.map(contentOf));
    expect(diff.entries[0]?.patch).toMatchObject({ title: 'first' });
    expect(diff.entries[0]?.unitId).not.toBe(target.entries[0]?.unitId);
    expect(diff.entries[0]?.transactionId).toBeNull();
    expect(diff.baseHeadCommitId).toBe(history.headCommitId);
    expect(restoredNotes[0]?.title).toBe('changed');
    expect(await projectionOf(db)).toEqual(projectionBefore);
    const after = await db.worktree.status();
    expect(after.headRevision).toBe(before.headRevision);
    expect(after.branchId).toBe(before.branchId);
    expect(after.activationRevision).toBe(before.activationRevision);
    expect(after.workingTreeRevision).toBe(before.workingTreeRevision + 1);
    expect(after).toMatchObject({
      clean: false,
      entryCount: 1,
      restoring: true,
      conflicted: false,
      byOrigin: { local: 1, remote_sync: 0 }
    });
    if (!restored.ok) throw new Error('复验夹具恢复被拒');
    expect(restored.workingTreeRevision).toBe(after.workingTreeRevision);
    expect(await db.worktree.restoreSession()).toEqual({
      id: restored.sessionId,
      branchId: before.branchId,
      targetCommitId: first.commitId,
      status: 'active'
    });
    expect(await db.worktree.listCommits()).toEqual(history);
    await expect(db.replay.restoreToCommit(first.commitId)).resolves.toEqual({
      ok: false,
      reason: 'dirty_working_tree'
    });
    expect(await noteIds(db)).toEqual([first.noteId, second.noteId].sort());
    expect(await db.worktree.status()).toEqual(after);
    expect(await db.worktree.diff()).toEqual(diff);
    expect(await projectionOf(db)).toEqual(projectionBefore);
    await expect(db.worktree.discard(credentialsOf(after))).resolves.toMatchObject({ ok: true, discardedCount: 1 });
    const cleared = await db.worktree.status();
    expect(cleared).toMatchObject({ clean: true, entryCount: 0, restoring: false, conflicted: false });
    expect(await db.worktree.restoreSession()).toBeNull();
    const direct = await db.worktree.restore({ commitId: first.commitId }, credentialsOf(cleared));
    expect(direct).toMatchObject({ ok: true, restoredCount: 1 });
    const directDiff = await db.worktree.diff();
    expect(directDiff.entries.map(contentOf)).toEqual(diff.entries.map(contentOf));
    expect(await projectionOf(db)).toEqual(projectionBefore);
    expect(await db.worktree.listCommits()).toEqual(history);
    const directStatus = await db.worktree.status();
    expect(directStatus).toMatchObject({
      clean: false,
      entryCount: 1,
      restoring: true,
      conflicted: false,
      headRevision: before.headRevision,
      branchId: before.branchId,
      activationRevision: before.activationRevision
    });
    await expect(db.worktree.discard(credentialsOf(directStatus))).resolves.toMatchObject({
      ok: true,
      discardedCount: 1
    });
    expect(await db.worktree.restoreSession()).toBeNull();
    expect((await db.worktree.diff()).entries).toEqual([]);
    expect(await db.worktree.status()).toMatchObject({
      clean: true,
      entryCount: 0,
      restoring: false,
      conflicted: false
    });
    console.info(
      'R3-06 restore evidence',
      JSON.stringify({
        target,
        projectionBefore,
        replayResult: restored,
        replayDiff: diff,
        replayStatus: after,
        directResult: direct,
        directDiff,
        directStatus,
        exitStatus: await db.worktree.status()
      })
    );
  });

  it('不可达目标拒绝不改数据/HEAD，断开后公开入口明确拒绝', async () => {
    const db = await createApp();
    const { noteId } = await createAndCommit(db, 'kept');
    const before = await db.worktree.status();
    await expect(db.replay.restoreToCommit('review-unreachable')).resolves.toEqual({
      ok: false,
      reason: 'unreachable_target'
    });
    expect(await noteIds(db)).toEqual([noteId]);
    expect(await db.worktree.status()).toEqual(before);
    await db.disconnectAll();
    await expect(db.replay.restoreToCommit('review-unreachable')).rejects.toMatchObject({ code: 'not_installed' });
  });
});
