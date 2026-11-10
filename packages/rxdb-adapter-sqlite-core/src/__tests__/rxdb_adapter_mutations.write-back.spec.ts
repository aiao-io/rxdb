import {
  Entity,
  EntityBase,
  type EntityUpdateData,
  getEntityStatus,
  PropertyType,
  RelationKind,
  RxDB,
  type RxDBMutationsMap,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { rxdb_adapter_mutations } from '../rxdb_adapter_mutations.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { Todo } from './fixtures/Todo.js';

@Entity({
  name: 'WriteBackBigParent',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'WriteBackBigChild', mappedProperty: 'parent' }
  ]
})
class WriteBackBigParent extends EntityBase<bigint> {
  declare id: bigint;
  label!: string;
}

@Entity({
  name: 'WriteBackBigChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'WriteBackBigParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class WriteBackBigChild extends EntityBase {
  title!: string;
  parentId!: bigint | null;
}

type QueryHandler = (sql: string, params?: SQLiteCompatibleType[]) => Promise<SqliteSuccessResult>;

class MutationTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-mutation-write-back-test';

  constructor(
    rxdb: RxDB,
    private readonly queryHandler: QueryHandler
  ) {
    super(rxdb);
  }

  override query(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    return this.queryHandler(sql, params);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('MutationTestAdapter.createClient must not be called');
  }
}

const CREATED = '2026-01-01T00:00:00.000Z';
const STORED = '2026-01-02T00:00:00.000Z';
const WRITTEN = '2026-01-03T00:00:00.000Z';

const createDatabase = (
  dbName: string,
  entities: (typeof Todo | typeof WriteBackBigParent | typeof WriteBackBigChild)[]
) => {
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { local: { adapter: 'noop' }, type: SyncType.None },
    multiInstance: false
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  return rxdb;
};

const todoRows = (sql: string, rows: SQLiteCompatibleType[][]): SqliteSuccessResult => ({
  sql,
  rowsAffected: rows.length,
  elapsed: 0,
  results: [{ columns: ['id', 'title', 'completed', 'createdAt', 'updatedAt'], rows }]
});

const written = (sql: string): SqliteSuccessResult => ({ sql, rowsAffected: 1, elapsed: 0, results: [] });

const mutationsOf = <T extends typeof Todo | typeof WriteBackBigChild>(
  kind: 'create' | 'update',
  EntityType: T,
  entities: InstanceType<T>[]
): RxDBMutationsMap<T> => ({
  create: kind === 'create' ? new Map([[EntityType, new Set(entities)]]) : new Map(),
  update: kind === 'update' ? new Map([[EntityType, new Set(entities)]]) : new Map(),
  remove: new Map()
});

describe('rxdb_adapter_mutations 批量写入后的回填', () => {
  it('批量更新执行期间对同一字段的新输入在回查回填后保留，modified 仍为 true', async () => {
    const rxdb = createDatabase('sqlite-batch-write-back-update', [Todo]);
    const todo = rxdb.entityManager.createEntityRef(
      Todo,
      {
        id: 'todo',
        title: 'original',
        completed: false,
        createdAt: new Date(CREATED),
        updatedAt: new Date(STORED)
      } as EntityUpdateData<typeof Todo>,
      { local: true, modified: false }
    );
    todo.title = 'submitted';
    const adapter = new MutationTestAdapter(rxdb, async sql => {
      if (sql.startsWith('UPDATE ')) {
        todo.title = 'typed while saving';
        return written(sql);
      }
      return todoRows(sql, [['todo', 'submitted', 0, CREATED, WRITTEN]]);
    });

    await rxdb_adapter_mutations(adapter, mutationsOf('update', Todo, [todo]));

    const status = getEntityStatus(todo);
    expect(todo.title).toBe('typed while saving');
    expect(todo.updatedAt).toEqual(new Date(WRITTEN));
    expect(status.origin.title).toBe('submitted');
    expect(status.patch).toEqual({ title: 'typed while saving' });
    expect(status.modified).toBe(true);
  });

  it('批量创建执行期间的新输入在回查回填后保留', async () => {
    const rxdb = createDatabase('sqlite-batch-write-back-create', [Todo]);
    const todo = rxdb.entityManager.createEntityRef(Todo, { id: 'todo', title: 'draft' } as EntityUpdateData<
      typeof Todo
    >);
    const adapter = new MutationTestAdapter(rxdb, async sql => {
      if (sql.startsWith('INSERT ')) {
        todo.title = 'typed after insert';
        return written(sql);
      }
      return todoRows(sql, [['todo', 'draft', 0, CREATED, STORED]]);
    });

    await rxdb_adapter_mutations(adapter, mutationsOf('create', Todo, [todo]));

    const status = getEntityStatus(todo);
    expect(todo.title).toBe('typed after insert');
    expect(status.local).toBe(true);
    expect(status.origin.title).toBe('draft');
    expect(status.modified).toBe(true);
  });

  describe('回查命中的是缓存里同 id 的另一个实例（不在本批提交记录里）', () => {
    const TODO_ID = '00000000-0000-4000-8000-000000000001';

    /** 本批要写的实例 `batch` 已被同 id 的 `cached` 顶掉缓存槽，回查按缓存槽命中 `cached` */
    const setup = (dbName: string) => {
      const rxdb = createDatabase(dbName, [Todo]);
      const em = rxdb.entityManager;
      const data = {
        id: TODO_ID,
        title: 'original',
        completed: false,
        createdAt: new Date(CREATED),
        updatedAt: new Date(STORED)
      } as EntityUpdateData<typeof Todo>;
      const batch = em.createEntityRef(Todo, data, { local: true, modified: false });
      batch.title = 'submitted';
      em.removeEntityCache(batch);
      const cached = em.createEntityRef(Todo, data, { local: true, modified: false });
      expect(em.getEntityRef(Todo, TODO_ID)).toBe(cached);
      const adapter = new MutationTestAdapter(rxdb, async sql =>
        sql.startsWith('UPDATE ') ? written(sql) : todoRows(sql, [[TODO_ID, 'submitted', 0, CREATED, WRITTEN]])
      );
      return { adapter, batch, cached };
    };

    it('干净的缓存实例取库里的值，基线随之推进，modified 为 false', async () => {
      const { adapter, batch, cached } = setup('sqlite-batch-write-back-other-instance-clean');

      await rxdb_adapter_mutations(adapter, mutationsOf('update', Todo, [batch]));

      const status = getEntityStatus(cached);
      expect(cached.title).toBe('submitted');
      expect(cached.updatedAt).toEqual(new Date(WRITTEN));
      expect(status.origin.title).toBe('submitted');
      expect(status.local).toBe(true);
      expect(status.modified).toBe(false);
    });

    it('有未保存编辑的缓存实例保留编辑与编辑历史，基线推进到库里的值，modified 仍为 true', async () => {
      const { adapter, batch, cached } = setup('sqlite-batch-write-back-other-instance-dirty');
      cached.title = 'unsaved draft';
      await Promise.resolve();
      const status = getEntityStatus(cached);
      expect(status.patches).toHaveLength(1);

      await rxdb_adapter_mutations(adapter, mutationsOf('update', Todo, [batch]));

      expect(cached.title).toBe('unsaved draft');
      expect(cached.updatedAt).toEqual(new Date(WRITTEN));
      expect(status.origin.title).toBe('submitted');
      expect(status.patch).toEqual({ title: 'unsaved draft' });
      expect(status.modified).toBe(true);
      expect(status.patches).toHaveLength(1);
    });
  });

  it('回查拿到安全整数形态的 bigint 外键时按目标主键类型解码，回填后仍是 bigint', async () => {
    const rxdb = createDatabase('sqlite-batch-write-back-bigint-fk', [WriteBackBigParent, WriteBackBigChild]);
    const child = rxdb.entityManager.createEntityRef(WriteBackBigChild, {
      id: 'child',
      title: 'child',
      parentId: 1n
    } as EntityUpdateData<typeof WriteBackBigChild>);
    const adapter = new MutationTestAdapter(rxdb, async sql => {
      if (sql.startsWith('INSERT ')) return written(sql);
      return {
        sql,
        rowsAffected: 1,
        elapsed: 0,
        results: [
          {
            columns: ['id', 'title', 'parentId', 'createdAt', 'updatedAt'],
            rows: [['child', 'child', 1, CREATED, STORED]]
          }
        ]
      };
    });

    await rxdb_adapter_mutations(adapter, mutationsOf('create', WriteBackBigChild, [child]));

    expect(child.parentId).toBe(1n);
    expect(getEntityStatus(child).modified).toBe(false);
  });
});
