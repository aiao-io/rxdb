import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      context: { userId: 'userId' },
      dbName: `db-${Date.now()}`,
      entities: [...ENTITIES],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });
    rxdb
      .adapter('pglite', async db => {
        adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
        return adapter;
      })
      .init();

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it("rxdb.connect('pglite') 连接数据库后能返回插件实例", async () => {
    const conn = await rxdb.connect('pglite');
    expect(conn).toBeTruthy();
    expect(conn).toBeInstanceOf(RxDBAdapterPGlite);
  });

  it('adapter.version() 能返回数据库版本', async () => {
    const version = await adapter.version();
    expect(version).toBeTypeOf('string');
    expect(version.includes('PostgreSQL 18.3')).toBeTruthy();
  });

  it('adapter.getTableColumns() 能返回表的列信息', async () => {
    const userColumns = await adapter.getTableColumns(User);
    expect(userColumns.length > 0).toBeTruthy();
  });

  it('adapter.transaction() 事务处理能调用成功', async () => {
    const user = await adapter.transaction(async executor => {
      const next = new User();
      next.name = 'aiao_promise';
      return executor.getRepository(User).create(next);
    });
    expect(user.name).toBe('aiao_promise');
  });

  it('adapter.transaction() 能检测到主键冲突', async () => {
    await expect(
      adapter.transaction(async executor => {
        const repo = executor.getRepository(User);
        const user = new User();
        user.name = 'aiao';
        await repo.create(user);
        const user2 = new User();
        user2.name = 'aiao';
        Reflect.set(user2, 'id', user.id);
        await repo.create(user2);
      })
    ).rejects.toThrow(/UNIQUE constraint failed|duplicate key value violates unique constraint/i);
  });

  it('rxdb.disconnect() 后重新 connect 应该使用新的客户端连接', async () => {
    await expect(adapter.version()).resolves.toContain('PostgreSQL');

    await rxdb.disconnect('pglite');

    const reconnectedAdapter = await rxdb.connect('pglite');

    await expect(reconnectedAdapter.version()).resolves.toContain('PostgreSQL');
  });
});

// 单独的 describe 隔离上面 disconnect/reconnect 测试对 memory store 的副作用：
// memory store 在 disconnect 后内存数据库会销毁，下次 user.save() 找不到表，
// 与本测试关心的事务锁释放无关。
describe('RxDBAdapterPGlite 事务回滚', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      context: { userId: 'userId' },
      dbName: `db-tx-${Date.now()}`,
      entities: [...ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    rxdb
      .adapter('pglite', async db => {
        adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
        return adapter;
      })
      .init();

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('transaction() 抛错后非事务查询仍可继续执行', async () => {
    await expect(
      adapter.transaction(async () => {
        throw new Error('intentional rollback');
      })
    ).rejects.toThrow('intentional rollback');

    const user = new User();
    user.name = 'after_rollback';
    await expect(user.save()).resolves.toBeDefined();
  });
});
