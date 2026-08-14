import {
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_WRITER_LEASE_TTL_MS,
  RXDB_WRITER_PROTOCOL_VERSION,
  RxDB
} from '@aiao/rxdb';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';

const writerProcessSource = String.raw`
  import { DatabaseSync } from 'node:sqlite';

  const databasePath = process.env.RXDB_TEST_DATABASE_PATH;
  const databaseId = process.env.RXDB_TEST_DATABASE_ID;
  const writerId = process.env.RXDB_TEST_WRITER_ID;
  if (!databasePath || !databaseId || !writerId) throw new Error('Missing writer process configuration.');

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 2000;');
  const guard = database
    .prepare('SELECT "epoch", "state", "minProtocol" FROM "rxdb$rxdb_upgrade_guard" WHERE "databaseId" = ?')
    .get(databaseId);
  if (!guard || guard.state !== 'open' || guard.minProtocol !== 1) throw new Error('Writer guard is not open.');
  const writerEpoch = guard.epoch;

  const renew = () => {
    database.exec('BEGIN IMMEDIATE;');
    try {
      const current = database
        .prepare('SELECT "epoch", "state", "minProtocol" FROM "rxdb$rxdb_upgrade_guard" WHERE "databaseId" = ?')
        .get(databaseId);
      if (!current || current.state !== 'open' || current.epoch !== writerEpoch || current.minProtocol > 1) {
        database.exec('ROLLBACK;');
        process.send?.({ type: 'fenced', epoch: current?.epoch, state: current?.state });
        return;
      }
      database.prepare(
        'INSERT INTO "rxdb$rxdb_writer_lease" ' +
          '("databaseId", "writerId", "protocolVersion", "epoch", "lastSeenAt", "expiresAt") ' +
          "VALUES (?, ?, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), " +
          "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')) " +
          'ON CONFLICT ("databaseId", "writerId") DO UPDATE SET ' +
          '"protocolVersion" = excluded."protocolVersion", "epoch" = excluded."epoch", ' +
          '"lastSeenAt" = excluded."lastSeenAt", "expiresAt" = excluded."expiresAt"'
      ).run(databaseId, writerId, writerEpoch);
      database.exec('COMMIT;');
      process.send?.({ type: 'renewed', epoch: writerEpoch });
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK;');
      process.send?.({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  process.on('message', message => {
    if (message === 'resume') renew();
    if (message === 'close') {
      database.close();
      process.exit(0);
    }
  });

  renew();
`;

interface WriterMessage {
  type: 'renewed' | 'fenced' | 'error';
  epoch?: number;
  state?: string;
  message?: string;
}

const isWriterMessage = (value: unknown): value is WriterMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type = Reflect.get(value, 'type');
  return type === 'renewed' || type === 'fenced' || type === 'error';
};

const waitForWriterMessage = (
  child: ChildProcess,
  expectedType: WriterMessage['type'],
  stderr: string[]
): Promise<WriterMessage> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for writer ${expectedType}: ${stderr.join('')}`));
    }, 5000);
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const onMessage = (message: unknown): void => {
      if (!isWriterMessage(message)) return;
      if (message.type === 'error') {
        cleanup();
        reject(new Error(message.message));
        return;
      }
      if (message.type !== expectedType) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup();
      reject(new Error(`Writer exited before ${expectedType}: code=${String(code)} signal=${String(signal)}`));
    };
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });

const waitForExit = (child: ChildProcess): Promise<void> =>
  child.exitCode !== null || child.signalCode !== null ?
    Promise.resolve()
  : new Promise((resolve, reject) => {
      child.once('exit', () => resolve());
      child.once('error', reject);
    });

const startWriter = async (databasePath: string, databaseId: string, writerId: string): Promise<ChildProcess> => {
  const stderr: string[] = [];
  const child = spawn(process.execPath, ['--input-type=module', '--eval', writerProcessSource], {
    env: {
      ...process.env,
      RXDB_TEST_DATABASE_PATH: databasePath,
      RXDB_TEST_DATABASE_ID: databaseId,
      RXDB_TEST_WRITER_ID: writerId
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  child.stderr?.on('data', chunk => stderr.push(String(chunk)));
  await waitForWriterMessage(child, 'renewed', stderr);
  return child;
};

const closeWriter = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (child.connected) child.send('close');
  await waitForExit(child);
};

const normalizeBinding = (value: SQLiteCompatibleType): SQLInputValue =>
  Array.isArray(value) ? Uint8Array.from(value) : value;

class NodeSqliteClient implements SqliteClientLike {
  readonly #database: DatabaseSync;
  readonly addEventListener = vi.fn();

  constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec('PRAGMA busy_timeout = 2000;');
  }

  execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    try {
      if (bindings === undefined && (sql.match(/;/g)?.length ?? 0) > 1) {
        this.#database.exec(sql);
        return Promise.resolve({ sql, rowsAffected: 0, elapsed: 0, results: [] });
      }
      const statement = this.#database.prepare(sql);
      const columns = statement.columns().map(column => column.name);
      const params = bindings?.map(normalizeBinding) ?? [];
      if (columns.length > 0) {
        statement.setReturnArrays(true);
        const rows = statement.all(...params) as unknown as SQLiteCompatibleType[][];
        return Promise.resolve({ sql, rowsAffected: 0, elapsed: 0, results: [{ columns, rows }] });
      }
      const result = statement.run(...params);
      return Promise.resolve({ sql, rowsAffected: Number(result.changes), elapsed: 0, results: [] });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  disconnect(): Promise<void> {
    this.#database.close();
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve('node:sqlite');
  }

  beginSystemMigrationTransactionSql(): string {
    return 'BEGIN EXCLUSIVE;';
  }
}

class MultiprocessMigrationAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'multiprocess-migration-test';

  constructor(
    rxdb: RxDB,
    private readonly client: SqliteClientLike
  ) {
    super(rxdb);
  }

  protected createClient(): Promise<SqliteClientLike> {
    return Promise.resolve(this.client);
  }
}

const createRxdb = (databaseId: string): RxDB =>
  ({
    config: { dbName: databaseId, entities: [] },
    context: {},
    connect: vi.fn(async () => undefined),
    dispatchEvent: vi.fn(),
    schemaManager: { getEntityMetadata: vi.fn(), getEntityTypeByTableName: vi.fn() },
    versionManager: { getCurrentBranch: vi.fn(async () => ({ id: 'main' })) }
  }) as unknown as RxDB;

const initializeLegacyDatabase = (databasePath: string, databaseId: string): void => {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE "rxdb$rxdb_migration" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL UNIQUE,
      "executedAt" TEXT NOT NULL
    );
    CREATE TABLE "rxdb$rxdb_upgrade_guard" (
      "databaseId" TEXT PRIMARY KEY NOT NULL,
      "epoch" INTEGER NOT NULL,
      "state" TEXT NOT NULL,
      "ownerId" TEXT,
      "ownerExpiresAt" TEXT,
      "minProtocol" INTEGER NOT NULL
    );
    CREATE TABLE "rxdb$rxdb_writer_lease" (
      "databaseId" TEXT NOT NULL,
      "writerId" TEXT NOT NULL,
      "protocolVersion" INTEGER NOT NULL,
      "epoch" INTEGER NOT NULL,
      "lastSeenAt" TEXT NOT NULL,
      "expiresAt" TEXT NOT NULL,
      PRIMARY KEY ("databaseId", "writerId")
    );
  `);
  database
    .prepare(
      `INSERT INTO "rxdb$rxdb_upgrade_guard"
       ("databaseId", "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol")
       VALUES (?, 1, 'open', NULL, NULL, ?)`
    )
    .run(databaseId, RXDB_WRITER_PROTOCOL_VERSION);
  database.close();
};

const temporaryDirectories = new Set<string>();
const adapters = new Set<MultiprocessMigrationAdapter>();
const writers = new Set<ChildProcess>();

afterEach(async () => {
  const activeWriters = Array.from(writers);
  writers.clear();
  await Promise.all(
    activeWriters.map(async child => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await waitForExit(child);
    })
  );
  const activeAdapters = Array.from(adapters);
  adapters.clear();
  // 逐个断开，不能 Promise.all：node:sqlite 是同步 API，两个连接在同一个事件循环上
  // 交错释放 lease 时，先拿到写锁的一方在 await 处让出，另一方的 BEGIN 会同步阻塞
  // 整个循环直到 busy_timeout 耗尽 —— 持锁方根本排不上 COMMIT，锁等待必然超时。
  // 真正的跨 realm 并发由子进程 writer 覆盖（独立事件循环，能真正并行）。
  for (const adapter of activeAdapters) await adapter.disconnect();
  const directories = Array.from(temporaryDirectories);
  temporaryDirectories.clear();
  await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })));
});

describe('SQLite multiprocess migration fencing', () => {
  it('drains crashed writers and fences a stale process after the database-time lease expires', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiao-sqlite-multiprocess-'));
    temporaryDirectories.add(directory);
    const databasePath = join(directory, 'migration.sqlite');
    const databaseId = 'multiprocess-migration';
    initializeLegacyDatabase(databasePath, databaseId);

    const client = new NodeSqliteClient(databasePath);
    const adapter = new MultiprocessMigrationAdapter(createRxdb(databaseId), client);
    adapters.add(adapter);
    await adapter.connect();

    const crashedWriter = await startWriter(databasePath, databaseId, 'crashed-writer');
    const staleWriter = await startWriter(databasePath, databaseId, 'stale-writer');
    writers.add(crashedWriter);
    writers.add(staleWriter);

    await expect(adapter.migrateSystemSchema()).rejects.toThrow(/active writer lease/i);

    crashedWriter.kill('SIGKILL');
    await waitForExit(crashedWriter);
    writers.delete(crashedWriter);
    await new Promise(resolve => setTimeout(resolve, 1200));

    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    const guard = await adapter.internalQuery(
      `SELECT "epoch", "state", "ownerId" FROM "rxdb$rxdb_upgrade_guard" WHERE "databaseId" = ?`,
      [databaseId]
    );
    expect(guard.results[0]?.rows).toEqual([[2, 'open', null]]);
    const watermarks = await adapter.internalQuery(`SELECT "name" FROM "rxdb$rxdb_migration" ORDER BY "name"`);
    expect(watermarks.results[0]?.rows).toEqual(
      [[RXDB_CHANGE_CODEC_WATERMARK], [RXDB_SYSTEM_SCHEMA_WATERMARK]].sort(([left], [right]) =>
        String(left).localeCompare(String(right))
      )
    );

    const stderr: string[] = [];
    staleWriter.stderr?.on('data', chunk => stderr.push(String(chunk)));
    const fenced = waitForWriterMessage(staleWriter, 'fenced', stderr);
    staleWriter.send('resume');
    await expect(fenced).resolves.toEqual(expect.objectContaining({ type: 'fenced', epoch: 2, state: 'open' }));
    await closeWriter(staleWriter);
    writers.delete(staleWriter);
  }, 10_000);

  it.each([
    [
      'unsupported protocol',
      RXDB_WRITER_PROTOCOL_VERSION + 1,
      1,
      '+0 seconds',
      '+5 minutes',
      'writer_protocol_unsupported'
    ],
    ['stale epoch', RXDB_WRITER_PROTOCOL_VERSION, 2, '+0 seconds', '+5 minutes', 'writer_lease_invalid'],
    ['future heartbeat', RXDB_WRITER_PROTOCOL_VERSION, 1, '+1 minute', '+2 minutes', 'writer_lease_invalid']
  ] as const)(
    'fails closed for a malformed %s lease',
    async (_label, protocol, epoch, lastSeenOffset, expiresOffset, code) => {
      const directory = await mkdtemp(join(tmpdir(), 'aiao-sqlite-invalid-lease-'));
      temporaryDirectories.add(directory);
      const databasePath = join(directory, 'migration.sqlite');
      const databaseId = 'invalid-lease-migration';
      initializeLegacyDatabase(databasePath, databaseId);

      const database = new DatabaseSync(databasePath);
      database
        .prepare(
          `INSERT INTO "rxdb$rxdb_writer_lease"
         ("databaseId", "writerId", "protocolVersion", "epoch", "lastSeenAt", "expiresAt")
         VALUES (?, 'invalid-writer', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))`
        )
        .run(databaseId, protocol, epoch, lastSeenOffset, expiresOffset);
      database.close();

      const adapter = new MultiprocessMigrationAdapter(createRxdb(databaseId), new NodeSqliteClient(databasePath));
      adapters.add(adapter);
      await adapter.connect();

      await expect(adapter.migrateSystemSchema()).rejects.toMatchObject({ code });
      const guard = await adapter.internalQuery(
        `SELECT "state" FROM "rxdb$rxdb_upgrade_guard" WHERE "databaseId" = ?`,
        [databaseId]
      );
      expect(guard.results[0]?.rows).toEqual([['open']]);
      const watermarks = await adapter.internalQuery(`SELECT "name" FROM "rxdb$rxdb_migration"`);
      expect(watermarks.results[0]?.rows).toEqual([]);
    }
  );
});

// `writerProcessSource` 里的子进程按 '+1 second' 续租，与适配器的 RXDB_WRITER_LEASE_TTL_MS 不同。
const PROCESS_WRITER_TTL_MS = 1000;

/** 一行 lease：`[writerId, protocolVersion, epoch, lastSeenAt, expiresAt]`。 */
type LeaseRow = SQLiteCompatibleType[];

/**
 * 读整张 lease 表。断言「不覆盖别人」必须逐列比对整行 —— 只比 writerId
 * 会漏掉别人的 epoch 或时间戳被改写的情况。
 */
const readLeaseRows = async (adapter: RxDBAdapterSqliteBase, databaseId: string): Promise<LeaseRow[]> => {
  const result = await adapter.internalQuery(
    `SELECT "writerId", "protocolVersion", "epoch", "lastSeenAt", "expiresAt"
     FROM "rxdb$rxdb_writer_lease" WHERE "databaseId" = ? ORDER BY "writerId"`,
    [databaseId]
  );
  return result.results[0]?.rows ?? [];
};

const writerIdsOf = (rows: LeaseRow[]): string[] => rows.map(row => String(row[0]));

/** 除 `writerId` 外的其余行，保持 `ORDER BY "writerId"` 的次序。 */
const othersOf = (rows: LeaseRow[], writerId: string): LeaseRow[] => rows.filter(row => String(row[0]) !== writerId);

describe('SQLite multiprocess writer lease registration', () => {
  it('gives every realm its own row and never overwrites another writer on re-registration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aiao-sqlite-lease-registration-'));
    temporaryDirectories.add(directory);
    const databasePath = join(directory, 'lease.sqlite');
    const databaseId = 'lease-registration';
    initializeLegacyDatabase(databasePath, databaseId);

    // 两个适配器 = 两个 realm（各自的连接、各自 uuid 生成的 writerId），走生产
    // startWriterLease() 路径；第三个 writer 是真实 OS 进程。
    const adapterA = new MultiprocessMigrationAdapter(createRxdb(databaseId), new NodeSqliteClient(databasePath));
    const adapterB = new MultiprocessMigrationAdapter(createRxdb(databaseId), new NodeSqliteClient(databasePath));
    adapters.add(adapterA);
    adapters.add(adapterB);
    await adapterA.connect();
    await adapterB.connect();

    // 逐个注册，靠"新出现的那一行"认出各自的 writerId —— #writer_id 是私有的，
    // 顺带就地验证了后注册的 writer 不会顶掉先注册的。
    await adapterA.startWriterLease();
    const afterFirst = await readLeaseRows(adapterA, databaseId);
    expect(afterFirst).toHaveLength(1);
    const writerIdA = writerIdsOf(afterFirst)[0] ?? '';

    await adapterB.startWriterLease();
    const afterSecond = await readLeaseRows(adapterA, databaseId);
    expect(afterSecond).toHaveLength(2);
    const writerIdB = writerIdsOf(othersOf(afterSecond, writerIdA))[0] ?? '';
    expect(writerIdB).not.toBe(writerIdA);
    // A 的行在 B 注册后逐列不变。
    expect(othersOf(afterSecond, writerIdB)).toEqual(afterFirst);

    const processWriter = await startWriter(databasePath, databaseId, 'process-writer');
    writers.add(processWriter);

    const registered = await readLeaseRows(adapterA, databaseId);
    expect(registered).toHaveLength(3);
    expect(new Set(writerIdsOf(registered))).toEqual(new Set([writerIdA, writerIdB, 'process-writer']));
    for (const row of registered) {
      expect(row[1]).toBe(RXDB_WRITER_PROTOCOL_VERSION);
      expect(row[2]).toBe(1);
    }

    // 心跳用数据库时间：TTL 跨度与「lastSeenAt 不在未来」都交给数据库时钟判定，
    // 不引入 JS 的 Date.now()（跨进程的本地时钟本就不可比）。
    const clock = await adapterA.internalQuery(
      `SELECT "writerId",
              CAST(ROUND((julianday("expiresAt") - julianday("lastSeenAt")) * 86400000) AS INTEGER),
              CASE WHEN julianday("lastSeenAt") <= julianday('now') THEN 1 ELSE 0 END
       FROM "rxdb$rxdb_writer_lease" WHERE "databaseId" = ? ORDER BY "writerId"`,
      [databaseId]
    );
    expect(clock.results[0]?.rows).toHaveLength(3);
    for (const row of clock.results[0]?.rows ?? []) {
      expect(row[1]).toBe(String(row[0]) === 'process-writer' ? PROCESS_WRITER_TTL_MS : RXDB_WRITER_LEASE_TTL_MS);
      expect(row[2]).toBe(1);
    }

    // strftime('%f') 是毫秒精度，等一会儿才能让重续的时间戳确实前进。
    await new Promise(resolve => setTimeout(resolve, 20));
    await adapterA.transaction(async () => undefined, false);

    const afterRenewA = await readLeaseRows(adapterA, databaseId);
    // 重复注册走 ON CONFLICT ("databaseId", "writerId")：A 仍是一行，既不新增也不吞掉别人。
    expect(afterRenewA).toHaveLength(3);
    expect(othersOf(afterRenewA, writerIdA)).toEqual(othersOf(registered, writerIdA));
    expect(String(afterRenewA.find(row => String(row[0]) === writerIdA)?.[3])).not.toBe(
      String(registered.find(row => String(row[0]) === writerIdA)?.[3])
    );

    // 反向再验一次：真实进程重续，两个适配器的行同样纹丝不动。
    const stderr: string[] = [];
    processWriter.stderr?.on('data', chunk => stderr.push(String(chunk)));
    const renewed = waitForWriterMessage(processWriter, 'renewed', stderr);
    processWriter.send('resume');
    await renewed;

    const afterRenewProcess = await readLeaseRows(adapterA, databaseId);
    expect(afterRenewProcess).toHaveLength(3);
    expect(othersOf(afterRenewProcess, 'process-writer')).toEqual(othersOf(afterRenewA, 'process-writer'));

    await closeWriter(processWriter);
    writers.delete(processWriter);
  }, 15_000);
});
