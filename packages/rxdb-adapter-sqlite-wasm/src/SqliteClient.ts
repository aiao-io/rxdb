import type { SqliteChangeEvent, SQLiteCompatibleType, SqliteResult } from '@aiao/rxdb-adapter-sqlite-core';
import {
  BATCH_TIMEOUT,
  type ChangeRecordEvent,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  FTS_BIGRAM_SQL_FUNCTION,
  get_cached_regexp,
  indexTextForFts,
  MAX_BATCH_WAIT_MS,
  SQLiteChangeType,
  validateSqliteNumericOption,
  WATCH_TABLES
} from '@aiao/rxdb-adapter-sqlite-core';
import { AsyncQueueExecutor, EventDispatcher, get } from '@aiao/utils';
import { executeHelper } from './execute_helper.js';
import type { SQLiteAPI } from './sqlite-api.type.js';
import { sqliteLoad } from './sqlite-load.utils.js';
import type { LoadModuleOptions } from './sqlite.interface.js';

// SQLite 常量内联（@subframe7536/sqlite-wasm/constant 运行时由 wa-sqlite 提供，但类型未导出）
const SQLITE_UTF8 = 1;
const SQLITE_DETERMINISTIC = 0x800;

export { BATCH_TIMEOUT };

export interface SqliteClientEvents {
  [SQLiteChangeType.SQLITE_DELETE]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_INSERT]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_UPDATE]: SqliteChangeEvent;
}

/**
 * 已打开的连接句柄
 *
 * 只在 `#init_sqlite` 完整成功后发布，未发布即代表「未初始化」——
 * 让 disconnect / execute 的守卫可以判定状态，而不是裸访问未赋值字段。
 */
interface SqliteConnection {
  readonly sqlite: SQLiteAPI;
  readonly db: number;
}

export class SqliteClient extends EventDispatcher<SqliteClientEvents> {
  // SQLite 后端
  #connection?: SqliteConnection;
  #is_init = false;
  #is_disconnecting = false;
  #is_disconnected = false;
  #disconnect_error?: unknown;
  /** 唯一的 disconnect 结果；并发调用共享它（SWM-001）。 */
  #disconnect_promise: Promise<void> | undefined;
  #init_promise?: Promise<void>;
  readonly #queue = new AsyncQueueExecutor(1);
  #pending_events: ChangeRecordEvent[] = [];
  #batch_timer?: ReturnType<typeof setTimeout>;
  #max_wait_timer?: ReturnType<typeof setTimeout>;
  #batch_timeout: number = DEFAULT_BATCH_TIMEOUT;

  /**
   * 初始化数据库
   *
   * @param dbName - 数据库名称（不含 .sqlite 扩展名）
   * @param options - 加载选项
   * @throws disconnect 进行中的客户端不可初始化
   */
  async init(dbName: string, options: LoadModuleOptions): Promise<void> {
    if (this.#is_disconnecting) {
      throw new Error('SqliteClient is disconnecting');
    }
    if (this.#disconnect_error) {
      throw new Error('SqliteClient previous disconnect failed; create a new client', {
        cause: this.#disconnect_error
      });
    }
    if (this.#is_init) return;
    if (this.#init_promise) return this.#init_promise;

    // 失败时 #is_init 保持 false，允许重试；并发调用复用同一 promise
    this.#init_promise = (async () => {
      this.#batch_timeout = validateSqliteNumericOption('batchTimeout', options?.batchTimeout, DEFAULT_BATCH_TIMEOUT, {
        allowZero: true
      });
      const cacheSize = validateSqliteNumericOption('cacheSizeKb', options?.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);

      await this.#init_sqlite(dbName, options, cacheSize);
      this.#is_init = true;
      this.#is_disconnected = false;
    })();

    try {
      await this.#init_promise;
    } finally {
      this.#init_promise = undefined;
    }
  }

  /**
   * 获取 SQLite 版本号
   */
  async version(): Promise<string> {
    const version = await this.execute('SELECT sqlite_version()');
    return get(version, 'results[0].rows[0][0]');
  }

  beginTransactionSql(): string {
    return 'BEGIN;';
  }

  beginSystemMigrationTransactionSql(): string {
    return 'BEGIN EXCLUSIVE;';
  }

  /**
   * 断开数据库连接
   *
   * 幂等：重复调用只关闭一次连接；未初始化时是安全空操作。
   * init 进行中调用会先等待其结束，避免漏关刚打开的连接。
   *
   * 排空执行队列后同步派发最后一批已提交变更。
   * 监听器异常会被记录，但不会阻断连接关闭。
   */
  disconnect(): Promise<void> {
    // SWM-001：并发调用必须共享**同一个**完成/失败结果。
    // 早先是「先置 `#is_disconnected = true`，后来者直接 return」——
    // 第二个调用在首个 close 还挂着时就 resolve，等于向调用方宣告「连接已关闭」，
    // 而底层连接仍开着、且首个 close 之后还可能失败。
    if (this.#disconnect_promise) return this.#disconnect_promise;

    const promise = this.#performDisconnect();
    this.#disconnect_promise = promise;
    void promise.then(
      () => {
        if (this.#disconnect_promise === promise) this.#disconnect_promise = undefined;
      },
      () => undefined
    );
    return promise;
  }

  /**
   * 执行 SQL 语句
   *
   * 所有查询自动排队，保证串行执行避免并发冲突
   *
   * @throws 客户端未初始化或已断开
   */
  async execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    if (this.#is_disconnecting || this.#is_disconnected) {
      throw new Error('SqliteClient has been disconnected');
    }
    const connection = this.#connection;
    if (!connection) {
      throw new Error('SqliteClient is not initialized');
    }
    return this.#queue.addTask(() => executeHelper(connection.sqlite, connection.db, sql, bindings));
  }

  async #performDisconnect(): Promise<void> {
    this.#is_disconnecting = true;
    this.#is_disconnected = true;

    try {
      this.#clear_batch_timers();

      if (this.#init_promise) {
        // init 失败的错误归调用 init 的一方，这里只关心连接是否需要关闭
        await this.#init_promise.catch(() => undefined);
      }

      const connection = this.#connection;
      if (connection) {
        this.#connection = undefined;
        await this.#queue.waitForAll();
        connection.sqlite.update_hook(connection.db, () => undefined);
        this.#clear_batch_timers();
        this.#flush_pending_events();
        await connection.sqlite.close(connection.db);
      }
      this.#is_init = false;
    } catch (error) {
      this.#is_init = false;
      this.#disconnect_error = error;
      throw error;
    } finally {
      this.removeAllEventListeners();
      this.#is_disconnecting = false;
    }
  }

  async #init_sqlite(dbName: string, options: LoadModuleOptions, cacheSize: number): Promise<void> {
    const core = await sqliteLoad(dbName, options);
    const { sqlite, pointer: db } = core;

    try {
      this.#register_custom_functions(sqlite, db);

      // 初始化 PRAGMA 直接走 executeHelper：此刻连接尚未发布，execute() 会被守卫拒绝
      await executeHelper(
        sqlite,
        db,
        `
        PRAGMA temp_store = memory;
        PRAGMA foreign_keys = ON;
        PRAGMA cache_size = -${cacheSize};
      `
      );

      sqlite.update_hook(db, (type, dbName, tableName, rowId) => {
        if (!dbName || !tableName || !WATCH_TABLES.has(tableName)) return;

        this.#pending_events.push({ type, dbName, tableName, rowId });
        this.#schedule_batch_send();
      });

      this.#connection = { sqlite, db };
    } catch (initializationError) {
      try {
        await sqlite.close(db);
      } catch (cleanupError) {
        throw new AggregateError(
          [initializationError, cleanupError],
          'sqlite-wasm initialization failed and connection cleanup failed',
          { cause: cleanupError }
        );
      }
      throw initializationError;
    }
  }

  /**
   * 调度批量发送。
   *
   * 防抖 + 硬上限：`#batch_timer` 每次新事件都会重置（合并连续变更）；
   * `#max_wait_timer` 只在批次首个事件时启动一次、不随后续事件重置，
   * 保证持续写入下最多 {@link MAX_BATCH_WAIT_MS} 后必定强制 flush 一次，
   * 否则纯 debounce 在写入间隔小于 batchTimeout 时会永不触发。
   */
  #schedule_batch_send(): void {
    if (this.#is_disconnecting) return;
    if (this.#batch_timer) {
      clearTimeout(this.#batch_timer);
    }
    this.#batch_timer = setTimeout(() => this.#flush_now(), this.#batch_timeout);

    if (!this.#max_wait_timer) {
      this.#max_wait_timer = setTimeout(() => this.#flush_now(), MAX_BATCH_WAIT_MS);
    }
  }

  #flush_now(): void {
    this.#clear_batch_timers();
    this.#flush_pending_events();
  }

  #clear_batch_timers(): void {
    if (this.#batch_timer) {
      clearTimeout(this.#batch_timer);
      this.#batch_timer = undefined;
    }
    if (this.#max_wait_timer) {
      clearTimeout(this.#max_wait_timer);
      this.#max_wait_timer = undefined;
    }
  }

  /**
   * 刷新待发送事件
   * 将同类型、同表的事件合并后分发
   */
  #flush_pending_events(): void {
    const pending = this.#pending_events;
    if (pending.length === 0) return;

    // 先摘走整批：监听器抛错时这批事件已经出队，不会在下次 flush 里被重放
    this.#pending_events = [];

    const grouped = Object.groupBy(pending, event => `${event.type}_${event.dbName}_${event.tableName}`);

    for (const events of Object.values(grouped)) {
      if (!events || events.length === 0) continue;
      this.#dispatch_group(events);
    }
  }

  /**
   * 分发单个分组
   *
   * 监听器抛出的错误属于监听器自身的缺陷：就地记录并继续，
   * 否则它会中断后续分组的分发，并从 setTimeout 回调逃逸成 unhandled error。
   */
  #dispatch_group(events: readonly ChangeRecordEvent[]): void {
    const first = events[0];
    try {
      this.dispatchEvent(first.type, {
        type: first.type,
        dbName: first.dbName,
        tableName: first.tableName,
        rowIds: events.map(e => e.rowId),
        recordAt: new Date()
      });
    } catch (error) {
      console.error(`SqliteClient: change listener for "${first.tableName}" threw`, error);
    }
  }

  /**
   * 注册自定义 SQL 函数
   *
   * 扩展 SQLite 功能，添加 JavaScript 正则表达式支持：
   * - `regexp(pattern, text)` - 正则匹配
   * - `regexp_replace(pattern, text, replacement[, flags])` - 正则替换
   *
   * @remarks
   * 契约（有意降级，与 `Oo1ClientBase#register_custom_functions` 逐条对齐，测试锁定）：
   * - `regexp` 编译/匹配失败 → warn + `0`（不匹配）
   * - `regexp_replace` 失败 → warn + 原文；参数不足 → `''`
   *
   * 回调由 `sqlite3_step` 执行途中调用，底层 `create_function` 既没有 try/catch，
   * 也不会把异常转成 `sqlite3_result_error`。让 JS 异常穿过 wasm 栈帧会使运行时处于
   * 不一致状态；同时不降级还会造成同一条 SQL 在两类 adapter 上行为分叉。
   * 调用方若需严格失败，应在应用层校验 pattern，而非依赖 SQL 抛错。
   */
  #register_custom_functions(sqlite3: SQLiteAPI, db: number): void {
    fun_regexp(sqlite3, db);
    fun_regexp_replace(sqlite3, db);
    fun_fts_bigram(sqlite3, db);
  }
}

function fun_regexp(sqlite3: SQLiteAPI, db: number): void {
  sqlite3.create_function(db, 'regexp', 2, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    const pattern = sqlite3.value_text(values[0]);
    try {
      const re = get_cached_regexp(pattern);
      sqlite3.result(context, re.test(sqlite3.value_text(values[1])) ? 1 : 0);
    } catch (error) {
      console.warn(`[SqliteClient] regexp(${pattern}) failed:`, error);
      sqlite3.result(context, 0);
    }
  });
}

/**
 * 注册 `rxdb_fts_bigram(text)`：FTS5 写入侧的 CJK bigram 变换。
 *
 * @remarks
 * 由 `@aiao/rxdb-plugin-search` 生成的 FTS trigger 与 backfill SQL 调用。
 * 与查询侧 `compileCjkToken` 共用 `@aiao/rxdb-adapter-sqlite-core` 里的同一份实现——
 * 两侧切分方式只要不一致，索引就整体失配。
 * `NULL` 原样返回（FTS5 视作空内容），非 CJK 文本零改动。
 */
function fun_fts_bigram(sqlite3: SQLiteAPI, db: number): void {
  sqlite3.create_function(db, FTS_BIGRAM_SQL_FUNCTION, 1, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    sqlite3.result(context, indexTextForFts(sqlite3.value_text(values[0])));
  });
}

/**
 * 注册 regexp_replace(pattern, text, replacement[, flags]) 函数
 */
function fun_regexp_replace(sqlite3: SQLiteAPI, db: number): void {
  sqlite3.create_function(db, 'regexp_replace', -1, SQLITE_UTF8 | SQLITE_DETERMINISTIC, 0, (context, values) => {
    if (values.length < 3) {
      sqlite3.result(context, '');
      return;
    }

    const pattern = sqlite3.value_text(values[0]);
    const text = sqlite3.value_text(values[1]);
    try {
      const replacement = sqlite3.value_text(values[2]);
      const flags = values.length > 3 ? sqlite3.value_text(values[3]) : '';
      sqlite3.result(context, text.replace(get_cached_regexp(pattern, flags), replacement));
    } catch (error) {
      console.warn(`[SqliteClient] regexp_replace(${pattern}) failed:`, error);
      sqlite3.result(context, text);
    }
  });
}
