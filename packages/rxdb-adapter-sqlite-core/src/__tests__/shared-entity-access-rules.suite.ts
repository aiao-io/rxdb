import {
  Entity,
  EntityBase,
  type EntityPropertyMetadataOptions,
  type EntityType,
  getEntityMetadata,
  isPermissionRuleViolation,
  OnDeleteAction,
  PermissionDeniedError,
  PropertyType,
  RelationKind,
  RxDBChange,
  RxDBGrantSnapshot,
  RxDBGrantState,
  WorktreeTableSet
} from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';
import type { AdapterFactory } from './adapter-factory.js';
import { SUITE_DEADLINE_MS } from './test-utils.js';

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

/** a 可编辑、b 只读 */
const GRANTS = [
  { scope: 'tenant:a', permissions: ['read', 'edit'] },
  { scope: 'tenant:b', permissions: ['read'] }
];

const tableOf = (EntityType: EntityType): string =>
  quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(EntityType), WorktreeTableSet.MAIN));

const rowsOf = async (adapter: RxDBAdapterSqliteBase, sql: string, params: unknown[] = []): Promise<unknown[][]> =>
  (await adapter.internalQuery(sql, params)).results.flatMap(item => item.rows);

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
  error.violations.filter(isPermissionRuleViolation).map(violation => violation.scope);

/**
 * 规则形式写权限的判定（US-029 AC#4～11、13）：SQLite 系各后端与 PGlite 结果一致。
 *
 * @remarks
 * 断言库里的行原样、没有新的变更日志，而不只是「抛了错」。关库重开（AC#10）用同一个实例断开再连上持久化的库，
 * 中间直接改掉库里那一行：重连之后的快照跟着库里的值走，证明 `connect()` 确实从库里读回，而不是沿用内存里的。
 */
export function entityAccessRulesSuite(factory: AdapterFactory): void {
  describe(`规则形式的写权限（US-029） [${factory.name}]`, () => {
    @Entity({
      name: 'AccessFolder',
      properties: [{ name: 'title', type: PropertyType.string }],
      relations: [
        { name: 'items', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'AccessItem', mappedProperty: 'folder' }
      ]
    })
    class AccessFolder extends EntityBase {
      declare title: string;
    }

    @Entity({
      name: 'AccessItem',
      properties: PROPERTIES,
      access: ACCESS,
      permissions: EDIT_RULES,
      relations: [
        {
          name: 'folder',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'AccessFolder',
          mappedProperty: 'items',
          nullable: true,
          onDelete: OnDeleteAction.CASCADE
        }
      ]
    })
    class AccessItem extends EntityBase {
      declare title: string;
      declare tenantId: string;
      declare folderId: string | null;
    }

    const ENTITIES = [AccessFolder, AccessItem];
    let adapter: RxDBAdapterSqliteBase | undefined;

    const open = async (persistent = false): Promise<RxDBAdapterSqliteBase> => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: ENTITIES, persistent });
      return adapter;
    };

    afterEach(async () => {
      if (!adapter) return;
      const current = adapter;
      adapter = undefined;
      try {
        await current.rxdb.disconnectAll();
      } finally {
        await factory.cleanupAdapter?.(current);
      }
    });

    const draft = (db: RxDBAdapterSqliteBase, tenantId: string, title = 'draft'): AccessItem => {
      const item = db.rxdb.entityManager.instantiate(AccessItem);
      item.title = title;
      item.tenantId = tenantId;
      return item;
    };

    /** 经适配器落库：系统写，不判定 */
    const seed = async (db: RxDBAdapterSqliteBase, tenantId: string, fields: object = {}): Promise<AccessItem> => {
      const item = Object.assign(draft(db, tenantId, 'seed'), fields);
      await db.mutations({
        create: new Map<EntityType, Set<EntityBase>>([[AccessItem, new Set([item])]]),
        update: new Map(),
        remove: new Map()
      });
      return item;
    };

    const rowOf = async (db: RxDBAdapterSqliteBase, id: string): Promise<unknown[] | undefined> =>
      (await rowsOf(db, `SELECT "title", "tenantId" FROM ${tableOf(AccessItem)} WHERE "id" = ?`, [id]))[0];

    const changeCount = async (db: RxDBAdapterSqliteBase): Promise<number> =>
      Number((await rowsOf(db, `SELECT count(*) FROM ${tableOf(RxDBChange)}`))[0][0]);

    it(
      'AC#4 快照未取到：三操作都以授权未知被拒，没有新行、行不变、仍在，没有新的变更日志',
      async () => {
        const db = await open();
        const stored = await seed(db, 'a');
        const removable = await seed(db, 'a');
        const before = await changeCount(db);
        const fresh = draft(db, 'a');
        stored.title = 'changed';

        for (const write of [fresh.save(), stored.save(), removable.remove()]) {
          const error = await rejectionOf(write);
          expect(error.violations.filter(isPermissionRuleViolation).map(v => v.reason)).toEqual(['grants-unknown']);
        }

        expect(await rowOf(db, fresh.id)).toBeUndefined();
        expect(await rowOf(db, stored.id)).toEqual(['seed', 'a']);
        expect(await rowOf(db, removable.id)).toEqual(['seed', 'a']);
        expect(await changeCount(db)).toBe(before);
      },
      SUITE_DEADLINE_MS
    );

    it(
      'AC#5 a 可编辑、b 只读：a 的增删改落库，b 的被拒且库里原样',
      async () => {
        const db = await open();
        await db.rxdb.grants.set(GRANTS);
        const repository = db.rxdb.entityManager.getRepository(AccessItem);
        const createdA = draft(db, 'a', 'created');
        const updatedA = await seed(db, 'a');
        const removedA = await seed(db, 'a');
        const updatedB = await seed(db, 'b');
        const removedB = await seed(db, 'b');

        await repository.create(createdA);
        await repository.update(updatedA, { title: 'changed' });
        await removedA.remove();
        const denied = [
          await rejectionOf(draft(db, 'b').save()),
          await rejectionOf(repository.update(updatedB, { title: 'changed' })),
          await rejectionOf(removedB.remove())
        ];

        expect(await rowOf(db, createdA.id)).toEqual(['created', 'a']);
        expect(await rowOf(db, updatedA.id)).toEqual(['changed', 'a']);
        expect(await rowOf(db, removedA.id)).toBeUndefined();
        expect(await rowOf(db, updatedB.id)).toEqual(['seed', 'b']);
        expect(await rowOf(db, removedB.id)).toEqual(['seed', 'b']);
        expect(denied.map(error => error.violations.filter(isPermissionRuleViolation)[0].operation)).toEqual([
          'create',
          'update',
          'delete'
        ]);
        expect(denied.flatMap(scopesOf)).toEqual(['tenant:b', 'tenant:b', 'tenant:b']);
      },
      SUITE_DEADLINE_MS
    );

    it(
      'AC#6 / AC#7 换租户两边都判；库里已被移到 b、内存实例还以为在 a 也按前像拒绝',
      async () => {
        const db = await open();
        await db.rxdb.grants.set(GRANTS);
        const moved = await seed(db, 'a');
        const stale = await seed(db, 'a');
        moved.tenantId = 'b';
        await db.internalQuery(`UPDATE ${tableOf(AccessItem)} SET "tenantId" = 'b' WHERE "id" = ?`, [stale.id]);
        stale.title = 'changed';

        expect(scopesOf(await rejectionOf(moved.save()))).toEqual(['tenant:b']);
        expect(scopesOf(await rejectionOf(stale.save()))).toEqual(['tenant:b']);
        expect(await rowOf(db, moved.id)).toEqual(['seed', 'a']);
        expect(await rowOf(db, stale.id)).toEqual(['seed', 'b']);
      },
      SUITE_DEADLINE_MS
    );

    it(
      'AC#8 批量：任一行被拒整批不写，超过 100 行时排在最后的只读行也判到',
      async () => {
        const db = await open();
        await db.rxdb.grants.set(GRANTS);
        const rows: AccessItem[] = [];
        for (let index = 0; index < 101; index++) rows.push(await seed(db, 'a'));
        const last = await seed(db, 'b');
        const fresh = draft(db, 'a');
        for (const row of [...rows, last]) row.title = 'changed';

        const error = await rejectionOf(db.rxdb.entityManager.saveMany([...rows, fresh, last]));

        expect(error.violations.filter(isPermissionRuleViolation).map(v => v.id)).toEqual([last.id]);
        expect(await rowOf(db, rows[0].id)).toEqual(['seed', 'a']);
        expect(await rowOf(db, fresh.id)).toBeUndefined();
        await rejectionOf(db.rxdb.entityManager.removeMany([rows[0], last]));
        expect(await rowOf(db, rows[0].id)).toEqual(['seed', 'a']);
      },
      SUITE_DEADLINE_MS
    );

    it(
      'AC#9 系统写不判定：适配器直写、撤销重做降权之前的修改、外键级联都照常落库',
      async () => {
        const db = await open();
        await db.rxdb.grants.set(GRANTS);
        const direct = await seed(db, 'b');
        direct.title = 'by-adapter';
        await db.mutations({
          create: new Map(),
          update: new Map<EntityType, Set<EntityBase>>([[AccessItem, new Set([direct])]]),
          remove: new Map()
        });
        const folder = db.rxdb.entityManager.instantiate(AccessFolder);
        folder.title = 'folder';
        await folder.save();
        const child = await seed(db, 'b', { folderId: folder.id });
        // 最后一笔本机修改：撤销要撤的就是它
        const edited = await seed(db, 'a');
        edited.title = 'edited';
        await edited.save();

        await db.rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read'] }]);
        const history = db.rxdb.versionManager.history(AccessItem);
        await history.undo();
        const undone = await rowOf(db, edited.id);
        await history.redo();
        await folder.remove();

        expect(await rowOf(db, direct.id)).toEqual(['by-adapter', 'b']);
        expect(undone).toEqual(['seed', 'a']);
        expect(await rowOf(db, edited.id)).toEqual(['edited', 'a']);
        expect(await rowOf(db, child.id)).toBeUndefined();
      },
      SUITE_DEADLINE_MS
    );

    it(
      'AC#10 / AC#11 快照随库走：重连读回库里的那一行；快照变化立即生效',
      async () => {
        let db = await open(true);
        await db.rxdb.grants.set(GRANTS);
        await draft(db, 'a').save();
        // 库里的那一行才是真相：直接改掉它，重连之后的快照必须跟着变
        await db.internalQuery(`UPDATE ${tableOf(RxDBGrantState)} SET "grants" = ?`, [
          JSON.stringify([{ scope: 'tenant:a', permissions: ['read'] }])
        ]);
        const rxdb = db.rxdb;
        await rxdb.disconnectAll();
        db = (await rxdb.connect(factory.name)) as RxDBAdapterSqliteBase;
        adapter = db;

        expect(rxdb.grants.snapshot.status).toBe('known');
        expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
        expect(scopesOf(await rejectionOf(draft(db, 'a').save()))).toEqual(['tenant:a']);

        await rxdb.grants.set(GRANTS);
        await draft(db, 'a').save();
        expect(rxdb.grants.snapshot).not.toBe(RxDBGrantSnapshot.UNKNOWN);
      },
      SUITE_DEADLINE_MS
    );
  });
}
