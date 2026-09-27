import type { RxDB, RxDBBackupManifest, RxDBBackupTrailer, RxDBRestoreResult } from '@aiao/rxdb';
import {
  assertRxDBBackupCompatible,
  classifyBackupIoError,
  hasRxDBBackupWebLocks,
  isRxDBBackupError,
  RxDBBackupArchiveReader,
  RxDBBackupError,
  tryAcquireRxDBBackupLock,
  type RxDBBackupEntryHeader,
  type RxDBBackupHeldLock
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { releaseComlinkProxy } from '../create_sqlite_client.js';
import type { SqliteBlankDatabase, SqliteClientLike } from '../sqlite-core.types.js';
import { quote_sql_identifier } from '../sqlite-core.utils.js';
import {
  readSqliteDumpColumns,
  readSqliteSystemVersionState,
  runSqliteBackupSql,
  selectSqliteRows,
  sqliteArchiveExtensions,
  sqliteTargetCompatibility,
  sqliteTextValue,
  type SqliteBackupExecutor
} from './sqlite-backup-schema.js';
import {
  assertSqliteSchemaSql,
  countSqliteRowLiterals,
  parseSqliteBackupSchema,
  parseSqliteBackupSummary,
  parseSqliteRowsEntryPath,
  SQLITE_BACKUP_MAX_ENTRY_BYTES,
  SQLITE_BACKUP_SCHEMA_ENTRY,
  SQLITE_BACKUP_SUMMARY_ENTRY,
  SQLITE_RESTORE_MARKER_TABLE,
  type SqliteBackupSchema,
  type SqliteBackupTable
} from './sqlite-backup-sql.js';
import {
  sqliteStorageLockName,
  type SqliteRestoreOptions,
  type SqliteSupportedBackupStorage
} from './sqlite-backup.interface.js';
import { listSqliteObjects, matchesSqliteBlankDatabase } from './sqlite-blank-database.js';

/** 恢复一次需要的全部上下文，由 adapter 提供。 */
export interface SqliteRestoreInput {
  /** 目标实例：会被 `init()`，但必须尚未连接。 */
  readonly rxdb: RxDB;
  readonly adapterName: string;
  readonly storage: SqliteSupportedBackupStorage;
  /** 按 adapter 当前配置打开目标库的一个新连接。 */
  readonly createClient: () => Promise<SqliteClientLike>;
}

/** {@link restoreSqliteDatabase} 的结果。 */
export interface SqliteRestoreOutcome {
  readonly result: RxDBRestoreResult;
  /** 内存目标恢复出来的连接（变更事件已恢复采集），由 adapter 接管；持久化目标为空。 */
  readonly client?: SqliteClientLike;
}

type PersistentStorage = Extract<SqliteSupportedBackupStorage, { kind: 'persistent' }>;

const MARKER = quote_sql_identifier(SQLITE_RESTORE_MARKER_TABLE);
const decoder = new TextDecoder('utf-8', { fatal: true });

const corrupt = (message: string, field: string, expected?: unknown, actual?: unknown): RxDBBackupError =>
  new RxDBBackupError('corrupt_archive', message, { details: { field, expected, actual } });

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw new RxDBBackupError('aborted', 'SQLite restore was aborted', { cause: signal.reason });
};

const requireWebLocks = (operation: string): void => {
  if (hasRxDBBackupWebLocks()) return;
  throw new RxDBBackupError('unsupported_combination', `SQLite ${operation} to persistent storage requires Web Locks`, {
    details: { field: 'navigator.locks' }
  });
};

/**
 * 目标实例本身必须还没连接：已连接的实例有自己的库，恢复结果既不能替换它、也不能被它接管。
 *
 * @remarks
 * `connected$` 是 BehaviorSubject 派生流，订阅时同步给出当前值。
 */
const assertTargetDisconnected = async (rxdb: RxDB): Promise<void> => {
  if (!(await firstValueFrom(rxdb.connected$))) return;
  throw new RxDBBackupError('target_busy', `RxDB "${rxdb.config.dbName}" is already connected`, {
    details: { field: 'rxdb', actual: rxdb.config.dbName }
  });
};

const acquireExclusive = async (storageKey: string): Promise<RxDBBackupHeldLock> => {
  const lock = await tryAcquireRxDBBackupLock(sqliteStorageLockName(storageKey), 'exclusive');
  if (lock) return lock;
  throw new RxDBBackupError('target_busy', `SQLite storage "${storageKey}" is in use`, {
    details: { field: 'storage', actual: storageKey }
  });
};

/**
 * 库里是否留着「恢复进行中」标记。
 *
 * @param executor - 客户端
 * @returns 有标记时为 `true`
 */
export const hasSqliteRestoreMarker = async (executor: SqliteBackupExecutor): Promise<boolean> => {
  const rows = await selectSqliteRows(
    executor,
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?",
    [SQLITE_RESTORE_MARKER_TABLE],
    'io_error'
  );
  return rows.length > 0;
};

const disconnectQuietly = async (client: SqliteClientLike): Promise<void> => {
  // 连接本身已经不可用或库将被丢弃，关闭失败不改变结论；吞掉它，让调用方看到真正的失败原因
  await client.disconnect().catch(() => undefined);
  releaseComlinkProxy(client);
};

const notEmpty = (storage: SqliteSupportedBackupStorage): RxDBBackupError =>
  new RxDBBackupError('target_not_empty', `SQLite storage "${storage.label}" already contains a database`, {
    details: { field: 'storage', actual: storage.label }
  });

/**
 * 目标必须恰好等于引擎新建的空库：没有恢复标记，对象与空库一致，引擎自建的表里也没有多出来的行。
 *
 * @param client - 目标连接
 * @param storage - 目标位置
 * @param blank - 同一个引擎上新建空库的描述
 */
const assertTargetEmpty = async (
  client: SqliteClientLike,
  storage: SqliteSupportedBackupStorage,
  blank: SqliteBlankDatabase
): Promise<void> => {
  const objects = await listSqliteObjects(client);
  if (objects.includes(`table:${SQLITE_RESTORE_MARKER_TABLE}`)) {
    throw new RxDBBackupError(
      'restore_incomplete',
      `A previous restore into "${storage.label}" did not finish; call cleanupIncompleteRestore()`,
      { details: { field: 'storage', actual: storage.label } }
    );
  }
  if (!(await matchesSqliteBlankDatabase(client, blank))) throw notEmpty(storage);
};

const unsupportedClient = (adapterName: string, field: string): RxDBBackupError =>
  new RxDBBackupError('unsupported_combination', `SQLite client of "${adapterName}" cannot restore`, {
    details: { field }
  });

/** 打开目标库：静音变更事件并确认它是空的；失败时关闭连接。 */
const openTarget = async (input: SqliteRestoreInput): Promise<SqliteClientLike> => {
  const client = await input.createClient().catch((error: unknown) => {
    throw classifyBackupIoError(error, `Failed to open the SQLite restore target "${input.storage.label}"`);
  });
  try {
    if (!client.setChangeEventsMuted) throw unsupportedClient(input.adapterName, 'client.setChangeEventsMuted');
    if (!client.describeBlankDatabase) throw unsupportedClient(input.adapterName, 'client.describeBlankDatabase');
    await client.setChangeEventsMuted(true);
    await assertTargetEmpty(client, input.storage, await client.describeBlankDatabase());
    return client;
  } catch (error) {
    await disconnectQuietly(client);
    throw error;
  }
};

// ─── 归档读取 ────────────────────────────────────────────────────────────────

interface RestoreSession {
  readonly reader: RxDBBackupArchiveReader;
  readonly manifest: RxDBBackupManifest;
  readonly signal: AbortSignal | undefined;
}

const openSession = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  input: SqliteRestoreInput,
  client: SqliteClientLike,
  signal: AbortSignal | undefined
): Promise<RestoreSession> => {
  const expected = await sqliteTargetCompatibility(input.rxdb, input.adapterName, client);
  throwIfAborted(signal);
  const reader = new RxDBBackupArchiveReader(source, signal);
  const manifest = await reader.readManifest();
  assertRxDBBackupCompatible(manifest, expected);
  return { reader, manifest, signal };
};

/** 读下一个条目头；归档已结束时为 `null`，结束标记挂在 `trailer` 上。 */
const nextEntry = async (
  reader: RxDBBackupArchiveReader
): Promise<{ header: RxDBBackupEntryHeader } | { trailer: RxDBBackupTrailer }> => {
  const item = await reader.next();
  if (item.type === 'data') throw corrupt('Backup archive data frame outside an entry', 'frame');
  return item.type === 'entry' ? { header: item.header } : { trailer: item.trailer };
};

const readEntryText = async (reader: RxDBBackupArchiveReader, header: RxDBBackupEntryHeader): Promise<string> => {
  if (header.kind !== 'file' || header.size > SQLITE_BACKUP_MAX_ENTRY_BYTES) {
    throw corrupt(
      `Backup entry "${header.path}" is not a SQLite archive file`,
      'size',
      SQLITE_BACKUP_MAX_ENTRY_BYTES,
      header.size
    );
  }
  const data = new Uint8Array(header.size);
  for (let at = 0; at < header.size;) {
    const item = await reader.next();
    if (item.type !== 'data') throw corrupt(`Backup entry "${header.path}" is incomplete`, 'size');
    data.set(item.bytes, at);
    at += item.bytes.length;
  }
  try {
    return decoder.decode(data);
  } catch (error) {
    throw new RxDBBackupError('corrupt_archive', `Backup entry "${header.path}" is not UTF-8`, { cause: error });
  }
};

const readJsonEntry = async (reader: RxDBBackupArchiveReader, path: string): Promise<unknown> => {
  const next = await nextEntry(reader);
  if (!('header' in next) || next.header.path !== path) {
    throw corrupt(`Backup archive is missing "${path}"`, 'path', path, 'header' in next ? next.header.path : null);
  }
  const text = await readEntryText(reader, next.header);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new RxDBBackupError('corrupt_archive', `Backup entry "${path}" is not JSON`, { cause: error });
  }
};

// ─── 写入目标 ────────────────────────────────────────────────────────────────

const archiveSql = (client: SqliteClientLike, sql: string, bindings?: (string | number)[]) =>
  runSqliteBackupSql(client, sql, bindings, 'corrupt_archive');

/** 归档结构用到的虚表模块必须恰好是 manifest 声明的那些：兼容性判定只看 manifest。 */
const assertArchiveModules = (schema: SqliteBackupSchema, manifest: RxDBBackupManifest): void => {
  let modules: string[];
  try {
    modules = sqliteArchiveExtensions(schema);
  } catch (error) {
    throw new RxDBBackupError('corrupt_archive', 'Backup schema contains an unreadable virtual table', {
      cause: error
    });
  }
  const declared = [...manifest.adapter.extensions].sort();
  if (modules.join('\n') !== declared.join('\n')) {
    throw corrupt('Backup schema uses modules the manifest does not declare', 'adapter.extensions', declared, modules);
  }
};

/**
 * 建表并核对列布局。
 *
 * @remarks
 * 影子表由它的虚表自动建出，只核对不创建：列布局不同说明两端的模块版本不同，是 `incompatible_archive`；
 * 普通表的建表语句就在归档里，建出来的列与归档声明的不同只能是归档被改过。
 */
const createTables = async (client: SqliteClientLike, schema: SqliteBackupSchema): Promise<void> => {
  for (const table of schema.tables) {
    if (table.kind === 'shadow') continue;
    assertSqliteSchemaSql(table.sql, 'table');
    await archiveSql(client, table.sql);
  }
  for (const table of schema.tables) {
    if (table.kind === 'virtual') continue;
    const actual = await readSqliteDumpColumns(client, table.name);
    if (actual.join('\n') === table.columns.join('\n')) continue;
    const code = table.kind === 'shadow' ? 'incompatible_archive' : 'corrupt_archive';
    throw new RxDBBackupError(code, `Restored table "${table.name}" has a different column layout`, {
      details: { field: `columns.${table.name}`, expected: table.columns, actual }
    });
  }
  // 虚表建好时影子表里已有模块写入的初始行（配置、索引结构），归档里的行会完整取代它们
  for (const table of schema.tables) {
    if (table.kind === 'shadow') await archiveSql(client, `DELETE FROM ${quote_sql_identifier(table.name)}`);
  }
};

const insertPrefix = (table: SqliteBackupTable): string => {
  const columns = [...table.columns.map(quote_sql_identifier), ...(table.rowid === null ? [] : [table.rowid])];
  return `INSERT INTO ${quote_sql_identifier(table.name)} (${columns.join(', ')}) VALUES `;
};

/** 行条目按表下标不减、同表序号从 0 连续递增；返回紧随其后的摘要条目头。 */
const insertRows = async (
  client: SqliteClientLike,
  session: RestoreSession,
  schema: SqliteBackupSchema,
  rows: number[]
): Promise<RxDBBackupEntryHeader> => {
  let last = { table: -1, seq: -1 };
  for (;;) {
    throwIfAborted(session.signal);
    const next = await nextEntry(session.reader);
    if (!('header' in next))
      throw corrupt('Backup archive ends before its summary', 'path', SQLITE_BACKUP_SUMMARY_ENTRY);
    const at = parseSqliteRowsEntryPath(next.header.path);
    if (at === null) return next.header;
    const table = schema.tables[at.table];
    const ordered = at.table === last.table ? at.seq === last.seq + 1 : at.table > last.table && at.seq === 0;
    if (!ordered || table === undefined || table.kind === 'virtual') {
      throw corrupt('Backup row entry is out of order', 'path', undefined, next.header.path);
    }
    const text = await readEntryText(session.reader, next.header);
    rows[at.table] += countSqliteRowLiterals(text, table.columns.length + (table.rowid === null ? 0 : 1));
    // 行 SQL 里是归档的行字面量，失败信息只能说是哪张表。
    await runSqliteBackupSql(
      client,
      insertPrefix(table) + text,
      undefined,
      'corrupt_archive',
      `rows of table "${table.name}"`
    );
    last = at;
  }
};

/** 索引、视图与触发器在行之后建：触发器不能在灌入归档行时触发。 */
const createObjects = async (client: SqliteClientLike, schema: SqliteBackupSchema): Promise<void> => {
  for (const object of schema.objects) {
    assertSqliteSchemaSql(object.sql, object.type);
    await archiveSql(client, object.sql);
  }
};

/**
 * 写入自增序列与库头字段。
 *
 * @remarks
 * 显式 rowid 的插入会把 `sqlite_sequence` 推到当前最大值，而归档记录的可能更大（被删掉的行也占过号），
 * 所以先清空再按归档写回。
 */
const writeSequencesAndHeader = async (client: SqliteClientLike, schema: SqliteBackupSchema): Promise<void> => {
  const sequence = await selectSqliteRows(
    client,
    "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'",
    undefined,
    'io_error'
  );
  if (sequence.length > 0) await archiveSql(client, 'DELETE FROM sqlite_sequence');
  for (const { name, seq } of schema.sequences) {
    await archiveSql(client, 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, CAST(? AS INTEGER))', [name, seq]);
  }
  // PRAGMA 不接受绑定参数；两个值在解析时已限定为 32 位整数
  await archiveSql(client, `PRAGMA user_version = ${schema.userVersion}`);
  await archiveSql(client, `PRAGMA application_id = ${schema.applicationId}`);
};

const readSummary = async (
  session: RestoreSession,
  header: RxDBBackupEntryHeader,
  schema: SqliteBackupSchema,
  rows: readonly number[]
): Promise<RxDBBackupTrailer> => {
  if (header.path !== SQLITE_BACKUP_SUMMARY_ENTRY) {
    throw corrupt('Backup archive contains an unexpected entry', 'path', SQLITE_BACKUP_SUMMARY_ENTRY, header.path);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readEntryText(session.reader, header));
  } catch (error) {
    if (isRxDBBackupError(error)) throw error;
    throw new RxDBBackupError('corrupt_archive', 'Backup summary is not JSON', { cause: error });
  }
  const summary = parseSqliteBackupSummary(parsed, schema.tables.length);
  if (summary.rows.join(',') !== rows.join(','))
    throw corrupt('Backup row count mismatch', 'summary', summary.rows, rows);
  const end = await nextEntry(session.reader);
  if (!('trailer' in end))
    throw corrupt('Backup archive has entries after its summary', 'path', undefined, end.header.path);
  return end.trailer;
};

// ─── 核对 ────────────────────────────────────────────────────────────────────

const assertVersions = async (client: SqliteClientLike, manifest: RxDBBackupManifest): Promise<void> => {
  const state = await readSqliteSystemVersionState(client, 'corrupt_archive');
  if (state.schemaVersion !== manifest.rxdb.systemSchemaVersion) {
    throw corrupt(
      'Restored database has a different system schema version',
      'rxdb.systemSchemaVersion',
      manifest.rxdb.systemSchemaVersion,
      state.schemaVersion
    );
  }
  if (state.codecVersion !== manifest.rxdb.changeCodecVersion) {
    throw corrupt(
      'Restored database has a different change codec version',
      'rxdb.changeCodecVersion',
      manifest.rxdb.changeCodecVersion,
      state.codecVersion
    );
  }
};

const describeObjects = (entries: readonly (readonly [string, string, string | null])[]): string[] =>
  entries.map(([type, name, sql]) => `${type}\u0000${name}\u0000${sql ?? ''}`).sort();

/**
 * 恢复出来的库结构必须恰好是归档声明的那些对象，逐条语句一致。
 *
 * @remarks
 * 结构语句在执行前只核对了「是一条 CREATE」，这里再确认它建出的对象名、类型与归档声明的一致，
 * 并且没有附加别的库。影子表由模块建出，语句不属于归档，只比对名字与类型。
 */
const assertStructure = async (client: SqliteClientLike, schema: SqliteBackupSchema): Promise<void> => {
  const rows = await selectSqliteRows(
    client,
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> ?",
    [SQLITE_RESTORE_MARKER_TABLE],
    'io_error'
  );
  const shadows = new Set(schema.tables.filter(table => table.kind === 'shadow').map(table => table.name));
  const actual = describeObjects(
    rows.map(([type, name, sql]) => {
      const objectName = sqliteTextValue(name, 'object name');
      const text = shadows.has(objectName) || typeof sql !== 'string' ? null : sql;
      return [sqliteTextValue(type, 'object type'), objectName, text] as const;
    })
  );
  const expected = describeObjects([
    ...schema.tables.map(table => ['table', table.name, table.kind === 'shadow' ? null : table.sql] as const),
    ...schema.objects.map(object => [object.type, object.name, object.sql] as const)
  ]);
  if (actual.join('\n') !== expected.join('\n')) {
    throw corrupt('Restored database structure does not match the archive', 'schema', expected.length, actual.length);
  }
  const attached = await selectSqliteRows(
    client,
    "SELECT name FROM pragma_database_list WHERE name NOT IN ('main', 'temp')",
    undefined,
    'io_error'
  );
  if (attached.length > 0) throw corrupt('Restore attached another database', 'schema', 0, attached.length);
};

/**
 * 在当前事务里删掉用户对象，`keep` 里的除外。
 *
 * @remarks
 * 视图与触发器先删；再删虚表，它们会带走自己的影子表；剩下的普通表用 `IF EXISTS`，已随虚表删掉的影子表不会报错。
 *
 * @param client - 目标连接
 * @param keep - 保留的对象名
 */
const dropUserObjects = async (client: SqliteClientLike, keep: readonly string[]): Promise<void> => {
  const objects = (await listSqliteObjects(client))
    .map(entry => ({ type: entry.slice(0, entry.indexOf(':')), name: entry.slice(entry.indexOf(':') + 1) }))
    .filter(object => !keep.includes(object.name));
  const virtual = await selectSqliteRows(
    client,
    "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'virtual'",
    undefined,
    'io_error'
  );
  const drops = [
    ...objects.filter(o => o.type === 'view').map(o => `DROP VIEW IF EXISTS ${quote_sql_identifier(o.name)}`),
    ...objects.filter(o => o.type === 'trigger').map(o => `DROP TRIGGER IF EXISTS ${quote_sql_identifier(o.name)}`),
    ...virtual.map(row => `DROP TABLE IF EXISTS ${quote_sql_identifier(sqliteTextValue(row[0], 'table name'))}`),
    ...objects.filter(o => o.type === 'table').map(o => `DROP TABLE IF EXISTS ${quote_sql_identifier(o.name)}`)
  ];
  for (const sql of drops) await runSqliteBackupSql(client, sql, undefined, 'io_error');
};

/**
 * 在一个事务里写完并核对整个库，事务仍未提交时返回。
 *
 * @remarks
 * 摘要要读到结尾才知道，所以一切写入都在同一个事务里，`end` 之后才允许调用方提交。
 */
const writeTarget = async (
  client: SqliteClientLike,
  session: RestoreSession,
  options: SqliteRestoreOptions
): Promise<RxDBBackupTrailer> => {
  const schema = parseSqliteBackupSchema(await readJsonEntry(session.reader, SQLITE_BACKUP_SCHEMA_ENTRY));
  assertArchiveModules(schema, session.manifest);
  // 目标此刻恰好是引擎新建的空库；引擎自建的对象由归档里的那一份整体取代
  await dropUserObjects(client, [SQLITE_RESTORE_MARKER_TABLE]);
  await createTables(client, schema);
  const rows = schema.tables.map(() => 0);
  const summaryHeader = await insertRows(client, session, schema, rows);
  await createObjects(client, schema);
  await writeSequencesAndHeader(client, schema);
  const trailer = await readSummary(session, summaryHeader, schema, rows);
  await options.onStage?.('rows-written');
  throwIfAborted(session.signal);
  await assertVersions(client, session.manifest);
  await assertStructure(client, schema);
  await options.onStage?.('verified');
  throwIfAborted(session.signal);
  return trailer;
};

const beginRestoreTransaction = async (client: SqliteClientLike): Promise<void> => {
  const begin = (await client.beginTransactionSql?.()) ?? 'BEGIN;';
  // 外键延迟到提交时检查：行按表的顺序灌入，被引用的表可能排在后面
  await runSqliteBackupSql(client, `${begin}\nPRAGMA defer_foreign_keys = ON;`, undefined, 'io_error');
};

/** 在事务里写入并提交；失败时回滚。 */
const commitTarget = async (
  client: SqliteClientLike,
  session: RestoreSession,
  options: SqliteRestoreOptions
): Promise<RxDBBackupTrailer> => {
  await beginRestoreTransaction(client);
  try {
    const trailer = await writeTarget(client, session, options);
    await archiveSql(client, 'COMMIT;');
    return trailer;
  } catch (error) {
    // 事务可能已被 SQLite 自己回滚（例如提交时的外键检查失败），此时 ROLLBACK 报错是预期内的
    await client.execute('ROLLBACK;').catch(() => undefined);
    throw error;
  }
};

const resultOf = (trailer: RxDBBackupTrailer, manifest: RxDBBackupManifest): RxDBRestoreResult => ({
  ...trailer,
  manifest,
  scope: manifest.scope
});

// ─── 内存目标 ────────────────────────────────────────────────────────────────

const restoreToMemory = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  input: SqliteRestoreInput,
  options: SqliteRestoreOptions
): Promise<SqliteRestoreOutcome> => {
  const client = await openTarget(input);
  try {
    const session = await openSession(source, input, client, options.signal);
    const trailer = await commitTarget(client, session, options);
    await client.setChangeEventsMuted?.(false);
    return { result: resultOf(trailer, session.manifest), client };
  } catch (error) {
    await disconnectQuietly(client);
    throw error;
  }
};

// ─── 持久化目标 ──────────────────────────────────────────────────────────────

/**
 * 删掉库里的全部用户对象与恢复标记，库回到「从未恢复过」。
 *
 * @remarks
 * 先关外键（PRAGMA 在事务里无效，必须在 BEGIN 之前），否则删表时隐式的 DELETE 会因引用关系失败。
 * 标记与其余对象在同一个事务里删掉并提交。引擎自建的对象也一并删掉，下一次连接时引擎会重新建出来，
 * 库随之回到新建空库的样子。
 */
const wipeTarget = async (client: SqliteClientLike): Promise<void> => {
  await runSqliteBackupSql(client, 'PRAGMA foreign_keys = OFF;', undefined, 'io_error');
  await runSqliteBackupSql(client, 'BEGIN;', undefined, 'io_error');
  try {
    await dropUserObjects(client, []);
    const sequence = await selectSqliteRows(
      client,
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'",
      undefined,
      'io_error'
    );
    if (sequence.length > 0) await runSqliteBackupSql(client, 'DELETE FROM sqlite_sequence', undefined, 'io_error');
    await runSqliteBackupSql(client, 'PRAGMA user_version = 0; PRAGMA application_id = 0;', undefined, 'io_error');
    await runSqliteBackupSql(client, 'COMMIT;', undefined, 'io_error');
  } catch (error) {
    await client.execute('ROLLBACK;').catch(() => undefined);
    throw error;
  }
};

/** 失败后把目标退回「从未恢复过」；清理本身失败时报 `cleanup_pending`，两个原因都挂在 `cause` 上。 */
const discardTarget = async (client: SqliteClientLike, cause: unknown): Promise<never> => {
  try {
    await wipeTarget(client);
  } catch (cleanupError) {
    throw new RxDBBackupError(
      'cleanup_pending',
      'SQLite restore failed and its partial data could not be removed; call cleanupIncompleteRestore()',
      { cause: new AggregateError([cause, cleanupError], 'Restore and cleanup both failed') }
    );
  } finally {
    await disconnectQuietly(client);
  }
  throw cause;
};

/** 数据与标记都已提交，只是连接没关掉：调用方该重连使用，而不是再恢复一遍（目标已不空）。 */
const closeFailed = (error: unknown): RxDBBackupError =>
  new RxDBBackupError(
    classifyBackupIoError(error, 'close').code,
    'The SQLite database was fully restored and verified; only closing its connection failed. ' +
      'Reconnect to use it instead of restoring again',
    { details: { field: 'disconnect' }, cause: error }
  );

/**
 * 标记单独提交，之后才开始写：页面在恢复中途被关，下一次连接看到标记就拒绝打开这个半截库。
 * 数据提交之后才删标记，两次提交之间崩溃同样留下标记。
 */
const restorePersistentLocked = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  input: SqliteRestoreInput,
  options: SqliteRestoreOptions
): Promise<RxDBRestoreResult> => {
  const client = await openTarget(input);
  let result: RxDBRestoreResult;
  try {
    const session = await openSession(source, input, client, options.signal);
    await archiveSql(client, `CREATE TABLE ${MARKER} (started_at TEXT NOT NULL)`);
    await archiveSql(client, `INSERT INTO ${MARKER} (started_at) VALUES (?)`, [new Date().toISOString()]);
    await options.onStage?.('marker-written');
    throwIfAborted(options.signal);
    const trailer = await commitTarget(client, session, options);
    await options.onStage?.('persisted');
    await runSqliteBackupSql(client, `DROP TABLE ${MARKER}`, undefined, 'io_error');
    result = resultOf(trailer, session.manifest);
  } catch (error) {
    return discardTarget(client, error);
  }
  try {
    await client.disconnect();
  } catch (error) {
    throw closeFailed(error);
  } finally {
    releaseComlinkProxy(client);
  }
  return result;
};

const restoreToPersistent = async (
  source: ReadableStreamDefaultReader<Uint8Array>,
  input: SqliteRestoreInput,
  storage: PersistentStorage,
  options: SqliteRestoreOptions
): Promise<SqliteRestoreOutcome> => {
  requireWebLocks('restore');
  const lock = await acquireExclusive(storage.storageKey);
  try {
    throwIfAborted(options.signal);
    return { result: await restorePersistentLocked(source, input, options) };
  } finally {
    await lock.release();
  }
};

/**
 * 把 {@link writeSqliteBackup} 产出的归档恢复进一个空的 SQLite 库。
 *
 * @remarks
 * 只写入**空**目标，不做合并或覆盖。兼容性（adapter、引擎大版本、虚表模块、系统表 / 变更编码版本、
 * 实体结构指纹、加密认证域）在写入第一条语句之前判定。结构与行在同一个事务里重放，摘要、水位与结构
 * 全部核对通过后才提交；任何失败都回滚。
 *
 * - 持久化目标：独占 Web Lock 挡住并发连接与并发恢复，库内标记表挡住「恢复中途页面被关」后的下一次连接。
 *   失败时删掉目标里的一切，目标回到从未恢复过的状态。
 * - 内存目标：恢复出来的连接经 {@link SqliteRestoreOutcome.client} 交给 adapter 接管。
 *
 * 恢复期间客户端的变更事件是静音的：恢复出来的行不是新变更。输入流在失败时被取消，成功时只释放读锁。
 *
 * @param source - 归档字节流
 * @param input - adapter 上下文
 * @param options - 取消信号与阶段回调
 * @returns 结束标记、manifest，以及内存目标的连接
 * @throws RxDBBackupError 见 {@link RxDBBackupErrorCode}；`cleanup_pending` 表示失败后连清理也没做完
 */
export const restoreSqliteDatabase = async (
  source: ReadableStream<Uint8Array>,
  input: SqliteRestoreInput,
  options: SqliteRestoreOptions
): Promise<SqliteRestoreOutcome> => {
  const sourceReader = source.getReader();
  try {
    throwIfAborted(options.signal);
    await assertTargetDisconnected(input.rxdb);
    const outcome =
      input.storage.kind === 'memory' ?
        await restoreToMemory(sourceReader, input, options)
      : await restoreToPersistent(sourceReader, input, input.storage, options);
    sourceReader.releaseLock();
    return outcome;
  } catch (error) {
    await sourceReader.cancel(error).catch(() => undefined);
    throw error;
  }
};

/** 存储层的失败（含打不开目标）都意味着残留还在，统一报 `cleanup_pending`；其余已分类的错误原样抛。 */
const cleanupFailed = (storageKey: string, error: unknown): RxDBBackupError =>
  isRxDBBackupError(error) && error.code !== 'io_error' && error.code !== 'storage_full' ?
    error
  : new RxDBBackupError('cleanup_pending', `Failed to clean up the incomplete restore of "${storageKey}"`, {
      cause: error
    });

const cleanupLocked = async (input: SqliteRestoreInput, storageKey: string): Promise<boolean> => {
  const client = await input.createClient().catch((error: unknown) => {
    throw cleanupFailed(storageKey, error);
  });
  try {
    if (!(await hasSqliteRestoreMarker(client))) return false;
    await wipeTarget(client);
    return true;
  } catch (error) {
    throw cleanupFailed(storageKey, error);
  } finally {
    await disconnectQuietly(client);
  }
};

/**
 * 清理一次没做完的恢复（页面在恢复中途关闭、或恢复失败后清理本身也失败）。
 *
 * @remarks
 * 拿不到独占锁说明目标正被连接或正在恢复，报 `target_busy` 而不是去删别人正在用的库。
 * 没有标记时什么都不做——一个正常的库永远不会被这里删掉。内存目标没有残留可言，恒为 `false`。
 *
 * @param input - adapter 上下文
 * @returns 确实清理了残留时为 `true`
 * @throws RxDBBackupError `target_busy` / `unsupported_combination` / `cleanup_pending`
 */
export const cleanupIncompleteSqliteRestore = async (input: SqliteRestoreInput): Promise<boolean> => {
  if (input.storage.kind === 'memory') return false;
  requireWebLocks('restore cleanup');
  const lock = await acquireExclusive(input.storage.storageKey);
  try {
    return await cleanupLocked(input, input.storage.storageKey);
  } finally {
    await lock.release();
  }
};
