/**
 * renderer 侧桌面 PGlite 客户端的快照读取与恢复冲突（US-217 阶段 C：AC#11、#12、#19、#21）。
 *
 * @remarks
 * host 是生产同款、跑在磁盘上的真实 PGlite；传输层与 `desktop-pglite-client.spec.ts` 一样两个方向都
 * 结构化克隆。数据目录从一次 initdb 得到的模板复制，省掉每个用例一次 initdb。
 */

import { RxDBBackupError } from '@aiao/rxdb';
import type { PGliteDataDirItem } from '@aiao/rxdb-adapter-pglite';
import {
  DESKTOP_PGLITE_EXCLUDED_FILES,
  RxDBAdapterDesktopError,
  type DesktopHostTransport,
  type DesktopPgliteResponse
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createElectronPgliteHost,
  type ElectronPgliteHost,
  type ElectronPgliteHostOptions,
  type ElectronPgliteRuntime
} from '../pglite-host.js';
import { acquirePgliteDirectoryLock } from '../pglite-host/pglite-host-lock.js';
import { DesktopPGliteClient } from '../pglite/desktop-pglite-client.js';

const OWNER = 5;
const OTHER_OWNER = 6;
const NAME = 'todo-pgdata';

/** 传输层上的一条请求：SQLite、文件与 PGlite 三族共用同一条通道。 */
type HostRequest = Parameters<DesktopHostTransport['request']>[0];

let templateRoot: string;
let template: string;

beforeAll(async () => {
  templateRoot = mkdtempSync(join(tmpdir(), 'rxdb-desktop-pg-client-template-'));
  template = join(templateRoot, 'template');
  const pg = new PGlite(template);
  await pg.waitReady;
  await pg.close();
}, 60_000);

afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});

let root: string;
let host: ElectronPgliteHost;
let runtimes: PGlite[];
let requests: HostRequest['kind'][];
/** 返回非 `undefined` 时替 host 作答，用来注入 host 侧故障。 */
let intercept: (payload: HostRequest) => DesktopPgliteResponse | undefined;
let transport: DesktopHostTransport;
let clients: DesktopPGliteClient[];

const startHost = (overrides: Partial<ElectronPgliteHostOptions> = {}): ElectronPgliteHost =>
  createElectronPgliteHost({
    createRuntime: async (name): Promise<ElectronPgliteRuntime> => {
      const runtime = new PGlite(join(root, name));
      runtimes.push(runtime);
      await runtime.waitReady;
      return runtime;
    },
    postNotify: () => undefined,
    backup: {
      resolveDataDirectory: name => join(root, name),
      createProbeRuntime: async () => new PGlite(),
      extensions: []
    },
    ...overrides
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rxdb-desktop-pg-client-backup-'));
  runtimes = [];
  requests = [];
  intercept = () => undefined;
  clients = [];
  host = startHost();
  transport = {
    request: async payload => {
      requests.push(payload.kind);
      const forced = intercept(payload);
      if (forced) return forced;
      return structuredClone(await host.handle(structuredClone(payload), OWNER));
    },
    subscribe: () => () => undefined
  };
});

afterEach(async () => {
  for (const client of clients.splice(0)) await client.forceClose().catch(() => undefined);
  await host.closeAll();
  for (const runtime of runtimes) await runtime.close().catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
});

const seed = (name = NAME): void => {
  cpSync(template, join(root, name), { recursive: true });
};

const openClient = async (name = NAME): Promise<DesktopPGliteClient> => {
  seed(name);
  const client = new DesktopPGliteClient({ transport, dataDirectoryName: name });
  clients.push(client);
  await client.init('todo', {});
  return client;
};

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
};

const collect = async (items: AsyncIterable<PGliteDataDirItem>): Promise<PGliteDataDirItem[]> => {
  const collected: PGliteDataDirItem[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

/** 每个文件条目之后的数据块字节数之和，按路径汇总。 */
const writtenSizes = (items: readonly PGliteDataDirItem[]): Map<string, number> => {
  const sizes = new Map<string, number>();
  let current: string | undefined;
  for (const item of items) {
    if (item.type === 'entry') {
      current = item.header.kind === 'file' ? item.header.path : undefined;
      if (current !== undefined) sizes.set(current, 0);
      continue;
    }
    expect(current).toBeDefined();
    sizes.set(current ?? '', (sizes.get(current ?? '') ?? 0) + item.bytes.byteLength);
  }
  return sizes;
};

const endFails: (payload: HostRequest) => DesktopPgliteResponse | undefined = payload =>
  payload.kind === 'pg.backup.end' ?
    { kind: 'error', code: 'host_internal_error', message: 'failed to release the snapshot' }
  : undefined;

describe('DesktopPGliteClient.snapshotDataDir', () => {
  it('streams the host data directory and hands back the callback result', async () => {
    const client = await openClient();
    await client.exec('CREATE TABLE t (name text); INSERT INTO t VALUES ($$a$$), ($$b$$);');

    const { items, result } = await client.snapshotDataDir(async stream => ({
      items: await collect(stream),
      result: 'written'
    }));

    expect(result).toBe('written');
    const entries = items.flatMap(item => (item.type === 'entry' ? [item.header] : []));
    expect(entries).toContainEqual({ path: 'PG_VERSION', kind: 'file', size: expect.any(Number) });
    expect(entries).toContainEqual({ path: 'base', kind: 'directory', size: 0 });
    for (const header of entries) {
      expect(DESKTOP_PGLITE_EXCLUDED_FILES.has(header.path.slice(header.path.lastIndexOf('/') + 1))).toBe(false);
    }
    const sizes = writtenSizes(items);
    for (const header of entries.filter(entry => entry.kind === 'file')) {
      expect(sizes.get(header.path)).toBe(header.size);
    }
    expect(requests.filter(kind => kind === 'pg.backup.end')).toHaveLength(1);
    expect(host.openBackupCount).toBe(0);
    // AC#19：快照结束后源库照常可读写。
    await client.exec('INSERT INTO t VALUES ($$c$$);');
    await expect(client.query<{ n: number }>('SELECT count(*)::int AS n FROM t')).resolves.toMatchObject({
      rows: [{ n: 3 }]
    });
  });

  // AC#19：消费方提前结束（取消、写满）时 host 那一侧的快照也必须结束，否则源库一直被扣着。
  it('ends the host backup when the consumer stops early', async () => {
    const client = await openClient();

    const first = await client.snapshotDataDir(async stream => {
      for await (const item of stream) return item;
      return undefined;
    });

    expect(first?.type).toBe('entry');
    expect(requests.filter(kind => kind === 'pg.backup.end')).toHaveLength(1);
    expect(host.openBackupCount).toBe(0);
    await expect(client.query<{ one: number }>('SELECT 1 AS one')).resolves.toMatchObject({ rows: [{ one: 1 }] });
  });

  it('rethrows the consumer failure after ending the host backup', async () => {
    const client = await openClient();
    const boom = new Error('sink failed');

    // 迭代器既不读完也不 return()：结束快照不能指望消费方配合。
    const snapshot = client.snapshotDataDir(async stream => {
      await stream[Symbol.asyncIterator]().next();
      throw boom;
    });

    await expect(snapshot).rejects.toBe(boom);
    expect(host.openBackupCount).toBe(0);
  });

  it('keeps the consumer failure when ending the host backup fails too', async () => {
    const client = await openClient();
    const boom = new Error('sink failed');
    intercept = endFails;

    await expect(
      client.snapshotDataDir(async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });

  // AC#19「清理失败可判别」：读完了却没能结束快照，调用方不能拿到一个看似成功的结果。
  it('reports a failure to end the host backup after a complete read', async () => {
    const client = await openClient();
    intercept = endFails;

    const error = await client.snapshotDataDir(collect).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
    expect(error).toMatchObject({ code: 'host_internal_error' });
  });

  // 快照期间同一客户端的其他语句要等快照结束再发：否则它们在 host 上排在快照的独占后面，
  // 而快照又在等 renderer 取下一块——两边互等。
  it('holds back other statements of the same client until the snapshot ends', async () => {
    const client = await openClient();
    const entered = deferred();
    const gate = deferred();

    const snapshot = client.snapshotDataDir(async stream => {
      await stream[Symbol.asyncIterator]().next();
      entered.resolve();
      await gate.promise;
      return 'snapshot';
    });
    await entered.promise;
    const query = client.query<{ one: number }>('SELECT 1 AS one');
    await delay(50);
    expect(requests).not.toContain('pg.query');

    gate.resolve();
    await expect(snapshot).resolves.toBe('snapshot');
    await expect(query).resolves.toMatchObject({ rows: [{ one: 1 }] });
    expect(requests.indexOf('pg.query')).toBeGreaterThan(requests.indexOf('pg.backup.end'));
  });

  it('asks the host for exactly one item at a time', async () => {
    seed();
    let inFlight = 0;
    let peak = 0;
    const base = transport;
    const paced = new DesktopPGliteClient({
      transport: {
        ...base,
        request: async payload => {
          if (payload.kind !== 'pg.backup.next') return base.request(payload);
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          try {
            return await base.request(payload);
          } finally {
            inFlight -= 1;
          }
        }
      },
      dataDirectoryName: NAME
    });
    clients.push(paced);
    await paced.init('todo', {});

    await paced.snapshotDataDir(async stream => {
      for await (const item of stream) {
        if (item.type === 'data') await delay(0);
      }
    });

    // AC#21 背压：renderer 不取下一项，host 就不读下一块。
    expect(peak).toBe(1);
  });

  it('does not ask for the next item before the consumer takes it', async () => {
    const client = await openClient();
    const asked = (): number => requests.filter(kind => kind === 'pg.backup.next').length;

    await client.snapshotDataDir(async items => {
      const iterator = items[Symbol.asyncIterator]();
      await iterator.next();
      await delay(20);
      // 消费方攥着第一项不放：连预取一项也不行，host 不该去读第二项。
      expect(asked()).toBe(1);
      await iterator.next();
      await delay(20);
      expect(asked()).toBe(2);
      await iterator.return?.();
    });
  });

  it('refuses when the host was created without backup support', async () => {
    await host.closeAll();
    host = startHost({ backup: undefined });
    const client = await openClient();
    let called = false;

    const error = await client
      .snapshotDataDir(async () => {
        called = true;
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'unsupported_operation' });
    expect(called).toBe(false);
  });

  it('refuses on a closed session', async () => {
    const client = await openClient();
    await client.disconnect();

    await expect(client.snapshotDataDir(collect)).rejects.toMatchObject({ code: 'session_closed' });
    expect(requests).not.toContain('pg.backup.begin');
  });
});

// AC#11、#12：普通连接撞上恢复，报的是备份契约里的码，调用方据此知道该清理还是该等。
describe('DesktopPGliteClient.init against a restore target', () => {
  it('reports a leftover restore marker as restore_incomplete', async () => {
    seed();
    const lock = acquirePgliteDirectoryLock(join(root, NAME));
    lock.markRestoring();
    lock.release();
    const client = new DesktopPGliteClient({ transport, dataDirectoryName: NAME });

    const error = await client.init('todo', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBBackupError);
    expect(error).toMatchObject({
      code: 'restore_incomplete',
      details: { field: 'dataDirectoryName', actual: NAME }
    });
    expect((error as RxDBBackupError).message).toContain('cleanupIncompleteElectronPGliteRestore');
    expect((error as RxDBBackupError).cause).toBeInstanceOf(RxDBAdapterDesktopError);
    expect(host.openSessionCount).toBe(0);
  });

  it('reports a restore in progress as restore_in_progress', async () => {
    const begun = await host.handle(
      { kind: 'pg.restore.begin', storage: { engine: 'pglite', dataDirectoryName: NAME } },
      OTHER_OWNER
    );
    expect(begun.kind).toBe('pg.restore.begin');
    const client = new DesktopPGliteClient({ transport, dataDirectoryName: NAME });

    const error = await client.init('todo', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBBackupError);
    expect(error).toMatchObject({
      code: 'restore_in_progress',
      details: { field: 'dataDirectoryName', actual: NAME }
    });
    expect(host.openSessionCount).toBe(0);
  });

  it('leaves other open failures as desktop errors', async () => {
    await host.closeAll();
    host = startHost({
      createRuntime: async () => {
        throw new Error('disk on fire');
      }
    });
    const client = new DesktopPGliteClient({ transport, dataDirectoryName: NAME });

    const error = await client.init('todo', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
    expect(error).toMatchObject({ code: 'open_failed' });
  });
});
