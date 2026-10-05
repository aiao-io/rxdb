import type { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
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

const createAndCommit = async (db: RxDB, title: string): Promise<{ commitId: string; noteId: string }> => {
  const adapter = await firstValueFrom(db.localAdapter$);
  const note = new ConformanceNote();
  note.title = title;
  note.body = null;
  await adapter.transaction(executor => executor.getRepository(ConformanceNote).create(note));
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
  it('恢复旧提交形成未提交变更，HEAD 不动，重复恢复以 dirty 拒绝', async () => {
    const db = await createApp();
    const first = await createAndCommit(db, 'first');
    const second = await createAndCommit(db, 'second');
    const adapter = await firstValueFrom(db.localAdapter$);
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(ConformanceNote);
      const [note] = await repository.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: first.noteId }] }
      });
      if (!note) throw new Error('复验夹具首条 note 缺失');
      await repository.update(note, { title: 'changed' });
    });
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
    expect(restoredNotes[0]?.title).toBe('first');
    const after = await db.workingTree.status();
    expect(after.headRevision).toBe(before.headRevision);
    expect(after.branchId).toBe(before.branchId);
    expect(after.activationRevision).toBe(before.activationRevision);
    expect(after.workingTreeRevision).toBeGreaterThan(before.workingTreeRevision);
    expect(await db.workingTree.listCommits()).toEqual(history);
    await expect(db.replay.restoreToCommit(first.commitId)).resolves.toEqual({
      ok: false,
      reason: 'dirty_working_tree'
    });
    expect(await noteIds(db)).toEqual([first.noteId, second.noteId].sort());
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
