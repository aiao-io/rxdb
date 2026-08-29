import { AsyncQueueExecutor, EventDispatcher, get } from '@aiao/utils';
import { executeOo1Helper } from './execute_oo1_helper.js';
import { FTS_BIGRAM_SQL_FUNCTION, indexTextForFts } from './fts5/cjk-bigram.js';
import type { Oo1Database, Oo1Static } from './oo1-types.js';
import type { SqliteClientLike } from './RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from './sqlite-backend.interface.js';
import {
  type ChangeRecordEvent,
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  get_cached_regexp,
  get_init_sql,
  get_persistent_db_file_name,
  MAX_BATCH_WAIT_MS,
  validateSqliteNumericOption,
  WATCH_TABLES
} from './sqlite-client.utils.js';
import type { SqliteChangeEvent, SQLiteCompatibleType, SqliteResult } from './sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/**
 * `Oo1ClientBase` 派发的事件签名表，供 EventDispatcher 类型推断。
 */
export interface Oo1ClientEvents {
  [SQLiteChangeType.SQLITE_DELETE]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_INSERT]: SqliteChangeEvent;
  [SQLiteChangeType.SQLITE_UPDATE]: SqliteChangeEvent;
}

/**
 * {@link Oo1ClientBase} 的连接生命周期状态。
 *
 * @remarks
 * 早先用 `#is_init` / `#is_disconnected` / `#init_promise` 三个字段各自表达一部分状态，
 * 组合出的 8 种取值里只有 4 种合法，`execute()` 也因此只检查得了「已断开」，
 * 未初始化时会一路走到 `#queue.addTask` 抛 `TypeError: ... reading 'addTask'`。
 * 收敛成单一状态字段后每条转移都是显式的。
 *
 * - `idle`：尚未 `init`，或 init 失败后已清理完毕（可重新 init）
 * - `initializing`：`init` 进行中，`#queue` 与 `#db` 尚未全部就绪
 * - `ready`：可执行 SQL
 * - `disconnected`：已 `disconnect`，重新 `init` 可回到 `ready`
 */
export type Oo1ClientState = 'idle' | 'initializing' | 'ready' | 'disconnected';

/**
 * 当 OPFS 后端数据库无法打开时的行为（例如浏览器不支持 `Atomics.wait`、
 * 缺少 `crossOriginIsolated` 等）。
 *
 * - `'memory'`：打印 warning 并显式回退到 `:memory:`。
 * - `'throw'`（默认）：把原始错误重新抛出，由调用方负责处理。
 */
export type OpfsFallback = 'memory' | 'throw';

/**
 * `Oo1ClientBase.init` 接受的运行期选项。
 * 子类可通过泛型扩展（如 `WaSqliteLoadOptions extends Oo1ClientLoadOptions`）。
 */
export interface Oo1ClientLoadOptions {
  opfs?: boolean;
  cacheSizeKb?: number;
  batchTimeout?: number;
  /** @default 'throw' */
  opfsFallback?: OpfsFallback;
}

/**
 * 包装 `oo1.DB` 风格运行时（`@sqlite.org/sqlite-wasm`、`@sqliteai/sqlite-wasm` 等）的
 * SQLite 客户端基类。
 *
 * ## 为什么叫 Oo1
 *
 * `oo1` 是上游官方 SQLite WASM 的 **Object Oriented API v1** 命名
 * （`sqlite3.oo1.DB` / `OpfsDb`），不是本仓库自创缩写。
 * 凡走这层面的适配器（sqlite / sqliteai）都继承本基类；
 * wa-sqlite 走 C API，**不**复用这里。
 *
 * 子类只需实现 {@link loadModule} 与 {@link clientName}；
 * 其余部分（队列管理、init/disconnect 生命周期、变更事件批处理、
 * 自定义函数注册、OPFS fallback）都在这里。
 *
 * @see {@link Oo1Static} — `oo1` 运行时最小契约
 */
export abstract class Oo1ClientBase<TLoadOptions extends Oo1ClientLoadOptions = Oo1ClientLoadOptions>
  extends EventDispatcher<Oo1ClientEvents>
  implements SqliteClientLike
{
  #state: Oo1ClientState = 'idle';
  /** `initializing` 期间的在途 init，供并发调用共享同一次初始化。 */
  #init_promise?: Promise<void>;
  #queue?: AsyncQueueExecutor;
  #pending_events: ChangeRecordEvent[] = [];
  #batch_timer?: ReturnType<typeof setTimeout>;
  #max_wait_timer?: ReturnType<typeof setTimeout>;
  #batch_timeout: number = DEFAULT_BATCH_TIMEOUT;
  protected sqlite3!: Oo1Static;
  protected db!: Oo1Database;

  /** 错误信息中使用的简短标识（例如 `'sqliteai'`）。 */
  protected abstract get clientName(): string;

  /**
   * 对外覆盖，与 {@link SqliteClientLike} 签名保持一致。
   * 委托给 {@link EventDispatcher} 中的泛型实现。
   */
  override addEventListener(type: SQLiteChangeType, handler: (event: SqliteChangeEvent) => void): void {
    super.addEventListener(type, handler);
  }

  async init(dbName: string, options?: TLoadOptions): Promise<void> {
    if (this.#state === 'ready') return;
    if (this.#init_promise) {
      await this.#init_promise;
      return;
    }

    this.#init_promise = (async () => {
      this.#queue = new AsyncQueueExecutor(1);
      this.#state = 'initializing';
      this.#batch_timeout = validateSqliteNumericOption('batchTimeout', options?.batchTimeout, DEFAULT_BATCH_TIMEOUT, {
        allowZero: true
      });
      const cacheSize = validateSqliteNumericOption('cacheSizeKb', options?.cacheSizeKb, DEFAULT_CACHE_SIZE_KB);

      await this.#init_sqlite(dbName, options, cacheSize);
      this.#state = 'ready';
    })();

    try {
      await this.#init_promise;
      this.#init_promise = undefined;
    } catch (error) {
      // 失败路径由 #cleanup_after_init_failure 复位状态，调用方可带合法参数重试。
      await this.#cleanup_after_init_failure();
      throw error;
    }
  }

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

  async disconnect(): Promise<void> {
    this.#state = 'disconnected';
    this.#init_promise = undefined;
    this.#clear_batch_timers();
    // 断开前同步派发已收集但未 flush 的变更事件，避免静默丢失最后一批。
    // 契约：监听器异常仅 log，不得中断 close/句柄释放（有意降级，测试锁定）——
    // 异常隔离在 #flush_pending_events 内部逐监听器完成。
    this.#flush_pending_events();
    // 必须排在 flush 之后：先清空就会连最后一批事件一起丢掉。
    // 适配器重连时会重新注册一组监听器（跨 Comlink 是全新代理，远端按引用去重认不出旧的），
    // 不在这里清空则旧监听器永久累积，同一条变更被重复派发 N 次。
    this.removeAllEventListeners();

    const sqlite3 = this.sqlite3 as Oo1Static | undefined;
    const db = this.db as Oo1Database | undefined;
    const queue = this.#queue;

    if (sqlite3?.capi?.sqlite3_update_hook && db) {
      sqlite3.capi.sqlite3_update_hook(
        db,
        () => {
          /* 无操作 */
        },
        0
      );
    }
    try {
      if (queue) {
        await queue.waitForAll();
      }
    } finally {
      // 即使 waitForAll 抛错也必须关闭连接，避免句柄泄漏
      if (db) {
        db.close();
      }
    }
  }

  /**
   * 执行 SQL。
   *
   * @param sql - SQL 语句
   * @param bindings - 绑定参数
   * @returns 执行结果
   * @throws {RxDBAdapterSqliteError} 客户端已断开，或尚未 `init` 完成
   */
  async execute(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    if (this.#state === 'disconnected') {
      throw new RxDBAdapterSqliteError(`${this.clientName} client has been disconnected`);
    }
    if (this.#state !== 'ready') {
      throw new RxDBAdapterSqliteError(
        `${this.clientName} client has not been initialized; call init(dbName) and await it before execute()`
      );
    }
    return this.#enqueue(sql, bindings);
  }

  /** 加载并初始化底层的 sqlite-wasm 模块。 */
  protected abstract loadModule(options?: TLoadOptions): Promise<Oo1Static>;

  /**
   * 把 `sqlite3_update_hook` 输出的 rowId 统一成 bigint。
   *
   * `@sqlite.org/sqlite-wasm` 在 rowId 较小时可能给出普通 `number`，
   * 官方客户端会覆盖本方法强制转成 `bigint`；运行时本身总输出 `bigint` 的子类可以保留默认。
   */
  protected normalizeRowId(rowId: number | bigint): bigint {
    return typeof rowId === 'bigint' ? rowId : BigInt(rowId);
  }

  /**
   * 把一条 SQL 排进串行队列执行，不做状态检查。
   *
   * `init` 阶段的 PRAGMA 走这里而不是 {@link execute}：此刻状态是 `initializing`，
   * 公开的 `execute()` 会拒绝，而队列与连接对内部路径已经就绪。
   */
  #enqueue(sql: string, bindings?: SQLiteCompatibleType[]): Promise<SqliteResult> {
    const queue = this.#queue;
    if (!queue) {
      throw new RxDBAdapterSqliteError(`${this.clientName} client task queue is unavailable`);
    }
    return queue.addTask(() => executeOo1Helper(this.clientName, this.db, sql, bindings));
  }

  async #init_sqlite(dbName: string, options: TLoadOptions | undefined, cacheSize: number): Promise<void> {
    this.sqlite3 = await this.loadModule(options);

    if (options?.opfs) {
      try {
        const OpfsDb = this.sqlite3.oo1.OpfsDb;
        if (!OpfsDb) {
          throw new RxDBAdapterSqliteError(`${this.clientName} runtime does not provide an OPFS database constructor`);
        }
        this.db = new OpfsDb(get_persistent_db_file_name(dbName));
      } catch (e) {
        if ((options.opfsFallback ?? 'throw') === 'throw') {
          throw e;
        }
        console.warn(`[${this.clientName}] OPFS database creation failed, falling back to in-memory database:`, e);
        this.db = new this.sqlite3.oo1.DB(':memory:');
      }
    } else {
      this.db = new this.sqlite3.oo1.DB(':memory:');
    }

    this.#register_custom_functions();

    await this.#enqueue(get_init_sql(cacheSize, !!options?.opfs));

    this.sqlite3.capi.sqlite3_update_hook(
      this.db,
      (_userCtx, op, dbName, tableName, rowId) => {
        if (!dbName || !tableName || !WATCH_TABLES.has(tableName)) return;

        this.#pending_events.push({
          type: op as SQLiteChangeType,
          dbName,
          tableName,
          rowId: this.normalizeRowId(rowId)
        });
        this.#schedule_batch_send();
      },
      0
    );
  }

  async #cleanup_after_init_failure(): Promise<void> {
    this.#clear_batch_timers();
    this.#pending_events.length = 0;

    const sqlite3 = this.sqlite3 as Oo1Static | undefined;
    const db = this.db as Oo1Database | undefined;
    const queue = this.#queue;

    if (sqlite3?.capi?.sqlite3_update_hook && db) {
      try {
        sqlite3.capi.sqlite3_update_hook(
          db,
          () => {
            /* 无操作 */
          },
          0
        );
      } catch {
        // 忽略清理失败，保留原始 init 错误
      }
    }

    if (queue) {
      try {
        await queue.waitForAll();
      } catch {
        // 忽略清理失败，保留原始 init 错误
      }
    }

    if (db) {
      try {
        db.close();
      } catch {
        // 忽略清理失败，保留原始 init 错误
      }
    }

    this.#queue = undefined;
    this.#state = 'idle';
    this.#init_promise = undefined;
  }

  /**
   * 防抖 + 硬上限调度：每次新事件重置 `#batch_timer`（合并连续变更）；
   * `#max_wait_timer` 只在批次首个事件时启动一次，不随后续事件重置，
   * 保证持续写入下最多 {@link MAX_BATCH_WAIT_MS} 后必定强制 flush 一次。
   */
  #schedule_batch_send(): void {
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
   * 派发并清空当前批次。
   *
   * @remarks
   * 队列必须在派发**之前**原子换出，监听器异常也必须逐条隔离。
   * 早先是「派发完所有分组后再 `pending.length = 0`」，任一监听器抛错就跳过清空：
   * 旧批次留在 `#pending_events` 里，下一次 flush 连同新事件一起重发，
   * 上层把同一条变更处理两遍；而调用点是 `setTimeout` 回调，异常还是未捕获的。
   */
  #flush_pending_events(): void {
    // 单次扫描按 (type, dbName, tableName) 分组，避免 Object.groupBy 产生中间对象与二次 rowId 映射
    const pending = this.#pending_events;
    if (pending.length === 0) return;
    this.#pending_events = [];

    type PendingEvent = (typeof pending)[number];
    interface Group {
      event: PendingEvent;
      rowIds: bigint[];
    }
    const groups = new Map<string, Group>();
    for (let i = 0; i < pending.length; i++) {
      const event = pending[i];
      const key = `${event.type}_${event.dbName}_${event.tableName}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rowIds.push(event.rowId);
      } else {
        groups.set(key, { event, rowIds: [event.rowId] });
      }
    }

    for (const { event, rowIds } of groups.values()) {
      // 监听器异常仅隔离并 log：一个订阅者的 bug 不得吃掉其余分组，也不得让批次卡住重放
      try {
        this.dispatchEvent(event.type, {
          type: event.type,
          dbName: event.dbName,
          tableName: event.tableName,
          rowIds,
          recordAt: new Date()
        });
      } catch (err) {
        console.error(`[${this.clientName}] change event listener failed for ${event.tableName}:`, err);
      }
    }
  }

  /**
   * 注册 SQL 侧自定义函数。
   *
   * 契约（有意降级，测试锁定）：
   * - `regexp` 编译/匹配失败 → warn + `0`（不匹配），避免非法 pattern 炸穿查询。
   * - `regexp_replace` 失败 → warn + 原文；参数不足 → `''`。
   * 调用方若需严格失败，应在应用层校验 pattern，而非依赖 SQL 抛错。
   */
  #register_custom_functions(): void {
    this.db.createFunction('regexp', (_ctxPtr: unknown, ...values: unknown[]) => {
      try {
        const re = get_cached_regexp(String(values[0]));
        return re.test(String(values[1])) ? 1 : 0;
      } catch (err) {
        console.warn(`[${this.clientName}] regexp(${String(values[0])}) failed:`, err);
        return 0;
      }
    });

    this.db.createFunction('regexp_replace', (_ctxPtr: unknown, ...args: unknown[]) => {
      if (args.length < 3) return '';
      try {
        const pattern = String(args[0]);
        const text = String(args[1]);
        const replacement = String(args[2]);
        const flags = args.length > 3 ? String(args[3]) : '';
        return text.replace(get_cached_regexp(pattern, flags), replacement);
      } catch (err) {
        console.warn(`[${this.clientName}] regexp_replace(${String(args[0])}) failed:`, err);
        return String(args[1]);
      }
    });

    // `rxdb_fts_bigram(text)`：FTS5 写入侧的 CJK bigram 变换，由
    // `@aiao/rxdb-plugin-search` 生成的 trigger 与 backfill SQL 调用。
    // 与查询侧 `compileCjkToken` 共用同一份实现——两侧切分方式只要不一致，索引就整体失配。
    // NULL 原样返回（FTS5 视作空内容），非 CJK 文本零改动。
    this.db.createFunction(FTS_BIGRAM_SQL_FUNCTION, (_ctxPtr: unknown, ...args: unknown[]) => {
      const value = args[0];
      if (value === null || value === undefined) return null;
      return indexTextForFts(String(value));
    });
  }
}
