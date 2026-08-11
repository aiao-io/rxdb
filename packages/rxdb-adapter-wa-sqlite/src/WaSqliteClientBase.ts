import type { SqliteChangeEvent, SQLiteCompatibleType, SqliteResult } from '@aiao/rxdb-adapter-sqlite-core';
import {
  type ChangeRecordEvent,
  DEFAULT_BATCH_TIMEOUT,
  get_cached_regexp,
  MAX_BATCH_WAIT_MS,
  RxDBAdapterSqliteError,
  SQLiteChangeType,
  WATCH_TABLES
} from '@aiao/rxdb-adapter-sqlite-core';
import { AsyncQueueExecutor, EventDispatcher, get } from '@aiao/utils';
import { SQLITE_DETERMINISTIC, SQLITE_UTF8 } from 'wa-sqlite';
import { executeHelper } from './execute_helper.js';
import type { SQLiteAPI, SQLiteVFS } from './wa-sqlite.interface.js';

/** wa-sqlite 客户端事件。 */
export interface WaSqliteClientEvents {
  [SQLiteChangeType.SQLITE_DELETE]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_INSERT]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_UPDATE]: SqliteChangeEvent;
}

/** 已加载的 wa-sqlite API 与 VFS。 */
export interface LoadedWaSqliteClientRuntime {
  readonly sqlite3: SQLiteAPI;
  readonly vfs: SQLiteVFS;
  readonly lockPolicy?: string;
  readonly finalizeOpenStatements?: (database: number) => Promise<void>;
}

/** wa-sqlite 客户端规范化后的运行参数。 */
export interface ResolvedWaSqliteClientOptions {
  readonly identity: Readonly<Record<string, unknown>>;
  readonly batchTimeout: number;
  readonly cacheSizeKb: number;
}

/** wa-sqlite 客户端的平台运行时。 */
export interface WaSqliteClientRuntime<TOptions extends object> {
  readonly clientName: string;
  load(dbName: string, options: TOptions): Promise<LoadedWaSqliteClientRuntime>;
  resolve(dbName: string, options: TOptions): ResolvedWaSqliteClientOptions;
  initializationSql?(cacheSizeKb: number): string;
}

const SHARED_HINT_LOCK_POLICY = 'shared+hint';
const WRITE_HINT_BEGIN_SQL = 'PRAGMA write_hint;\nBEGIN IMMEDIATE;';
const WRITE_HINT_SYSTEM_MIGRATION_BEGIN_SQL = 'PRAGMA write_hint;\nBEGIN EXCLUSIVE;';

interface SQLiteConnection {
  readonly sqlite: SQLiteAPI;
  readonly db: number;
  readonly vfs: SQLiteVFS;
  readonly lockPolicy?: string;
  readonly finalizeOpenStatements?: (database: number) => Promise<void>;
}

type ClientIdentity = Readonly<Record<string, unknown>>;

type ClientState =
  | { status: 'idle' }
  | { status: 'initializing'; identity: ClientIdentity; promise: Promise<void> }
  | { status: 'ready'; connection: SQLiteConnection; identity: ClientIdentity }
  | { status: 'disconnecting'; promise: Promise<void> }
  | { status: 'disconnected' };

/** 注入平台 loader 后共享的 wa-sqlite 客户端实现。 */
export class WaSqliteClientBase<TOptions extends object> extends EventDispatcher<WaSqliteClientEvents> {
  #state: ClientState = { status: 'idle' };
  readonly #queue = new AsyncQueueExecutor(1);
  readonly #pendingEvents: ChangeRecordEvent[] = [];
  #batchTimer?: ReturnType<typeof setTimeout>;
  #maxWaitTimer?: ReturnType<typeof setTimeout>;
  #batchTimeout: number = DEFAULT_BATCH_TIMEOUT;

  constructor(private readonly runtime: WaSqliteClientRuntime<TOptions>) {
    super();
  }

  /** 初始化数据库。相同 identity 可重复调用，冲突配置会明确拒绝。 */
  async init(dbName: string, options: TOptions): Promise<void> {
    const state = this.#state;
    if (state.status === 'disconnected' || state.status === 'disconnecting') {
      throw new Error(`${this.runtime.clientName} client has been disconnected`);
    }

    const resolved = this.runtime.resolve(dbName, options);
    if (state.status === 'ready') {
      assertSameIdentity(state.identity, resolved.identity, this.runtime.clientName);
      return;
    }
    if (state.status === 'initializing') {
      assertSameIdentity(state.identity, resolved.identity, this.runtime.clientName);
      await state.promise;
      return;
    }

    this.#batchTimeout = resolved.batchTimeout;
    const promise = this.#initialize(dbName, options, resolved.cacheSizeKb, resolved.identity);
    this.#state = { status: 'initializing', identity: resolved.identity, promise };
    await promise;
  }

  /** 获取 SQLite 版本号。 */
  async version(): Promise<string> {
    const version = await this.execute('SELECT sqlite_version()');
    return get(version, 'results[0].rows[0][0]');
  }

  /** 获取当前 VFS 所需的事务开始语句。 */
  beginTransactionSql(): string {
    const state = this.#state;
    if (state.status === 'ready' && state.connection.lockPolicy === SHARED_HINT_LOCK_POLICY) {
      return WRITE_HINT_BEGIN_SQL;
    }
    return 'BEGIN;';
  }

  /** 获取系统迁移事务所需的最高强度锁语句。 */
  beginSystemMigrationTransactionSql(): string {
    const state = this.#state;
    if (state.status === 'ready' && state.connection.lockPolicy === SHARED_HINT_LOCK_POLICY) {
      return WRITE_HINT_SYSTEM_MIGRATION_BEGIN_SQL;
    }
    return 'BEGIN EXCLUSIVE;';
  }

  /** 等待现有任务结束并关闭数据库与 VFS。 */
  async disconnect(): Promise<void> {
    const state = this.#state;
    if (state.status === 'disconnected') return;
    if (state.status === 'disconnecting') {
      await state.promise;
      return;
    }

    const promise = Promise.resolve().then(() => this.#performDisconnect(state));
    this.#state = { status: 'disconnecting', promise };
    await promise;
  }

  /** 串行执行 SQL。 */
  async execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    const state = this.#state;
    if (state.status === 'disconnected' || state.status === 'disconnecting') {
      throw new Error(`${this.runtime.clientName} client has been disconnected`);
    }
    if (state.status !== 'ready') throw new Error(`${this.runtime.clientName} client is not initialized`);

    const { sqlite, db } = state.connection;
    return this.#queue.addTask(() => executeHelper(sqlite, db, sql, bindings));
  }

  async #initialize(dbName: string, options: TOptions, cacheSize: number, identity: ClientIdentity): Promise<void> {
    try {
      const connection = await this.#openConnection(dbName, options, cacheSize);
      if (this.#state.status !== 'initializing') {
        await closeConnection(connection);
        throw new Error(`${this.runtime.clientName} client has been disconnected`);
      }
      this.#state = { status: 'ready', connection, identity };
    } catch (error) {
      if (this.#state.status === 'initializing') this.#state = { status: 'idle' };
      throw error;
    }
  }

  async #openConnection(dbName: string, options: TOptions, cacheSize: number): Promise<SQLiteConnection> {
    const { sqlite3: sqlite, vfs, lockPolicy, finalizeOpenStatements } = await this.runtime.load(dbName, options);
    const disposers: Array<() => Promise<void>> = [async () => vfs.close()];
    const dispose = async (cause: unknown): Promise<never> => {
      for (const disposer of disposers.reverse()) {
        try {
          await disposer();
        } catch (error) {
          console.error(`[${this.runtime.clientName}] 连接建立失败后的清理步骤出错：`, error);
        }
      }
      throw cause;
    };

    let db: number;
    try {
      db = await sqlite.open_v2(`${dbName}.sqlite`);
    } catch (error) {
      return dispose(error);
    }
    disposers.push(async () => {
      await closeDatabase(sqlite, db, finalizeOpenStatements);
    });

    try {
      registerCustomFunctions(sqlite, db);
      const initializationSql =
        this.runtime.initializationSql?.(cacheSize) ??
        `
          PRAGMA temp_store = memory;
          PRAGMA foreign_keys = ON;
          PRAGMA cache_size = -${cacheSize};
        `;
      await executeHelper(sqlite, db, initializationSql);
      sqlite.update_hook(db, (type, databaseName, tableName, rowId) => {
        if (!databaseName || !tableName || !WATCH_TABLES.has(tableName)) return;
        this.#pendingEvents.push({ type, dbName: databaseName, tableName, rowId: normalizeRowId(rowId) });
        this.#scheduleBatch();
      });
      return { sqlite, db, vfs, lockPolicy, finalizeOpenStatements };
    } catch (error) {
      return dispose(error);
    }
  }

  async #performDisconnect(state: Exclude<ClientState, { status: 'disconnecting' | 'disconnected' }>): Promise<void> {
    try {
      this.#clearTimers();
      if (state.status === 'initializing') {
        await state.promise.catch(() => undefined);
        return;
      }
      if (state.status === 'idle') return;

      const { sqlite, db, vfs, finalizeOpenStatements } = state.connection;
      await this.#queue.waitForAll();
      sqlite.update_hook(db, () => undefined);
      this.#clearTimers();
      this.#flushPendingEvents();
      await closeConnection({ sqlite, db, vfs, finalizeOpenStatements });
    } finally {
      this.removeAllEventListeners();
      this.#state = { status: 'disconnected' };
    }
  }

  #scheduleBatch(): void {
    if (this.#state.status === 'disconnecting') return;
    if (this.#batchTimer) clearTimeout(this.#batchTimer);
    this.#batchTimer = setTimeout(() => this.#flushNow(), this.#batchTimeout);
    if (!this.#maxWaitTimer) this.#maxWaitTimer = setTimeout(() => this.#flushNow(), MAX_BATCH_WAIT_MS);
  }

  #flushNow(): void {
    this.#clearTimers();
    this.#flushPendingEvents();
  }

  #clearTimers(): void {
    if (this.#batchTimer) clearTimeout(this.#batchTimer);
    if (this.#maxWaitTimer) clearTimeout(this.#maxWaitTimer);
    this.#batchTimer = undefined;
    this.#maxWaitTimer = undefined;
  }

  #flushPendingEvents(): void {
    const pending = this.#pendingEvents.splice(0);
    if (pending.length === 0) return;

    const grouped = new Map<string, ChangeRecordEvent[]>();
    for (const event of pending) {
      const key = `${event.type}_${event.dbName}_${event.tableName}`;
      const events = grouped.get(key);
      if (events) events.push(event);
      else grouped.set(key, [event]);
    }
    for (const events of grouped.values()) this.#dispatchGroup(events);
  }

  #dispatchGroup(events: readonly ChangeRecordEvent[]): void {
    const first = events[0];
    try {
      this.dispatchEvent(first.type, {
        type: first.type,
        dbName: first.dbName,
        tableName: first.tableName,
        rowIds: events.map(event => event.rowId),
        recordAt: new Date()
      });
    } catch (error) {
      console.error(`[${this.runtime.clientName}] change listener for "${first.tableName}" threw`, error);
    }
  }
}

function normalizeRowId(rowId: number | bigint): bigint {
  return typeof rowId === 'bigint' ? rowId : BigInt(rowId);
}

async function closeDatabase(
  sqlite: SQLiteAPI,
  database: number,
  finalizeOpenStatements?: (database: number) => Promise<void>
): Promise<void> {
  try {
    await finalizeOpenStatements?.(database);
  } finally {
    await sqlite.close(database);
  }
}

async function closeConnection(connection: SQLiteConnection): Promise<void> {
  let firstError: unknown;
  let failed = false;
  try {
    await closeDatabase(connection.sqlite, connection.db, connection.finalizeOpenStatements);
  } catch (error) {
    firstError = error;
    failed = true;
  }
  try {
    await connection.vfs.close();
  } catch (error) {
    if (!failed) {
      firstError = error;
      failed = true;
    } else {
      console.error('[rxdb-adapter-wa-sqlite] VFS 关闭失败：', error);
    }
  }
  if (failed) throw firstError;
}

function assertSameIdentity(current: ClientIdentity, requested: ClientIdentity, clientName: string): void {
  const fields = new Set([...Object.keys(current), ...Object.keys(requested)]);
  const conflicts = [...fields].filter(field => current[field] !== requested[field]);
  if (conflicts.length === 0) return;
  throw new RxDBAdapterSqliteError(`${clientName} conflicting initialization: ${conflicts.join(', ')}`);
}

function registerCustomFunctions(sqlite: SQLiteAPI, db: number): void {
  sqlite.create_function(db, 'regexp', 2, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    const regexp = get_cached_regexp(sqlite.value_text(values[0]));
    const text = sqlite.value_text(values[1]);
    sqlite.result(context, regexp.test(text) ? 1 : 0);
  });
  sqlite.create_function(db, 'regexp_replace', -1, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    if (values.length < 3) throw new Error('regexp_replace requires at least 3 arguments');
    const pattern = sqlite.value_text(values[0]);
    const text = sqlite.value_text(values[1]);
    const replacement = sqlite.value_text(values[2]);
    const flags = values.length > 3 ? sqlite.value_text(values[3]) : '';
    sqlite.result(context, text.replace(get_cached_regexp(pattern, flags), replacement));
  });
}
