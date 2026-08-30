import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { EventDispatcher } from '@aiao/utils';
import type { Results } from '@electric-sql/pglite';
import type { LiveQuery } from '@electric-sql/pglite/live';
import { afterEach, describe, expect, it } from 'vitest';
import { PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';
import { IPGliteClient, PGliteClient, PGliteClientEvents } from '../PGliteClient.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 代理客户端：实现 {@link IPGliteClient} 与变更事件源两组契约，但**不是** {@link PGliteClient}。
 *
 * @remarks
 * US-208 的桌面客户端就是这个形状——查询走 IPC、NOTIFY 由主进程转发。适配器过去用
 * `client instanceof PGliteClient` 决定要不要挂/摘变更监听，这类客户端因此既收不到变更，
 * 也永远不会被解绑（`disconnect()` 之后监听器仍挂着，指向已废弃的适配器）。
 */
class ProxyPGliteClient extends EventDispatcher<PGliteClientEvents> implements IPGliteClient {
  readonly #inner = new PGliteClient();

  /** 被挂上监听的变更类型；解绑后移除。用来直接观察挂/摘这对动作。 */
  readonly attached = new Set<PGliteChangeType>();

  get pendingNotificationCount(): number {
    return this.#inner.pendingNotificationCount;
  }

  override addEventListener<T extends keyof PGliteClientEvents>(
    type: T,
    listener: (event: PGliteClientEvents[T]) => void
  ): void {
    this.attached.add(type);
    super.addEventListener(type, listener);
  }

  override removeEventListener<T extends keyof PGliteClientEvents>(
    type: T,
    listener: (event: PGliteClientEvents[T]) => void
  ): void {
    this.attached.delete(type);
    super.removeEventListener(type, listener);
  }

  async init(dbName: string, options: Parameters<IPGliteClient['init']>[1]): Promise<void> {
    await this.#inner.init(dbName, options);
    // 转发底层变更，模拟「主进程把 NOTIFY 送进渲染进程」。
    for (const type of [PGliteChangeType.INSERT, PGliteChangeType.UPDATE, PGliteChangeType.DELETE]) {
      this.#inner.addEventListener(type, (event: PGliteChangeEvent) => this.dispatchEvent(type, event));
    }
  }

  query<T>(...args: Parameters<IPGliteClient['query']>): Promise<Results<T>> {
    return this.#inner.query<T>(...args);
  }

  sql<T>(...args: Parameters<IPGliteClient['sql']>): Promise<Results<T>> {
    return this.#inner.sql<T>(...args);
  }

  exec(...args: Parameters<IPGliteClient['exec']>) {
    return this.#inner.exec(...args);
  }

  // `describeQuery` 在 `IPGliteClient` 上是可选的（跨 IPC 代理不了），取参数类型前得先摘掉
  // `undefined`——这里断言的是「在场时签名不变」，不是「它一定在场」。
  describeQuery(...args: Parameters<NonNullable<IPGliteClient['describeQuery']>>) {
    return this.#inner.describeQuery(...args);
  }

  transaction<T>(callback: Parameters<IPGliteClient['transaction']>[0]): Promise<T> {
    return this.#inner.transaction(callback) as Promise<T>;
  }

  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.#inner.runExclusive(fn);
  }

  hasStoragePeer(): boolean {
    return this.#inner.hasStoragePeer();
  }

  liveQuery<T>(
    query: string,
    params?: unknown[] | null,
    callback?: (results: Results<T>) => void
  ): Promise<LiveQuery<T>> {
    return this.#inner.liveQuery<T>(query, params, callback);
  }

  forceClose(): Promise<void> {
    return this.#inner.forceClose();
  }

  disconnect(): Promise<void> {
    return this.#inner.disconnect();
  }

  version(): Promise<string> {
    return this.#inner.version();
  }
}

describe('RxDBAdapterPGlite 客户端工厂', () => {
  let rxdb: RxDB | undefined;

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
    rxdb = undefined;
  });

  const setup = async <T extends RxDBAdapterPGlite>(create: (db: RxDB) => T): Promise<T> => {
    let adapter!: T;
    rxdb = new RxDB({
      dbName: `adapter-factory-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      context: { userId: 'creator-user' },
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => {
      adapter = create(db);
      return adapter;
    });
    await rxdb.connect('pglite');
    return adapter;
  };

  it('子类可以用 createClient() 替换底层客户端', async () => {
    const clients: ProxyPGliteClient[] = [];
    class SubclassedAdapter extends RxDBAdapterPGlite {
      protected override createClient(): IPGliteClient {
        const client = new ProxyPGliteClient();
        clients.push(client);
        return client;
      }
    }

    const adapter = await setup(db => new SubclassedAdapter(db, { store: 'memory' }));

    // 只建一次，且真的被用上了——查询能通，说明不是构造完就被默认实现顶掉。
    expect(clients).toHaveLength(1);
    await expect(adapter.rawQuery('SELECT 1 AS one')).resolves.toMatchObject({ columns: ['one'], rows: [[1]] });
  });

  it('非默认实现的变更监听会被挂上，也会在 disconnect 时解绑', async () => {
    const clients: ProxyPGliteClient[] = [];
    class SubclassedAdapter extends RxDBAdapterPGlite {
      protected override createClient(): IPGliteClient {
        const client = new ProxyPGliteClient();
        clients.push(client);
        return client;
      }
    }

    await setup(db => new SubclassedAdapter(db, { store: 'memory' }));
    const client = clients[0];

    expect([...client.attached].sort()).toEqual(
      [PGliteChangeType.INSERT, PGliteChangeType.UPDATE, PGliteChangeType.DELETE].sort()
    );

    await rxdb?.disconnectAll();
    rxdb = undefined;

    expect([...client.attached]).toEqual([]);
  });
});
