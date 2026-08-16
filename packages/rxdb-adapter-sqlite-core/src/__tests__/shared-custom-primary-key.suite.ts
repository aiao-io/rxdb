import {
  Entity,
  EntityBase,
  PropertyType,
  RelationKind,
  RxDBChange,
  uuid,
  type FindOptions,
  type RelationEntitiesObservable,
  type RelationEntityObservable,
  type RelationExistsRules,
  type RelationStringRules,
  type RuleGroupBase,
  type RxDB,
  type RxDBEntityId,
  type StringRules
} from '@aiao/rxdb';
import { firstValueFrom, type Observable } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db } from './test-utils.js';

/**
 * 主键属性名恒为 `id`，但 `columnName` 是公开可配的：物理列可以叫别的名字。
 * 这些实体把三种关系形态（MANY_TO_ONE / ONE_TO_MANY / MANY_TO_MANY）都挂在自定义主键列上，
 * 用来把建表 → CRUD → 关系 → 事件 → 版本切换整条链路上残留的字面量 `id` 一次性暴露出来（SQLC-014）。
 */
const CUSTOM_ID = {
  name: 'id',
  displayName: 'ID',
  columnName: 'pk_id',
  type: PropertyType.uuid,
  primary: true,
  unique: true,
  readonly: true,
  default: () => uuid()
} as const;

/**
 * 内联测试实体拿不到 `@aiao/rxdb-client-generator` 的产物，`StringKey<T>` 只认类上真实声明的键，
 * 关系路径（`book.title`）与 EXISTS 字段会被类型挡在门外。这里按 rxdb 系统实体
 * （`packages/rxdb/src/system/types.ts`）的手写惯例，只补本套件用到的那几条规则。
 */
type CpkTagRuleGroup = RuleGroupBase<typeof CpkTag, 'label', StringRules<CpkTag, 'label'>>;

type CpkNoteRuleGroup = RuleGroupBase<
  typeof CpkNote,
  'content' | 'book.title' | 'tags' | 'tags.label',
  | StringRules<CpkNote, 'content'>
  | RelationStringRules<'book.title', string>
  | RelationExistsRules<'tags', CpkTagRuleGroup>
  | RelationStringRules<'tags.label', string>
>;

type CpkBookRuleGroup = RuleGroupBase<
  typeof CpkBook,
  'title' | 'notes',
  StringRules<CpkBook, 'title'> | RelationExistsRules<'notes', CpkNoteRuleGroup>
>;

@Entity({
  name: 'CpkTag',
  namespace: 'cpk',
  tableName: 'cpk_tag',
  properties: [{ ...CUSTOM_ID }, { name: 'label', type: PropertyType.string }],
  relations: [{ name: 'notes', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CpkNote', mappedProperty: 'tags' }]
})
class CpkTag extends EntityBase {
  label!: string;
  declare notes$: RelationEntitiesObservable<typeof CpkNote>;
}

@Entity({
  name: 'CpkBook',
  namespace: 'cpk',
  tableName: 'cpk_book',
  properties: [{ ...CUSTOM_ID }, { name: 'title', type: PropertyType.string }],
  relations: [{ name: 'notes', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'CpkNote', mappedProperty: 'book' }]
})
class CpkBook extends EntityBase {
  title!: string;
  declare notes$: RelationEntitiesObservable<typeof CpkNote>;
  declare static find: {
    (options: FindOptions<typeof CpkBook, CpkBookRuleGroup>): Observable<CpkBook[]>;
    <T extends EntityBase<RxDBEntityId>>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  };
}

@Entity({
  name: 'CpkNote',
  namespace: 'cpk',
  tableName: 'cpk_note',
  properties: [{ ...CUSTOM_ID }, { name: 'content', type: PropertyType.string }],
  relations: [
    { name: 'book', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'CpkBook', mappedProperty: 'notes' },
    { name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'CpkTag', mappedProperty: 'notes' }
  ]
})
class CpkNote extends EntityBase {
  content!: string;
  declare book$: RelationEntityObservable<typeof CpkBook>;
  declare tags$: RelationEntitiesObservable<typeof CpkTag>;
  declare static find: {
    (options: FindOptions<typeof CpkNote, CpkNoteRuleGroup>): Observable<CpkNote[]>;
    <T extends EntityBase<RxDBEntityId>>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
  };
}

/** 自定义主键列测试：非默认主键列的建表、写入与查询。 */
export function customPrimaryKeySuite(factory: AdapterFactory) {
  describe.sequential(`自定义主键列 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;
    let rxdb: RxDB;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [CpkBook, CpkNote, CpkTag] });
      rxdb = adapter.rxdb;
    });

    beforeEach(async () => await cleanup_db(adapter));

    afterAll(async () => {
      if (adapter) {
        await cleanup_db(adapter);
        await adapter.rxdb.disconnectAll();
      }
    });

    const createBook = async (title: string): Promise<CpkBook> => {
      const book = new CpkBook();
      book.title = title;
      await book.save();
      return book;
    };

    it('建表：主键落到自定义物理列上', async () => {
      const { rows } = await adapter.rawQuery(`SELECT sql FROM sqlite_master WHERE name = 'cpk$cpk_book'`);
      expect(String(rows[0][0])).toContain('"pk_id" TEXT PRIMARY KEY');
    });

    const allBookTitles = async (): Promise<string[]> =>
      (
        await firstValueFrom(
          CpkBook.find({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'title', sort: 'asc' }] })
        )
      ).map(row => row.title);

    it('CRUD：insert / find / update / remove 全部走自定义主键列', async () => {
      const book = await createBook('cpk-a');
      expect(await firstValueFrom(CpkBook.get(book.id))).toMatchObject({ id: book.id, title: 'cpk-a' });

      book.title = 'cpk-a2';
      await book.save();
      expect((await firstValueFrom(CpkBook.get(book.id))).title).toBe('cpk-a2');

      await book.remove();
      expect(await allBookTitles()).toEqual([]);
    });

    it('CRUD：批量更新与批量删除按自定义主键列定位', async () => {
      const first = await createBook('cpk-b1');
      const second = await createBook('cpk-b2');

      first.title = 'cpk-b1x';
      second.title = 'cpk-b2x';
      await rxdb.entityManager.saveMany([first, second]);
      expect(await allBookTitles()).toEqual(['cpk-b1x', 'cpk-b2x']);

      await rxdb.entityManager.removeMany([first, second]);
      expect(await allBookTitles()).toEqual([]);
    });

    it('关系：MANY_TO_ONE / ONE_TO_MANY 的 JOIN 与 EXISTS 用自定义主键列', async () => {
      const book = await createBook('cpk-c');
      const note = new CpkNote();
      note.content = 'cpk-note';
      note.book$.set(book);
      await note.save();

      const byRelationPath = await firstValueFrom(
        CpkNote.find({ where: { combinator: 'and', rules: [{ field: 'book.title', operator: '=', value: 'cpk-c' }] } })
      );
      expect(byRelationPath.map(row => row.id)).toEqual([note.id]);

      const byExists = await firstValueFrom(
        CpkBook.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'notes',
                operator: 'exists',
                where: { combinator: 'and', rules: [{ field: 'content', operator: '=', value: 'cpk-note' }] }
              }
            ]
          }
        })
      );
      expect(byExists.map(row => row.id)).toEqual([book.id]);
    });

    it('关系：MANY_TO_MANY 的中间表 JOIN 用自定义主键列', async () => {
      const book = await createBook('cpk-m2m-book');
      const note = new CpkNote();
      note.content = 'cpk-m2m';
      note.book$.set(book);
      await note.save();

      const tag = new CpkTag();
      tag.label = 'cpk-tag';
      await tag.save();

      await note.tags$.add(tag);
      await note.save();

      const byRelationPath = await firstValueFrom(
        CpkNote.find({
          where: { combinator: 'and', rules: [{ field: 'tags.label', operator: '=', value: 'cpk-tag' }] }
        })
      );
      expect(byRelationPath.map(row => row.id)).toEqual([note.id]);

      const byExists = await firstValueFrom(
        CpkNote.find({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'tags',
                operator: 'exists',
                where: { combinator: 'and', rules: [{ field: 'label', operator: '=', value: 'cpk-tag' }] }
              }
            ]
          }
        })
      );
      expect(byExists.map(row => row.id)).toEqual([note.id]);
    });

    it('事件：change 表按自定义主键列记录 entityId', async () => {
      const book = await createBook('cpk-d');
      const changes = await firstValueFrom(
        RxDBChange.find({
          where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: 'CpkBook' }] }
        })
      );
      expect(changes.map(change => change.entityId)).toContain(book.id);
    });

    it('版本切换：切回旧分支时按自定义主键列回滚', async () => {
      const book = await createBook('cpk-e');
      await rxdb.versionManager.createBranch('cpk_branch');
      await rxdb.versionManager.switchBranch('cpk_branch');

      book.title = 'cpk-e-on-branch';
      await book.save();
      const onBranch = await createBook('cpk-e-branch-only');

      await rxdb.versionManager.switchBranch('main');

      expect((await firstValueFrom(CpkBook.get(book.id))).title).toBe('cpk-e');
      expect(await allBookTitles()).toEqual(['cpk-e']);
      expect(onBranch.id).toBeDefined();
    });
  });
}
