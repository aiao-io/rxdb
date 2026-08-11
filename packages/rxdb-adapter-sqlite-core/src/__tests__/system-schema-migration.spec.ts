import {
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RXDB_WRITER_PROTOCOL_VERSION,
  RxDB,
  RxDBChange,
  RxDBMigration,
  RxDBSystemMigrationLockError,
  UnsupportedRxDBSystemVersionError,
  type EntityType
} from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import { Todo } from './fixtures/Todo.js';

class MigrationTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'migration-test-sqlite';

  constructor(
    rxdb: RxDB,
    private readonly client: SqliteClientLike
  ) {
    super(rxdb);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    return this.client;
  }
}

interface MigrationClientState {
  readonly committedWatermarks: Set<string>;
  readonly committedWriterLeases: Set<string>;
  readonly expiredWriterLeases: Set<string>;
  readonly sql: string[];
  committedGuard: MigrationGuard;
  protocolTablesPresent: boolean;
  failLock: boolean;
  failCodecWatermarkOnce: boolean;
}

interface MigrationGuard {
  epoch: number;
  state: string;
  ownerId: string | null;
  ownerExpiresAt: string | null;
  minProtocol: number;
}

const result = (sql: string, rows: SQLiteCompatibleType[][] = [], rowsAffected = 0): SqliteResult => ({
  sql,
  rowsAffected,
  elapsed: 0,
  results: rows.length > 0 ? [{ columns: ['name'], rows }] : []
});

const createMigrationClient = (
  initialWatermarks: Iterable<string> = []
): { client: SqliteClientLike; state: MigrationClientState } => {
  const state: MigrationClientState = {
    committedWatermarks: new Set(initialWatermarks),
    committedWriterLeases: new Set(),
    expiredWriterLeases: new Set(),
    sql: [],
    committedGuard: {
      epoch: 1,
      state: 'open',
      ownerId: null,
      ownerExpiresAt: null,
      minProtocol: RXDB_WRITER_PROTOCOL_VERSION
    },
    protocolTablesPresent: true,
    failLock: false,
    failCodecWatermarkOnce: false
  };
  let pendingWatermarks = new Set<string>();
  let pendingWriterLeases = new Set<string>();
  let pendingGuard = { ...state.committedGuard };
  let transactionStarted = false;

  const execute = vi.fn(async (sql: string, bindings: SQLiteCompatibleType[] = []): Promise<SqliteResult> => {
    state.sql.push(sql);
    if (sql.length === 0) throw new Error('execute() requires a non-empty SQL string');
    if (sql.includes('BEGIN EXCLUSIVE')) {
      if (state.failLock) throw new Error('SQLITE_BUSY');
      transactionStarted = true;
      pendingWatermarks = new Set(state.committedWatermarks);
      pendingWriterLeases = new Set(state.committedWriterLeases);
      pendingGuard = { ...state.committedGuard };
      return result(sql);
    }
    if (sql.includes('FROM "sqlite_master"') && sql.includes('IN (?, ?)')) {
      return state.protocolTablesPresent ? result(sql, [[bindings[0]], [bindings[1]]]) : result(sql);
    }
    if (sql.includes('SELECT "name" FROM')) {
      return result(
        sql,
        Array.from(transactionStarted ? pendingWatermarks : state.committedWatermarks, watermark => [watermark])
      );
    }
    if (sql.includes('SELECT "epoch", "state", "ownerId", "ownerExpiresAt", "minProtocol"')) {
      return result(sql, [
        [
          pendingGuard.epoch,
          pendingGuard.state,
          pendingGuard.ownerId,
          pendingGuard.ownerExpiresAt,
          pendingGuard.minProtocol,
          pendingGuard.ownerExpiresAt && new Date(pendingGuard.ownerExpiresAt).getTime() > Date.now() ? 1 : 0
        ]
      ]);
    }
    if (sql.includes(`SET "state" = 'draining'`)) {
      pendingGuard.state = 'draining';
      pendingGuard.ownerId = String(bindings[0]);
      pendingGuard.ownerExpiresAt = new Date(Date.now() + 30_000).toISOString();
      return result(sql, [], 1);
    }
    if (sql.includes(`SET "state" = 'migrating'`)) {
      pendingGuard.state = 'migrating';
      pendingGuard.epoch += 1;
      return result(sql, [[pendingGuard.epoch]], 1);
    }
    if (sql.includes(`SET "state" = 'open'`)) {
      pendingGuard.state = 'open';
      pendingGuard.ownerId = null;
      pendingGuard.ownerExpiresAt = null;
      return result(sql, [], 1);
    }
    if (sql.includes('SELECT "writerId", "protocolVersion", "epoch"')) {
      return result(
        sql,
        Array.from(pendingWriterLeases).map(writerId => [
          writerId,
          RXDB_WRITER_PROTOCOL_VERSION,
          pendingGuard.epoch,
          1,
          state.expiredWriterLeases.has(writerId) ? 0 : 1
        ])
      );
    }
    if (sql.includes('SELECT "writerId" FROM "rxdb$rxdb_writer_lease"')) {
      const currentWriterId = bindings[1];
      const writerId = Array.from(pendingWriterLeases).find(id => id !== currentWriterId);
      return result(sql, writerId ? [[writerId]] : []);
    }
    if (sql.includes('DELETE FROM "rxdb$rxdb_writer_lease"')) {
      if (sql.includes('julianday')) {
        for (const writerId of state.expiredWriterLeases) pendingWriterLeases.delete(writerId);
      } else {
        pendingWriterLeases.clear();
      }
      return result(sql);
    }
    if (sql.includes('sqlite_master')) return result(sql, [[1]]);
    if (sql.includes('INSERT OR IGNORE INTO "rxdb$rxdb_upgrade_guard"')) return result(sql);
    if (sql.includes('INSERT INTO') && typeof bindings[0] === 'string') {
      if (bindings[0] === RXDB_CHANGE_CODEC_WATERMARK && state.failCodecWatermarkOnce) {
        state.failCodecWatermarkOnce = false;
        throw new Error('injected watermark failure');
      }
      pendingWatermarks.add(bindings[0]);
      return result(sql);
    }
    if (sql === 'COMMIT;') {
      state.committedWatermarks.clear();
      for (const watermark of pendingWatermarks) state.committedWatermarks.add(watermark);
      state.committedWriterLeases.clear();
      for (const writerId of pendingWriterLeases) state.committedWriterLeases.add(writerId);
      for (const writerId of state.expiredWriterLeases) {
        if (!state.committedWriterLeases.has(writerId)) state.expiredWriterLeases.delete(writerId);
      }
      state.committedGuard = { ...pendingGuard };
      transactionStarted = false;
      return result(sql);
    }
    if (sql === 'ROLLBACK;') {
      pendingWatermarks = new Set(state.committedWatermarks);
      pendingWriterLeases = new Set(state.committedWriterLeases);
      pendingGuard = { ...state.committedGuard };
      transactionStarted = false;
      return result(sql);
    }
    return result(sql);
  });

  return {
    state,
    client: {
      execute,
      disconnect: vi.fn(async () => undefined),
      version: vi.fn(async () => '3.46.0'),
      addEventListener: vi.fn()
    }
  };
};

const createRxdb = (entities: EntityType[] = [Todo]): RxDB =>
  ({
    config: { dbName: 'migration-test', entities },
    context: {},
    connect: vi.fn(async () => undefined),
    dispatchEvent: vi.fn(),
    schemaManager: { getEntityMetadata: vi.fn(), getEntityTypeByTableName: vi.fn() },
    versionManager: { getCurrentBranch: vi.fn(async () => ({ id: 'main' })) }
  }) as unknown as RxDB;

const adapters = new Set<MigrationTestAdapter>();

const trackAdapter = (adapter: MigrationTestAdapter): MigrationTestAdapter => {
  adapters.add(adapter);
  return adapter;
};

afterEach(async () => {
  const pending = Array.from(adapters);
  adapters.clear();
  await Promise.all(pending.map(adapter => adapter.disconnect()));
});

describe('SQLite system schema migration', () => {
  it('协议表缺失时 fail-fast，不自动创建或执行迁移', async () => {
    const { client, state } = createMigrationClient();
    state.protocolTablesPresent = false;
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toMatchObject({ code: 'writer_guard_missing' });
    expect(state.committedWatermarks).toEqual(new Set());
    expect(state.sql.some(sql => sql.includes('CREATE TRIGGER') || sql.includes('INSERT INTO'))).toBe(false);
  });

  it('活跃 bridge writer 排空后原子提升 epoch 并迁移', async () => {
    const { client, state } = createMigrationClient();
    state.committedWriterLeases.add('bridge-writer');
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toThrow(/active writer lease/i);
    expect(state.committedWatermarks).toEqual(new Set());
    expect(state.committedGuard).toEqual(
      expect.objectContaining({ epoch: 1, state: 'draining', ownerId: expect.any(String) })
    );

    state.committedWriterLeases.clear();
    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    expect(state.committedWatermarks).toEqual(new Set([RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]));
    expect(state.committedGuard).toEqual({
      epoch: 2,
      state: 'open',
      ownerId: null,
      ownerExpiresAt: null,
      minProtocol: RXDB_WRITER_PROTOCOL_VERSION
    });
  });

  it('不抢占未过期的其他 upgrader owner', async () => {
    const { client, state } = createMigrationClient();
    state.committedGuard = {
      ...state.committedGuard,
      state: 'draining',
      ownerId: 'other-upgrader',
      ownerExpiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toThrow(/another upgrader/i);
    expect(state.committedWatermarks).toEqual(new Set());
    expect(state.committedGuard.ownerId).toBe('other-upgrader');
  });

  it('按数据库时间接管过期 owner 并清理过期 writer lease', async () => {
    const { client, state } = createMigrationClient();
    state.committedGuard = {
      ...state.committedGuard,
      state: 'draining',
      ownerId: 'expired-upgrader',
      ownerExpiresAt: new Date(Date.now() - 60_000).toISOString()
    };
    state.committedWriterLeases.add('expired-writer');
    state.expiredWriterLeases.add('expired-writer');
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    expect(state.committedWriterLeases).toEqual(new Set());
    expect(state.committedGuard).toEqual({
      epoch: 2,
      state: 'open',
      ownerId: null,
      ownerExpiresAt: null,
      minProtocol: RXDB_WRITER_PROTOCOL_VERSION
    });
  });

  it('全 log:false 实体升级时不执行空 trigger SQL', async () => {
    const { client } = createMigrationClient();
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb([RxDBChange, RxDBMigration]), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
  });

  it('升级 legacy schema、重建业务 trigger，并且重复执行不改写历史', async () => {
    const { client, state } = createMigrationClient();
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await adapter.migrateSystemSchema();

    expect(state.committedWatermarks).toEqual(new Set([RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]));
    expect(state.sql.some(sql => sql.includes('CREATE TRIGGER'))).toBe(true);
    const writesAfterFirstMigration = state.sql.filter(sql => sql.includes('INSERT INTO')).length;
    const triggerCreatesAfterFirstMigration = state.sql.filter(sql => sql.includes('CREATE TRIGGER')).length;

    await adapter.migrateSystemSchema();

    expect(state.sql.filter(sql => sql.includes('INSERT INTO'))).toHaveLength(writesAfterFirstMigration);
    expect(state.sql.filter(sql => sql.includes('CREATE TRIGGER'))).toHaveLength(triggerCreatesAfterFirstMigration);
  });

  it('高版本在任何 trigger DDL 或 watermark DML 前 fail-fast', async () => {
    // 由当前版本推算「未来版本」，而不是写死数字 —— 写死的话下一次版本号 bump
    // 会让这个 fixture 变成「当前版本」，fail-fast 契约被悄悄跳过而测试仍然绿
    const { client, state } = createMigrationClient([
      `${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION + 1}`
    ]);
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(UnsupportedRxDBSystemVersionError);

    expect(state.sql).toContain('ROLLBACK;');
    expect(state.sql.some(sql => sql.includes('CREATE TRIGGER') || sql.includes('INSERT INTO'))).toBe(false);
  });

  it('watermark DML 失败时回滚，下一次可完整重试', async () => {
    const { client, state } = createMigrationClient();
    state.failCodecWatermarkOnce = true;
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toThrow('injected watermark failure');
    expect(state.committedWatermarks).toEqual(new Set());
    expect(state.sql).toContain('ROLLBACK;');

    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    expect(state.committedWatermarks).toEqual(new Set([RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]));
  });

  it('独占锁失败时中止，业务 trigger 不启动', async () => {
    const { client, state } = createMigrationClient();
    state.failLock = true;
    const adapter = trackAdapter(new MigrationTestAdapter(createRxdb(), client));
    await adapter.connect();

    await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(RxDBSystemMigrationLockError);

    expect(state.sql.at(-1)).toContain('BEGIN EXCLUSIVE');
    expect(state.sql.some(sql => sql.includes('CREATE TRIGGER') || sql.includes(RXDB_SYSTEM_SCHEMA_WATERMARK))).toBe(
      false
    );
  });
});
