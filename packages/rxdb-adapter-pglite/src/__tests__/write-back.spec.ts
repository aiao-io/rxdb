/**
 * 写入回填与等待期编辑、批量写路径的真实 PGlite 回归。
 *
 * 编辑注入点：包一层 `adapter.transaction`，在本行 UPDATE 已执行、结果还没交回时改实体——
 * 与用户在保存等待期间继续输入是同一时序。
 */
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  getEntityStatus,
  PropertyType,
  type RelationEntitiesObservable,
  type RelationEntityObservable,
  RelationKind,
  RxDB,
  RxDBChange,
  SyncType,
  type TransactionFun
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { getTableNameByMetadata } from '../table-name-resolver.js';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';
import { generateDbName } from './test-utils.js';

@Entity({ name: 'WriteBackRow', properties: [{ name: 'title', type: PropertyType.string }] })
class WriteBackRow extends EntityBase {
  title!: string;
}

@Entity({ name: 'WriteBackDisabledRow', properties: [{ name: 'title', type: PropertyType.string }] })
class WriteBackDisabledRow extends EntityBase {
  title!: string;
}

@Entity({
  name: 'WriteBackParent',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'WriteBackChild', mappedProperty: 'parent' }
  ]
})
class WriteBackParent extends EntityBase {
  label!: string;
  declare children$: RelationEntitiesObservable<typeof WriteBackChild>;
}

@Entity({
  name: 'WriteBackChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'WriteBackParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class WriteBackChild extends EntityBase {
  title!: string;
  parentId!: string | null;
  declare parent$: RelationEntityObservable<typeof WriteBackParent>;
}

/** 在下一条命中 `pattern` 的语句执行完、结果交回之前调一次 `onStatement` */
const interceptStatements = (adapter: RxDBAdapterPGlite, pattern: RegExp, onStatement: (sql: string) => void) => {
  const realTransaction = adapter.transaction.bind(adapter);
  adapter.transaction = (<T extends TransactionFun>(transactionFun: T, transactionLog?: boolean) =>
    realTransaction(async executor => {
      const tx = executor as PGliteTransactionExecutor;
      const queryRaw = tx.queryRaw.bind(tx);
      tx.queryRaw = (async (sql: string, bindings?: unknown[]) => {
        const result = await queryRaw(sql, bindings);
        if (pattern.test(sql)) onStatement(sql);
        return result;
      }) as typeof tx.queryRaw;
      return transactionFun(executor);
    }, transactionLog)) as typeof adapter.transaction;
  return () => {
    adapter.transaction = realTransaction;
  };
};

describe('PGlite 写入回填', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let rowTable: string;

  const storedRow = async (id: string) =>
    (await adapter.query<{ title: string; updatedAt: Date }>(`SELECT * FROM ${rowTable} WHERE id = $1`, [id])).rows[0];

  const changeCount = async () => {
    const table = getTableNameByMetadata(getEntityMetadata(RxDBChange), adapter.tableSet);
    const result = await adapter.query<{ count: string | number }>(`SELECT count(*) AS count FROM ${table}`);
    return Number(result.rows[0].count);
  };

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [WriteBackRow, WriteBackDisabledRow, WriteBackParent, WriteBackChild],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      syncOverrides: [{ entity: WriteBackDisabledRow, sync: { type: SyncType.None } }],
      multiInstance: false
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.connect('pglite');
    rowTable = getTableNameByMetadata(getEntityMetadata(WriteBackRow), adapter.tableSet);
  });

  afterAll(async () => {
    await rxdb?.disconnectAll();
  });

  it('单条 save() 等待写入期间的新输入保留，再次 save() 写进库里', async () => {
    const row = new WriteBackRow({ title: 'original' });
    await row.save();
    row.title = 'submitted';
    const saving = row.save();
    row.title = 'typed while saving';
    await saving;

    expect(row.title).toBe('typed while saving');
    expect(getEntityStatus(row).modified).toBe(true);
    expect((await storedRow(row.id)).title).toBe('submitted');

    await row.save();
    expect((await storedRow(row.id)).title).toBe('typed while saving');
  });

  it('saveMany 的 UPDATE 执行期间的新输入在回查回填后保留，再次 save() 写进库里', async () => {
    const row = new WriteBackRow({ title: 'original' });
    await row.save();
    row.title = 'submitted';
    const restore = interceptStatements(adapter, /^UPDATE /i, () => {
      row.title = 'typed while saving';
    });
    try {
      await rxdb.entityManager.saveMany([row]);
    } finally {
      restore();
    }

    const status = getEntityStatus(row);
    expect(row.title).toBe('typed while saving');
    expect(status.origin.title).toBe('submitted');
    expect(status.patch).toEqual({ title: 'typed while saving' });
    expect(status.modified).toBe(true);

    await row.save();
    expect((await storedRow(row.id)).title).toBe('typed while saving');
  });

  it('saveMany 不把领先墙钟的 updatedAt 写回更早的整批时刻', async () => {
    const row = new WriteBackRow({ title: 'original' });
    await row.save();
    const ahead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await adapter.query(`UPDATE ${rowTable} SET "updatedAt" = $1 WHERE id = $2`, [ahead, row.id]);
    await adapter.getRepository(WriteBackRow).findOne({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: row.id }] }
    });
    expect(row.updatedAt.getTime()).toBe(ahead.getTime());

    row.title = 'edited';
    await rxdb.entityManager.saveMany([row]);

    const stored = await storedRow(row.id);
    expect(stored.title).toBe('edited');
    expect(new Date(stored.updatedAt).getTime()).toBeGreaterThan(ahead.getTime());
  });

  it('saveMany 遇到改了又改回、patch 为空的实体不发 UPDATE、不推进时间、不追加变更', async () => {
    const row = new WriteBackRow({ title: 'same' });
    await row.save();
    const before = await storedRow(row.id);
    row.title = 'detour';
    row.title = 'same';
    expect(getEntityStatus(row).modified).toBe(true);
    expect(getEntityStatus(row).patch).toEqual({});
    const changesBefore = await changeCount();
    const updates: string[] = [];
    const restore = interceptStatements(adapter, /^UPDATE /i, sql => updates.push(sql));
    try {
      await rxdb.entityManager.saveMany([row]);
    } finally {
      restore();
    }

    expect(updates).toEqual([]);
    expect(await changeCount()).toBe(changesBefore);
    expect(new Date((await storedRow(row.id)).updatedAt).getTime()).toBe(new Date(before.updatedAt).getTime());
    expect(getEntityStatus(row).modified).toBe(false);
  });

  it('QueryCache 回填远端行时避让未保存的本地编辑，基线推进到远端值', async () => {
    const draft = new WriteBackRow({ title: 'cache original' });
    await draft.save();
    const clean = new WriteBackRow({ title: 'clean original' });
    await clean.save();
    draft.title = 'unsaved draft';
    const later = new Date(Date.now() + 1000).toISOString();

    await firstValueFrom(
      adapter.upsertMany('WriteBackRow', [
        { id: draft.id, title: 'remote refresh', createdAt: draft.createdAt.toISOString(), updatedAt: later },
        { id: clean.id, title: 'remote clean', createdAt: clean.createdAt.toISOString(), updatedAt: later }
      ])
    );

    const draftStatus = getEntityStatus(draft);
    expect(draft.title).toBe('unsaved draft');
    expect(draftStatus.origin.title).toBe('remote refresh');
    expect(draftStatus.patch).toEqual({ title: 'unsaved draft' });
    expect(draftStatus.modified).toBe(true);
    expect(clean.title).toBe('remote clean');
    expect(getEntityStatus(clean).modified).toBe(false);
  });

  it('一对多集合 remove 后保存父实体，子实体外键置空落库', async () => {
    const parent = new WriteBackParent({ label: 'parent' });
    await parent.save();
    const child = new WriteBackChild({ title: 'child' });
    child.parent$.set(parent);
    await child.save();

    parent.children$.remove(child);
    await parent.save();

    const table = getTableNameByMetadata(getEntityMetadata(WriteBackChild), adapter.tableSet);
    const stored = await adapter.query<{ parentId: string | null }>(`SELECT * FROM ${table} WHERE id = $1`, [child.id]);
    expect(stored.rows[0].parentId).toBeNull();
  });

  it('两侧都没声明的 SyncDisabled 覆盖：单条、纯同类批量、混合批量都写进本地库', async () => {
    await new WriteBackDisabledRow({ title: 'single' }).save();
    await rxdb.entityManager.saveMany([new WriteBackDisabledRow({ title: 'batch-alone' })]);
    await rxdb.entityManager.saveMany([
      new WriteBackDisabledRow({ title: 'mixed-disabled' }),
      new WriteBackRow({ title: 'mixed-regular' })
    ]);

    const table = getTableNameByMetadata(getEntityMetadata(WriteBackDisabledRow), adapter.tableSet);
    const stored = await adapter.query<{ title: string }>(`SELECT title FROM ${table} ORDER BY title`);
    expect(stored.rows.map(row => row.title)).toEqual(['batch-alone', 'mixed-disabled', 'single']);
  });
});
