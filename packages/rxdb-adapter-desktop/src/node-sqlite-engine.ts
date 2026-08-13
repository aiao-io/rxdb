/**
 * 基于 `node:sqlite` 的桌面 SQLite 引擎，运行在 host 侧（Electron 主进程 / worker）。
 *
 * @remarks
 * `node:sqlite` 是**同步**接口，因此本类的所有方法都是同步的：一次 `execute()` 在返回前
 * 已经跑完。异步语义留给上层的 host dispatcher，由它决定跑在哪个线程。
 *
 * @module node-sqlite-engine
 */

import {
  DEFAULT_CACHE_SIZE_KB,
  get_init_sql,
  isReadOnlyStatement,
  normalizeSingleStatementSql,
  SQLiteChangeType,
  WATCH_TABLES,
  type SqliteChangeEvent,
  type SqliteData,
  type SQLiteCompatibleType,
  type SqliteResult
} from '@aiao/rxdb-adapter-sqlite-core';
import { DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from 'node:sqlite';
import { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from './desktop-error.js';

/** {@link NodeSqliteEngine.open} 的入参。 */
export interface NodeSqliteEngineOptions {
  /** 数据库文件的绝对物理路径，由 host 在应用数据目录内解析得出。 */
  readonly filePath: string;
  /** 逻辑数据库名，仅用于变更事件的诊断字段。 */
  readonly dbName: string;
  /**
   * 变更事件回调。
   *
   * @remarks
   * 在写语句返回**之前**同步调用。实现方不得抛错：此刻写入已经落库，抛错会让调用方
   * 误以为这次写失败而重试。
   */
  readonly onChange: (event: SqliteChangeEvent) => void;
  /** SQLite page cache 大小（KB），默认 {@link DEFAULT_CACHE_SIZE_KB}。 */
  readonly cacheSizeKb?: number;
}

/** 注册给 SQLite 的通知函数名；触发器体内调用它把行变更捎回 JS。 */
const NOTIFY_FUNCTION_NAME = 'rxdb_desktop_notify';

/** TEMP 触发器名前缀，方便诊断时一眼认出是本适配器装的。 */
const TRIGGER_PREFIX = 'rxdb_desktop_notify';

const NOTIFY_OPERATIONS = [
  { type: SQLiteChangeType.SQLITE_INSERT, event: 'INSERT', row: 'NEW' },
  { type: SQLiteChangeType.SQLITE_UPDATE, event: 'UPDATE', row: 'NEW' },
  { type: SQLiteChangeType.SQLITE_DELETE, event: 'DELETE', row: 'OLD' }
] as const;

/** SQLite 主结果码 → 桌面错误码。未列出的一律算语句自身失败。 */
const SQLITE_ERROR_CODES = new Map<number, RxDBAdapterDesktopErrorCode>([
  [3, 'permission_denied'], // SQLITE_PERM
  [8, 'permission_denied'], // SQLITE_READONLY
  [23, 'permission_denied'], // SQLITE_AUTH
  [11, 'database_corrupted'], // SQLITE_CORRUPT
  [26, 'database_corrupted'], // SQLITE_NOTADB
  [14, 'open_failed'] // SQLITE_CANTOPEN
]);

const NO_ACTIVE_TRANSACTION = 'cannot rollback - no transaction is active';

const readErrcode = (error: unknown): number | undefined => {
  const errcode = (error as { errcode?: unknown }).errcode;
  return typeof errcode === 'number' ? errcode : undefined;
};

const classify = (error: unknown, fallback: RxDBAdapterDesktopErrorCode): RxDBAdapterDesktopErrorCode => {
  const errcode = readErrcode(error);
  if (errcode === undefined) return fallback;
  return SQLITE_ERROR_CODES.get(errcode) ?? fallback;
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 把绑定参数转成 `node:sqlite` 认识的形状；`number[]` 是 blob 的等价写法。 */
const toSupportedValue = (binding: SQLiteCompatibleType): SQLInputValue =>
  Array.isArray(binding) ? Uint8Array.from(binding) : binding;

/**
 * 校验通知函数收到的三个参数。
 *
 * @remarks
 * 调用方只有本文件生成的触发器 SQL，形状对不上只可能是本文件自身的缺陷。宁可让这次写入失败，
 * 也不能默默丢掉一个变更事件：丢事件会让 renderer 的缓存与库里的真实状态无声分叉。
 */
const notifyArguments = (
  type: SQLOutputValue,
  tableName: SQLOutputValue,
  rowId: SQLOutputValue
): [SQLiteChangeType, string, bigint] => {
  if (typeof type !== 'bigint' || typeof tableName !== 'string' || typeof rowId !== 'bigint') {
    throw new RxDBAdapterDesktopError(
      'host_internal_error',
      `the notify trigger passed (${typeof type}, ${typeof tableName}, ${typeof rowId}) instead of (bigint, string, bigint)`
    );
  }
  return [Number(type) as SQLiteChangeType, tableName, rowId];
};

/**
 * 把读回的值归一化成 `SQLiteCompatibleType`。
 *
 * @remarks
 * 语句上开了 `setReadBigInts(true)`，否则超出 `Number.MAX_SAFE_INTEGER` 的整数会静默丢精度。
 * 代价是**所有**整数都变成 `bigint`，连 rowid、`COUNT(*)` 也不例外，上层将被迫到处判类型。
 * 因此这里把安全范围内的整数降回 `number`，与 sqlite-wasm 后端读到的类型保持一致——
 * 同一份仓储代码在两个后端上必须看到同样的值。
 */
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const normalizeValue = (value: unknown): SQLiteCompatibleType => {
  if (typeof value !== 'bigint') return value as SQLiteCompatibleType;
  return value >= MIN_SAFE_BIGINT && value <= MAX_SAFE_BIGINT ? Number(value) : value;
};

const normalizeRow = (row: readonly unknown[]): SQLiteCompatibleType[] => row.map(normalizeValue);

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * 单个数据库连接。
 *
 * @remarks
 * 一个会话一个连接，不共享：两个窗口若共用一条连接，它们的 `BEGIN` 块会互相穿插，
 * 事务隔离直接失效。各自持有连接后，跨窗口的并发交给 SQLite 自己的文件锁与写者租约处理。
 */
export class NodeSqliteEngine {
  readonly #db: DatabaseSync;
  readonly #dbName: string;
  readonly #onChange: (event: SqliteChangeEvent) => void;
  readonly #watchedTables = new Set<string>();
  /** 本次 `execute()` 期间累积的行变更，按「变更类型 + 表」分组。 */
  readonly #pendingChanges = new Map<string, { type: SQLiteChangeType; tableName: string; rowIds: bigint[] }>();
  #changesStatement?: StatementSync;
  #closed = false;

  private constructor(db: DatabaseSync, options: NodeSqliteEngineOptions) {
    this.#db = db;
    this.#dbName = options.dbName;
    this.#onChange = options.onChange;
  }

  /**
   * 打开（必要时创建）一个数据库文件。
   *
   * @remarks
   * 打不开就抛错，**绝不**回退到内存库或另一个位置：用户必须能确信数据确实写进了
   * 他指定的那个文件（AC#6）。初始化中途失败时会把已开的句柄关掉，不留悬挂连接。
   *
   * @param options - 引擎配置
   * @returns 已完成初始化、已装好变更通知的引擎
   * @throws {@link RxDBAdapterDesktopError} code 为 `open_failed` / `permission_denied` / `database_corrupted`
   */
  static open(options: NodeSqliteEngineOptions): NodeSqliteEngine {
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(options.filePath);
    } catch (error) {
      throw new RxDBAdapterDesktopError(
        classify(error, 'open_failed'),
        `failed to open desktop database ${options.dbName}: ${messageOf(error)}`,
        { cause: error }
      );
    }

    const engine = new NodeSqliteEngine(db, options);
    try {
      engine.#initialize(options.cacheSizeKb ?? DEFAULT_CACHE_SIZE_KB);
      return engine;
    } catch (error) {
      db.close();
      throw new RxDBAdapterDesktopError(
        classify(error, 'open_failed'),
        `failed to initialize desktop database ${options.dbName}: ${messageOf(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * 执行一条或一组 SQL。
   *
   * @remarks
   * 结果形状与 `executeOo1Helper` 逐字对齐（AC#4）：至多一个结果集，且只在语句真的产出列时才有；
   * 只读语句的 `rowsAffected` 恒为 0，不泄漏上一条写语句遗留的计数。
   *
   * 多语句脚本不接受绑定参数：`node:sqlite` 的 `exec()` 无法绑参，逐条 prepare 又需要可靠地
   * 切分 SQL（字符串字面量里的 `;` 会切错），与其猜不如直接拒绝。
   *
   * @param sql - 待执行的 SQL
   * @param bindings - 位置绑定参数
   * @returns 与 sqlite 核心一致的执行结果
   * @throws {@link RxDBAdapterDesktopError} 会话已关闭、多语句带参、或 SQL 执行失败时
   */
  execute(sql: string, bindings: readonly SQLiteCompatibleType[] = []): SqliteResult {
    this.#assertOpen();
    const startedAt = performance.now();
    const isSingleStatement = !normalizeSingleStatementSql(sql).includes(';');
    if (!isSingleStatement && bindings.length > 0) {
      throw new RxDBAdapterDesktopError(
        'protocol_violation',
        `multi statement scripts cannot carry bindings, got ${bindings.length} for SQL "${sql}"`
      );
    }

    // 前一次是为别的连接刚建好的系统表补装触发器，后一次是为本条语句自己建的表补装。
    this.#ensureNotifyTriggers();
    const results = isSingleStatement ? this.#runSingleStatement(sql, bindings) : this.#runScript(sql);
    const rowsAffected = isReadOnlyStatement(sql) ? 0 : this.#changes();
    this.#ensureNotifyTriggers();
    this.#flushChanges();
    return { sql, rowsAffected, elapsed: performance.now() - startedAt, results };
  }

  /**
   * 报告底层 SQLite 引擎版本。
   *
   * @returns 形如 `3.50.4` 的版本串
   */
  version(): string {
    this.#assertOpen();
    const [row] = this.#runSingleStatement('SELECT sqlite_version()', []);
    return String(row?.rows[0]?.[0]);
  }

  /**
   * 断开连接并释放文件句柄。
   *
   * @remarks
   * 关闭前回滚尚未提交的事务并做一次 TRUNCATE checkpoint（AC#9）：前者避免把半截状态留给下次启动，
   * 后者把 WAL 内容并回主库文件，使调用方随后可以直接重命名/备份这个 `.sqlite3`，
   * 而不必额外搬运 `-wal` / `-shm` 旁文件。
   *
   * 重复调用是安全的。
   */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#rollbackOpenTransaction();
      this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      this.#changesStatement = undefined;
      this.#pendingChanges.clear();
      this.#db.close();
    }
  }

  #initialize(cacheSizeKb: number): void {
    this.#db.function(
      NOTIFY_FUNCTION_NAME,
      // directOnly:false 是关键——默认值会禁止在触发器体内调用本函数。
      // useBigIntArguments:true 保证 rowid 原样送达，不会在 2^53 处丢位。
      // varargs:false 时 node 用 fn.length 决定形参个数，因此这三个形参必须写全，不能改成 rest。
      { deterministic: false, directOnly: false, useBigIntArguments: true, varargs: false },
      (type: SQLOutputValue, tableName: SQLOutputValue, rowId: SQLOutputValue): null => {
        this.#recordChange(...notifyArguments(type, tableName, rowId));
        return null;
      }
    );
    // 单文件数据库始终按持久化档位配置：WAL + synchronous=NORMAL。
    this.#db.exec(get_init_sql(cacheSizeKb, true));
    this.#ensureNotifyTriggers();
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new RxDBAdapterDesktopError('session_closed', `desktop database ${this.#dbName} is already closed`);
    }
  }

  #runSingleStatement(sql: string, bindings: readonly SQLiteCompatibleType[]): SqliteData[] {
    try {
      const statement = this.#db.prepare(sql);
      statement.setReturnArrays(true);
      statement.setReadBigInts(true);
      const rows = statement.all(...bindings.map(toSupportedValue)) as unknown as unknown[][];
      const columns = statement.columns().map(column => column.name);
      return columns.length > 0 ? [{ columns, rows: rows.map(normalizeRow) }] : [];
    } catch (error) {
      throw this.#statementError(sql, error);
    }
  }

  #runScript(sql: string): SqliteData[] {
    try {
      this.#db.exec(sql);
      return [];
    } catch (error) {
      throw this.#statementError(sql, error);
    }
  }

  #statementError(sql: string, error: unknown): RxDBAdapterDesktopError {
    return new RxDBAdapterDesktopError(
      classify(error, 'statement_failed'),
      `desktop database ${this.#dbName} failed for SQL "${sql}": ${messageOf(error)}`,
      { cause: error }
    );
  }

  #changes(): number {
    this.#changesStatement ??= this.#prepareChangesStatement();
    const [row] = this.#changesStatement.all() as unknown as number[][];
    return Number(row?.[0] ?? 0);
  }

  #prepareChangesStatement(): StatementSync {
    const statement = this.#db.prepare('SELECT changes()');
    statement.setReturnArrays(true);
    return statement;
  }

  #recordChange(type: SQLiteChangeType, tableName: string, rowId: bigint): void {
    const key = `${type} ${tableName}`;
    const pending = this.#pendingChanges.get(key);
    if (pending) {
      pending.rowIds.push(rowId);
      return;
    }
    this.#pendingChanges.set(key, { type, tableName, rowIds: [rowId] });
  }

  #flushChanges(): void {
    if (this.#pendingChanges.size === 0) return;
    const batch = [...this.#pendingChanges.values()];
    this.#pendingChanges.clear();
    const recordAt = new Date();
    for (const { type, tableName, rowIds } of batch) {
      this.#onChange({ type, dbName: 'main', tableName, rowIds, recordAt });
    }
  }

  /**
   * 为已经存在的系统表补装 TEMP 通知触发器。
   *
   * @remarks
   * 会话打开时这些表往往还不存在——它们由适配器初始化过程现建，所以触发器只能**惰性**安装。
   * 建表方可能是本连接，也可能是另一个窗口的连接，因此每条语句前后各检查一次：
   * 只在语句后检查会漏掉本连接开启前、由别的连接建好的表上的第一次写入。
   * 三张表全部装好后本方法直接返回，稳态下不再查 `sqlite_master`。
   *
   * 已知边界：同一条多语句脚本里先 `CREATE` 系统表再往里写，这次写入观察不到。
   * 适配器的建表与写入分属不同 `execute()`，不会踩到。
   *
   * 用 TEMP 触发器而非普通触发器：TEMP 对象只活在本连接的 temp schema 里，永远不会写进用户的
   * 库文件，因此不会污染他自己的 schema（AC#8），也不会被别的程序看见。
   */
  #ensureNotifyTriggers(): void {
    if (this.#watchedTables.size === WATCH_TABLES.size) return;
    const watched = [...WATCH_TABLES];
    const placeholders = watched.map(() => '?').join(', ');
    const statement = this.#db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
    );
    statement.setReturnArrays(true);
    const existing = statement.all(...watched) as unknown as string[][];
    for (const [tableName] of existing) {
      if (this.#watchedTables.has(tableName)) continue;
      this.#createNotifyTriggers(tableName);
      this.#watchedTables.add(tableName);
    }
  }

  #createNotifyTriggers(tableName: string): void {
    const table = quoteIdentifier(tableName);
    const literal = quoteLiteral(tableName);
    for (const { type, event, row } of NOTIFY_OPERATIONS) {
      const trigger = quoteIdentifier(`${TRIGGER_PREFIX}$${tableName}$${event}`);
      this.#db.exec(
        `CREATE TEMP TRIGGER IF NOT EXISTS ${trigger} AFTER ${event} ON ${table} ` +
          `BEGIN SELECT ${NOTIFY_FUNCTION_NAME}(${type}, ${literal}, ${row}.rowid); END;`
      );
    }
  }

  #rollbackOpenTransaction(): void {
    try {
      this.#db.exec('ROLLBACK');
    } catch (error) {
      // 没有活动事务是最常见的正常路径，只吞这一种；其它错误必须暴露出去。
      if (!messageOf(error).includes(NO_ACTIVE_TRANSACTION)) throw error;
    }
  }
}
