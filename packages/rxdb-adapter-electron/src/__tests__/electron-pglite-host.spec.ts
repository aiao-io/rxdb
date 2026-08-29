/**
 * 桌面 PGlite host 的行为契约（US-208 AC#1～#9、#11）。
 *
 * @remarks
 * 用例一律跑在**真实 PGlite 实例**上，不用 mock runtime：本故事要证的核心是
 * 「跨 IPC 的事务确实是一条 PostgreSQL 事务」（AC#2），而 mock 事务只能证明
 * 我们自己写的那几行 Map 操作自洽。
 */

import {
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  type DesktopPgliteNotifyMessage,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createElectronPgliteHost,
  DESKTOP_PGLITE_WATCH_CHANNELS,
  type ElectronPgliteHost,
  type ElectronPgliteRuntime
} from '../pglite-host.js';

const OWNER = 11;
const OTHER_OWNER = 22;

interface Harness {
  readonly host: ElectronPgliteHost;
  readonly notifies: DesktopPgliteNotifyMessage[];
  /** 已创建的 runtime 条数——AC#7 的「单实例」就是数它。 */
  readonly created: () => number;
}

let active: Harness | undefined;

const createHarness = (): Harness => {
  const notifies: DesktopPgliteNotifyMessage[] = [];
  const runtimes: PGlite[] = [];
  const host = createElectronPgliteHost({
    createRuntime: async (dataDirectoryName: string): Promise<ElectronPgliteRuntime> => {
      expect(dataDirectoryName).toBeTypeOf('string');
      const runtime = new PGlite();
      await runtime.waitReady;
      runtimes.push(runtime);
      return runtime;
    },
    postNotify: message => notifies.push(message)
  });
  const harness: Harness = { host, notifies, created: () => runtimes.length };
  active = harness;
  return harness;
};

afterEach(async () => {
  await active?.host.closeAll();
  active = undefined;
});

/** 发一条请求并断言它不是错误应答，顺带把类型收窄。 */
const ok = async <TKind extends Exclude<DesktopPgliteResponse['kind'], 'error'>>(
  host: ElectronPgliteHost,
  kind: TKind,
  request: DesktopPgliteRequest,
  owner = OWNER
): Promise<Extract<DesktopPgliteResponse, { kind: TKind }>> => {
  const response = await host.handle(request, owner);
  if (response.kind === 'error') throw new Error(`${response.code}: ${response.message}`);
  expect(response.kind).toBe(kind);
  return response as Extract<DesktopPgliteResponse, { kind: TKind }>;
};

/** 发一条请求并断言它是错误应答，返回错误码。 */
const failure = async (
  host: ElectronPgliteHost,
  request: DesktopPgliteRequest,
  owner = OWNER
): Promise<string> => {
  const response = await host.handle(request, owner);
  expect(response.kind).toBe('error');
  return (response as Extract<DesktopPgliteResponse, { kind: 'error' }>).code;
};

const openSession = async (host: ElectronPgliteHost, dataDirectoryName: string, owner = OWNER): Promise<string> => {
  const response = await ok(
    host,
    'pg.open',
    { kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName } },
    owner
  );
  return response.result.sessionId;
};

describe('createElectronPgliteHost', () => {
  it('握手不建目录、不碰 createRuntime（AC#11）', async () => {
    const { host, created } = createHarness();

    const response = await ok(host, 'pg.handshake', { kind: 'pg.handshake' });

    expect(response.result.protocolVersion).toBe(DESKTOP_PGLITE_PROTOCOL_VERSION);
    // 版本对不上时 renderer 就此止步，磁盘上不该多出一棵 initdb 目录树。
    expect(created()).toBe(0);
    expect(host.openSessionCount).toBe(0);
  });

  it('open 只回逻辑位置，不泄漏物理根目录（AC#5）', async () => {
    const { host } = createHarness();

    const response = await ok(host, 'pg.open', {
      kind: 'pg.open',
      storage: { engine: 'pglite', dataDirectoryName: 'todo-pgdata' }
    });

    expect(response.result.protocolVersion).toBe(DESKTOP_PGLITE_PROTOCOL_VERSION);
    expect(response.result.resolvedLocation).toBe('desktop-pglite://app-scope/todo-pgdata');
    expect(response.result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(host.openSessionCount).toBe(1);
  });

  it('同一个数据目录只起一个 PGlite 实例，最后一个会话关掉才释放（AC#7）', async () => {
    const { host, created } = createHarness();

    const first = await openSession(host, 'shared-pgdata');
    const second = await openSession(host, 'shared-pgdata', OTHER_OWNER);

    expect(created()).toBe(1);
    expect(host.openInstanceCount).toBe(1);

    // 一个窗口写、另一个窗口读，读得到——两条会话确实落在同一个库上。
    await ok(host, 'pg.exec', { kind: 'pg.exec', sessionId: first, sql: 'CREATE TABLE t (id int primary key)' });
    await ok(host, 'pg.query', { kind: 'pg.query', sessionId: first, sql: 'INSERT INTO t VALUES (1)', params: [] });
    const read = await ok(
      host,
      'pg.query',
      { kind: 'pg.query', sessionId: second, sql: 'SELECT id FROM t', params: [] },
      OTHER_OWNER
    );
    expect(read.result.rows).toEqual([{ id: 1 }]);

    await ok(host, 'pg.close', { kind: 'pg.close', sessionId: first });
    expect(host.openInstanceCount).toBe(1);
    await ok(host, 'pg.close', { kind: 'pg.close', sessionId: second }, OTHER_OWNER);
    expect(host.openInstanceCount).toBe(0);
  });

  it('不同数据目录各起一个实例', async () => {
    const { host, created } = createHarness();

    await openSession(host, 'a-pgdata');
    await openSession(host, 'b-pgdata');

    expect(created()).toBe(2);
    expect(host.openInstanceCount).toBe(2);
  });

  it('提交后的写入可见，回滚后的写入一条都不留（AC#2）', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'tx-pgdata');
    await ok(host, 'pg.exec', { kind: 'pg.exec', sessionId, sql: 'CREATE TABLE t (id int primary key)' });

    const committed = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'INSERT INTO t VALUES ($1)',
      params: [1],
      transactionId: committed.result.transactionId
    });
    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'INSERT INTO t VALUES ($1)',
      params: [2],
      transactionId: committed.result.transactionId
    });
    await ok(host, 'pg.commit', {
      kind: 'pg.commit',
      sessionId,
      transactionId: committed.result.transactionId
    });

    const rolledBack = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'INSERT INTO t VALUES ($1)',
      params: [3],
      transactionId: rolledBack.result.transactionId
    });
    await ok(host, 'pg.rollback', {
      kind: 'pg.rollback',
      sessionId,
      transactionId: rolledBack.result.transactionId
    });

    const rows = await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'SELECT id FROM t ORDER BY id',
      params: []
    });
    expect(rows.result.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('事务里的 pg.exec 也走同一条事务，回滚照样带走它', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'tx-exec-pgdata');
    await ok(host, 'pg.exec', { kind: 'pg.exec', sessionId, sql: 'CREATE TABLE t (id int primary key)' });

    const begun = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    await ok(host, 'pg.exec', {
      kind: 'pg.exec',
      sessionId,
      sql: 'INSERT INTO t VALUES (7); INSERT INTO t VALUES (8);',
      transactionId: begun.result.transactionId
    });
    await ok(host, 'pg.rollback', { kind: 'pg.rollback', sessionId, transactionId: begun.result.transactionId });

    const rows = await ok(host, 'pg.query', { kind: 'pg.query', sessionId, sql: 'SELECT id FROM t', params: [] });
    expect(rows.result.rows).toEqual([]);
  });

  it('第二条并发事务快速失败而不是静默排队，且不拖死后续事务', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'busy-pgdata');

    const held = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    // 唯一那条连接被上面这条事务占着，第二个 begin 只能超时——决不能无限期挂着。
    expect(await failure(host, { kind: 'pg.begin', sessionId, timeout: 50 })).toBe('transaction_unavailable');

    await ok(host, 'pg.commit', { kind: 'pg.commit', sessionId, transactionId: held.result.transactionId });

    // 超时那条事务必须已经被彻底放弃：否则它会在连接空出来的瞬间抢走锁，
    // 于是「超时之后再也开不了事务」，而现场看上去只是「数据库不响应」。
    const next = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    await ok(host, 'pg.commit', { kind: 'pg.commit', sessionId, transactionId: next.result.transactionId });
    expect(host.openTransactionCount).toBe(0);
  });

  it('renderer 崩溃后 releaseOwner 回滚它名下全部事务并放开连接（AC#3）', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'crash-pgdata');
    await ok(host, 'pg.exec', { kind: 'pg.exec', sessionId, sql: 'CREATE TABLE t (id int primary key)' });

    const doomed = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });
    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'INSERT INTO t VALUES ($1)',
      params: [1],
      transactionId: doomed.result.transactionId
    });

    expect(await host.releaseOwner(OWNER)).toBe(1);
    expect(host.openTransactionCount).toBe(0);
    // 会话随窗口一起消失，连接因此也被释放。
    expect(host.openSessionCount).toBe(0);
    expect(host.openInstanceCount).toBe(0);

    // 库还能用，且崩溃前那条未提交的写入没有留下痕迹。
    const revived = await openSession(host, 'crash-pgdata');
    const rows = await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId: revived,
      sql: "SELECT to_regclass('t') IS NULL AS gone",
      params: []
    });
    expect(rows.result.rows).toEqual([{ gone: true }]);
  });

  it('别的窗口拿不走不属于自己的事务 ID', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'owner-pgdata');
    const begun = await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 2_000 });

    expect(
      await failure(
        host,
        {
          kind: 'pg.query',
          sessionId,
          sql: 'SELECT 1',
          params: [],
          transactionId: begun.result.transactionId
        },
        OTHER_OWNER
      )
    ).toBe('permission_denied');

    expect(
      await failure(host, {
        kind: 'pg.commit',
        sessionId,
        transactionId: '00000000-0000-4000-8000-000000000000'
      })
    ).toBe('transaction_not_found');

    await ok(host, 'pg.rollback', { kind: 'pg.rollback', sessionId, transactionId: begun.result.transactionId });
  });

  it('bigint / Uint8Array / Date / JSONB 跨协议逐值保真（AC#1）', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'fidelity-pgdata');
    await ok(host, 'pg.exec', {
      kind: 'pg.exec',
      sessionId,
      sql: 'CREATE TABLE t (id int primary key, big int8, blob bytea, ts timestamptz, doc jsonb)'
    });

    const big = 9_007_199_254_740_993n;
    const blob = new Uint8Array([0, 1, 255]);
    const ts = new Date('2020-01-02T03:04:05.000Z');
    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: 'INSERT INTO t VALUES ($1, $2, $3, $4, $5)',
      params: [1, big, blob, ts, { a: [1, 'x'] }]
    });

    const rows = await ok(host, 'pg.query', { kind: 'pg.query', sessionId, sql: 'SELECT * FROM t', params: [] });
    expect(rows.result.rows[0]).toEqual({ id: 1, big, blob, ts, doc: { a: [1, 'x'] } });
    // fields 必须已经被收窄成可克隆的两项，否则 ipcRenderer.invoke 会以 DataCloneError 失败。
    expect(rows.result.fields.every(field => Object.keys(field).sort().join() === 'dataTypeID,name')).toBe(true);
  });

  it('转发裸 NOTIFY，批量与去重不在 host 侧发生', async () => {
    const { host, notifies } = createHarness();
    const sessionId = await openSession(host, 'notify-pgdata');

    await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId,
      sql: `NOTIFY rxdb_change_notify, '{"operation":"INSERT","ids":["a"]}'`,
      params: []
    });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(notifies).toEqual([
      {
        kind: 'pg.notify',
        sessionId,
        channel: 'rxdb_change_notify',
        payload: '{"operation":"INSERT","ids":["a"]}'
      }
    ]);
  });

  it('订阅的频道就是渲染进程那三张系统表', () => {
    expect([...DESKTOP_PGLITE_WATCH_CHANNELS]).toEqual([
      'rxdb_change_notify',
      'rxdb_branch_notify',
      'rxdb_migration_notify'
    ]);
  });

  it('失败一律走应答而不是 reject，错误码原样过 IPC', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'error-pgdata');

    expect(await failure(host, { kind: 'pg.version', sessionId: '00000000-0000-4000-8000-000000000000' })).toBe(
      'session_closed'
    );
    expect(await failure(host, { kind: 'pg.query', sessionId, sql: 'SELECT * FROM nope', params: [] })).toBe(
      'statement_failed'
    );
    await expect(host.handle({ kind: 'pg.unknown' }, OWNER)).resolves.toMatchObject({
      kind: 'error',
      code: 'protocol_violation'
    });
    // SQLite 与文件两族的 kind 在这里同样是协议违规，三族解析器互不接受对方的请求。
    await expect(host.handle({ kind: 'execute', sessionId, sql: 'SELECT 1' }, OWNER)).resolves.toMatchObject({
      kind: 'error',
      code: 'protocol_violation'
    });
  });

  it('pg.version 报的是真实 PostgreSQL 版本', async () => {
    const { host } = createHarness();
    const sessionId = await openSession(host, 'version-pgdata');

    const response = await ok(host, 'pg.version', { kind: 'pg.version', sessionId });

    expect(response.result).toMatch(/^PostgreSQL /);
  });
});
