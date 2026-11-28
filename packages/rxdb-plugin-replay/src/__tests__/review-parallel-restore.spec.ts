import type { RxDB } from '@aiao/rxdb';
import {
  rxDBPluginWorkingTree,
  type WorkingTreeDiffEntry,
  type WorkingTreeStatus
} from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote } from '@aiao/rxdb-plugin-working-tree/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { rxDBPluginReplay } from '../plugin.js';
import { createPgliteDb, createRecordingDbFactory } from './fixtures/dbs.js';

const apps: RxDB[] = [];

const createApp = async (): Promise<RxDB> => {
  const db = createPgliteDb(`review-replay-restore-${crypto.randomUUID()}`, [ConformanceNote]);
  apps.push(db);
  db.use(rxDBPluginWorkingTree);
  db.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory });
  await db.connect('pglite');
  await db.workingTree.enable();
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
  const status = await db.workingTree.status();
  const committed = await db.workingTree.commit(title, {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision,
    authorId: 'review-plugins',
    operationId: crypto.randomUUID()
  });
  if (!committed.ok) throw new Error(`复验夹具提交失败：${JSON.stringify(committed)}`);
  return { commitId: committed.commitId, noteId: note.id };
};

const credentialsOf = (status: WorkingTreeStatus) => ({
  expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});

const contentOf = (entry: WorkingTreeDiffEntry) => ({
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

/** 条目按实体 id 排：`diff()` 按条目 id 排，同一笔 restore 写下的几条 id 先后不承诺 */
const byEntityId = (entries: readonly WorkingTreeDiffEntry[]): WorkingTreeDiffEntry[] =>
  [...entries].sort((left, right) => String(left.entityId).localeCompare(String(right.entityId)));

describe('并行评审：replay 恢复走真实 PGlite 工作树事务', () => {
  // US-320 之后 restore 把业务表写成目标提交的数据，条目是「HEAD → 目标」的差异（不再是目标节点自己的变更单元），
  // discard 把业务表退回 HEAD。replay 只是现取凭据转调 restore()，两条路落下的业务表、条目与状态必须一模一样。
  it('replay 恢复与直接 restore 对照一致：业务表呈现目标提交的数据、差异计为未提交改动，discard 退回 HEAD', async () => {
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
    const changed = await db.workingTree.status();
    const committed = await db.workingTree.commit('changed', {
      expectedBranch: { branchId: changed.branchId, activationRevision: changed.activationRevision },
      expectedHeadRevision: changed.headRevision,
      expectedWorkingTreeRevision: changed.workingTreeRevision,
      authorId: 'review-plugins',
      operationId: crypto.randomUUID()
    });
    expect(committed.ok).toBe(true);
    const before = await db.workingTree.status();
    const history = await db.workingTree.listCommits();
    const target = await db.workingTree.commitChanges(first.commitId);
    const projectionBefore = await projectionOf(db);
    expect(before).toMatchObject({ clean: true, entryCount: 0, restoring: false, conflicted: false });
    expect((await db.workingTree.diff()).entries).toEqual([]);
    expect(await db.workingTree.restoreSession()).toBeNull();
    expect(target.entries).toHaveLength(1);
    expect(target.entries[0]).toMatchObject({ entityId: first.noteId, operation: 'insert', patch: { title: 'first' } });
    expect(projectionBefore.find(row => row.id === first.noteId)?.title).toBe('changed');
    // 目标提交里只有 first 一行、标题还是 'first'：second 是之后插进来的，first 的标题是之后改的——差异正好两条
    const projectionAtTarget = [{ id: first.noteId, title: 'first' }];
    const restored = await db.replay.restoreToCommit(first.commitId);
    expect(restored).toMatchObject({ ok: true, restoredCount: 2 });
    expect(await noteIds(db)).toEqual([first.noteId]);
    const restoredNotes = await adapter.transaction(
      executor =>
        executor.getRepository(ConformanceNote).find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: first.noteId }] }
        }),
      false
    );
    const diff = await db.workingTree.diff();
    const firstEntry = diff.entries.find(entry => entry.entityId === first.noteId);
    const secondEntry = diff.entries.find(entry => entry.entityId === second.noteId);
    expect(diff.entries).toHaveLength(2);
    expect(firstEntry).toMatchObject({
      entityId: first.noteId,
      operation: 'update',
      patch: { title: 'first' },
      inversePatch: { title: 'changed' },
      origin: 'local'
    });
    // 删除条目的 inversePatch 是 HEAD 上的整行：discard 拿它把这一行插回来（下面 discard 之后的投影对照就是证据）
    expect(secondEntry).toMatchObject({
      entityId: second.noteId,
      operation: 'delete',
      patch: null,
      inversePatch: { title: 'second' },
      origin: 'local'
    });
    // 条目是这次 restore 新写的单元，不借目标节点的 unitId，也不挂哪笔捕获事务
    expect(diff.entries.map(entry => entry.unitId)).not.toContain(target.entries[0]?.unitId);
    expect(diff.entries.map(entry => entry.transactionId)).toEqual([null, null]);
    expect(diff.baseHeadCommitId).toBe(history.headCommitId);
    expect(restoredNotes[0]?.title).toBe('first');
    expect(await projectionOf(db)).toEqual(projectionAtTarget);
    const after = await db.workingTree.status();
    expect(after.headRevision).toBe(before.headRevision);
    expect(after.branchId).toBe(before.branchId);
    expect(after.activationRevision).toBe(before.activationRevision);
    expect(after.workingTreeRevision).toBe(before.workingTreeRevision + 1);
    expect(after).toMatchObject({
      clean: false,
      entryCount: 2,
      restoring: true,
      conflicted: false,
      byOrigin: { local: 2, remote_sync: 0 }
    });
    if (!restored.ok) throw new Error('复验夹具恢复被拒');
    expect(restored.workingTreeRevision).toBe(after.workingTreeRevision);
    expect(await db.workingTree.restoreSession()).toEqual({
      id: restored.sessionId,
      branchId: before.branchId,
      targetCommitId: first.commitId,
      status: 'active'
    });
    expect(await db.workingTree.listCommits()).toEqual(history);
    await expect(db.replay.restoreToCommit(first.commitId)).resolves.toEqual({
      ok: false,
      reason: 'dirty_working_tree'
    });
    expect(await noteIds(db)).toEqual([first.noteId]);
    expect(await db.workingTree.status()).toEqual(after);
    expect(await db.workingTree.diff()).toEqual(diff);
    expect(await projectionOf(db)).toEqual(projectionAtTarget);
    await expect(db.workingTree.discard(credentialsOf(after))).resolves.toMatchObject({ ok: true, discardedCount: 2 });
    // discard 把业务表退回 HEAD：second 按删除条目的 inversePatch 插回来，first 的标题回到 'changed'
    expect(await projectionOf(db)).toEqual(projectionBefore);
    const cleared = await db.workingTree.status();
    expect(cleared).toMatchObject({ clean: true, entryCount: 0, restoring: false, conflicted: false });
    expect(await db.workingTree.restoreSession()).toBeNull();
    const direct = await db.workingTree.restore({ commitId: first.commitId }, credentialsOf(cleared));
    expect(direct).toMatchObject({ ok: true, restoredCount: 2 });
    const directDiff = await db.workingTree.diff();
    expect(byEntityId(directDiff.entries).map(contentOf)).toEqual(byEntityId(diff.entries).map(contentOf));
    expect(await projectionOf(db)).toEqual(projectionAtTarget);
    expect(await db.workingTree.listCommits()).toEqual(history);
    const directStatus = await db.workingTree.status();
    expect(directStatus).toMatchObject({
      clean: false,
      entryCount: 2,
      restoring: true,
      conflicted: false,
      headRevision: before.headRevision,
      branchId: before.branchId,
      activationRevision: before.activationRevision
    });
    await expect(db.workingTree.discard(credentialsOf(directStatus))).resolves.toMatchObject({
      ok: true,
      discardedCount: 2
    });
    expect(await projectionOf(db)).toEqual(projectionBefore);
    expect(await db.workingTree.restoreSession()).toBeNull();
    expect((await db.workingTree.diff()).entries).toEqual([]);
    expect(await db.workingTree.status()).toMatchObject({
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
        exitStatus: await db.workingTree.status()
      })
    );
  });

  it('不可达目标拒绝不改数据/HEAD，断开后公开入口明确拒绝', async () => {
    const db = await createApp();
    const { noteId } = await createAndCommit(db, 'kept');
    const before = await db.workingTree.status();
    await expect(db.replay.restoreToCommit('review-unreachable')).resolves.toEqual({
      ok: false,
      reason: 'unreachable_target'
    });
    expect(await noteIds(db)).toEqual([noteId]);
    expect(await db.workingTree.status()).toEqual(before);
    await db.disconnectAll();
    await expect(db.replay.restoreToCommit('review-unreachable')).rejects.toMatchObject({ code: 'not_installed' });
  });
});
