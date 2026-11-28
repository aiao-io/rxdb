/**
 * @fileoverview 多对多关联行 id：字符串主键里带分隔符（US-228，评审 F5）
 *
 * @remarks
 * 派生名字曾把主键原样拼进 `…|<外键>=<主键>|<外键>=<主键>`：`('a|tagsId=b', 'c')` 与 `('a', 'b|tagsId=c')`
 * 拼出同一段名字、得到同一个 id，第二对插入中间表时撞上同 id 的行，按「这一对已经在库里」保留原行，
 * 两对静默合并成一对。这里在真实 PGlite 上把两对都关联上，读回中间表核对两行与各自的两端。
 */
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  junctionEntityId,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityType,
  type RelationEntitiesObservable
} from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

@Entity({
  name: 'KeyedNote',
  namespace: 'junction_keys',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }],
  relations: [{ name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'KeyedTag', mappedProperty: 'notes' }]
})
class KeyedNote extends EntityBase<string> {
  declare id: string;
  declare readonly tags$: RelationEntitiesObservable<typeof KeyedTag>;
}

@Entity({
  name: 'KeyedTag',
  namespace: 'junction_keys',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }],
  relations: [{ name: 'notes', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'KeyedNote', mappedProperty: 'tags' }]
})
class KeyedTag extends EntityBase<string> {
  declare id: string;
}

interface JunctionRow {
  id: string;
  notesId: string;
  tagsId: string;
}

describe('多对多关联行 id：字符串主键里带分隔符', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [KeyedNote, KeyedTag],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const junctionOf = (): EntityType => {
    const relation = getEntityMetadata(KeyedNote).relationMap.get('tags');
    if (relation?.kind !== RelationKind.MANY_TO_MANY) throw new Error('KeyedNote.tags 不是多对多');
    return relation.junctionEntityType;
  };

  const note = async (id: string): Promise<KeyedNote> => {
    const created = new KeyedNote();
    created.id = id;
    await created.save();
    return created;
  };

  const tag = async (id: string): Promise<KeyedTag> => {
    const created = new KeyedTag();
    created.id = id;
    await created.save();
    return created;
  };

  const derivedId = (noteId: string, tagId: string): string =>
    junctionEntityId(getEntityMetadata(junctionOf()), [
      { foreignKey: 'notesId', id: noteId, uuid: false },
      { foreignKey: 'tagsId', id: tagId, uuid: false }
    ]);

  it('拼出同一段文本的两对各自落成一行，id 不同、两端都对得上', async () => {
    const firstNote = await note('a|tagsId=b');
    const firstTag = await tag('c');
    const secondNote = await note('a');
    const secondTag = await tag('b|tagsId=c');

    await firstNote.tags$.add(firstTag);
    await firstNote.save();
    await secondNote.tags$.add(secondTag);
    await secondNote.save();

    const result = await adapter.internalQuery<JunctionRow>(
      `SELECT id, "notesId", "tagsId" FROM "junction_keys"."KeyedNote_KeyedTag" ORDER BY "notesId"`
    );
    expect(result.rows).toEqual([
      { id: derivedId('a', 'b|tagsId=c'), notesId: 'a', tagsId: 'b|tagsId=c' },
      { id: derivedId('a|tagsId=b', 'c'), notesId: 'a|tagsId=b', tagsId: 'c' }
    ]);
    expect(derivedId('a', 'b|tagsId=c')).not.toBe(derivedId('a|tagsId=b', 'c'));
  });
});
