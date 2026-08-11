import { EntityType, RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ENTITIES } from '@aiao/rxdb-test/shop';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db, cloneEntityClasses, generateDbName } from '../testing.js';

const getWriterProtocolState = async (adapter: RxDBAdapterPGlite) => {
  const guard = await adapter.internalQuery<{
    databaseId: string;
    epoch: number;
    state: string;
    minProtocol: number;
  }>(
    `SELECT "databaseId", "epoch", "state", "minProtocol"
     FROM "rxdb"."rxdb_upgrade_guard"
     ORDER BY "databaseId"`
  );
  const leases = await adapter.internalQuery<{
    databaseId: string;
    writerId: string;
    protocolVersion: number;
    epoch: number;
  }>(
    `SELECT "databaseId", "writerId", "protocolVersion", "epoch"
     FROM "rxdb"."rxdb_writer_lease"
     ORDER BY "databaseId", "writerId"`
  );
  return { guard: guard.rows, leases: leases.rows };
};

describe('testing cleanup_db integration & cloneEntityClasses metadata', () => {
  let rxdb: RxDB | undefined;

  afterEach(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
      rxdb = undefined;
    }
  });

  const connect = async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [...ENTITIES, Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    let adapter!: RxDBAdapterPGlite;
    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
    return adapter;
  };

  it('cleanup_db runs remove/truncate/main-branch reinstall paths', async () => {
    const adapter = await connect();
    const repo = adapter.getRepository(Todo);
    const todo = new Todo();
    todo.title = 'cleanup-me';
    await repo.create(todo);

    const protocolBefore = await getWriterProtocolState(adapter);
    expect(protocolBefore.guard).toHaveLength(1);
    expect(protocolBefore.leases).toHaveLength(1);

    // 写入额外的 change 行，使 truncate 路径中的 public/rxdb 表非空。
    await expect(cleanup_db(adapter)).resolves.toBeUndefined();

    expect(await getWriterProtocolState(adapter)).toEqual(protocolBefore);

    expect((await adapter.internalQuery(`SELECT id FROM "public"."todos"`)).rows).toEqual([]);
    expect((await adapter.internalQuery(`SELECT id FROM "rxdb"."rxdb_change"`)).rows).toEqual([]);

    const branch = await adapter.internalQuery(`SELECT id, activated FROM "rxdb"."rxdb_branch" WHERE id = 'main'`);
    expect(branch.rows.length).toBeGreaterThanOrEqual(1);
    expect((branch.rows[0] as { activated: boolean }).activated).toBe(true);

    const nextTodo = new Todo();
    nextTodo.title = 'writer-still-valid';
    await expect(repo.create(nextTodo)).resolves.toBeDefined();

    // 第二次调用验证重建的触发器语句，同时不会丢失 writer lease。
    await expect(cleanup_db(adapter)).resolves.toBeUndefined();
    expect(await getWriterProtocolState(adapter)).toEqual(protocolBefore);
  });

  it('cloneEntityClasses copies ɵMetadata and non-special statics', () => {
    const meta = { name: 'Demo' };
    const metaSym = Symbol('ɵMetadata');
    class Demo {
      static keep = 42;
    }
    Object.defineProperty(Demo, metaSym, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: false
    });
    const custom = Symbol('custom');
    Object.defineProperty(Demo, custom, {
      value: 'x',
      enumerable: false,
      configurable: true,
      writable: true
    });

    const [Clone] = cloneEntityClasses([Demo as unknown as EntityType]);
    expect(Clone).not.toBe(Demo);
    expect((Clone as unknown as { keep: number }).keep).toBe(42);
    const clonedMeta = Object.getOwnPropertyDescriptor(Clone, metaSym)?.value;
    expect(clonedMeta).toBeTruthy();
    expect(Object.getPrototypeOf(clonedMeta)).toBe(meta);
    expect(Object.getOwnPropertyDescriptor(Clone, custom)?.value).toBe('x');
  });

  it('cloneEntityClasses walks prototype chain for ɵMetadata', () => {
    const meta = { name: 'BaseMeta' };
    const metaSym = Symbol('ɵMetadata');
    class Base {}
    Object.defineProperty(Base, metaSym, {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: false
    });
    class Child extends Base {}
    const [Clone] = cloneEntityClasses([Child as unknown as EntityType]);
    const clonedMeta = Object.getOwnPropertyDescriptor(Clone, metaSym)?.value;
    expect(Object.getPrototypeOf(clonedMeta)).toBe(meta);
  });
});
