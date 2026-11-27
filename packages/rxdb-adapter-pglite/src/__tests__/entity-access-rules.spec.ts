/**
 * @fileoverview US-029 阶段 B — 规则形式写权限的真库证据（PGlite，AC#1、4～11、13）。
 *
 * 核心包的同名 spec 用替身证明「写没有发出去」；这里用 PGlite 证明库里的行确实原样、没有留下待推修改：
 *
 * 1. AC#1 shop 的 `IdCard` / `Order`（业务 `ownerId`）没声明 access：快照未取到也照常写；
 * 2. AC#4 快照未取到：三操作都被拒，行不变、没有新的变更日志；
 * 3. AC#5～7 a 可编辑、b 只读：a 写进库，b 被拒；换租户两边都判；前像按库里的值判（库里已被移到 b 也拒）；
 * 4. AC#8 批量任一行被拒整批不写，超过 100 行时前像也一行不漏；
 * 5. AC#9 适配器 / 执行器层、撤销重做、外键级联都不判定；
 * 6. AC#10 关库重开同一个库沿用上次的快照，另一个身份的库里没有它；AC#11 快照变化立即生效；
 * 7. 手动排序：重排与改分组字段（作用域就是分组字段）按 update 判。
 */

import {
  Entity,
  EntityBase,
  type EntityPropertyMetadataOptions,
  type EntityType,
  getEntityAccessScope,
  getEntityMetadata,
  isPermissionRuleViolation,
  OnDeleteAction,
  PermissionDeniedError,
  type PermissionRuleViolation,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBGrantSnapshot,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { IdCard, Order, ENTITIES as SHOP_ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

const PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'title', type: PropertyType.string },
  { name: 'tenantId', type: PropertyType.string }
];

const ACCESS = { scope: { property: 'tenantId', prefix: 'tenant:' } } as const;

const EDIT_RULES = {
  create: { requires: 'edit' },
  update: { requires: 'edit' },
  delete: { requires: 'edit' }
} as const;

/** 没有规则的父表：删它时级联删掉子表里的行，那是系统写 */
@Entity({
  name: 'RuleFolder',
  tableName: 'rule_folder',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [{ name: 'items', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'RuleItem', mappedProperty: 'folder' }]
})
class RuleFolder extends EntityBase {
  declare title: string;
}

@Entity({
  name: 'RuleItem',
  tableName: 'rule_item',
  properties: PROPERTIES,
  access: ACCESS,
  permissions: EDIT_RULES,
  relations: [
    {
      name: 'folder',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RuleFolder',
      mappedProperty: 'items',
      nullable: true,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class RuleItem extends EntityBase {
  declare title: string;
  declare tenantId: string;
  declare folderId: string | null;
}

@Entity({ name: 'RuleNote', tableName: 'rule_note', properties: PROPERTIES, access: ACCESS, permissions: EDIT_RULES })
class RuleNote extends EntityBase {
  declare title: string;
  declare tenantId: string;
}

/** 作用域同时是分组字段：跨组移动就是换租户 */
@Entity({
  name: 'RuleCard',
  tableName: 'rule_card',
  properties: [...PROPERTIES, { name: 'sortOrder', type: PropertyType.string }],
  access: ACCESS,
  permissions: EDIT_RULES,
  manualOrder: { groupBy: ['tenantId'] }
})
class RuleCard extends EntityBase {
  declare title: string;
  declare tenantId: string;
  declare sortOrder: string;
}

type Scoped = EntityBase & { title: string; tenantId: string };
type ScopedType = EntityType & (new () => Scoped);

const TABLES = new Map<EntityType, string>([
  [RuleItem, 'rule_item'],
  [RuleNote, 'rule_note'],
  [RuleCard, 'rule_card']
]);

/** a 可编辑、b 只读 */
const GRANTS = [
  { scope: 'tenant:a', permissions: ['read', 'edit'] },
  { scope: 'tenant:b', permissions: ['read'] }
];

interface Database {
  rxdb: RxDB;
  adapter: RxDBAdapterPGlite;
}

const opened: RxDB[] = [];

/** `store` 不传时落在 `idb://<dbName>`：同名再开一次就是同一个库 */
const openDatabase = async (dbName: string = generateDbName(), store?: 'memory'): Promise<Database> => {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'test-user' },
    entities: [RuleFolder, RuleItem, RuleNote, RuleCard, ...SHOP_ENTITIES],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, store ? { store } : {}));
  rxdb.use(rxDBPluginHistory);
  opened.push(rxdb);
  await rxdb.connect('pglite');
  return { rxdb, adapter: await rxdb.getAdapter('pglite') };
};

/** 已授权（a 可编辑、b 只读）的内存库 */
const grantedDatabase = async (): Promise<Database> => {
  const database = await openDatabase(generateDbName(), 'memory');
  await database.rxdb.grants.set(GRANTS);
  return database;
};

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

const draft = <T extends ScopedType>(rxdb: RxDB, EntityType: T, tenantId: string, title = 'draft'): InstanceType<T> => {
  const entity = rxdb.entityManager.instantiate(EntityType) as InstanceType<T>;
  entity.title = title;
  entity.tenantId = tenantId;
  return entity;
};

/** 经适配器落库（系统写，不判定），返回已落库的实体 */
const seed = async <T extends ScopedType>(
  { rxdb, adapter }: Database,
  EntityType: T,
  tenantId: string,
  fields: Record<string, unknown> = {}
): Promise<InstanceType<T>> => {
  const entity = Object.assign(draft(rxdb, EntityType, tenantId, 'seed'), fields);
  await adapter.mutations({
    create: new Map<EntityType, Set<EntityBase>>([[EntityType, new Set([entity])]]),
    update: new Map(),
    remove: new Map()
  });
  return entity;
};

/** 库里这一行；没有这一行时为 `undefined` */
const rowOf = async (
  { adapter }: Database,
  EntityType: EntityType,
  id: string
): Promise<{ title: string; tenantId: string } | undefined> => {
  const result = await adapter.internalQuery<{ title: string; tenantId: string }>(
    `SELECT "title", "tenantId" FROM "public"."${TABLES.get(EntityType)}" WHERE "id" = $1`,
    [id]
  );
  return result.rows[0];
};

/** 变更日志的行数：被拒的写不能留下待推修改 */
const changeCount = async ({ adapter }: Database): Promise<number> => {
  const result = await adapter.internalQuery<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM "rxdb"."rxdb_change"`
  );
  return result.rows[0].count;
};

const rejectionOf = (write: Promise<unknown>): Promise<PermissionDeniedError> =>
  write.then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      return error as PermissionDeniedError;
    }
  );

const scopesOf = (error: PermissionDeniedError): (string | null)[] =>
  error.violations.filter(isPermissionRuleViolation).map((violation: PermissionRuleViolation) => violation.scope);

describe('US-029 阶段 B：规则形式的判定（PGlite）', () => {
  describe('AC#1 没声明 access 的实体零变化', () => {
    it('shop 的 IdCard / Order（业务 ownerId）元数据里没有 access，快照未取到也照常写', async () => {
      const database = await openDatabase(generateDbName(), 'memory');
      const { rxdb } = database;
      const userId = crypto.randomUUID();
      const cardId = crypto.randomUUID();

      expect(getEntityAccessScope(getEntityMetadata(IdCard))).toBeUndefined();
      expect(getEntityAccessScope(getEntityMetadata(Order))).toBeUndefined();
      expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);

      await rxdb.entityManager.saveMany([
        rxdb.entityManager.instantiate(User, { id: userId as never, name: 'u', idCardId: cardId }),
        rxdb.entityManager.instantiate(IdCard, { id: cardId as never, code: `c-${cardId}`, ownerId: userId }),
        rxdb.entityManager.instantiate(Order, { number: `o-${cardId}`, amount: 1, ownerId: userId })
      ]);

      const result = await database.adapter.internalQuery<{ count: number }>(
        `SELECT count(*)::int AS "count" FROM "shop"."order" WHERE "ownerId" = $1`,
        [userId]
      );
      expect(result.rows[0].count).toBe(1);
    });
  });

  describe('AC#4 快照未取到：一律拒绝，库里原样', () => {
    it('create / update / delete 都以授权未知被拒，没有新行、行不变、仍在，没有新的变更日志', async () => {
      const database = await openDatabase(generateDbName(), 'memory');
      const stored = await seed(database, RuleItem, 'a');
      const removable = await seed(database, RuleItem, 'a');
      const before = await changeCount(database);
      const fresh = draft(database.rxdb, RuleItem, 'a');
      stored.title = 'changed';

      for (const write of [fresh.save(), stored.save(), removable.remove()]) {
        const error = await rejectionOf(write);
        expect(error.violations.filter(isPermissionRuleViolation).map(v => v.reason)).toEqual(['grants-unknown']);
      }

      expect(await rowOf(database, RuleItem, fresh.id)).toBeUndefined();
      expect(await rowOf(database, RuleItem, stored.id)).toEqual({ title: 'seed', tenantId: 'a' });
      expect(await rowOf(database, RuleItem, removable.id)).toEqual({ title: 'seed', tenantId: 'a' });
      expect(await changeCount(database)).toBe(before);
    });
  });

  describe('AC#5 a 可编辑、b 只读：各入口 × 各操作', () => {
    const creates = [
      [
        '门面 Repository.create()',
        (db: Database, e: RuleItem) => db.rxdb.entityManager.getRepository(RuleItem).create(e)
      ],
      ['EntityManager.save()', (db: Database, e: RuleItem) => db.rxdb.entityManager.save(e)],
      ['实体实例 save()', (_db: Database, e: RuleItem) => e.save()]
    ] as const;
    const updates = [
      [
        '门面 Repository.update()',
        (db: Database, e: RuleItem) => db.rxdb.entityManager.getRepository(RuleItem).update(e, { title: 'changed' })
      ],
      ['EntityManager.save()', (db: Database, e: RuleItem) => db.rxdb.entityManager.save(e)],
      ['实体实例 save()', (_db: Database, e: RuleItem) => e.save()]
    ] as const;
    const removes = [
      [
        '门面 Repository.remove()',
        (db: Database, e: RuleItem) => db.rxdb.entityManager.getRepository(RuleItem).remove(e)
      ],
      ['EntityManager.remove()', (db: Database, e: RuleItem) => db.rxdb.entityManager.remove(e)],
      ['实体实例 remove()', (_db: Database, e: RuleItem) => e.remove()]
    ] as const;

    it.each(creates)('create · %s：a 写进库，b 被拒且没有新行', async (_label, write) => {
      const database = await grantedDatabase();
      const allowed = draft(database.rxdb, RuleItem, 'a', 'created');
      const denied = draft(database.rxdb, RuleItem, 'b', 'created');

      await write(database, allowed);
      const error = await rejectionOf(write(database, denied));

      expect(await rowOf(database, RuleItem, allowed.id)).toEqual({ title: 'created', tenantId: 'a' });
      expect(await rowOf(database, RuleItem, denied.id)).toBeUndefined();
      expect(error.violations).toEqual([
        {
          namespace: 'public',
          entity: 'RuleItem',
          operation: 'create',
          id: denied.id,
          scope: 'tenant:b',
          requires: 'edit',
          reason: 'missing-permission'
        }
      ]);
    });

    it.each(updates)('update · %s：a 写进库，b 被拒且行不变', async (_label, write) => {
      const database = await grantedDatabase();
      const allowed = await seed(database, RuleItem, 'a');
      const denied = await seed(database, RuleItem, 'b');
      allowed.title = 'changed';
      denied.title = 'changed';

      await write(database, allowed);
      const error = await rejectionOf(write(database, denied));

      expect(await rowOf(database, RuleItem, allowed.id)).toEqual({ title: 'changed', tenantId: 'a' });
      expect(await rowOf(database, RuleItem, denied.id)).toEqual({ title: 'seed', tenantId: 'b' });
      expect(scopesOf(error)).toEqual(['tenant:b']);
    });

    it.each(removes)('delete · %s：a 删掉，b 被拒且仍在', async (_label, write) => {
      const database = await grantedDatabase();
      const allowed = await seed(database, RuleItem, 'a');
      const denied = await seed(database, RuleItem, 'b');

      await write(database, allowed);
      const error = await rejectionOf(write(database, denied));

      expect(await rowOf(database, RuleItem, allowed.id)).toBeUndefined();
      expect(await rowOf(database, RuleItem, denied.id)).toEqual({ title: 'seed', tenantId: 'b' });
      expect(scopesOf(error)).toEqual(['tenant:b']);
    });
  });

  describe('AC#6 / AC#7 换租户与持久化前像', () => {
    it.each([
      ['a → b', 'a', 'b'],
      ['b → a', 'b', 'a']
    ])('%s：被拒，库里不变', async (_label, from, to) => {
      const database = await grantedDatabase();
      const item = await seed(database, RuleItem, from);
      item.tenantId = to;

      const error = await rejectionOf(item.save());

      expect(scopesOf(error)).toEqual(['tenant:b']);
      expect(await rowOf(database, RuleItem, item.id)).toEqual({ title: 'seed', tenantId: from });
    });

    it('库里已被移到 b、内存实例还以为在 a：读到前像 b 才判，被拒', async () => {
      const database = await grantedDatabase();
      const item = await seed(database, RuleItem, 'a');
      await database.adapter.internalQuery(`UPDATE "public"."rule_item" SET "tenantId" = 'b' WHERE "id" = $1`, [
        item.id
      ]);
      item.title = 'changed';

      const error = await rejectionOf(item.save());

      expect(scopesOf(error)).toEqual(['tenant:b']);
      expect(await rowOf(database, RuleItem, item.id)).toEqual({ title: 'seed', tenantId: 'b' });
    });
  });

  describe('AC#8 批量：任一行被拒整批不写', () => {
    it('saveMany()：合规的改动与新行也没落库', async () => {
      const database = await grantedDatabase();
      const editedA = await seed(database, RuleItem, 'a');
      const editedB = await seed(database, RuleNote, 'b');
      const fresh = draft(database.rxdb, RuleItem, 'a');
      editedA.title = 'changed';
      editedB.title = 'changed';

      const error = await rejectionOf(database.rxdb.entityManager.saveMany([editedA, fresh, editedB] as EntityBase[]));

      expect(error.violations.filter(isPermissionRuleViolation).map(v => `${v.entity}:${v.id}`)).toEqual([
        `RuleNote:${editedB.id}`
      ]);
      expect(await rowOf(database, RuleItem, editedA.id)).toEqual({ title: 'seed', tenantId: 'a' });
      expect(await rowOf(database, RuleItem, fresh.id)).toBeUndefined();
      expect(await rowOf(database, RuleNote, editedB.id)).toEqual({ title: 'seed', tenantId: 'b' });
    });

    it('removeMany()：合规的那行也没被删', async () => {
      const database = await grantedDatabase();
      const allowed = await seed(database, RuleItem, 'a');
      const denied = await seed(database, RuleItem, 'b');

      await rejectionOf(database.rxdb.entityManager.removeMany([allowed, denied]));

      expect(await rowOf(database, RuleItem, allowed.id)).toEqual({ title: 'seed', tenantId: 'a' });
      expect(await rowOf(database, RuleItem, denied.id)).toEqual({ title: 'seed', tenantId: 'b' });
    });

    it('超过 100 行的批：排在最后的只读行也读到了前像，整批被拒', async () => {
      const database = await grantedDatabase();
      const rows = [];
      for (let index = 0; index < 101; index++) rows.push(await seed(database, RuleItem, 'a'));
      const last = await seed(database, RuleItem, 'b');
      for (const row of [...rows, last]) row.title = 'changed';

      const error = await rejectionOf(database.rxdb.entityManager.saveMany([...rows, last]));

      expect(error.violations.filter(isPermissionRuleViolation).map(v => v.id)).toEqual([last.id]);
      expect(await rowOf(database, RuleItem, rows[0].id)).toEqual({ title: 'seed', tenantId: 'a' });
    });
  });

  describe('AC#9 系统写不判定', () => {
    it('adapter.mutations() 与 transaction() 执行器改只读作用域的行：照常写出', async () => {
      const database = await grantedDatabase();
      const viaAdapter = await seed(database, RuleItem, 'b');
      const viaExecutor = await seed(database, RuleItem, 'b');
      viaAdapter.title = 'by-adapter';

      await database.adapter.mutations({
        create: new Map(),
        update: new Map<EntityType, Set<EntityBase>>([[RuleItem, new Set([viaAdapter])]]),
        remove: new Map()
      });
      await database.adapter.transaction(executor =>
        executor.getRepository(RuleItem).update(viaExecutor, { title: 'by-executor' })
      );

      expect(await rowOf(database, RuleItem, viaAdapter.id)).toEqual({ title: 'by-adapter', tenantId: 'b' });
      expect(await rowOf(database, RuleItem, viaExecutor.id)).toEqual({ title: 'by-executor', tenantId: 'b' });
    });

    it('降权之前的本机修改：撤销、重做都照常落库', async () => {
      const database = await grantedDatabase();
      const item = await seed(database, RuleItem, 'a');
      item.title = 'edited';
      await item.save();

      await database.rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read'] }]);
      const history = database.rxdb.versionManager.history();
      await history.undo();
      expect(await rowOf(database, RuleItem, item.id)).toEqual({ title: 'seed', tenantId: 'a' });
      await history.redo();
      expect(await rowOf(database, RuleItem, item.id)).toEqual({ title: 'edited', tenantId: 'a' });
    });

    it('外键级联：删没有规则的父行，只读作用域里的子行跟着删', async () => {
      const database = await grantedDatabase();
      const folder = database.rxdb.entityManager.instantiate(RuleFolder);
      folder.title = 'folder';
      await folder.save();
      const child = await seed(database, RuleItem, 'b', { folderId: folder.id });

      await folder.remove();

      expect(await rowOf(database, RuleItem, child.id)).toBeUndefined();
    });
  });

  describe('AC#10 快照随身份的库走', () => {
    it('关库重开同一个库：沿用上次的快照判定', async () => {
      const dbName = generateDbName();
      const first = await openDatabase(dbName);
      await first.rxdb.grants.set(GRANTS);
      await first.rxdb.disconnectAll();

      const reopened = await openDatabase(dbName);

      expect(reopened.rxdb.grants.snapshot.status).toBe('known');
      expect(reopened.rxdb.grants.snapshot.grants).toEqual(first.rxdb.grants.snapshot.grants);
      const allowed = draft(reopened.rxdb, RuleItem, 'a', 'after-reopen');
      await allowed.save();
      expect(await rowOf(reopened, RuleItem, allowed.id)).toEqual({ title: 'after-reopen', tenantId: 'a' });
      await rejectionOf(draft(reopened.rxdb, RuleItem, 'b').save());
    });

    it('另一个身份的库：没有这份快照，规则写一律拒绝', async () => {
      const mine = await grantedDatabase();
      const theirs = await openDatabase(generateDbName(), 'memory');

      expect(mine.rxdb.grants.snapshot.status).toBe('known');
      expect(theirs.rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
      const error = await rejectionOf(draft(theirs.rxdb, RuleItem, 'a').save());
      expect(error.violations.filter(isPermissionRuleViolation).map(v => v.reason)).toEqual(['grants-unknown']);
    });
  });

  describe('AC#11 快照变化立即生效', () => {
    it('收回 a 的 edit：之后的写当场被拒，快照事件发出一次', async () => {
      const database = await grantedDatabase();
      const emitted: RxDBGrantSnapshot[] = [];
      const subscription = database.rxdb.grants.snapshot$.subscribe(snapshot => emitted.push(snapshot));
      await draft(database.rxdb, RuleItem, 'a').save();

      await database.rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read'] }]);
      const error = await rejectionOf(draft(database.rxdb, RuleItem, 'a').save());
      subscription.unsubscribe();

      expect(scopesOf(error)).toEqual(['tenant:a']);
      expect(emitted).toHaveLength(2);
      expect(emitted[1].has('tenant:a', 'edit')).toBe(false);
    });
  });

  describe('手动排序：重排与改分组字段按 update 判', () => {
    const seedCards = async (database: Database) => {
      const a0 = await seed(database, RuleCard, 'a', { sortOrder: 'a0' });
      const a1 = await seed(database, RuleCard, 'a', { sortOrder: 'a1' });
      const b0 = await seed(database, RuleCard, 'b', { sortOrder: 'a0' });
      const b1 = await seed(database, RuleCard, 'b', { sortOrder: 'a1' });
      return { a0, a1, b0, b1 };
    };

    it('组内重排：a 放行，b 被拒', async () => {
      const database = await grantedDatabase();
      const { a0, a1, b0, b1 } = await seedCards(database);
      const repository = database.rxdb.entityManager.getRepository(RuleCard);

      await repository.reorder(a0.id, { prevId: a1.id, nextId: null });
      const error = await rejectionOf(repository.reorder(b0.id, { prevId: b1.id, nextId: null }));

      expect(scopesOf(error)).toEqual(['tenant:b']);
    });

    it('把 a 的行移进 b 组：两边都判，被拒', async () => {
      const database = await grantedDatabase();
      const { a0 } = await seedCards(database);

      const error = await rejectionOf(
        database.rxdb.entityManager.getRepository(RuleCard).reorder(a0.id, { group: { tenantId: 'b' } })
      );

      expect(scopesOf(error)).toEqual(['tenant:b']);
      expect(await rowOf(database, RuleCard, a0.id)).toEqual({ title: 'seed', tenantId: 'a' });
    });

    it('改分组字段又没给排序键（事务内追加到新组末尾）：同样判写后的作用域', async () => {
      const database = await grantedDatabase();
      const { a0 } = await seedCards(database);

      const error = await rejectionOf(
        database.rxdb.entityManager.getRepository(RuleCard).update(a0, { tenantId: 'b' })
      );

      expect(scopesOf(error)).toEqual(['tenant:b']);
      expect(await rowOf(database, RuleCard, a0.id)).toEqual({ title: 'seed', tenantId: 'a' });
    });
  });
});
