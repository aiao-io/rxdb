import type { RxDB, RxDBBackupCompatibility, RxDBBackupErrorCode, RxDBSystemVersionState } from '@aiao/rxdb';
import {
  getEntityMetadata,
  getRxDBBackupAuthDomain,
  getRxDBBackupSchemaFingerprint,
  getRxDBSystemVersionState,
  isRxDBBackupError,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_CODEC_WATERMARK_PREFIX,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RxDBBackupError,
  RxDBMigration
} from '@aiao/rxdb';
import type { SQLiteCompatibleType, SqliteResult } from '../sqlite-core.interface.js';
import type { SqliteClientLike } from '../sqlite-core.types.js';
import { get_table_name_by_metadata, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import {
  assertSqliteSchemaSql,
  SQLITE_BACKUP_SCHEMA_VERSION,
  SQLITE_RESTORE_MARKER_TABLE,
  SQLITE_ROWID_KEYWORDS,
  sqliteVirtualTableModule,
  type SqliteBackupObject,
  type SqliteBackupSchema,
  type SqliteBackupSequence,
  type SqliteBackupTable,
  type SqliteRowidKeyword,
  type SqliteSchemaSqlType
} from './sqlite-backup-sql.js';
import { SQLITE_BACKUP_ENGINE, SQLITE_BACKUP_ENGINE_COMPATIBILITY } from './sqlite-backup.interface.js';

/** 备份 / 恢复只需要执行 SQL 的能力。 */
export type SqliteBackupExecutor = Pick<SqliteClientLike, 'execute'>;

/** SQL 失败既不是空间不足也不是 I/O 错误时落到的分类。 */
export type SqliteBackupSqlFailure = Extract<RxDBBackupErrorCode, 'corrupt_archive' | 'io_error'>;

const STORAGE_FULL = /SQLITE_FULL|database or disk is full|QuotaExceeded/i;
const IO_ERROR = /SQLITE_IOERR|disk I\/O error/i;
/** SQLite 主结果码名：固定词表，放进脱敏后的信息里不会带出任何行内容。 */
const RESULT_CODE =
  /\bSQLITE_(?:ERROR|INTERNAL|PERM|ABORT|BUSY|LOCKED|NOMEM|READONLY|INTERRUPT|IOERR|CORRUPT|NOTFOUND|FULL|CANTOPEN|PROTOCOL|EMPTY|SCHEMA|TOOBIG|CONSTRAINT|MISMATCH|MISUSE|NOLFS|AUTH|FORMAT|RANGE|NOTADB)\b/g;
const MAX_CAUSE_DEPTH = 8;

/**
 * 沿 `cause` 链收集失败原因，去掉客户端包装里原样复述的 SQL。
 *
 * @remarks
 * 客户端把错误包成 `… failed for SQL "<sql>": <原因>`，跨 Comlink 时 `cause` 会丢，只剩这段文字。
 * 恢复时 `<sql>` 里是归档的行数据，必须先切掉，否则一行内容恰好写着 `SQLITE_FULL` 就会被误判。
 */
const failureReasons = (error: unknown, sql: string): string => {
  const marker = `failed for SQL "${sql}": `;
  const reasons: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth++) {
    const text = current instanceof Error ? `${current.name}: ${current.message}` : String(current);
    const at = text.indexOf(marker);
    reasons.push(at < 0 ? text : text.slice(at + marker.length));
    current = current instanceof Error ? current.cause : undefined;
  }
  return reasons.join('\n');
};

/**
 * 把一次 SQL 执行失败映射到稳定分类；已分类的原样返回。
 *
 * @remarks
 * 给了 `redactedAs` 时，信息里只有这段描述与 SQLite 结果码名，且不挂原始异常：恢复灌入的行 SQL 里是
 * 归档的行字面量，客户端包装会原样复述整条 SQL，驱动自己的 `near "<token>"` 也会复述其中的片段，
 * 任何一处进了日志或错误上报就等于把用户数据带了出去。
 *
 * @param error - 客户端抛出的异常
 * @param sql - 失败的那条 SQL
 * @param otherwise - 既不是空间不足也不是 I/O 错误时的分类：恢复时 SQLite 拒绝归档内容报 `corrupt_archive`，
 * 备份时读库失败报 `io_error`
 * @param redactedAs - SQL 含用户数据时代替它出现在信息里的描述（如 `rows of table "note"`）
 * @returns 分类后的错误；未脱敏时原始异常挂在 `cause` 上
 */
export const classifySqliteBackupFailure = (
  error: unknown,
  sql: string,
  otherwise: SqliteBackupSqlFailure,
  redactedAs?: string
): RxDBBackupError => {
  if (error instanceof RxDBBackupError) return error;
  const reasons = failureReasons(error, sql);
  let code: RxDBBackupErrorCode = otherwise;
  if (STORAGE_FULL.test(reasons)) code = 'storage_full';
  else if (IO_ERROR.test(reasons)) code = 'io_error';
  if (redactedAs !== undefined) {
    const resultCodes = [...new Set(reasons.match(RESULT_CODE))];
    const suffix = resultCodes.length > 0 ? ` (${resultCodes.join(', ')})` : '';
    return new RxDBBackupError(code, `SQLite rejected ${redactedAs}${suffix}`);
  }
  const statement = sql.length > 120 ? `${sql.slice(0, 120)}…` : sql;
  return new RxDBBackupError(code, `SQLite rejected "${statement}"`, { cause: error });
};

/**
 * 执行一条 SQL，失败按 {@link classifySqliteBackupFailure} 分类。
 *
 * @param executor - 客户端
 * @param sql - SQL
 * @param bindings - 绑定参数
 * @param otherwise - 兜不住时的分类
 * @param redactedAs - SQL 含用户数据时代替它出现在错误信息里的描述
 * @returns 执行结果
 */
export const runSqliteBackupSql = async (
  executor: SqliteBackupExecutor,
  sql: string,
  bindings: SQLiteCompatibleType[] | undefined,
  otherwise: SqliteBackupSqlFailure,
  redactedAs?: string
): Promise<SqliteResult> => {
  try {
    return await executor.execute(sql, bindings);
  } catch (error) {
    throw classifySqliteBackupFailure(error, sql, otherwise, redactedAs);
  }
};

/**
 * 执行一条查询并返回它的行。
 *
 * @param executor - 客户端
 * @param sql - 单条查询
 * @param bindings - 绑定参数
 * @param otherwise - 兜不住时的分类
 * @returns 行（数组形式）
 * @throws RxDBAdapterSqliteError 客户端没有返回结果集（违反客户端契约）
 */
export const selectSqliteRows = async (
  executor: SqliteBackupExecutor,
  sql: string,
  bindings: SQLiteCompatibleType[] | undefined,
  otherwise: SqliteBackupSqlFailure
): Promise<SQLiteCompatibleType[][]> => {
  const result = await runSqliteBackupSql(executor, sql, bindings, otherwise);
  const set = result.results[0];
  if (!set) throw new RxDBAdapterSqliteError(`SQLite client returned no result set for "${sql}"`);
  return set.rows;
};

/**
 * 取一个文本值。
 *
 * @param value - 结果集里的值
 * @param what - 错误信息里的字段名
 * @returns 文本
 * @throws RxDBAdapterSqliteError 不是文本（违反 SQLite 或客户端契约）
 */
export const sqliteTextValue = (value: SQLiteCompatibleType, what: string): string => {
  if (typeof value !== 'string') throw new RxDBAdapterSqliteError(`SQLite returned a non-text ${what}`);
  return value;
};

/**
 * 取转储查询返回的整行字面量字节。
 *
 * @remarks
 * 字面量按 BLOB 取回而不是按文本：SQLite 不校验 TEXT 的编码，驱动把非法 UTF-8 解码成文本时
 * 会悄悄换成 U+FFFD，调用方就无从发现这一行备份出去会走样。
 *
 * @param value - 转储查询结果的第一列
 * @returns 原样的字节
 */
export const sqliteRowLiteralBytes = (value: SQLiteCompatibleType): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new RxDBAdapterSqliteError('SQLite returned a non-blob row literal');
};

const integerOf = (value: SQLiteCompatibleType, what: string): number => {
  const number = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(number)) throw new RxDBAdapterSqliteError(`SQLite returned a non-integer ${what}`);
  return number as number;
};

const selectSingle = async (executor: SqliteBackupExecutor, sql: string): Promise<SQLiteCompatibleType> => {
  const rows = await selectSqliteRows(executor, sql, undefined, 'io_error');
  if (rows.length !== 1) throw new RxDBAdapterSqliteError(`SQLite returned ${rows.length} rows for "${sql}"`);
  return rows[0][0];
};

/**
 * 读 SQLite 引擎版本。
 *
 * @param executor - 客户端
 * @returns `sqlite_version()` 原文
 */
export const readSqliteEngineVersion = async (executor: SqliteBackupExecutor): Promise<string> =>
  sqliteTextValue(await selectSingle(executor, 'SELECT sqlite_version()'), 'engine version');

/**
 * 读当前连接注册的虚表模块。
 *
 * @param executor - 客户端
 * @returns 去重、小写、排序后的模块名
 */
export const readSqliteModules = async (executor: SqliteBackupExecutor): Promise<string[]> => {
  const rows = await selectSqliteRows(executor, 'SELECT name FROM pragma_module_list', undefined, 'io_error');
  return [...new Set(rows.map(row => sqliteTextValue(row[0], 'module name').toLowerCase()))].sort();
};

/**
 * 归档依赖的虚表模块：恢复端必须全部提供。
 *
 * @param schema - 归档结构
 * @returns 去重、小写、排序后的模块名
 * @throws RxDBBackupError `unsupported_combination` 取不到模块名的虚表语句
 */
export const sqliteArchiveExtensions = (schema: SqliteBackupSchema): string[] => {
  const modules = new Set<string>();
  for (const table of schema.tables) {
    if (table.kind !== 'virtual') continue;
    const module = sqliteVirtualTableModule(table.sql);
    if (module === null) {
      throw new RxDBBackupError('unsupported_combination', `Cannot tell the module of virtual table "${table.name}"`, {
        details: { field: 'sql', actual: table.sql }
      });
    }
    modules.add(module);
  }
  return [...modules].sort();
};

/**
 * 后端写不了影子表时，拒绝含影子表的结构。
 *
 * @remarks
 * 影子表只能按行原样恢复（见 {@link SqliteBackupTable}）。以 defensive 模式运行 SQLite 的后端改不了影子表，
 * 恢复不了这样的归档；备份端也据此拒绝，不产出一份同一 adapter 恢复不了的归档。
 *
 * @param schema - 源库或归档的结构
 * @param adapterName - adapter 名，写进错误信息
 * @throws RxDBBackupError `unsupported_combination`，`details.actual` 为结构里的虚表模块
 */
export const assertNoSqliteShadowTables = (schema: SqliteBackupSchema, adapterName: string): void => {
  const shadows = schema.tables.filter(table => table.kind === 'shadow').map(table => table.name);
  if (shadows.length === 0) return;
  throw new RxDBBackupError(
    'unsupported_combination',
    `Adapter "${adapterName}" cannot write the shadow tables ${shadows.join(', ')} of its virtual tables`,
    { details: { field: 'adapter.extensions', actual: sqliteArchiveExtensions(schema) } }
  );
};

/**
 * 读库里的系统表结构 / 变更编码水位。
 *
 * @param executor - 客户端
 * @param otherwise - 读失败时的分类：备份时是 `io_error`，恢复后核对时系统表缺失说明归档有问题，是 `corrupt_archive`
 * @returns 水位
 */
export const readSqliteSystemVersionState = async (
  executor: SqliteBackupExecutor,
  otherwise: SqliteBackupSqlFailure
): Promise<RxDBSystemVersionState> => {
  const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
  const rows = await selectSqliteRows(
    executor,
    `SELECT "name" FROM ${migrationTable} WHERE substr("name", 1, ?) = ? OR substr("name", 1, ?) = ?`,
    [
      RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.length,
      RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
      RXDB_CHANGE_CODEC_WATERMARK_PREFIX.length,
      RXDB_CHANGE_CODEC_WATERMARK_PREFIX
    ],
    otherwise
  );
  return getRxDBSystemVersionState(rows.map(row => sqliteTextValue(row[0], 'watermark name')));
};

/**
 * 目标侧的兼容性期望。
 *
 * @param rxdb - 目标实例（会被 `init()`，但不会连接）
 * @param adapterName - 目标 adapter 名
 * @param executor - 目标客户端，用来问它注册了哪些虚表模块
 * @returns 兼容性期望
 */
export const sqliteTargetCompatibility = async (
  rxdb: RxDB,
  adapterName: string,
  executor: SqliteBackupExecutor
): Promise<RxDBBackupCompatibility> => {
  rxdb.init();
  return {
    adapterName,
    engine: SQLITE_BACKUP_ENGINE,
    engineCompatibility: SQLITE_BACKUP_ENGINE_COMPATIBILITY,
    extensions: await readSqliteModules(executor),
    systemSchemaVersion: RXDB_SYSTEM_SCHEMA_VERSION,
    changeCodecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaFingerprint: getRxDBBackupSchemaFingerprint(rxdb),
    authDomain: getRxDBBackupAuthDomain(rxdb)
  };
};

// ─── 结构读取与转储计划 ──────────────────────────────────────────────────────

/**
 * 一张表的键集分页转储计划。
 *
 * @remarks
 * 每页结果的第一列是整行的字面量文本 `(v1,v2,…)`，其后是 `keyCount` 个键列的原值；
 * 下一页把上一页最后一行的键原样绑定回去。键在 SQLite 里唯一且非空，分页不重不漏。
 */
export interface SqliteTableDump {
  /** 在 {@link SqliteBackupSchema.tables} 里的下标。 */
  readonly table: number;
  readonly keyCount: number;
  /**
   * 绑定参数：`[limit]`。每行第一列是整行字面量的 UTF-8 字节（BLOB，见 {@link sqliteRowLiteralBytes}），
   * 其后是键列。
   */
  readonly firstPageSql: string;
  /** 绑定参数：`[...上一页最后一行的键, limit]`。 */
  readonly nextPageSql: string;
  /**
   * 绑定参数同 {@link firstPageSql}。每行只有一列：该行字面量字节数的保守上界，不构造字面量本身；
   * 转储据此决定下一页取几行，让单页回复不超过字节预算。
   */
  readonly firstSizeSql: string;
  /** 绑定参数同 {@link nextPageSql}，结果同 {@link firstSizeSql}。 */
  readonly nextSizeSql: string;
}

/** {@link readSqliteBackupSchema} 的结果。 */
export interface SqliteBackupPlan {
  readonly schema: SqliteBackupSchema;
  /** 需要转储行的表（虚表没有），按表的下标递增。 */
  readonly dumps: readonly SqliteTableDump[];
}

interface SqliteColumnInfo {
  readonly name: string;
  /** 在主键里的位置（从 1 开始），不在主键里为 0。 */
  readonly pk: number;
  /** 0 普通列；1 虚表隐藏列；2 / 3 生成列。 */
  readonly hidden: number;
}

const unsupported = (message: string, field: string, actual: unknown): RxDBBackupError =>
  new RxDBBackupError('unsupported_combination', message, { details: { field, actual } });

/** 单列的字面量：含 NUL 的文本 `quote()` 会截断，改用 hex 还原。 */
const literalOf = (column: string): string =>
  `CASE WHEN typeof(${column}) = 'text' AND instr(${column}, char(0)) > 0 ` +
  `THEN 'CAST(X''' || hex(${column}) || ''' AS TEXT)' ELSE quote(${column}) END`;

const TABLE_KINDS: Readonly<Record<string, SqliteBackupTable['kind']>> = {
  table: 'normal',
  virtual: 'virtual',
  shadow: 'shadow'
};

const readColumns = async (executor: SqliteBackupExecutor, table: string): Promise<SqliteColumnInfo[]> => {
  const rows = await selectSqliteRows(
    executor,
    'SELECT name, pk, hidden FROM pragma_table_xinfo(?)',
    [table],
    'io_error'
  );
  return rows.map(row => ({
    name: sqliteTextValue(row[0], 'column name'),
    pk: integerOf(row[1], 'primary key position'),
    hidden: integerOf(row[2], 'hidden flag')
  }));
};

/**
 * 读一张表参与转储的列（不含虚表隐藏列与生成列），按定义顺序。
 *
 * @param executor - 客户端
 * @param table - 表名
 * @returns 列名；表不存在时为空数组
 */
export const readSqliteDumpColumns = async (executor: SqliteBackupExecutor, table: string): Promise<string[]> =>
  (await readColumns(executor, table)).filter(column => column.hidden === 0).map(column => column.name);

/** 单列主键且没有 `origin = 'pk'` 的自动索引，就是 rowid 的别名。 */
const readRowidAlias = async (
  executor: SqliteBackupExecutor,
  table: string,
  columns: readonly SqliteColumnInfo[]
): Promise<string | null> => {
  const pk = columns.filter(column => column.pk > 0);
  if (pk.length !== 1) return null;
  const indexes = await selectSqliteRows(
    executor,
    "SELECT 1 FROM pragma_index_list(?) WHERE origin = 'pk'",
    [table],
    'io_error'
  );
  return indexes.length === 0 ? pk[0].name : null;
};

const freeRowidKeyword = (table: string, columns: readonly SqliteColumnInfo[]): SqliteRowidKeyword => {
  const names = new Set(columns.map(column => column.name.toLowerCase()));
  const keyword = SQLITE_ROWID_KEYWORDS.find(candidate => !names.has(candidate));
  if (keyword === undefined) {
    throw unsupported(`Table "${table}" shadows every rowid keyword`, 'columns', [...names]);
  }
  return keyword;
};

interface TableLayout {
  readonly table: SqliteBackupTable;
  /** 键列的 SQL 表达式。 */
  readonly keys: readonly string[];
}

const readTableLayout = async (
  executor: SqliteBackupExecutor,
  name: string,
  sql: string,
  listing: { readonly kind: SqliteBackupTable['kind']; readonly withoutRowid: boolean }
): Promise<TableLayout> => {
  if (listing.kind === 'virtual') {
    return { table: { name, kind: 'virtual', sql, columns: [], rowid: null }, keys: [] };
  }
  const info = await readColumns(executor, name);
  const columns = info.filter(column => column.hidden === 0).map(column => column.name);
  const table = (rowid: SqliteRowidKeyword | null): SqliteBackupTable => ({
    name,
    kind: listing.kind,
    sql,
    columns,
    rowid
  });
  if (listing.withoutRowid) {
    const pk = info.filter(column => column.pk > 0).sort((a, b) => a.pk - b.pk);
    return { table: table(null), keys: pk.map(column => quote_sql_identifier(column.name)) };
  }
  const alias = await readRowidAlias(executor, name, info);
  if (alias !== null) return { table: table(null), keys: [quote_sql_identifier(alias)] };
  const keyword = freeRowidKeyword(name, info);
  return { table: table(keyword), keys: [keyword] };
};

/**
 * 一列字面量字节数的上界：{@link literalOf} 的最长形式是十六进制（每字节两个字符）加定长外壳，
 * `quote()` 转义单引号也不超过两倍。`octet_length()`（SQLite 3.43+）只读记录头里的长度，
 * 不把 TEXT / BLOB 内容读出来，探测大行不会把它们整段读一遍。
 */
const literalBoundOf = (column: string): string => `(2 * ifnull(octet_length(${column}), 0) + 32)`;

const planDump = (layout: TableLayout, index: number): SqliteTableDump => {
  const { table, keys } = layout;
  const columns = [...table.columns.map(quote_sql_identifier), ...(table.rowid === null ? [] : [table.rowid])];
  const row = `CAST('(' || ${columns.map(literalOf).join(` || ',' || `)} || ')' AS BLOB)`;
  const bound = columns.map(literalBoundOf).join(' + ');
  const keyList = keys.join(', ');
  const tableName = quote_sql_identifier(table.name);
  const after = `WHERE (${keyList}) > (${keys.map(() => '?').join(', ')})`;
  const order = `ORDER BY ${keyList} LIMIT ?`;
  const from = `SELECT ${row}, ${keyList} FROM ${tableName}`;
  const sizes = `SELECT ${bound} FROM ${tableName}`;
  return {
    table: index,
    keyCount: keys.length,
    firstPageSql: `${from} ${order}`,
    nextPageSql: `${from} ${after} ${order}`,
    firstSizeSql: `${sizes} ${order}`,
    nextSizeSql: `${sizes} ${after} ${order}`
  };
};

/** 恢复端会拒绝的结构语句在备份时就拒绝，不产出一份恢复不了的归档。 */
const assertRestorableSql = (sql: string, type: SqliteSchemaSqlType, name: string): void => {
  try {
    assertSqliteSchemaSql(sql, type);
  } catch (error) {
    if (!isRxDBBackupError(error) || error.code !== 'corrupt_archive') throw error;
    throw unsupported(`Object "${name}" is not a single CREATE ${type.toUpperCase()} statement`, 'sql', name);
  }
};

/**
 * 文本转成 BLOB 得到的是库的原生编码字节，据此判断库编码（`PRAGMA encoding` 不返回结果集）。
 * 转储把整行字面量转成 BLOB 当 UTF-8 字节读，恢复端也按 UTF-8 执行，所以只接受 UTF-8 库。
 */
const ENCODING_SQL =
  "SELECT CASE hex(CAST('a' AS BLOB)) WHEN '61' THEN 'UTF-8' WHEN '6100' THEN 'UTF-16le' ELSE 'UTF-16be' END";

const assertUtf8Database = async (executor: SqliteBackupExecutor): Promise<void> => {
  const encoding = sqliteTextValue(await selectSingle(executor, ENCODING_SQL), 'encoding');
  if (encoding !== 'UTF-8') throw unsupported('Only UTF-8 databases can be backed up', 'encoding', encoding);
};

/**
 * 转储计划要求的最低 SQLite 版本：{@link literalBoundOf} 用到 `octet_length()`（3.43），
 * 读结构用到的 `pragma_table_list`（3.37）也在其内。
 */
const MIN_ENGINE_VERSION = { major: 3, minor: 43 } as const;

/** 更老的引擎在读结构时就判成组合不支持，而不是转储到一半因为缺函数被归成 `io_error`。 */
const assertSupportedEngine = async (executor: SqliteBackupExecutor): Promise<void> => {
  const version = await readSqliteEngineVersion(executor);
  const match = /^(\d+)\.(\d+)\./.exec(version);
  const major = match === null ? -1 : Number(match[1]);
  const minor = match === null ? -1 : Number(match[2]);
  const { major: minMajor, minor: minMinor } = MIN_ENGINE_VERSION;
  if (major > minMajor || (major === minMajor && minor >= minMinor)) return;
  throw new RxDBBackupError('unsupported_combination', `SQLite ${version} is too old to back up or restore`, {
    details: { field: 'adapter.engineVersion', expected: `>=${minMajor}.${minMinor}.0`, actual: version }
  });
};

const readTableListing = async (
  executor: SqliteBackupExecutor
): Promise<Map<string, { readonly kind: SqliteBackupTable['kind'] | undefined; readonly withoutRowid: boolean }>> => {
  const rows = await selectSqliteRows(
    executor,
    "SELECT name, type, wr FROM pragma_table_list WHERE schema = 'main'",
    undefined,
    'io_error'
  );
  return new Map(
    rows.map(row => [
      sqliteTextValue(row[0], 'table name'),
      {
        kind: TABLE_KINDS[sqliteTextValue(row[1], 'table type')],
        withoutRowid: integerOf(row[2], 'without rowid flag') === 1
      }
    ])
  );
};

const readSequences = async (
  executor: SqliteBackupExecutor,
  tables: readonly SqliteBackupTable[]
): Promise<SqliteBackupSequence[]> => {
  const exists = await selectSqliteRows(
    executor,
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'",
    undefined,
    'io_error'
  );
  if (exists.length === 0) return [];
  const rows = await selectSqliteRows(
    executor,
    'SELECT name, CAST(seq AS TEXT) FROM sqlite_sequence ORDER BY rowid',
    undefined,
    'io_error'
  );
  // DROP TABLE 会顺手删掉序列行，这里只防御手工写进去的孤儿行：它不属于任何表，恢复端会拒绝
  const normal = new Set(tables.filter(table => table.kind === 'normal').map(table => table.name));
  return rows
    .map(row => ({ name: sqliteTextValue(row[0], 'sequence name'), seq: sqliteTextValue(row[1], 'sequence value') }))
    .filter(sequence => normal.has(sequence.name));
};

/**
 * 在当前事务里读出整库结构与每张表的转储计划。
 *
 * @remarks
 * 调用方负责先 `BEGIN`，保证结构与随后读出的行来自同一个快照。`sqlite_` 开头的内部对象
 * （`sqlite_sequence`、`sqlite_stat*`、自动索引）不进归档；`sqlite_sequence` 的内容单独记录。
 *
 * @param executor - 客户端
 * @returns 结构与转储计划
 * @throws RxDBBackupError `unsupported_combination` 库不是 UTF-8 编码、引擎低于 SQLite 3.43、没有建表语句的对象、恢复端会拒绝的结构语句、
 * 未知的表类型、rowid 关键字全被遮蔽
 * @throws RxDBBackupError `restore_incomplete` 库里有未完成恢复的标记
 */
export const readSqliteBackupSchema = async (executor: SqliteBackupExecutor): Promise<SqliteBackupPlan> => {
  await assertUtf8Database(executor);
  await assertSupportedEngine(executor);
  const entries = await selectSqliteRows(
    executor,
    "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY rowid",
    undefined,
    'io_error'
  );
  const listing = await readTableListing(executor);
  const layouts: TableLayout[] = [];
  const objects: SqliteBackupObject[] = [];
  for (const [rawType, rawName, rawTblName, rawSql] of entries) {
    const type = sqliteTextValue(rawType, 'object type');
    const name = sqliteTextValue(rawName, 'object name');
    if (name.toLowerCase() === SQLITE_RESTORE_MARKER_TABLE) {
      throw new RxDBBackupError('restore_incomplete', 'The database carries an unfinished restore marker');
    }
    if (typeof rawSql !== 'string') throw unsupported(`Object "${name}" has no CREATE statement`, 'sql', rawSql);
    if (type !== 'table') {
      if (type !== 'index' && type !== 'view' && type !== 'trigger') throw unsupported('Unknown object', 'type', type);
      assertRestorableSql(rawSql, type, name);
      objects.push({ type, name, tblName: sqliteTextValue(rawTblName, 'table name'), sql: rawSql });
      continue;
    }
    const entry = listing.get(name);
    if (entry?.kind === undefined) throw unsupported(`Table "${name}" has an unsupported type`, 'type', name);
    if (entry.kind !== 'shadow') assertRestorableSql(rawSql, 'table', name);
    layouts.push(await readTableLayout(executor, name, rawSql, { kind: entry.kind, withoutRowid: entry.withoutRowid }));
  }
  const tables = layouts.map(layout => layout.table);
  const schema: SqliteBackupSchema = {
    version: SQLITE_BACKUP_SCHEMA_VERSION,
    userVersion: integerOf(
      await selectSingle(executor, 'SELECT user_version FROM pragma_user_version'),
      'user_version'
    ),
    applicationId: integerOf(
      await selectSingle(executor, 'SELECT application_id FROM pragma_application_id'),
      'application_id'
    ),
    tables,
    objects,
    sequences: await readSequences(executor, tables)
  };
  const dumps = layouts.flatMap((layout, index) => (layout.table.kind === 'virtual' ? [] : [planDump(layout, index)]));
  return { schema, dumps };
};
