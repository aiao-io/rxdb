import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';

const { trackRxDB } = registerRxDBTeardown();

@Entity({
  name: 'WriteResultNote',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'body', type: PropertyType.string, nullable: true }
  ]
})
class WriteResultNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
  body!: string | null;
}

const CREATED = new Date('2026-01-01T00:00:00.000Z');
const STORED = new Date('2026-01-02T00:00:00.000Z');
const WRITTEN = new Date('2026-01-03T00:00:00.000Z');

const createDatabase = (dbName: string): RxDB => {
  const rxdb = trackRxDB(
    new RxDB({
      dbName,
      entities: [WriteResultNote],
      sync: { local: { adapter: 'noop' }, type: SyncType.None },
      multiInstance: false
    })
  );
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const storedNote = (rxdb: RxDB) =>
  rxdb.entityManager.createEntityRef(
    WriteResultNote,
    {
      id: 'note',
      title: 'original',
      body: 'stored body',
      createdAt: CREATED,
      updatedAt: STORED
    },
    { local: true, modified: false }
  );

const writtenRow = (values: Partial<WriteResultNote>) =>
  ({
    id: 'note',
    title: 'original',
    body: 'stored body',
    createdAt: CREATED,
    updatedAt: WRITTEN,
    ...values
  }) as Partial<WriteResultNote>;

describe('EntityStatus.applyWriteResult：写入成功后的收尾', () => {
  it('提交之后对同一字段的新输入保留为未保存改动，基线推进到写入的值', () => {
    const note = storedNote(createDatabase('write-result-same-field'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    const mark = status.writeMark(submitted);
    note.title = 'typed while saving';

    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, mark);

    expect(note.title).toBe('typed while saving');
    expect(note.updatedAt).toEqual(WRITTEN);
    expect(status.origin.title).toBe('submitted');
    expect(status.origin.updatedAt).toEqual(WRITTEN);
    expect(status.patch).toEqual({ title: 'typed while saving' });
    expect(status.modified).toBe(true);
  });

  it('提交之后对其他字段的新输入同样保留', () => {
    const note = storedNote(createDatabase('write-result-other-field'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    const mark = status.writeMark(submitted);
    note.body = 'typed body';

    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, mark);

    expect(note.title).toBe('submitted');
    expect(note.body).toBe('typed body');
    expect(status.origin.body).toBe('stored body');
    expect(status.patch).toEqual({ body: 'typed body' });
    expect(status.modified).toBe(true);
  });

  it('没有新输入时整行取数据库的值，脏标记归零', () => {
    const note = storedNote(createDatabase('write-result-clean'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    const mark = status.writeMark(submitted);

    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, mark);

    expect(note.title).toBe('submitted');
    expect(note.updatedAt).toEqual(WRITTEN);
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });

  it('数据库改写了提交的值时以数据库为准，不残留假差异', () => {
    const note = storedNote(createDatabase('write-result-normalized'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    const mark = status.writeMark(submitted);

    status.applyWriteResult(writtenRow({ title: 'SUBMITTED' }), submitted, mark);

    expect(note.title).toBe('SUBMITTED');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });

  it('提交之后改走又改回提交值，按已写入收敛', () => {
    const note = storedNote(createDatabase('write-result-reverted'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    const mark = status.writeMark(submitted);
    note.title = 'detour';
    note.title = 'submitted';

    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, mark);

    expect(note.title).toBe('submitted');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });

  it('只提交了部分字段时，没提交的未保存编辑留着待下次保存', () => {
    const note = storedNote(createDatabase('write-result-partial'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    note.body = 'not submitted';

    const submitted = { title: 'submitted' };
    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, status.writeMark(submitted));

    expect(note.title).toBe('submitted');
    expect(note.body).toBe('not submitted');
    expect(status.patch).toEqual({ body: 'not submitted' });
    expect(status.modified).toBe(true);
  });

  it('创建：生成 INSERT 之后的新输入保留，库里生成的字段照收', () => {
    const rxdb = createDatabase('write-result-create');
    const draft = rxdb.entityManager.createEntityRef(WriteResultNote, { id: 'note', title: 'draft' });
    const status = getEntityStatus(draft);
    const submitted = { ...draft };
    const mark = status.writeMark(submitted);
    draft.title = 'typed after insert';

    status.applyWriteResult(writtenRow({ title: 'draft', body: null }), submitted, mark);
    status.local = true;

    expect(draft.title).toBe('typed after insert');
    expect(draft.createdAt).toEqual(CREATED);
    expect(status.origin.title).toBe('draft');
    expect(status.patch).toEqual({ title: 'typed after insert' });
    expect(status.modified).toBe(true);
  });
it('patch 取走之后、写入开始之前（事务排队期间）的编辑同样算提交之后', () => {
    const note = storedNote(createDatabase('write-result-queued'));
    const status = getEntityStatus(note);
    note.title = 'submitted';
    const submitted = status.patch;
    note.title = 'typed while queued';
    const mark = status.writeMark(submitted);

    status.applyWriteResult(writtenRow({ title: 'submitted' }), submitted, mark);

    expect(note.title).toBe('typed while queued');
    expect(status.patch).toEqual({ title: 'typed while queued' });
    expect(status.modified).toBe(true);
  });

  it('调用方提交实例上从未写过的值时，实例上的旧值不算新编辑', () => {
    const note = storedNote(createDatabase('write-result-explicit-patch'));
    const status = getEntityStatus(note);
    note.title = 'stale local';
    status.mergeExternal(writtenRow({ title: 'stale local' }));
    expect(status.modified).toBe(false);
    const submitted = { title: 'computed elsewhere' };
    const mark = status.writeMark(submitted);

    status.applyWriteResult(writtenRow({ title: 'computed elsewhere' }), submitted, mark);

    expect(note.title).toBe('computed elsewhere');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });
});
