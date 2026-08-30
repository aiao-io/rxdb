/**
 * renderer 侧桌面 PGlite 客户端的契约测试。
 *
 * @remarks
 * 传输层是**进程内直连**而不是真的 `ipcRenderer.invoke`，但请求与应答都经过一次
 * `structuredClone`：协议承诺的正是「只用结构化克隆搬得动的类型」，把这一步省掉
 * 就等于把 AC#1 的断言全部架空——bigint / `Uint8Array` / `Date` 会因为直接引用传递
 * 而永远"保真"，真的跨进程时才在 IPC 层炸出 DataCloneError。
 *
 * 另一侧是**真实的 PGlite**（内存实例）与生产同款的 host，因此事务语义、NOTIFY
 * 与类型往返都不是模拟的。
 *
 * @module __tests__/desktop-pglite-client
 */

import { PGliteChangeType, type PGliteChangeEvent } from '@aiao/rxdb-adapter-pglite';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import { identifier } from '@electric-sql/pglite/template';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopPGliteClient } from '../pglite/desktop-pglite-client.js';
import { createElectronPgliteHost, type ElectronPgliteHost } from '../pglite-host/electron-pglite-host.js';
import type { ElectronPgliteRuntime } from '../pglite-host/electron-pglite-host.js';

const OWNER = 7;

let host: ElectronPgliteHost;
let runtimes: PGlite[];
let transport: DesktopHostTransport;
let requestKinds: string[];
let listeners: Set<(message: unknown) => void>;

const openClient = async (dataDirectoryName = 'todo-pgdata'): Promise<DesktopPGliteClient> => {
  const client = new DesktopPGliteClient({ transport, dataDirectoryName });
  await client.init('todo', {});
  return client;
};

beforeEach(() => {
  runtimes = [];
  requestKinds = [];
  listeners = new Set();
  host = createElectronPgliteHost({
    createRuntime: async (): Promise<ElectronPgliteRuntime> => {
      const runtime = new PGlite();
      await runtime.waitReady;
      runtimes.push(runtime);
      return runtime;
    },
    postNotify: message => {
      const cloned = structuredClone(message);
      for (const listener of listeners) listener(cloned);
    }
  });
  transport = {
    request: async payload => {
      requestKinds.push(payload.kind);
      // 两个方向都克隆：请求带着 renderer 的绑定参数过去，应答带着 PG 的原值回来，
      // 任何一侧混进函数或类实例都会在这里以 DataCloneError 现形。
      return structuredClone(await host.handle(structuredClone(payload), OWNER));
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
});

afterEach(async () => {
  await host.closeAll();
  for (const runtime of runtimes) await runtime.close().catch(() => undefined);
});

describe('DesktopPGliteClient', () => {
  // AC#11：版本核对必须排在任何有副作用的请求之前。PGlite 的 `pg.open` 会 mkdir 出
  // 一整棵 initdb 目录树，等到从 open 应答里读出版本不匹配时，磁盘上已经多了它。
  it('handshakes before it opens anything', async () => {
    await (await openClient()).disconnect();
    expect(requestKinds[0]).toBe('pg.handshake');
    expect(requestKinds.indexOf('pg.open')).toBeGreaterThan(0);
  });

  // 存储由主进程独占。悄悄忽略 store/dataDir 的话，调用方以为自己指定了落盘位置，
  // 而数据实际落在别处——症状是"重启后数据没了"。
  it('refuses PGlite storage options because the host owns storage', async () => {
    const client = new DesktopPGliteClient({ transport, dataDirectoryName: 'todo-pgdata' });
    await expect(client.init('todo', { store: 'memory' })).rejects.toThrowError(/protocol_violation|store/);
  });

  it('reports the logical location the host resolved, never a physical path', async () => {
    const client = await openClient();
    expect(client.resolvedLocation).toBe('desktop-pglite://app-scope/todo-pgdata');
    await client.disconnect();
  });

  // AC#1：int8 / bytea / timestamptz / jsonb 逐值保真，且中间只经过结构化克隆。
  it('round-trips bigint, binary, timestamps and jsonb without JSON encoding', async () => {
    const client = await openClient();
    await client.exec(`
      CREATE TABLE fidelity (
        id int8 PRIMARY KEY, blob bytea, at timestamptz, meta jsonb
      )`);
    const at = new Date('2026-08-30T01:02:03.000Z');
    const blob = new Uint8Array([0, 1, 255, 128]);
    await client.query('INSERT INTO fidelity (id, blob, at, meta) VALUES ($1, $2, $3, $4)', [
      9007199254740993n,
      blob,
      at,
      { nested: { flag: true }, list: [1, 2] }
    ]);

    const result = await client.query<{
      id: bigint;
      blob: Uint8Array;
      at: Date;
      meta: { nested: { flag: boolean }; list: number[] };
    }>('SELECT id, blob, at, meta FROM fidelity');
    const row = result.rows[0];
    expect(row.id).toBe(9007199254740993n);
    expect([...row.blob]).toEqual([0, 1, 255, 128]);
    expect(row.at.toISOString()).toBe(at.toISOString());
    expect(row.meta).toEqual({ nested: { flag: true }, list: [1, 2] });
    // `fields` 上的解析器函数必须被 host 剥掉，否则整条应答过不了结构化克隆。
    expect(Object.keys(result.fields[0]).sort()).toEqual(['dataTypeID', 'name']);
    await client.disconnect();
  });

  it('returns one result per statement from exec', async () => {
    const client = await openClient();
    const results = await client.exec('CREATE TABLE multi (id int); SELECT 1 AS a; SELECT 2 AS b;');
    expect(results).toHaveLength(3);
    expect(results[2].rows).toEqual([{ b: 2 }]);
    await client.disconnect();
  });

  // AC#2：多条语句必须真的落在同一条事务里，而不是被包装成"看起来像事务"的独立请求。
  it('commits every statement of a transaction together', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tx_demo (id int)');
    await client.transaction(async tx => {
      await tx.query('INSERT INTO tx_demo VALUES (1)');
      await tx.query('INSERT INTO tx_demo VALUES (2)');
      // 事务内自读得看得见自己写的行，否则这两条根本不在同一条事务上。
      expect((await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM tx_demo')).rows[0].n).toBe(2);
    });
    expect((await client.query<{ n: number }>('SELECT count(*)::int AS n FROM tx_demo')).rows[0].n).toBe(2);
    await client.disconnect();
  });

  it('rolls the whole transaction back when the callback throws', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tx_rollback (id int)');
    await expect(
      client.transaction(async tx => {
        await tx.query('INSERT INTO tx_rollback VALUES (1)');
        throw new Error('business rule rejected the write');
      })
    ).rejects.toThrowError('business rule rejected the write');
    expect((await client.query<{ n: number }>('SELECT count(*)::int AS n FROM tx_rollback')).rows[0].n).toBe(0);
    // 事务必须已经在 host 上结清，而不是挂着占住那条唯一连接。
    expect(host.openTransactionCount).toBe(0);
    await client.disconnect();
  });

  it('honours an explicit tx.rollback() without failing the transaction call', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tx_explicit (id int)');
    await client.transaction(async tx => {
      await tx.query('INSERT INTO tx_explicit VALUES (1)');
      await tx.rollback();
      expect(tx.closed).toBe(true);
    });
    expect((await client.query<{ n: number }>('SELECT count(*)::int AS n FROM tx_explicit')).rows[0].n).toBe(0);
    await client.disconnect();
  });

  // 这条是核心回归：没有本地互斥时，第二条事务的 `pg.begin` 会排在会话队列里等主进程
  // 那条唯一连接，而连接要等第一条事务发完剩下的语句才空出来——两边互相等，
  // 表现为 5 秒后一句 `transaction_unavailable`，看上去像 host 有 bug。
  it('serialises concurrent transactions locally instead of deadlocking on the single connection', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tx_race (id int)');
    await Promise.all([
      client.transaction(async tx => {
        await tx.query('INSERT INTO tx_race VALUES (1)');
        await tx.query('INSERT INTO tx_race VALUES (2)');
      }),
      client.transaction(async tx => {
        await tx.query('INSERT INTO tx_race VALUES (3)');
      })
    ]);
    expect((await client.query<{ n: number }>('SELECT count(*)::int AS n FROM tx_race')).rows[0].n).toBe(3);
    await client.disconnect();
  });

  // 自动提交语句在事务开着时必须等，不能插到事务的两条语句中间：那条语句会跑在事务
  // **之外**，而 PGlite 的连接锁又攥在挂起的事务手里，结果是双方互相等死。
  it('makes autocommit statements wait for an open transaction', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tx_wait (id int)');
    const order: string[] = [];
    const transaction = client.transaction(async tx => {
      await tx.query('INSERT INTO tx_wait VALUES (1)');
      await new Promise(resolve => setTimeout(resolve, 20));
      order.push('transaction');
    });
    const autocommit = client.query('INSERT INTO tx_wait VALUES (2)').then(() => order.push('autocommit'));
    await Promise.all([transaction, autocommit]);
    expect(order).toEqual(['transaction', 'autocommit']);
    await client.disconnect();
  });

  // 标签模板走 PGlite 自己的编译器，因此 `identifier` 的转义与参数化与浏览器路径逐字一致。
  it('compiles tagged templates with PGlite own compiler, inside a transaction too', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE tpl (id int)');
    const id = 7;
    await client.sql`INSERT INTO ${identifier`tpl`} VALUES (${id})`;
    await client.transaction(async tx => {
      const rows = (await tx.sql<{ id: number }>`SELECT id FROM tpl WHERE id = ${id}`).rows;
      expect(rows).toEqual([{ id: 7 }]);
    });
    await client.disconnect();
  });

  // `listen` 要在**这条连接**上挂一个回调，而回调过不了进程边界。静默降级成
  // 「订阅了但永远收不到」是最难查的一种故障，所以必须当场炸。
  it('fails loudly on transaction operations it cannot proxy', async () => {
    const client = await openClient();
    await client.transaction(async tx => {
      expect(() => tx.listen('x', () => undefined)).toThrowError(/listen/);
    });
    await client.disconnect();
  });

  it('turns forwarded NOTIFY into batched change events', async () => {
    const client = await openClient();
    const events: PGliteChangeEvent[] = [];
    client.addEventListener(PGliteChangeType.INSERT, event => events.push(event));

    const payload = JSON.stringify({ operation: PGliteChangeType.INSERT, ids: ['a', 'b'] });
    for (const listener of listeners) {
      listener({ kind: 'pg.notify', sessionId: client.sessionId, channel: 'rxdb_change_notify', payload });
    }
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(events).toHaveLength(1);
    expect(events[0].tableName).toBe('rxdb_change');
    expect(events[0].dbName).toBe('todo');
    expect(events[0].rowIds).toEqual(['a', 'b']);
    await client.disconnect();
  });

  // 变更通道是全 renderer 共享的：别的会话（甚至 SQLite host 的 `change` 消息）都会
  // 走同一条管子过来，认错一条就等于把另一个库的变更派发到自己的查询上。
  it('ignores messages that belong to another session or protocol', async () => {
    const client = await openClient();
    const events: PGliteChangeEvent[] = [];
    client.addEventListener(PGliteChangeType.INSERT, event => events.push(event));

    const payload = JSON.stringify({ operation: PGliteChangeType.INSERT, ids: ['a'] });
    for (const listener of listeners) {
      listener({ kind: 'pg.notify', sessionId: 'someone-else', channel: 'rxdb_change_notify', payload });
      listener({ kind: 'change', sessionId: client.sessionId, event: {} });
    }
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(events).toEqual([]);
    await client.disconnect();
  });

  it('reports the PostgreSQL version the host is running', async () => {
    const client = await openClient();
    expect(await client.version()).toMatch(/^PostgreSQL /);
    await client.disconnect();
  });

  it('closes the host session on disconnect and refuses later statements', async () => {
    const client = await openClient();
    await client.disconnect();
    expect(host.openSessionCount).toBe(0);
    await expect(client.query('SELECT 1')).rejects.toThrowError(/session_closed/);
  });

  it('releases the session on forceClose as well', async () => {
    const client = await openClient();
    await client.forceClose();
    expect(host.openSessionCount).toBe(0);
  });

  it('shares one host instance between two clients on the same data directory', async () => {
    const first = await openClient('shared-pgdata');
    const second = await openClient('shared-pgdata');
    expect(host.openSessionCount).toBe(2);
    expect(host.openInstanceCount).toBe(1);
    await first.exec('CREATE TABLE shared (id int)');
    expect((await second.query<{ n: number }>('SELECT count(*)::int AS n FROM shared')).rows[0].n).toBe(0);
    await first.disconnect();
    await second.disconnect();
  });
});
