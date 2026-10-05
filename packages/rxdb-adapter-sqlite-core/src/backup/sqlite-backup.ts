import type { RxDB, RxDBBackupManifest, RxDBBackupOptions, RxDBBackupResult, RxDBBackupTrailer } from '@aiao/rxdb';
import {
  classifyBackupIoError,
  getRxDBBackupAuthDomain,
  getRxDBBackupSchemaFingerprint,
  runRxDBBackupWhenQueued,
  RXDB_BACKUP_FORMAT,
  RXDB_BACKUP_FORMAT_VERSION,
  RXDB_BACKUP_SCOPE,
  RxDBBackupArchiveWriter,
  RxDBBackupError
} from '@aiao/rxdb';
import type { AsyncQueueExecutor } from '@aiao/utils';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  assertNoSqliteShadowTables,
  readSqliteBackupSchema,
  readSqliteEngineVersion,
  readSqliteSystemVersionState,
  runSqliteBackupSql,
  selectSqliteRows,
  sqliteArchiveExtensions,
  sqliteRowLiteralBytes,
  type SqliteBackupExecutor,
  type SqliteTableDump
} from './sqlite-backup-schema.js';
import {
  SQLITE_BACKUP_MAX_ENTRY_BYTES,
  SQLITE_BACKUP_SCHEMA_ENTRY,
  SQLITE_BACKUP_SUMMARY_ENTRY,
  sqliteRowsEntryPath
} from './sqlite-backup-sql.js';
import {
  SQLITE_BACKUP_ENGINE,
  SQLITE_BACKUP_ENGINE_COMPATIBILITY,
  SQLITE_BACKUP_LOCK_TIMEOUT_MS,
  type SqliteSupportedBackupStorage
} from './sqlite-backup.interface.js';

/** 行条目攒到这么大就落一个条目；单行更大时独占一个条目。 */
const ENTRY_TARGET_BYTES = 1024 * 1024;
/** 每页查询回复的字节预算：先取各行字面量的上界，累计不超过预算的行数就是这一页的行数。 */
const PAGE_BUDGET_BYTES = 256 * 1024;
const MAX_PAGE_ROWS = 512;

const COMMA = 0x2c;
/** 抖音 iOS 没有原生编码器、polyfill 在 import 之后才装，模块顶层不能构造：第一次用到再建。 */
let encoder: TextEncoder | undefined;
/** 只用来校验行字面量：恢复端用同样严格的解码读条目。 */
let utf8: TextDecoder | undefined;

/** 备份一次需要的全部上下文。 */
export interface SqliteBackupInput {
  readonly rxdb: RxDB;
  readonly adapterName: string;
  readonly client: SqliteBackupExecutor;
  readonly storage: SqliteSupportedBackupStorage;
  readonly queue: AsyncQueueExecutor;
  /** 同一 adapter 恢复时能否写影子表；不能时含影子表的库在写出任何字节前被拒绝。 */
  readonly shadowTablesWritable: boolean;
}

const assertUtf8Row = (bytes: Uint8Array, tableName: string): void => {
  try {
    (utf8 ??= new TextDecoder('utf-8', { fatal: true })).decode(bytes);
  } catch {
    throw new RxDBBackupError('unsupported_combination', `Table "${tableName}" has TEXT that is not valid UTF-8`, {
      details: { field: 'rowText', actual: tableName }
    });
  }
};

/** 把一张表的行字面量攒成约 1 MiB 的条目，行与行之间用逗号连接，恰好是 `VALUES` 之后的文本。 */
class SqliteRowEntries {
  readonly #archive: RxDBBackupArchiveWriter;
  readonly #table: number;
  #parts: Uint8Array[] = [];
  #bytes = 0;
  #seq = 0;

  constructor(archive: RxDBBackupArchiveWriter, table: number) {
    this.#archive = archive;
    this.#table = table;
  }

  /**
   * 追加一行。
   *
   * @remarks
   * TEXT 值里的非法 UTF-8 会原样出现在字面量里，恢复端严格解码时必然拒绝整个条目，所以在这里就拒绝备份。
   */
  async add(bytes: Uint8Array, tableName: string): Promise<void> {
    if (bytes.length > SQLITE_BACKUP_MAX_ENTRY_BYTES) {
      throw new RxDBBackupError('unsupported_combination', `A row of table "${tableName}" is too large to back up`, {
        details: { field: 'rowBytes', expected: SQLITE_BACKUP_MAX_ENTRY_BYTES, actual: bytes.length }
      });
    }
    assertUtf8Row(bytes, tableName);
    if (this.#parts.length > 0 && this.#bytes + 1 + bytes.length > ENTRY_TARGET_BYTES) await this.flush();
    this.#bytes += this.#parts.length > 0 ? bytes.length + 1 : bytes.length;
    this.#parts.push(bytes);
  }

  async flush(): Promise<void> {
    if (this.#parts.length === 0) return;
    const data = new Uint8Array(this.#bytes);
    let at = 0;
    for (const part of this.#parts) {
      if (at > 0) data[at++] = COMMA;
      data.set(part, at);
      at += part.length;
    }
    this.#parts = [];
    this.#bytes = 0;
    await this.#archive.beginEntry({
      path: sqliteRowsEntryPath(this.#table, this.#seq++),
      kind: 'file',
      size: data.length
    });
    await this.#archive.writeData(data);
  }
}

/** 按行字面量上界累计，预算内能放下几行；单行超出预算时也取这一行。 */
const rowsWithinBudget = (bounds: readonly SQLiteCompatibleType[][]): number => {
  let total = 0;
  for (let index = 0; index < bounds.length; index++) {
    total += Number(bounds[index][0]);
    if (total > PAGE_BUDGET_BYTES) return Math.max(1, index);
  }
  return bounds.length;
};

const dumpTable = async (
  executor: SqliteBackupExecutor,
  archive: RxDBBackupArchiveWriter,
  dump: SqliteTableDump,
  tableName: string
): Promise<number> => {
  const entries = new SqliteRowEntries(archive, dump.table);
  // 行的大小事先不知道，而且前面的行小不代表后面的行也小：每页先问上界再定行数，
  // 否则小行之后的一页几百个大行会让一条回复（桌面上是一条 host 消息）远超预算。
  // 探测的行数跟着上一页走（至多翻倍），大行表不会每页都把后面几百行的记录头再走一遍
  let keys: SQLiteCompatibleType[] | null = null;
  let probe = MAX_PAGE_ROWS;
  let count = 0;
  for (;;) {
    const after = keys ?? [];
    const bounds = await selectSqliteRows(
      executor,
      keys === null ? dump.firstSizeSql : dump.nextSizeSql,
      [...after, probe],
      'io_error'
    );
    if (bounds.length === 0) break;
    const limit = rowsWithinBudget(bounds);
    const page = await selectSqliteRows(
      executor,
      keys === null ? dump.firstPageSql : dump.nextPageSql,
      [...after, limit],
      'io_error'
    );
    for (const row of page) await entries.add(sqliteRowLiteralBytes(row[0]), tableName);
    count += page.length;
    if (page.length < limit || (limit === bounds.length && bounds.length < probe)) break;
    keys = page[page.length - 1].slice(1, 1 + dump.keyCount);
    probe = Math.min(MAX_PAGE_ROWS, limit * 2);
  }
  await entries.flush();
  return count;
};

const writeJsonEntry = async (archive: RxDBBackupArchiveWriter, path: string, value: unknown): Promise<void> => {
  const data = (encoder ??= new TextEncoder()).encode(JSON.stringify(value));
  await archive.beginEntry({ path, kind: 'file', size: data.length });
  await archive.writeData(data);
};

const dumpDatabase = async (
  input: SqliteBackupInput,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<{ trailer: RxDBBackupTrailer; manifest: RxDBBackupManifest }> => {
  const { client, rxdb } = input;
  const plan = await readSqliteBackupSchema(client);
  if (!input.shadowTablesWritable) assertNoSqliteShadowTables(plan.schema, input.adapterName);
  const versions = await readSqliteSystemVersionState(client, 'io_error');
  const authDomain = getRxDBBackupAuthDomain(rxdb);
  const manifest: RxDBBackupManifest = {
    format: RXDB_BACKUP_FORMAT,
    formatVersion: RXDB_BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    scope: RXDB_BACKUP_SCOPE,
    adapter: {
      name: input.adapterName,
      engine: SQLITE_BACKUP_ENGINE,
      engineVersion: await readSqliteEngineVersion(client),
      engineCompatibility: SQLITE_BACKUP_ENGINE_COMPATIBILITY,
      extensions: sqliteArchiveExtensions(plan.schema),
      storage: input.storage.label
    },
    rxdb: {
      version: rxdb.version,
      systemSchemaVersion: versions.schemaVersion,
      changeCodecVersion: versions.codecVersion
    },
    schemaFingerprint: getRxDBBackupSchemaFingerprint(rxdb),
    encryption: authDomain === null ? null : { authDomain }
  };
  const archive = new RxDBBackupArchiveWriter(writer, signal);
  await archive.writeManifest(manifest);
  await writeJsonEntry(archive, SQLITE_BACKUP_SCHEMA_ENTRY, plan.schema);
  const rows = plan.schema.tables.map(() => 0);
  for (const dump of plan.dumps) {
    rows[dump.table] = await dumpTable(client, archive, dump, plan.schema.tables[dump.table].name);
  }
  await writeJsonEntry(archive, SQLITE_BACKUP_SUMMARY_ENTRY, { rows });
  return { trailer: await archive.finish(), manifest };
};

/** 整个转储在一个读事务里完成：结构、水位与全部行来自同一个快照。 */
const snapshot = async (
  input: SqliteBackupInput,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<{ trailer: RxDBBackupTrailer; manifest: RxDBBackupManifest }> => {
  await runSqliteBackupSql(input.client, 'BEGIN;', undefined, 'io_error');
  try {
    const result = await dumpDatabase(input, writer, signal);
    await runSqliteBackupSql(input.client, 'COMMIT;', undefined, 'io_error');
    return result;
  } catch (error) {
    // 只读事务回滚失败不影响库；吞掉它，让调用方看到真正的失败原因
    await input.client.execute('ROLLBACK;').catch(() => undefined);
    throw error;
  }
};

/**
 * 把已连接的 SQLite 库写成一份归档。
 *
 * @remarks
 * 归档是逻辑转储：`sqlite/schema.json`（全部建表 / 索引 / 视图 / 触发器语句、`user_version`、
 * `application_id`、`sqlite_sequence`），按表分段的 `sqlite/rows/<表>/<序号>`（`quote()` 行字面量），
 * 最后是 `sqlite/summary.json`（每张表的行数）。虚表只记建表语句，数据随它的影子表一起转储。
 *
 * @param input - adapter 上下文
 * @param sink - 输出流；成功时被 close，失败时被 abort
 * @param options - 取消信号与排队时限
 * @returns 结束标记与 manifest
 */
export const writeSqliteBackup = async (
  input: SqliteBackupInput,
  sink: WritableStream<Uint8Array>,
  options: RxDBBackupOptions
): Promise<RxDBBackupResult> => {
  const signal = options.signal;
  const writer = sink.getWriter();
  try {
    const { trailer, manifest } = await runRxDBBackupWhenQueued(input.queue, () => snapshot(input, writer, signal), {
      signal,
      timeoutMs: options.lockTimeoutMs ?? SQLITE_BACKUP_LOCK_TIMEOUT_MS,
      label: 'SQLite backup'
    });
    await writer.close().catch((error: unknown) => {
      throw classifyBackupIoError(error, 'Failed to close the backup output');
    });
    return { ...trailer, manifest, scope: manifest.scope };
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  } finally {
    writer.releaseLock();
  }
};
