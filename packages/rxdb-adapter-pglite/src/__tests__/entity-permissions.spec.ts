/**
 * @fileoverview US-027 阶段 B — 公开写入口判定的真库证据（AC#6、7、9）。
 *
 * 核心包的同名 spec 用替身证明「写没有发出去」；这里用 PGlite 证明库里的行确实原样：
 *
 * 1. AC#6 被拒的 create 不留新行，update 后行原样，remove 后行仍在；
 * 2. AC#7 批量与「带出关联实体的单条 save()」整批被拒，合规的那几条也没落库；
 *    未改动的只读关联实体不会被带进批次误拒；
 * 3. AC#9 适配器 `mutations()` 与 `transaction()` 执行器不判定，系统写照常进行。
 */

import {
  Entity,
  EntityBase,
  type EntityPropertyMetadataOptions,
  type EntityType,
  PermissionDeniedError,
  PropertyType,
  type RelationEntityObservable,
  RelationKind,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

const TITLE: EntityPropertyMetadataOptions[] = [{ name: 'title', type: PropertyType.string }];

@Entity({
  name: 'PermFolder',
  tableName: 'perm_folder',
  properties: TITLE,
  permissions: { update: 'system' },
  relations: [{ name: 'notes', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'PermNote', mappedProperty: 'folder' }]
})
class PermFolder extends EntityBase {
  title!: string;
}

@Entity({
  name: 'PermNote',
  tableName: 'perm_note',
  properties: TITLE,
  relations: [
    {
      name: 'folder',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PermFolder',
      mappedProperty: 'notes',
      nullable: true
    }
  ]
})
class PermNote extends EntityBase {
  title!: string;
  folderId?: string;
  declare readonly folder$: RelationEntityObservable<typeof PermFolder>;
}

@Entity({ name: 'PermLedger', tableName: 'perm_ledger', properties: TITLE, permissions: { create: 'system' } })
class PermLedger extends EntityBase {
  title!: string;
}

@Entity({ name: 'PermArchive', tableName: 'perm_archive', properties: TITLE, permissions: { delete: 'system' } })
class PermArchive extends EntityBase {
  title!: string;
}

type Titled = EntityBase & { title: string };
type TitledType = EntityType & (new () => Titled);

const TABLES = new Map<EntityType, string>([
  [PermFolder, 'perm_folder'],
  [PermNote, 'perm_note'],
  [PermLedger, 'perm_ledger'],
  [PermArchive, 'perm_archive']
]);

describe('US-027 阶段 B：公开写入口判定（PGlite）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [PermFolder, PermNote, PermLedger, PermArchive],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  const draft = <T extends TitledType>(EntityType: T, title = 'draft'): InstanceType<T> => {
    const entity = new EntityType() as InstanceType<T>;
    entity.title = title;
    return entity;
  };

  /** 经适配器落库（执行器层不判定，AC#9），返回已落库的实体 */
  const seed = async <T extends TitledType>(EntityType: T, title = 'seed'): Promise<InstanceType<T>> => {
    const entity = draft(EntityType, title);
    await adapter.mutations({
      create: new Map<EntityType, Set<EntityBase>>([[EntityType, new Set([entity])]]),
      update: new Map(),
      remove: new Map()
    });
    return entity;
  };

  /** 库里这一行的 title；没有这一行时为 `undefined` */
  const titleInDb = async (EntityType: EntityType, id: string): Promise<string | undefined> => {
    const result = await adapter.internalQuery<{ title: string }>(
      `SELECT "title" FROM "public"."${TABLES.get(EntityType)}" WHERE "id" = $1`,
      [id]
    );
    return result.rows[0]?.title;
  };

  const rejectionOf = (write: Promise<unknown>): Promise<unknown> =>
    write.then(
      () => {
        throw new Error('写入应被拒绝，却成功了');
      },
      (error: unknown) => error
    );

  describe('AC#6 单条入口被拒后库里原样', () => {
    it.each([
      ['门面 Repository.create()', (e: PermLedger) => rxdb.entityManager.getRepository(PermLedger).create(e)],
      ['EntityManager.create()', (e: PermLedger) => rxdb.entityManager.create(e)],
      ['EntityManager.save()', (e: PermLedger) => rxdb.entityManager.save(e)],
      ['实体实例 save()', (e: PermLedger) => e.save()]
    ])('%s：被拒的 create 不留新行', async (_label, run) => {
      const ledger = draft(PermLedger);

      expect(await rejectionOf(run(ledger))).toBeInstanceOf(PermissionDeniedError);
      expect(await titleInDb(PermLedger, ledger.id)).toBeUndefined();
    });

    it.each([
      [
        '门面 Repository.update()',
        (e: PermFolder) => rxdb.entityManager.getRepository(PermFolder).update(e, { title: 'changed' })
      ],
      ['EntityManager.update()', (e: PermFolder) => rxdb.entityManager.update(e)],
      ['EntityManager.save()', (e: PermFolder) => rxdb.entityManager.save(e)],
      ['实体实例 save()', (e: PermFolder) => e.save()]
    ])('%s：被拒的 update 后行原样', async (_label, run) => {
      const folder = await seed(PermFolder);
      folder.title = 'changed';

      expect(await rejectionOf(run(folder))).toBeInstanceOf(PermissionDeniedError);
      expect(await titleInDb(PermFolder, folder.id)).toBe('seed');
    });

    it.each([
      ['门面 Repository.remove()', (e: PermArchive) => rxdb.entityManager.getRepository(PermArchive).remove(e)],
      ['EntityManager.remove()', (e: PermArchive) => rxdb.entityManager.remove(e)],
      ['实体实例 remove()', (e: PermArchive) => e.remove()]
    ])('%s：被拒的 remove 后行仍在', async (_label, run) => {
      const archive = await seed(PermArchive);

      expect(await rejectionOf(run(archive))).toBeInstanceOf(PermissionDeniedError);
      expect(await titleInDb(PermArchive, archive.id)).toBe('seed');
    });
  });

  describe('AC#7 批量与带出关联实体的单条 save() 整批被拒', () => {
    it('saveMany()：合规的新行也没落库，违规的行原样', async () => {
      const note = draft(PermNote);
      const folder = await seed(PermFolder);
      folder.title = 'changed';
      const ledger = draft(PermLedger);

      const error = await rejectionOf(rxdb.entityManager.saveMany([note, folder, ledger] as EntityBase[]));

      expect((error as PermissionDeniedError).violations.map(v => `${v.entity}:${v.operation}`)).toEqual([
        'PermLedger:create',
        'PermFolder:update'
      ]);
      expect(await titleInDb(PermNote, note.id)).toBeUndefined();
      expect(await titleInDb(PermFolder, folder.id)).toBe('seed');
      expect(await titleInDb(PermLedger, ledger.id)).toBeUndefined();
    });

    it('removeMany()：合规的那行也没被删', async () => {
      const note = await seed(PermNote);
      const archive = await seed(PermArchive);

      const error = await rejectionOf(rxdb.entityManager.removeMany([note, archive] as EntityBase[]));

      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(await titleInDb(PermNote, note.id)).toBe('seed');
      expect(await titleInDb(PermArchive, archive.id)).toBe('seed');
    });

    it('mutations()：合规的新行也没落库', async () => {
      const note = draft(PermNote);
      const folder = await seed(PermFolder);
      folder.title = 'changed';

      const error = await rejectionOf(
        rxdb.entityManager.mutations({
          create: new Map<EntityType, Set<EntityBase>>([[PermNote, new Set([note])]]),
          update: new Map<EntityType, Set<EntityBase>>([[PermFolder, new Set([folder])]]),
          remove: new Map()
        })
      );

      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(await titleInDb(PermNote, note.id)).toBeUndefined();
      expect(await titleInDb(PermFolder, folder.id)).toBe('seed');
    });

    it('单条 save() 带出改过的只读关联实体：整批被拒，自身也没落库', async () => {
      const folder = await seed(PermFolder);
      folder.title = 'changed';
      const note = draft(PermNote);
      note.folder$.set(folder);

      const error = await rejectionOf(note.save());

      expect((error as PermissionDeniedError).violations).toEqual([
        { namespace: 'public', entity: 'PermFolder', operation: 'update' }
      ]);
      expect(await titleInDb(PermNote, note.id)).toBeUndefined();
      expect(await titleInDb(PermFolder, folder.id)).toBe('seed');
    });

    it('关联的只读实体没改动：不进批次，save() 照常落库', async () => {
      const folder = await seed(PermFolder);
      const note = draft(PermNote, 'linked');
      note.folder$.set(folder);

      await note.save();

      expect(await titleInDb(PermNote, note.id)).toBe('linked');
    });
  });

  describe('AC#9 适配器 / 执行器层不判定', () => {
    it('adapter.mutations() 更新 update: system 的实体成功', async () => {
      const folder = await seed(PermFolder);
      folder.title = 'by-adapter';

      await adapter.mutations({
        create: new Map(),
        update: new Map<EntityType, Set<EntityBase>>([[PermFolder, new Set([folder])]]),
        remove: new Map()
      });

      expect(await titleInDb(PermFolder, folder.id)).toBe('by-adapter');
    });

    it('transaction() 执行器的仓储更新 update: system 的实体成功', async () => {
      const folder = await seed(PermFolder);

      await (
        await rxdb.getAdapter('pglite')
      ).transaction(executor => executor.getRepository(PermFolder).update(folder, { title: 'by-executor' }));

      expect(await titleInDb(PermFolder, folder.id)).toBe('by-executor');
    });
  });
});
