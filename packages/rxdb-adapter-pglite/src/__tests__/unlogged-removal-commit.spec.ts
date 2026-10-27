import { Entity, ENTITY_LOCAL_REMOVE_EVENT, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { generateDbName } from './test-utils.js';

/**
 * @fileoverview 不写变更日志的实体，删除通知必须随所属事务提交才发出（INC-002）。
 *
 * @remarks
 * PGlite 不派核心的事务事件，核心不会替它把事务里派的事件排队：删行之后当场派，事务随后回滚
 * 或 COMMIT 失败，行还在而 `ENTITY_LOCAL_REMOVE` 已经到了订阅者手里。
 * COMMIT 失败用延迟外键造：建表时外键一律 `DEFERRABLE INITIALLY DEFERRED`，引用还在时删父行，
 * DELETE 本身成功，违约到 COMMIT 才报。
 */
@Entity({
  name: 'CommitNote',
  tableName: 'commit_note',
  log: false,
  properties: [{ name: 'title', type: PropertyType.string, nullable: true }]
})
class CommitNote extends EntityBase {
  title?: string | null;
}

/** 引用 {@link CommitNote} 的行：不带 `onDelete`，删被引用的行要到 COMMIT 才报外键违约 */
@Entity({
  name: 'CommitNoteRef',
  tableName: 'commit_note_ref',
  log: false,
  properties: [{ name: 'noteId', type: PropertyType.uuid, required: true }],
  foreignKeys: [{ name: 'note', properties: ['noteId'], mappedEntity: 'CommitNote', mappedProperties: ['id'] }]
})
class CommitNoteRef extends EntityBase {
  declare noteId: string;
}

describe('无日志实体的删除通知随事务提交（INC-002）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let removedIds: string[];

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [CommitNote, CommitNoteRef],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
    removedIds = [];
    rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, event => {
      removedIds.push(...event.entities.map(entity => String(entity.id)));
    });
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const saveNote = async (): Promise<CommitNote> => {
    const note = new CommitNote();
    note.title = 'note';
    await note.save();
    return note;
  };

  const countNotes = async (): Promise<number> => {
    const result = await adapter.internalQuery<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM public.commit_note'
    );
    return Number(result.rows[0].count);
  };

  it('显式事务里经仓库删除后回滚：行还在，一条删除通知都不发', async () => {
    const note = await saveNote();

    await expect(
      adapter.transaction(async executor => {
        await executor.getRepository(CommitNote).remove(note);
        throw new Error('业务失败');
      })
    ).rejects.toThrow('业务失败');

    expect(await countNotes()).toBe(1);
    expect(removedIds).toEqual([]);
  });

  it('显式事务里经批量删除后回滚：同样零通知', async () => {
    const note = await saveNote();

    await expect(
      adapter.transaction(async executor => {
        await executor.removeMany([note]);
        throw new Error('业务失败');
      })
    ).rejects.toThrow('业务失败');

    expect(await countNotes()).toBe(1);
    expect(removedIds).toEqual([]);
  });

  it('COMMIT 时延迟外键违约：删除失败，零通知', async () => {
    const note = await saveNote();
    const ref = new CommitNoteRef();
    ref.noteId = note.id;
    await ref.save();

    await expect(note.remove()).rejects.toThrow();

    expect(await countNotes()).toBe(1);
    expect(removedIds).toEqual([]);
  });

  it('正常删除：恰好一条通知', async () => {
    const note = await saveNote();

    await note.remove();

    expect(removedIds).toEqual([note.id]);
    expect(await countNotes()).toBe(0);
  });

  it('事务里删除：提交之前一条都不发，提交之后恰好一条', async () => {
    const first = await saveNote();
    const second = await saveNote();
    let seenBeforeCommit: string[] | undefined;

    await adapter.transaction(async executor => {
      await executor.getRepository(CommitNote).remove(first);
      await executor.removeMany([second]);
      seenBeforeCommit = [...removedIds];
    });

    expect(seenBeforeCommit).toEqual([]);
    expect(removedIds.sort()).toEqual([first.id, second.id].sort());
  });
});
