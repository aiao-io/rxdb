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
  DEFAULT_BATCH_TIMEOUT,
  DEFAULT_CACHE_SIZE_KB,
  get_init_sql,
  isReadOnlyStatement,
  MAX_BATCH_WAIT_MS,
  SQLiteChangeType,
  validateSqliteNumericOption,
  WATCH_TABLES,
  type SqliteChangeEvent,
  type SQLiteCompatibleType,
  type SqliteData,
  type SqliteResult
} from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { constants, DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from 'node:sqlite';
import { splitSqliteScript } from './sqlite-script.js';

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
   * 在产生变更的语句返回**之后**的任务里调用（批处理见 {@link NodeSqliteEngineOptions.batchTimeout}），
   * 唯一的例外是 {@link NodeSqliteEngine.close} 里的收尾 flush。实现方不该抛错——
   * 此刻写入早已落库，没有任何调用方还能对失败做出反应；真抛了也只会被隔离并 log，
   * 既不会中断同批次的其余分组，也不会传播给写入方。
   */
  readonly onChange: (event: SqliteChangeEvent) => void;
  /** SQLite page cache 大小（KB），默认 {@link DEFAULT_CACHE_SIZE_KB}。 */
  readonly cacheSizeKb?: number;
  /**
   * 变更事件的防抖窗口（毫秒），默认 {@link DEFAULT_BATCH_TIMEOUT}。
   *
   * @remarks
   * 与 wasm 后端的同名选项同义：窗口内的连续写入合并成一次派发。0 表示下一个宏任务立即派发。
   */
  readonly batchTimeout?: number;
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
  [14, 'open_failed'], // SQLITE_CANTOPEN
  [5, 'database_busy'], // SQLITE_BUSY
  [6, 'database_busy'] // SQLITE_LOCKED
]);

/**
 * 授权器拒绝的 opcode：会让 SQLite 自己再打开一个数据库文件的那些。
 *
 * @remarks
 * host 只解析 `open` 请求里的逻辑库名，物理路径不受 renderer 控制；但 SQL 本身是透传的
 * （`rawQuery()` 和事务内的 `execute()` 都要求这一点），`ATTACH DATABASE` 能让 SQLite 绕过
 * 那次路径解析，直接按语句里的字面量打开任意可访问文件。`VACUUM INTO` 不含 ATTACH 关键字，
 * 但 SQLite 同样走 {@link constants.SQLITE_ATTACH} 授权码，所以一并被这条规则挡住——
 * 这正是必须用授权器而不是正则扫 SQL 的原因。
 *
 * 只封文件级 opcode，DDL/DML/事务/PRAGMA/TEMP 触发器全部照旧放行，库内能力不受影响。
 */
const DENIED_ACTION_CODES = new Set<number>([constants.SQLITE_ATTACH, constants.SQLITE_DETACH]);

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

/** 读一条形如 `SELECT changes()` 的单值计数语句。 */
const readCounter = (statement: StatementSync): number => {
  const [row] = statement.all() as unknown as number[][];
  return Number(row?.[0] ?? 0);
};

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

type BatchTimer = ReturnType<typeof setTimeout> & { unref?: () => void };

/**
 * 启动一个不阻止宿主进程退出的定时器。
 *
 * @remarks
 * 待发的变更通知不该把 Electron 主进程多吊住几十毫秒；正常关停路径由
 * {@link NodeSqliteEngine.close} 的同步 flush 兜底，不依赖这个定时器跑到。
 */
const startBatchTimer = (callback: () => void, delay: number): BatchTimer => {
  const timer: BatchTimer = setTimeout(callback, delay);
  timer.unref?.();
  return timer;
};

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
  readonly #batchTimeout: number;
  readonly #watchedTables = new Set<string>();
  /** 当前批次累积的行变更，按「变更类型 + 表」分组。 */
  readonly #pendingChanges = new Map<string, { type: SQLiteChangeType; tableName: string; rowIds: bigint[] }>();
  #batchTimer?: BatchTimer;
  #maxWaitTimer?: BatchTimer;
  #changesStatement?: StatementSync;
  #totalChangesStatement?: StatementSync;
  #closed = false;

  private constructor(db: DatabaseSync, options: NodeSqliteEngineOptions) {
    this.#db = db;
    this.#dbName = options.dbName;
    this.#onChange = options.onChange;
    this.#batchTimeout = validateSqliteNumericOption('batchTimeout', options.batchTimeout, DEFAULT_BATCH_TIMEOUT, {
      allowZero: true
    });
  }

  /**
   * 打开（必要时创建）一个数据库文件。
   *
   * @remarks
   * 打不开就抛错，**绝不**回退到内存库或另一个位置：用户必须能确信数据确实写进了
   * 他指定的那个文件（AC#4）。初始化中途失败时会把已开的句柄关掉，不留悬挂连接。
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

    try {
      // 构造也在 try 里：选项校验失败同样必须把刚开的句柄关掉，否则文件被一直锁住。
      const engine = new NodeSqliteEngine(db, options);
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
   * 结果形状与 `executeOo1Helper` 逐字对齐（AC#2）：至多一个结果集，且只在语句真的产出列时才有；
   * 只读语句的 `rowsAffected` 恒为 0，不泄漏上一条写语句遗留的计数。
   *
   * 多语句脚本逐条 prepare 执行（切分见 {@link splitSqliteScript}），但**不接受绑定参数**：
   * 参数属于其中某一条语句，静默绑到第一条只会把数据写错位；wasm 后端同样拒绝这个组合。
   *
   * @param sql - 待执行的 SQL
   * @param bindings - 位置绑定参数
   * @returns 与 sqlite 核心一致的执行结果
   * @throws {@link RxDBAdapterDesktopError} 会话已关闭、多语句带参、或 SQL 执行失败时
   */
  execute(sql: string, bindings: readonly SQLiteCompatibleType[] = []): SqliteResult {
    this.#assertOpen();
    const startedAt = performance.now();
    const statements = splitSqliteScript(sql);
    if (statements.length > 1 && bindings.length > 0) {
      throw new RxDBAdapterDesktopError(
        'protocol_violation',
        `multi statement scripts cannot carry bindings, got ${bindings.length} for SQL "${sql}"`
      );
    }

    // 前一次是为别的连接刚建好的系统表补装触发器，后一次是为本条语句自己建的表补装。
    this.#ensureNotifyTriggers();
    const { results, rowsAffected } = this.#runStatements(statements, bindings);
    this.#ensureNotifyTriggers();
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
   * 关闭前回滚尚未提交的事务并做一次 TRUNCATE checkpoint（AC#7）：前者避免把半截状态留给下次启动，
   * 后者把 WAL 内容并回主库文件，使调用方随后可以直接重命名/备份这个 `.sqlite3`，
   * 而不必额外搬运 `-wal` / `-shm` 旁文件。
   *
   * 还攒在批次里的变更事件在这里**同步**发掉，与 `Oo1ClientBase.disconnect` 一致：
   * 定时器随连接一起消失，不发就等于把最后一批写入的通知悄悄吞掉。
   *
   * 重复调用是安全的。
   */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#flushNow();
    try {
      this.#rollbackOpenTransaction();
      this.#db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } finally {
      this.#changesStatement = undefined;
      this.#totalChangesStatement = undefined;
      this.#db.close();
    }
  }

  /**
   * 装好变更通知函数并跑一遍初始化 pragma。
   *
   * @remarks
   * 这里**故意不设** `PRAGMA busy_timeout`：`node:sqlite` 是同步接口，等锁就是同步自旋，
   * 而桌面路径上所有窗口的连接都活在 Electron 主进程的同一条线程上。持锁那个窗口的
   * `COMMIT` 是一个还排在事件循环里的 JS 续体——线程被 busy_timeout 占住，它就永远轮不到，
   * 于是必然等满整个超时再失败，中途整个应用还是冻的。撞锁只能在**异步**层面退让重试，
   * 见 `createElectronSqliteHost` 里的 busy 重试。
   */
  #initialize(cacheSizeKb: number): void {
    // 先装授权器再跑任何 SQL：初始化本身也走同一条边界，不给「初始化期间不设防」留窗口。
    this.#db.setAuthorizer(actionCode =>
      DENIED_ACTION_CODES.has(actionCode) ? constants.SQLITE_DENY : constants.SQLITE_OK
    );
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

  /**
   * 逐条执行脚本里的语句，只保留**第一条产出行**的语句的结果集。
   *
   * @remarks
   * 「只留第一条」是照着 oo1 的 `db.exec` 抄的：它遇到第一个 `columnCount > 0` 的语句后就
   * 不再收集，因此 wasm 后端的一次 `execute()` 至多返回一个 {@link SqliteData}。
   * 桌面端与之对齐，上层才不必分后端处理。
   *
   * 走到这里时 `bindings` 非空即意味着只有一条语句（多语句带参已在 {@link NodeSqliteEngine.execute} 拒绝）。
   *
   * 影响行数**逐条累加**，与 wasm 后端 `execute_helper.ts` 的
   * `rowsAffected += sqlite3.changes(db)` 同形：`changes()` 只反映最后一条语句，
   * 拿它当整个脚本的答案，`DELETE a; DELETE b;` 会漏掉前一条。
   */
  #runStatements(
    statements: readonly string[],
    bindings: readonly SQLiteCompatibleType[]
  ): { results: SqliteData[]; rowsAffected: number } {
    const results: SqliteData[] = [];
    let rowsAffected = 0;
    for (const statement of statements) {
      const totalChangesBefore = this.#totalChanges();
      const data = this.#runSingleStatement(statement, bindings);
      rowsAffected += this.#statementRowsAffected(statement, totalChangesBefore);
      if (results.length === 0) results.push(...data);
    }
    return { results, rowsAffected };
  }

  /**
   * 单条语句影响的行数。
   *
   * @remarks
   * `changes()` 只被 INSERT / UPDATE / DELETE 重置。任何别的语句跑完，它仍然是**上一条写语句**
   * 留下的数字——SQLC-030 记的就是这类事故。只读语句由 {@link isReadOnlyStatement} 挡掉；
   * DDL、PRAGMA、`BEGIN` / `COMMIT` 这些既不是只读、又不改行的语句挡不住，于是再用
   * `total_changes()` 兜一层：它单调递增且只记真正改动的行，一条语句前后不变就说明它一行没动，
   * 此时 `changes()` 必然是遗留值。
   *
   * 兜底只用来判断「动没动」，报出去的仍是 `changes()`：两者对触发器与外键级联的口径不同
   * （`total_changes()` 把它们算进去，`changes()` 不算），换成差值会悄悄改变级联删除的返回值。
   *
   * @param sql - 单条语句
   * @param totalChangesBefore - 执行前的 `total_changes()`
   * @returns 该语句影响的行数
   */
  #statementRowsAffected(sql: string, totalChangesBefore: number): number {
    if (isReadOnlyStatement(sql) || this.#totalChanges() === totalChangesBefore) return 0;
    return this.#changes();
  }

  #statementError(sql: string, error: unknown): RxDBAdapterDesktopError {
    return new RxDBAdapterDesktopError(
      classify(error, 'statement_failed'),
      `desktop database ${this.#dbName} failed for SQL "${sql}": ${messageOf(error)}`,
      { cause: error }
    );
  }

  #changes(): number {
    this.#changesStatement ??= this.#prepareCounterStatement('SELECT changes()');
    return readCounter(this.#changesStatement);
  }

  #totalChanges(): number {
    this.#totalChangesStatement ??= this.#prepareCounterStatement('SELECT total_changes()');
    return readCounter(this.#totalChangesStatement);
  }

  #prepareCounterStatement(sql: string): StatementSync {
    const statement = this.#db.prepare(sql);
    statement.setReturnArrays(true);
    return statement;
  }

  #recordChange(type: SQLiteChangeType, tableName: string, rowId: bigint): void {
    const key = `${type} ${tableName}`;
    const pending = this.#pendingChanges.get(key);
    if (pending) pending.rowIds.push(rowId);
    else this.#pendingChanges.set(key, { type, tableName, rowIds: [rowId] });
    this.#scheduleFlush();
  }

  /**
   * 防抖 + 硬上限调度，与 `Oo1ClientBase.#schedule_batch_send` 同一套语义。
   *
   * @remarks
   * 本方法是在**触发器体内**被调用的——此刻语句还在执行，事务还开着，行还没提交。
   * 早先在 `execute()` 末尾同步 flush，订阅者因此会在提交前就被叫醒去回查这些 rowid，
   * 回查请求排在写入之后，事件相对后续写入整体晚一拍；wasm 后端从来是把事件推到之后的
   * 宏任务里的，桌面端跟着做，同一份上层代码在两个后端上才会有同样的时序（AC#2）。
   *
   * `#batchTimer` 每来一个事件就重置（合并连续写入），`#maxWaitTimer` 只在批次首个事件时
   * 启动一次且不再重置，保证持续写入下最多 {@link MAX_BATCH_WAIT_MS} 必定强制发一次。
   */
  #scheduleFlush(): void {
    if (this.#batchTimer) clearTimeout(this.#batchTimer);
    this.#batchTimer = startBatchTimer(() => this.#flushNow(), this.#batchTimeout);
    this.#maxWaitTimer ??= startBatchTimer(() => this.#flushNow(), MAX_BATCH_WAIT_MS);
  }

  #flushNow(): void {
    this.#clearBatchTimers();
    this.#flushChanges();
  }

  #clearBatchTimers(): void {
    if (this.#batchTimer) clearTimeout(this.#batchTimer);
    if (this.#maxWaitTimer) clearTimeout(this.#maxWaitTimer);
    this.#batchTimer = undefined;
    this.#maxWaitTimer = undefined;
  }

  /**
   * 派发并清空当前批次，与 `Oo1ClientBase.#flush_pending_events` 同一套语义。
   *
   * @remarks
   * 队列必须在派发**之前**原子换出：留到派发之后再清，任一监听器抛错都会把整批留在
   * `#pendingChanges` 里，下次 flush 连同新事件一起重发，上层把同一条变更处理两遍。
   *
   * 回调异常逐分组隔离并 log：调用点是定时器回调，异常逃出去就是主进程的未捕获异常，
   * 一个订阅者的 bug 会连带整个 Electron 应用一起崩，而此刻写入其实早已落库。
   */
  #flushChanges(): void {
    if (this.#pendingChanges.size === 0) return;
    const batch = [...this.#pendingChanges.values()];
    this.#pendingChanges.clear();
    const recordAt = new Date();
    for (const { type, tableName, rowIds } of batch) {
      try {
        this.#onChange({ type, dbName: 'main', tableName, rowIds, recordAt });
      } catch (error) {
        console.error(`[NodeSqliteEngine] change event listener failed for ${tableName}:`, error);
      }
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
   * 库文件，因此不会污染他自己的 schema（AC#6），也不会被别的程序看见。
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

  /**
   * 回滚尚未提交的事务；没有事务时什么都不做。
   *
   * @remarks
   * 先问状态再决定发不发 `ROLLBACK`，而不是无条件发了再按 SQLite 的报错文案豁免——
   * 那句文案是实现细节，SQLite 改一个字这里就会把「没有事务」当成真故障抛出去，
   * 而这是关闭路径上最常见的正常情况。`isTransaction` 包的是
   * `sqlite3_get_autocommit()`，是同一个判据的稳定问法。
   */
  #rollbackOpenTransaction(): void {
    if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
  }
}
