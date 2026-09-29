/**
 * 桌面 PGlite host 的备份与恢复协议（US-217 阶段 C：AC#5、#11、#12、#16、#19、#21）。
 *
 * @remarks
 * 磁盘上的真实 PGlite。整个文件只 initdb 一次，其余用例从模板目录复制——复制比 initdb 快一个数量级；
 * 校验恢复顺序与写入校验的用例直接用模板遍历出的条目，不必每次先跑一遍备份。
 */

import {
  DESKTOP_PGLITE_EXCLUDED_FILES,
  DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES,
  type DesktopPgliteBackupItem,
  type DesktopPgliteDataDirItem,
  type DesktopPgliteRequest,
  type DesktopPgliteResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createElectronPgliteHost,
  type ElectronPgliteBackupOptions,
  type ElectronPgliteHost,
  type ElectronPgliteHostOptions,
  type ElectronPgliteRuntime
} from '../pglite-host.js';
import { walkPgliteDataDirectory } from '../pglite-host/pglite-host-data-dir.js';
import { pgliteLockPathOf } from '../pglite-host/pglite-host-lock.js';

const OWNER = 11;
const OTHER_OWNER = 22;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
/** 跑一整遍真实备份或恢复的用例：约两千次 `handle` 加上千次 fsync。 */
const HEAVY = 60_000;

let templateRoot: string;
let template: string;
let templateItems: DesktopPgliteDataDirItem[];

beforeAll(async () => {
  templateRoot = mkdtempSync(join(tmpdir(), 'rxdb-pglite-host-template-'));
  template = join(templateRoot, 'template');
  const pg = new PGlite(template);
  await pg.waitReady;
  await pg.close();
  templateItems = [];
  for await (const item of walkPgliteDataDirectory(template)) templateItems.push(item);
}, 60_000);

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

let root: string;
let runtimes: PGlite[];
let probes: number;
let hosts: ElectronPgliteHost[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rxdb-pglite-host-backup-'));
  runtimes = [];
  probes = 0;
  hosts = [];
});

afterEach(async () => {
  for (const host of hosts.splice(0)) await host.closeAll();
  rmSync(root, { recursive: true, force: true });
});

const dir = (name: string): string => join(root, name);

const seed = (name: string): void => {
  cpSync(template, dir(name), { recursive: true });
};

const defaultBackup = (): ElectronPgliteBackupOptions => ({
  resolveDataDirectory: dir,
  createProbeRuntime: async () => {
    probes += 1;
    return new PGlite();
  },
  extensions: ['b', 'a', 'a']
});

const createRuntime = async (name: string): Promise<ElectronPgliteRuntime> => {
  const runtime = new PGlite(dir(name));
  runtimes.push(runtime);
  await runtime.waitReady;
  return runtime;
};

const startHost = (overrides: Partial<ElectronPgliteHostOptions> = {}): ElectronPgliteHost => {
  const host = createElectronPgliteHost({
    createRuntime,
    postNotify: () => undefined,
    backup: defaultBackup(),
    ...overrides
  });
  hosts.push(host);
  return host;
};

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

const failure = async (host: ElectronPgliteHost, request: DesktopPgliteRequest, owner = OWNER): Promise<string> => {
  const response = await host.handle(request, owner);
  expect(response.kind).toBe('error');
  return (response as Extract<DesktopPgliteResponse, { kind: 'error' }>).code;
};

const storage = (dataDirectoryName: string) => ({ engine: 'pglite' as const, dataDirectoryName });

const openSession = async (host: ElectronPgliteHost, name: string, owner = OWNER): Promise<string> =>
  (await ok(host, 'pg.open', { kind: 'pg.open', storage: storage(name) }, owner)).result.sessionId;

const exec = async (
  host: ElectronPgliteHost,
  sessionId: string,
  sql: string,
  transactionId?: string
): Promise<void> => {
  await ok(host, 'pg.exec', { kind: 'pg.exec', sessionId, sql, transactionId });
};

const names = async (host: ElectronPgliteHost, sessionId: string): Promise<unknown[]> => {
  const response = await ok(host, 'pg.query', {
    kind: 'pg.query',
    sessionId,
    sql: 'SELECT name FROM t ORDER BY name',
    params: []
  });
  return response.result.rows.map(row => row['name']);
};

const beginBackup = async (host: ElectronPgliteHost, sessionId: string, timeout = 5_000): Promise<string> =>
  (await ok(host, 'pg.backup.begin', { kind: 'pg.backup.begin', sessionId, timeout })).result.backupId;

const nextItem = async (
  host: ElectronPgliteHost,
  sessionId: string,
  backupId: string
): Promise<DesktopPgliteBackupItem> =>
  (await ok(host, 'pg.backup.next', { kind: 'pg.backup.next', sessionId, backupId })).result;

const endBackup = async (host: ElectronPgliteHost, sessionId: string, backupId: string): Promise<void> => {
  await ok(host, 'pg.backup.end', { kind: 'pg.backup.end', sessionId, backupId });
};

const drainBackup = async (
  host: ElectronPgliteHost,
  sessionId: string,
  backupId: string
): Promise<DesktopPgliteDataDirItem[]> => {
  const items: DesktopPgliteDataDirItem[] = [];
  let item = await nextItem(host, sessionId, backupId);
  while (item.type !== 'end') {
    items.push(item);
    item = await nextItem(host, sessionId, backupId);
  }
  return items;
};

/** 在 `name` 上建一张表、写入 `rows`，再完整读一遍快照。 */
const snapshotOf = async (host: ElectronPgliteHost, name: string, rows: readonly string[]) => {
  seed(name);
  const sessionId = await openSession(host, name);
  await exec(host, sessionId, 'CREATE TABLE t (name text)');
  for (const row of rows) {
    await ok(host, 'pg.query', { kind: 'pg.query', sessionId, sql: 'INSERT INTO t VALUES ($1)', params: [row] });
  }
  const backupId = await beginBackup(host, sessionId);
  const items = await drainBackup(host, sessionId, backupId);
  await endBackup(host, sessionId, backupId);
  return { sessionId, items };
};

const step = (
  kind: 'pg.restore.prepare' | 'pg.restore.open' | 'pg.restore.persist' | 'pg.restore.commit' | 'pg.restore.abort',
  restoreId: string
): DesktopPgliteRequest => ({ kind, restoreId });

const write = (restoreId: string, item: DesktopPgliteDataDirItem): DesktopPgliteRequest => ({
  kind: 'pg.restore.write',
  restoreId,
  item
});

const restoreQuery = (restoreId: string, sql: string): DesktopPgliteRequest => ({
  kind: 'pg.restore.query',
  restoreId,
  sql,
  params: []
});

const beginRestore = async (host: ElectronPgliteHost, name: string, owner = OWNER): Promise<string> =>
  (await ok(host, 'pg.restore.begin', { kind: 'pg.restore.begin', storage: storage(name) }, owner)).result.restoreId;

const cleanup = async (host: ElectronPgliteHost, name: string): Promise<boolean> =>
  (await ok(host, 'pg.restore.cleanup', { kind: 'pg.restore.cleanup', storage: storage(name) })).result.cleaned;

const writeAll = async (host: ElectronPgliteHost, restoreId: string, items: readonly DesktopPgliteDataDirItem[]) => {
  for (const item of items) await ok(host, 'pg.restore.write', write(restoreId, item));
};

const entry = (path: string, kind: 'file' | 'directory', size = 0): DesktopPgliteDataDirItem => ({
  type: 'entry',
  header: { path, kind, size }
});

const data = (size: number): DesktopPgliteDataDirItem => ({ type: 'data', bytes: new Uint8Array(size) });

/** 把一份快照按原样落成目录，用独立的 PGlite 读出表 `t`：快照自身必须是一个完整可用的数据目录。 */
const materializedNames = async (items: readonly DesktopPgliteDataDirItem[], directory: string): Promise<string[]> => {
  mkdirSync(directory);
  let file: number | undefined;
  for (const item of items) {
    if (item.type === 'data') {
      writeSync(file!, item.bytes);
      continue;
    }
    if (file !== undefined) closeSync(file);
    file = undefined;
    const target = join(directory, ...item.header.path.split('/'));
    if (item.header.kind === 'directory') mkdirSync(target);
    else file = openSync(target, 'wx');
  }
  if (file !== undefined) closeSync(file);
  const pg = new PGlite(directory);
  try {
    const { rows } = await pg.query<{ name: string }>('SELECT name FROM t ORDER BY name');
    return rows.map(row => row.name);
  } finally {
    await pg.close();
  }
};

/** 一个 promise 在给定时间内是否仍未落地。 */
const stillPending = async (promise: Promise<unknown>, ms = 50): Promise<boolean> => {
  let settled = false;
  const mark = (): void => {
    settled = true;
  };
  void promise.then(mark, mark);
  await delay(ms);
  return !settled;
};

/** 第一个运行时的 `close` 停在闸门上直到 `release()`；同时记下同一时刻活着的运行时数的峰值。 */
const gatedFirstClose = () => {
  let live = 0;
  let peak = 0;
  let markStarted!: () => void;
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const createGatedRuntime = async (name: string): Promise<ElectronPgliteRuntime> => {
    const runtime = await createRuntime(name);
    const gated = runtimes.length === 1;
    live += 1;
    peak = Math.max(peak, live);
    return {
      query: (sql, params) => runtime.query(sql, params),
      exec: sql => runtime.exec(sql),
      transaction: callback => runtime.transaction(callback),
      listen: (channel, callback) => runtime.listen(channel, callback),
      close: async () => {
        if (gated) {
          markStarted();
          await gate;
        }
        await runtime.close();
        live -= 1;
      }
    };
  };
  return { createRuntime: createGatedRuntime, started, release, peak: () => peak };
};

describe('未配置备份的 host', () => {
  const v2Requests: DesktopPgliteRequest[] = [
    { kind: 'pg.engine' },
    { kind: 'pg.backup.begin', sessionId: UNKNOWN_ID, timeout: 1_000 },
    { kind: 'pg.backup.next', sessionId: UNKNOWN_ID, backupId: UNKNOWN_ID },
    { kind: 'pg.backup.end', sessionId: UNKNOWN_ID, backupId: UNKNOWN_ID },
    { kind: 'pg.restore.begin', storage: storage('target') },
    { kind: 'pg.restore.cleanup', storage: storage('target') },
    step('pg.restore.prepare', UNKNOWN_ID),
    write(UNKNOWN_ID, entry('PG_VERSION', 'file')),
    step('pg.restore.open', UNKNOWN_ID),
    restoreQuery(UNKNOWN_ID, 'SELECT 1'),
    step('pg.restore.persist', UNKNOWN_ID),
    step('pg.restore.commit', UNKNOWN_ID),
    step('pg.restore.abort', UNKNOWN_ID)
  ];

  it.each(v2Requests.map(request => [request.kind, request] as const))(
    '%s → unsupported_operation，先于任何会话或 ID 查找',
    async (_kind, request) => {
      const host = startHost({ backup: undefined });

      expect(await failure(host, request)).toBe('unsupported_operation');
      expect(readdirSync(root)).toEqual([]);
    }
  );

  it('普通连接照旧可用，且不在数据目录旁留下锁文件', async () => {
    const host = startHost({ backup: undefined });
    seed('plain');
    await openSession(host, 'plain');

    expect(existsSync(pgliteLockPathOf(dir('plain')))).toBe(false);
    expect(host.openBackupCount).toBe(0);
    expect(host.openRestoreCount).toBe(0);
  });
});

describe('pg.engine', () => {
  it('用不落盘的探针回答引擎版本与扩展；扩展去重排序，答案只算一次', async () => {
    const host = startHost();

    const first = await ok(host, 'pg.engine', { kind: 'pg.engine' });
    const second = await ok(host, 'pg.engine', { kind: 'pg.engine' });

    expect(first.result.serverVersion).toMatch(/^\d+/);
    expect(first.result.extensions).toEqual(['a', 'b']);
    expect(second.result).toEqual(first.result);
    expect(probes).toBe(1);
    expect(runtimes).toHaveLength(0);
    expect(readdirSync(root)).toEqual([]);
  });

  it('探针起不来：报 open_failed，下一次重新尝试', async () => {
    let attempts = 0;
    const host = startHost({
      backup: {
        ...defaultBackup(),
        createProbeRuntime: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error('probe boom');
          return new PGlite();
        }
      }
    });

    expect(await failure(host, { kind: 'pg.engine' })).toBe('open_failed');
    expect((await ok(host, 'pg.engine', { kind: 'pg.engine' })).result.extensions).toEqual(['a', 'b']);
    expect(attempts).toBe(2);
  });

  it('探针答不出 server_version：报 host_internal_error，照样关掉探针，下一次重新尝试', async () => {
    let closes = 0;
    const host = startHost({
      backup: {
        ...defaultBackup(),
        createProbeRuntime: async () => ({
          query: async () => ({ rows: [], fields: [] }),
          close: async () => {
            closes += 1;
          }
        })
      }
    });

    expect(await failure(host, { kind: 'pg.engine' })).toBe('host_internal_error');
    expect(await failure(host, { kind: 'pg.engine' })).toBe('host_internal_error');
    expect(closes).toBe(2);
  });
});

describe('pg.backup.*', () => {
  it(
    '逐项读出一致快照：含 PG_VERSION、不含运行态文件，数据块不超过 64K 且各自独占 ArrayBuffer',
    async () => {
      const host = startHost();
      const { sessionId, items } = await snapshotOf(host, 'source', ['alpha', 'beta']);

      const entries = items.flatMap(item => (item.type === 'entry' ? [item.header] : []));
      expect(entries.some(header => header.path === 'PG_VERSION' && header.kind === 'file')).toBe(true);
      for (const header of entries) {
        expect(DESKTOP_PGLITE_EXCLUDED_FILES.has(header.path.split('/').at(-1) ?? '')).toBe(false);
      }
      let expected = 0;
      for (const item of items) {
        if (item.type === 'entry') {
          expect(expected).toBe(0);
          expected = item.header.size;
          continue;
        }
        expect(item.bytes.byteLength).toBeLessThanOrEqual(DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES);
        expect(item.bytes.buffer.byteLength).toBe(item.bytes.byteLength);
        expected -= item.bytes.byteLength;
      }
      expect(expected).toBe(0);
      expect(host.openBackupCount).toBe(0);
      expect(await materializedNames(items, join(root, 'copy'))).toEqual(['alpha', 'beta']);
      expect(await names(host, sessionId)).toEqual(['alpha', 'beta']);
    },
    HEAVY
  );

  it('快照期间占住连接：其他语句排队，新事务与第二次快照到期报 transaction_unavailable', async () => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');
    const backupId = await beginBackup(host, sessionId);
    expect(host.openBackupCount).toBe(1);
    expect(host.openTransactionCount).toBe(0);

    const queued = host.handle({ kind: 'pg.query', sessionId, sql: 'SELECT 1 AS one', params: [] }, OWNER);
    expect(await stillPending(queued)).toBe(true);
    expect(await failure(host, { kind: 'pg.begin', sessionId, timeout: 50 })).toBe('transaction_unavailable');
    expect(await failure(host, { kind: 'pg.backup.begin', sessionId, timeout: 50 })).toBe('transaction_unavailable');
    expect(host.openBackupCount).toBe(1);

    await nextItem(host, sessionId, backupId);
    await endBackup(host, sessionId, backupId);

    expect((await queued).kind).toBe('pg.query');
    expect(host.openBackupCount).toBe(0);
  });

  it(
    '只含快照边界前已提交的数据：开着的事务挡住快照，提交后才开始，回滚的写入不在其中（AC#16）',
    async () => {
      const host = startHost();
      seed('source');
      const sessionId = await openSession(host, 'source');
      await exec(host, sessionId, "CREATE TABLE t (name text); INSERT INTO t VALUES ('autocommit')");

      const rolledBack = (await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 1_000 })).result;
      await exec(host, sessionId, "INSERT INTO t VALUES ('rolled-back')", rolledBack.transactionId);
      expect(await failure(host, { kind: 'pg.backup.begin', sessionId, timeout: 50 })).toBe('transaction_unavailable');
      await ok(host, 'pg.rollback', { kind: 'pg.rollback', sessionId, transactionId: rolledBack.transactionId });

      const committed = (await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 1_000 })).result;
      await exec(host, sessionId, "INSERT INTO t VALUES ('committed')", committed.transactionId);
      const waiting = host.handle({ kind: 'pg.backup.begin', sessionId, timeout: 5_000 }, OWNER);
      expect(await stillPending(waiting)).toBe(true);
      await ok(host, 'pg.commit', { kind: 'pg.commit', sessionId, transactionId: committed.transactionId });

      const response = await waiting;
      if (response.kind !== 'pg.backup.begin') throw new Error(`unexpected ${response.kind}`);
      const items = await drainBackup(host, sessionId, response.result.backupId);
      await endBackup(host, sessionId, response.result.backupId);

      expect(await materializedNames(items, join(root, 'copy'))).toEqual(['autocommit', 'committed']);
    },
    HEAVY
  );

  it('快照 ID 未知、属于别的会话或别的窗口：分别报 transaction_not_found / permission_denied', async () => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');
    const otherSession = await openSession(host, 'source');
    const backupId = await beginBackup(host, sessionId);

    const cursor = (kind: 'pg.backup.next' | 'pg.backup.end', session: string, id: string): DesktopPgliteRequest => ({
      kind,
      sessionId: session,
      backupId: id
    });
    expect(await failure(host, cursor('pg.backup.next', sessionId, UNKNOWN_ID))).toBe('transaction_not_found');
    expect(await failure(host, cursor('pg.backup.next', otherSession, backupId))).toBe('transaction_not_found');
    expect(await failure(host, cursor('pg.backup.end', otherSession, backupId))).toBe('transaction_not_found');
    expect(await failure(host, cursor('pg.backup.next', sessionId, backupId), OTHER_OWNER)).toBe('permission_denied');
    expect(await failure(host, cursor('pg.backup.next', UNKNOWN_ID, backupId))).toBe('session_closed');
    expect(host.openBackupCount).toBe(1);

    await endBackup(host, sessionId, backupId);
    expect(await failure(host, cursor('pg.backup.next', sessionId, backupId))).toBe('transaction_not_found');
  });

  it('关闭会话时结束其快照并交还连接', async () => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');
    const backupId = await beginBackup(host, sessionId);
    await nextItem(host, sessionId, backupId);

    await ok(host, 'pg.close', { kind: 'pg.close', sessionId });

    expect(host.openBackupCount).toBe(0);
    expect(host.openSessionCount).toBe(0);
    expect(host.openInstanceCount).toBe(0);
    expect(await failure(host, { kind: 'pg.backup.next', sessionId, backupId })).toBe('session_closed');
    const reopened = await openSession(host, 'source');
    expect((await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId: reopened, timeout: 1_000 })).kind).toBe(
      'pg.begin'
    );
  });

  it.each(['releaseOwner', 'closeAll'] as const)('%s 结束窗口名下的快照、释放实例与锁', async teardown => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');
    const backupId = await beginBackup(host, sessionId);
    await nextItem(host, sessionId, backupId);

    if (teardown === 'releaseOwner') await host.releaseOwner(OWNER);
    else await host.closeAll();

    expect(host.openBackupCount).toBe(0);
    expect(host.openInstanceCount).toBe(0);
    const other = startHost();
    await openSession(other, 'source');
  });

  it('读取中途文件消失：报 file_not_found，快照自动结束，源库照常可用（AC#19）', async () => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');
    const backupId = await beginBackup(host, sessionId);
    const first = await nextItem(host, sessionId, backupId);
    expect(first).toMatchObject({ type: 'entry', header: { path: 'PG_VERSION' } });
    rmSync(join(dir('source'), 'postgresql.conf'));

    let response = await host.handle({ kind: 'pg.backup.next', sessionId, backupId }, OWNER);
    while (response.kind === 'pg.backup.next') {
      response = await host.handle({ kind: 'pg.backup.next', sessionId, backupId }, OWNER);
    }

    expect(response).toMatchObject({ kind: 'error', code: 'file_not_found' });
    expect(host.openBackupCount).toBe(0);
    expect(await failure(host, { kind: 'pg.backup.next', sessionId, backupId })).toBe('transaction_not_found');
    expect((await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 1_000 })).kind).toBe('pg.begin');
  });

  it('resolveDataDirectory 指错目录：报 host_internal_error 且不占着连接', async () => {
    const host = startHost({
      backup: { ...defaultBackup(), resolveDataDirectory: name => join(root, 'elsewhere', name) }
    });
    seed('source');
    const sessionId = await openSession(host, 'source');

    expect(await failure(host, { kind: 'pg.backup.begin', sessionId, timeout: 1_000 })).toBe('host_internal_error');
    expect(host.openBackupCount).toBe(0);
    expect((await ok(host, 'pg.begin', { kind: 'pg.begin', sessionId, timeout: 50 })).kind).toBe('pg.begin');
  });
});

describe('pg.restore.*', () => {
  it(
    '完整恢复：校验期间目标对外不可见，提交后可以正常连接读写（AC#5、#12、#18）',
    async () => {
      const host = startHost();
      const { sessionId: sourceSession, items } = await snapshotOf(host, 'source', ['alpha', 'beta']);
      await ok(host, 'pg.close', { kind: 'pg.close', sessionId: sourceSession });
      rmSync(dir('source'), { recursive: true, force: true });

      const restoreId = await beginRestore(host, 'target');
      expect(host.openRestoreCount).toBe(1);
      expect(await failure(host, { kind: 'pg.open', storage: storage('target') })).toBe('restore_in_progress');
      expect(await failure(host, { kind: 'pg.restore.begin', storage: storage('target') })).toBe('database_busy');
      expect(await failure(host, { kind: 'pg.restore.cleanup', storage: storage('target') })).toBe('database_busy');

      await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
      await writeAll(host, restoreId, items);
      await ok(host, 'pg.restore.open', step('pg.restore.open', restoreId));
      const verified = await ok(host, 'pg.restore.query', restoreQuery(restoreId, 'SELECT name FROM t ORDER BY name'));
      expect(verified.result.rows.map(row => row['name'])).toEqual(['alpha', 'beta']);
      expect(host.openSessionCount).toBe(0);
      expect(host.openInstanceCount).toBe(0);
      expect(await failure(host, { kind: 'pg.open', storage: storage('target') })).toBe('restore_in_progress');

      await ok(host, 'pg.restore.persist', step('pg.restore.persist', restoreId));
      await ok(host, 'pg.restore.commit', step('pg.restore.commit', restoreId));

      expect(host.openRestoreCount).toBe(0);
      expect(await cleanup(host, 'target')).toBe(false);
      const sessionId = await openSession(host, 'target');
      await ok(host, 'pg.query', { kind: 'pg.query', sessionId, sql: "INSERT INTO t VALUES ('gamma')", params: [] });
      expect(await names(host, sessionId)).toEqual(['alpha', 'beta', 'gamma']);
    },
    HEAVY
  );

  it('两次恢复并发：恰好一个取得目标，另一个报 database_busy（AC#12）', async () => {
    const host = startHost();

    const responses = await Promise.all([
      host.handle({ kind: 'pg.restore.begin', storage: storage('target') }, OWNER),
      host.handle({ kind: 'pg.restore.begin', storage: storage('target') }, OWNER)
    ]);

    expect(responses.map(response => response.kind).sort()).toEqual(['error', 'pg.restore.begin']);
    expect(responses.find(response => response.kind === 'error')).toMatchObject({ code: 'database_busy' });
    expect(host.openRestoreCount).toBe(1);
  });

  it('恢复与普通连接并发：恰好一方取得目标（AC#12）', async () => {
    const host = startHost();

    const [opened, restoring] = await Promise.all([
      host.handle({ kind: 'pg.open', storage: storage('target') }, OWNER),
      host.handle({ kind: 'pg.restore.begin', storage: storage('target') }, OWNER)
    ]);

    const winners = [opened.kind, restoring.kind].filter(kind => kind !== 'error');
    expect(winners).toHaveLength(1);
    const loser = [opened, restoring].find(response => response.kind === 'error');
    expect(['database_busy', 'restore_in_progress']).toContain((loser as { code: string }).code);
  });

  it('目标已有内容：报 target_not_empty，并交还独占权', async () => {
    const host = startHost();
    seed('target');

    expect(await failure(host, { kind: 'pg.restore.begin', storage: storage('target') })).toBe('target_not_empty');
    expect(await failure(host, { kind: 'pg.restore.begin', storage: storage('target') })).toBe('target_not_empty');
    expect(host.openRestoreCount).toBe(0);
  });

  it('目标正被本 host 或另一个 host 连接：报 database_busy，且不触碰目标（AC#12）', async () => {
    const host = startHost();
    const other = startHost();
    seed('shared');
    const sessionId = await openSession(host, 'shared');

    expect(await failure(host, { kind: 'pg.restore.begin', storage: storage('shared') })).toBe('database_busy');
    expect(await failure(other, { kind: 'pg.restore.begin', storage: storage('shared') })).toBe('database_busy');
    expect(await failure(other, { kind: 'pg.restore.cleanup', storage: storage('shared') })).toBe('database_busy');
    expect(await failure(other, { kind: 'pg.open', storage: storage('shared') })).toBe('database_busy');
    expect(runtimes).toHaveLength(1);

    await ok(host, 'pg.close', { kind: 'pg.close', sessionId });
    await openSession(other, 'shared');
  });

  it('另一个 host 正在恢复：本 host 连不上也清不掉该目标（AC#12）', async () => {
    const host = startHost();
    const other = startHost();
    const restoreId = await beginRestore(other, 'target');
    await ok(other, 'pg.restore.prepare', step('pg.restore.prepare', restoreId), OWNER);

    expect(await failure(host, { kind: 'pg.open', storage: storage('target') })).toBe('database_busy');
    expect(await failure(host, { kind: 'pg.restore.begin', storage: storage('target') })).toBe('database_busy');
    expect(await failure(host, { kind: 'pg.restore.cleanup', storage: storage('target') })).toBe('database_busy');
    expect(runtimes).toHaveLength(0);
  });

  it('步骤乱序：报 protocol_violation，恢复本身不受影响', async () => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');

    for (const request of [
      write(restoreId, entry('base', 'directory')),
      step('pg.restore.open', restoreId),
      step('pg.restore.persist', restoreId),
      step('pg.restore.commit', restoreId),
      restoreQuery(restoreId, 'SELECT 1')
    ]) {
      expect(await failure(host, request)).toBe('protocol_violation');
    }
    expect(existsSync(dir('target'))).toBe(false);

    await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
    for (const request of [
      step('pg.restore.prepare', restoreId),
      restoreQuery(restoreId, 'SELECT 1'),
      step('pg.restore.persist', restoreId),
      step('pg.restore.commit', restoreId)
    ]) {
      expect(await failure(host, request)).toBe('protocol_violation');
    }
    await ok(host, 'pg.restore.write', write(restoreId, entry('base', 'directory')));
  });

  it(
    '私有实例打开之后：再写入或未落盘就提交都是乱序；中止时关闭实例并删掉目录',
    async () => {
      const host = startHost();
      const restoreId = await beginRestore(host, 'target');
      await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
      await writeAll(host, restoreId, templateItems);
      await ok(host, 'pg.restore.open', step('pg.restore.open', restoreId));
      expect(runtimes).toHaveLength(1);

      expect(await failure(host, write(restoreId, entry('extra', 'directory')))).toBe('protocol_violation');
      expect(await failure(host, step('pg.restore.commit', restoreId))).toBe('protocol_violation');
      expect(await failure(host, step('pg.restore.open', restoreId))).toBe('protocol_violation');
      expect(await failure(host, restoreQuery(restoreId, 'SELECT * FROM missing_table'))).toBe('statement_failed');
      const one = await ok(host, 'pg.restore.query', restoreQuery(restoreId, 'SELECT 1 AS one'));
      expect(one.result.rows).toEqual([{ one: 1 }]);

      await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));

      expect(runtimes[0]?.closed).toBe(true);
      expect(existsSync(dir('target'))).toBe(false);
      expect(host.openRestoreCount).toBe(0);
      expect(await cleanup(host, 'target')).toBe(false);
    },
    HEAVY
  );

  const corrupting: [string, DesktopPgliteDataDirItem[], 'write' | 'open'][] = [
    ['数据块超出条目声明的大小', [entry('PG_VERSION', 'file', 4), data(8)], 'write'],
    ['上一个文件的数据还没写完就来了新条目', [entry('PG_VERSION', 'file', 4), entry('base', 'directory')], 'write'],
    ['没有文件条目的数据块', [data(4)], 'write'],
    ['重复的目录条目', [entry('base', 'directory'), entry('base', 'directory')], 'write'],
    ['重复的文件条目', [entry('PG_VERSION', 'file'), entry('PG_VERSION', 'file')], 'write'],
    ['父目录不在归档里', [entry('base/1/1234', 'file')], 'write'],
    ['文件在父路径上占了目录的位置', [entry('base', 'file'), entry('base/1', 'directory')], 'write'],
    ['最后一个文件的数据没写完', [entry('PG_VERSION', 'file', 4), data(2)], 'open'],
    ['没有 PG_VERSION', [entry('base', 'directory')], 'open']
  ];

  it.each(corrupting)('%s：报 database_corrupted，之后只接受 abort', async (_name, items, failingStep) => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');
    await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));

    const leading = failingStep === 'write' ? items.slice(0, -1) : items;
    await writeAll(host, restoreId, leading);
    const failing = failingStep === 'write' ? write(restoreId, items.at(-1)!) : step('pg.restore.open', restoreId);
    expect(await failure(host, failing)).toBe('database_corrupted');
    expect(runtimes).toHaveLength(0);

    expect(await failure(host, write(restoreId, entry('other', 'directory')))).toBe('protocol_violation');
    expect(await failure(host, step('pg.restore.open', restoreId))).toBe('protocol_violation');
    await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));

    expect(existsSync(dir('target'))).toBe(false);
    expect(host.openRestoreCount).toBe(0);
    await ok(host, 'pg.restore.abort', step('pg.restore.abort', await beginRestore(host, 'target')));
  });

  it('协议层拒绝的条目（越界路径、运行态文件、超大数据块）报 protocol_violation，不影响恢复', async () => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');
    await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
    await ok(host, 'pg.restore.write', write(restoreId, entry('PG_VERSION', 'file', 2)));

    for (const item of [
      entry('../escape', 'directory'),
      entry('postmaster.pid', 'file'),
      { type: 'data', bytes: new Uint8Array(DESKTOP_PGLITE_MAX_DATA_CHUNK_BYTES + 1) } as const
    ]) {
      expect(await failure(host, write(restoreId, item))).toBe('protocol_violation');
    }

    await ok(host, 'pg.restore.write', write(restoreId, data(2)));
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    '写入撞上权限之类的环境故障：如实报出而不归为归档损坏，之后只接受 abort',
    async () => {
      const host = startHost();
      const restoreId = await beginRestore(host, 'target');
      await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
      chmodSync(dir('target'), 0o500);

      try {
        expect(await failure(host, write(restoreId, entry('PG_VERSION', 'file', 3)))).toBe('permission_denied');
        expect(await failure(host, write(restoreId, entry('base', 'directory')))).toBe('protocol_violation');
      } finally {
        chmodSync(dir('target'), 0o700);
      }
      await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));

      expect(existsSync(dir('target'))).toBe(false);
      expect(await cleanup(host, 'target')).toBe(false);
    }
  );

  it('排在 abort 后面的请求：报 transaction_not_found，不会落到已经删掉的目标上', async () => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');
    await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));

    const [aborted, written] = await Promise.all([
      host.handle(step('pg.restore.abort', restoreId), OWNER),
      host.handle(write(restoreId, entry('base', 'directory')), OWNER)
    ]);

    expect(aborted.kind).toBe('pg.restore.abort');
    expect(written).toMatchObject({ kind: 'error', code: 'transaction_not_found' });
    expect(existsSync(dir('target'))).toBe(false);
  });

  it('恢复 ID 未知或属于别的窗口：报 transaction_not_found / permission_denied', async () => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');

    expect(await failure(host, step('pg.restore.prepare', UNKNOWN_ID))).toBe('transaction_not_found');
    expect(await failure(host, step('pg.restore.prepare', restoreId), OTHER_OWNER)).toBe('permission_denied');
    expect(await failure(host, step('pg.restore.abort', restoreId), OTHER_OWNER)).toBe('permission_denied');

    await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));
    expect(await failure(host, step('pg.restore.abort', restoreId))).toBe('transaction_not_found');
  });

  it('取得独占后、写入前中止：目标原样不动，可以立即重新恢复', async () => {
    const host = startHost();
    mkdirSync(dir('target'));
    const restoreId = await beginRestore(host, 'target');

    await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));

    expect(readdirSync(dir('target'))).toEqual([]);
    expect(await cleanup(host, 'target')).toBe(false);
    await beginRestore(host, 'target');
  });

  it('写入途中中止：删掉写了一半的目录并清除标记', async () => {
    const host = startHost();
    const restoreId = await beginRestore(host, 'target');
    await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
    await writeAll(host, restoreId, templateItems.slice(0, 20));

    await ok(host, 'pg.restore.abort', step('pg.restore.abort', restoreId));

    expect(existsSync(dir('target'))).toBe(false);
    expect(await cleanup(host, 'target')).toBe(false);
    await beginRestore(host, 'target');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    '中止时删不掉写了一半的目录：报 cleanup_pending，标记保留到清理成功为止（AC#19）',
    async () => {
      const host = startHost();
      const restoreId = await beginRestore(host, 'target');
      await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
      await writeAll(host, restoreId, [entry('base', 'directory'), entry('base/1', 'directory')]);
      chmodSync(join(dir('target'), 'base'), 0o500);

      try {
        expect(await failure(host, step('pg.restore.abort', restoreId))).toBe('cleanup_pending');
        expect(host.openRestoreCount).toBe(0);
        expect(await failure(host, { kind: 'pg.open', storage: storage('target') })).toBe('restore_incomplete');
      } finally {
        chmodSync(join(dir('target'), 'base'), 0o700);
      }

      expect(await cleanup(host, 'target')).toBe(true);
      expect(existsSync(dir('target'))).toBe(false);
    }
  );

  it.each(['releaseOwner', 'closeAll'] as const)(
    '%s 打断恢复：标记留在磁盘上，新的 host 据此拒绝连接直到清理（AC#11）',
    async teardown => {
      const host = startHost();
      const restoreId = await beginRestore(host, 'target');
      await ok(host, 'pg.restore.prepare', step('pg.restore.prepare', restoreId));
      await writeAll(host, restoreId, templateItems.slice(0, 20));

      if (teardown === 'releaseOwner') await host.releaseOwner(OWNER);
      else await host.closeAll();

      expect(host.openRestoreCount).toBe(0);
      expect(existsSync(pgliteLockPathOf(dir('target')))).toBe(true);
      const restarted = startHost();
      expect(await failure(restarted, { kind: 'pg.open', storage: storage('target') })).toBe('restore_incomplete');
      expect(await failure(restarted, { kind: 'pg.restore.begin', storage: storage('target') })).toBe(
        'restore_incomplete'
      );
      expect(runtimes).toHaveLength(0);

      expect(await cleanup(restarted, 'target')).toBe(true);
      expect(existsSync(dir('target'))).toBe(false);
      expect(await cleanup(restarted, 'target')).toBe(false);
      await beginRestore(restarted, 'target');
    }
  );
});

describe('实例生命周期', () => {
  it('同一数据目录上的多个会话共享一个运行时与一把锁', async () => {
    const host = startHost();
    seed('source');

    await openSession(host, 'source');
    await openSession(host, 'source');

    expect(runtimes).toHaveLength(1);
    expect(host.openInstanceCount).toBe(1);
  });

  it('关掉最后一个会话的同时重新打开：两者都成功，不撞上正在释放的锁', async () => {
    const host = startHost();
    seed('source');
    const sessionId = await openSession(host, 'source');

    const [closed, opened] = await Promise.all([
      host.handle({ kind: 'pg.close', sessionId }, OWNER),
      host.handle({ kind: 'pg.open', storage: storage('source') }, OWNER)
    ]);

    expect(closed.kind).toBe('pg.close');
    if (opened.kind !== 'pg.open') throw new Error(`unexpected ${JSON.stringify(opened)}`);
    expect(host.openInstanceCount).toBe(1);
    const one = await ok(host, 'pg.query', {
      kind: 'pg.query',
      sessionId: opened.result.sessionId,
      sql: 'SELECT 1 AS one',
      params: []
    });
    expect(one.result.rows).toEqual([{ one: 1 }]);
  });

  it.each(['pg.open', 'pg.restore.begin'] as const)(
    '最后一个会话的运行时还没关完就来了 %s：等它关完、交还锁再继续，同一目录上从不同时活着两个运行时',
    async kind => {
      const gate = gatedFirstClose();
      const host = startHost({ createRuntime: gate.createRuntime });
      seed('source');
      const sessionId = await openSession(host, 'source');

      const closed = host.handle({ kind: 'pg.close', sessionId }, OWNER);
      await gate.started;
      const waiting = host.handle({ kind, storage: storage('source') }, OWNER);
      try {
        expect(await stillPending(waiting)).toBe(true);
      } finally {
        gate.release();
      }

      expect((await closed).kind).toBe('pg.close');
      const response = await waiting;
      if (kind === 'pg.open') expect(response.kind).toBe('pg.open');
      // 恢复等到了锁：被拒绝的理由是目标里已有数据，而不是撞上本 host 正在释放的旧锁。
      else expect(response).toMatchObject({ kind: 'error', code: 'target_not_empty' });
      expect(gate.peak()).toBe(1);
    }
  );

  it('订阅失败：报 open_failed，关掉刚起来的运行时并释放锁', async () => {
    let closes = 0;
    let attempts = 0;
    const host = startHost({
      createRuntime: async name => {
        attempts += 1;
        if (attempts > 1) return createRuntime(name);
        const runtime = await createRuntime(name);
        return {
          query: (sql, params) => runtime.query(sql, params),
          exec: sql => runtime.exec(sql),
          transaction: callback => runtime.transaction(callback),
          listen: () => Promise.reject(new Error('listen boom')),
          close: async () => {
            closes += 1;
            await runtime.close();
          }
        };
      }
    });
    seed('source');

    expect(await failure(host, { kind: 'pg.open', storage: storage('source') })).toBe('open_failed');
    expect(closes).toBe(1);
    expect(host.openInstanceCount).toBe(0);

    await openSession(host, 'source');
    expect(attempts).toBe(2);
  });

  it('运行时起不来：报 open_failed 并释放锁，修好后可以重试', async () => {
    let attempts = 0;
    const host = startHost({
      createRuntime: async name => {
        attempts += 1;
        if (attempts === 1) throw new Error('runtime boom');
        return createRuntime(name);
      }
    });
    seed('source');

    expect(await failure(host, { kind: 'pg.open', storage: storage('source') })).toBe('open_failed');
    expect(host.openInstanceCount).toBe(0);

    await openSession(host, 'source');
    expect(attempts).toBe(2);
  });
});
