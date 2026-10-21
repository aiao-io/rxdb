import type {
  SqliteBlankDatabase,
  SqliteChangeEvent,
  SQLiteCompatibleType,
  SqliteResult
} from '@aiao/rxdb-adapter-sqlite-core';
import {
  type ChangeRecordEvent,
  DEFAULT_BATCH_TIMEOUT,
  describeSqliteDatabase,
  FTS_BIGRAM_SQL_FUNCTION,
  get_cached_regexp,
  indexTextForFts,
  MAX_BATCH_WAIT_MS,
  releaseComlinkProxy,
  RxDBAdapterSqliteError,
  SQLiteChangeType,
  WATCH_TABLES
} from '@aiao/rxdb-adapter-sqlite-core';
import { AsyncQueueExecutor, EventDispatcher, type EventListener, get } from '@aiao/utils';
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
  /**
   * 执行打开，并决定打开失败后要不要整个重来。
   *
   * @param attempt - 一次完整的打开：`load` 新建模块与 VFS → `open_v2` → 初始化 SQL；失败时已关掉这一次的 VFS
   * @param dbName - 库名
   * @param options - 平台加载配置
   * @returns `attempt` 的结果
   *
   * @remarks
   * 重来就再调一次 `attempt`，不复用失败那次的模块与 VFS。浏览器对 `OPFSCoopSyncVFS` 按退避重试（US-221：整页刷新时
   * 上一个页面还占着库文件的同步访问句柄）；不需要重试的平台直接 `attempt()`。
   */
  open<T>(attempt: () => Promise<T>, dbName: string, options: TOptions): Promise<T>;
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

/** 持有者带键登记的监听；三类变更的事件数据同形 */
type OwnedListener = EventListener<SqliteChangeEvent>;

type ClientState =
  | { status: 'idle' }
  | { status: 'initializing'; identity: ClientIdentity; promise: Promise<void> }
  | { status: 'ready'; connection: SQLiteConnection; identity: ClientIdentity }
  /** 最后一个持有者交还了，正在关库；关完回到 `idle`，还能再 `init`（{@link WaSqliteClientBase.release}） */
  | { status: 'releasing'; promise: Promise<void> }
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
  #changeEventsMuted = false;
  /** 带持有者键 `init` 过、还没交还的持有者 */
  readonly #owners = new Set<string>();
  /** 每个持有者带键登记的监听，交还时按它摘 */
  readonly #ownerListeners = new Map<string, Array<readonly [keyof WaSqliteClientEvents, OwnedListener]>>();

  constructor(private readonly runtime: WaSqliteClientRuntime<TOptions>) {
    super();
  }

  /**
   * 初始化数据库。相同 identity 可重复调用，冲突配置会明确拒绝。
   *
   * @param dbName - 库名
   * @param options - 平台加载配置
   * @param owner - 持有者键：SharedWorker 上每个标签页的适配器各给一个，交还时凭它（{@link WaSqliteClientBase.release}）
   */
  async init(dbName: string, options: TOptions, owner?: string): Promise<void> {
    const state = this.#state;
    if (state.status === 'disconnected' || state.status === 'disconnecting') {
      throw new Error(`${this.runtime.clientName} client has been disconnected`);
    }
    if (state.status === 'releasing') {
      await state.promise;
      return this.init(dbName, options, owner);
    }

    const resolved = this.runtime.resolve(dbName, options);
    if (state.status === 'ready') {
      assertSameIdentity(state.identity, resolved.identity, this.runtime.clientName);
      this.#hold(owner);
      return;
    }
    if (state.status === 'initializing') {
      assertSameIdentity(state.identity, resolved.identity, this.runtime.clientName);
      await state.promise;
      this.#hold(owner);
      return;
    }

    this.#batchTimeout = resolved.batchTimeout;
    const promise = this.#initialize(dbName, options, resolved.cacheSizeKb, resolved.identity);
    this.#state = { status: 'initializing', identity: resolved.identity, promise };
    await promise;
    this.#hold(owner);
  }

  /**
   * 登记变更监听。
   *
   * @param type - 变更类型
   * @param listener - 监听器
   * @param owner - 登记它的持有者；给了的话交还时一并摘掉（{@link WaSqliteClientBase.release}）
   */
  override addEventListener<T extends keyof WaSqliteClientEvents>(
    type: T,
    listener: EventListener<WaSqliteClientEvents[T]>,
    owner?: string
  ): void {
    super.addEventListener(type, listener);
    if (owner === undefined) return;
    const listeners = this.#ownerListeners.get(owner) ?? [];
    listeners.push([type, listener as OwnedListener]);
    this.#ownerListeners.set(owner, listeners);
  }

  /**
   * 一个持有者退出：摘掉它带键登记的监听，交还它那一份持有；最后一份交还时关库，关完还能再 `init`（US-314 B2.3b）。
   *
   * @param owner - `init` 时给的持有者键；没持有过的、已经交还过的只摘监听
   *
   * @remarks
   * SharedWorker 里只有这一个客户端，每个标签页都连着它：一个标签页断开只交还自己那一份，不关别人还在用的连接。
   * 监听经 Comlink 传进来时是 worker 里新造的代理，摘下之后一并释放，标签页那头暴露监听的端口随之关掉。
   * {@link WaSqliteClientBase.disconnect} 照旧是不论持有者、整个关掉且不能再用。
   */
  async release(owner: string): Promise<void> {
    for (const [type, listener] of this.#ownerListeners.get(owner) ?? []) {
      this.removeEventListener(type, listener);
      releaseComlinkProxy(listener);
    }
    this.#ownerListeners.delete(owner);
    if (!this.#owners.delete(owner) || this.#owners.size > 0) return;
    await this.#closeToIdle();
  }

  /**
   * 连接上有没结束的事务就回滚它（US-314 B2.3b）。
   *
   * @returns 回滚了为 `true`；连接本来就在自动提交状态为 `false`
   * @throws Error 客户端未就绪
   *
   * @remarks
   * 排在已经送到这个客户端的语句后面判：死掉的标签页送来的语句先跑完，再看它留下的事务还开着没有。
   * 调用方要拿着跨标签页的锁，否则回滚的可能是别的标签页正在跑的事务。
   */
  async rollbackOrphanTransaction(): Promise<boolean> {
    const { sqlite, db } = this.#readyConnection();
    return this.#queue.addTask(async () => {
      if (sqlite.get_autocommit(db) !== 0) return false;
      await executeHelper(sqlite, db, 'ROLLBACK');
      return true;
    });
  }

  /** 获取 SQLite 版本号。 */
  async version(): Promise<string> {
    const version = await this.execute('SELECT sqlite_version()');
    return get(version, 'results[0].rows[0][0]');
  }

  /**
   * 暂停 / 恢复变更事件采集。
   *
   * @param muted - `true` 时 update hook 直接忽略写入，不入批也不派发
   *
   * @remarks
   * 静音是整个客户端的，不分持有者；SharedWorker 传输不支持恢复，共用的客户端不会被静音。
   */
  setChangeEventsMuted(muted: boolean): void {
    this.#changeEventsMuted = muted;
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

  /**
   * 在同一个模块上开一条临时 `:memory:` 连接，描述引擎新建空库本来的样子。
   *
   * @returns 空库的对象列表与描述
   * @throws Error 客户端未就绪
   */
  async describeBlankDatabase(): Promise<SqliteBlankDatabase> {
    const state = this.#state;
    if (state.status !== 'ready') throw new Error(`${this.runtime.clientName} client is not initialized`);
    const { sqlite } = state.connection;
    const blank = await sqlite.open_v2(':memory:');
    try {
      return await describeSqliteDatabase({ execute: (sql, bindings) => executeHelper(sqlite, blank, sql, bindings) });
    } finally {
      await sqlite.close(blank);
    }
  }

  /** 等待现有任务结束并关闭数据库与 VFS；不论持有者，关了就不能再用。 */
  async disconnect(): Promise<void> {
    const state = this.#state;
    if (state.status === 'disconnected') return;
    if (state.status === 'disconnecting') {
      await state.promise;
      return;
    }
    if (state.status === 'releasing') {
      await state.promise;
      return this.disconnect();
    }

    const promise = Promise.resolve().then(() => this.#performDisconnect(state));
    this.#state = { status: 'disconnecting', promise };
    await promise;
  }

  /** 串行执行 SQL。 */
  async execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    const { sqlite, db } = this.#readyConnection();
    return this.#queue.addTask(() => executeHelper(sqlite, db, sql, bindings));
  }

  /** 就绪的连接；断开了、还没就绪都抛 */
  #readyConnection(): SQLiteConnection {
    const state = this.#state;
    if (state.status === 'disconnected' || state.status === 'disconnecting') {
      throw new Error(`${this.runtime.clientName} client has been disconnected`);
    }
    if (state.status !== 'ready') throw new Error(`${this.runtime.clientName} client is not initialized`);
    return state.connection;
  }

  #hold(owner: string | undefined): void {
    if (owner !== undefined) this.#owners.add(owner);
  }

  /** 最后一个持有者交还：等现有任务跑完、关库，回到 `idle`，之后还能再 `init` */
  async #closeToIdle(): Promise<void> {
    const state = this.#state;
    if (state.status !== 'ready') return;
    const promise = (async () => {
      try {
        await this.#closeReadyConnection(state.connection);
      } finally {
        this.removeAllEventListeners();
        this.#ownerListeners.clear();
        this.#state = { status: 'idle' };
      }
    })();
    this.#state = { status: 'releasing', promise };
    await promise;
  }

  async #initialize(dbName: string, options: TOptions, cacheSize: number, identity: ClientIdentity): Promise<void> {
    try {
      const connection = await this.runtime.open(
        () => this.#openConnection(dbName, options, cacheSize),
        dbName,
        options
      );
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
        if (this.#changeEventsMuted || !databaseName || !tableName || !WATCH_TABLES.has(tableName)) return;
        this.#pendingEvents.push({ type, dbName: databaseName, tableName, rowId: normalizeRowId(rowId) });
        this.#scheduleBatch();
      });
      return { sqlite, db, vfs, lockPolicy, finalizeOpenStatements };
    } catch (error) {
      return dispose(error);
    }
  }

  async #performDisconnect(
    state: Exclude<ClientState, { status: 'disconnecting' | 'disconnected' | 'releasing' }>
  ): Promise<void> {
    try {
      this.#clearTimers();
      if (state.status === 'initializing') {
        await state.promise.catch(() => undefined);
        return;
      }
      if (state.status === 'idle') return;
      await this.#closeReadyConnection(state.connection);
    } finally {
      this.removeAllEventListeners();
      this.#owners.clear();
      this.#ownerListeners.clear();
      this.#state = { status: 'disconnected' };
    }
  }

  /** 等现有任务跑完，摘掉 update hook、同步派掉攒着的变更，再关库与 VFS */
  async #closeReadyConnection(connection: SQLiteConnection): Promise<void> {
    const { sqlite, db, vfs, finalizeOpenStatements } = connection;
    await this.#queue.waitForAll();
    sqlite.update_hook(db, () => undefined);
    this.#clearTimers();
    this.#flushPendingEvents();
    await closeConnection({ sqlite, db, vfs, finalizeOpenStatements });
  }

  #scheduleBatch(): void {
    if (this.#state.status === 'disconnecting' || this.#state.status === 'releasing') return;
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
  // `rxdb_fts_bigram(text)`：FTS5 写入侧的 CJK bigram 变换，由
  // `@aiao/rxdb-plugin-search` 生成的 trigger 与 backfill SQL 调用。
  // 实现取自 `@aiao/rxdb-adapter-sqlite-core`，与查询侧 `compileCjkToken` 同源——
  // 两侧切分方式只要不一致，索引就整体失配。NULL 原样返回，非 CJK 文本零改动。
  sqlite.create_function(db, FTS_BIGRAM_SQL_FUNCTION, 1, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    sqlite.result(context, indexTextForFts(sqlite.value_text(values[0])));
  });
}
