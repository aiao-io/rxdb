import { RxDBBackupError } from '@aiao/rxdb';

/**
 * US-217 SQLite 归档的入口校验。
 *
 * @remarks
 * 恢复端必须把归档里的文本拼进 SQL 才能执行（结构语句只能以文本形式重建，行数据以 `quote()`
 * 字面量批量插入）。这里是全部的注入防线：只接受备份端自己能产出的形状，任何多余的字符都报
 * `corrupt_archive`，不交给 SQLite 去「尽量理解」。扫描全部手写成线性循环，不用带量词的正则，
 * 几十 MiB 的 blob 不会触发回溯。
 */

/** 恢复进行中标记表的名字；归档里出现同名对象即视为损坏。 */
export const SQLITE_RESTORE_MARKER_TABLE = 'rxdb$restore_in_progress';

/** 恢复端识别的 schema.json 版本。 */
export const SQLITE_BACKUP_SCHEMA_VERSION = 1 as const;

/** 归档条目 `sqlite/schema.json`。 */
export const SQLITE_BACKUP_SCHEMA_ENTRY = 'sqlite/schema.json';

/** 归档条目 `sqlite/summary.json`。 */
export const SQLITE_BACKUP_SUMMARY_ENTRY = 'sqlite/summary.json';

/**
 * 单个行条目的上限（32 MiB）。
 *
 * @remarks
 * 恢复端要把整个条目读进内存拼成一条 INSERT，这是恢复端内存的上界；备份端遇到单行字面量超过它
 * 报 `unsupported_combination`，恢复端遇到更大的条目报 `corrupt_archive`。
 */
export const SQLITE_BACKUP_MAX_ENTRY_BYTES = 32 * 1024 * 1024;

/**
 * 第 `table` 张表的第 `seq` 个行条目的路径。
 *
 * @param table - 表在 {@link SqliteBackupSchema.tables} 里的下标
 * @param seq - 该表内的条目序号，从 0 开始
 * @returns 条目路径
 */
export const sqliteRowsEntryPath = (table: number, seq: number): string => `sqlite/rows/${table}/${seq}`;

const ROWS_ENTRY = /^sqlite\/rows\/(0|[1-9]\d{0,8})\/(0|[1-9]\d{0,8})$/;

/**
 * 解析行条目路径。
 *
 * @param path - 条目路径
 * @returns 表下标与序号；不是行条目（或数字不规范）时为 `null`
 */
export const parseSqliteRowsEntryPath = (path: string): { readonly table: number; readonly seq: number } | null => {
  const match = ROWS_ENTRY.exec(path);
  return match ? { table: Number(match[1]), seq: Number(match[2]) } : null;
};

/** 可以单独转储隐式 rowid 的三个关键字，按优先级排列。 */
export const SQLITE_ROWID_KEYWORDS = ['rowid', '_rowid_', 'oid'] as const;

/** 隐式 rowid 的关键字。 */
export type SqliteRowidKeyword = (typeof SQLITE_ROWID_KEYWORDS)[number];

/**
 * 归档里的一张表。
 *
 * - `normal`：普通表，结构与行都恢复
 * - `virtual`：虚表，只执行建表语句，由模块自己建出影子表
 * - `shadow`：虚表的影子表，不执行建表语句，只核对列并替换行
 */
export interface SqliteBackupTable {
  readonly name: string;
  readonly kind: 'normal' | 'virtual' | 'shadow';
  /** `sqlite_schema.sql` 原文。 */
  readonly sql: string;
  /** 转储的列（不含隐藏列与生成列），按表定义顺序；虚表为空。 */
  readonly columns: readonly string[];
  /** 需要单独转储的隐式 rowid 关键字；rowid 别名表、`WITHOUT ROWID` 表与虚表为 `null`。 */
  readonly rowid: SqliteRowidKeyword | null;
}

/** 归档里的索引、视图、触发器。 */
export interface SqliteBackupObject {
  readonly type: 'index' | 'view' | 'trigger';
  readonly name: string;
  readonly tblName: string;
  readonly sql: string;
}

/** `sqlite_sequence` 的一行；`seq` 用十进制文本保存，避免超过 2^53 时丢精度。 */
export interface SqliteBackupSequence {
  readonly name: string;
  readonly seq: string;
}

/** 归档条目 `sqlite/schema.json` 的内容。 */
export interface SqliteBackupSchema {
  readonly version: typeof SQLITE_BACKUP_SCHEMA_VERSION;
  readonly userVersion: number;
  readonly applicationId: number;
  /** 按 `sqlite_schema` 的创建顺序。 */
  readonly tables: readonly SqliteBackupTable[];
  /** 按 `sqlite_schema` 的创建顺序。 */
  readonly objects: readonly SqliteBackupObject[];
  readonly sequences: readonly SqliteBackupSequence[];
}

/** 归档条目 `sqlite/summary.json` 的内容：每张表转储的行数，下标与 {@link SqliteBackupSchema.tables} 对应。 */
export interface SqliteBackupSummary {
  readonly rows: readonly number[];
}

/** 结构语句的对象类型。 */
export type SqliteSchemaSqlType = 'table' | 'index' | 'view' | 'trigger';

const corrupt = (message: string, field?: string, actual?: unknown): RxDBBackupError =>
  new RxDBBackupError('corrupt_archive', message, field === undefined ? {} : { details: { field, actual } });

// ─── 行字面量 ────────────────────────────────────────────────────────────────

const CHAR_0 = 48;
const CHAR_9 = 57;
const CAST_PREFIX = "CAST(X'";
const CAST_SUFFIX = "' AS TEXT)";

const isDigit = (code: number): boolean => code >= CHAR_0 && code <= CHAR_9;

const isHexDigit = (code: number): boolean =>
  isDigit(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);

/** 从 `at` 起读至少一位数字，返回数字之后的位置；一位都没有返回 -1。 */
const scanDigits = (text: string, at: number): number => {
  let i = at;
  while (i < text.length && isDigit(text.charCodeAt(i))) i++;
  return i === at ? -1 : i;
};

/** `-?\d+(\.\d+)?([eE][+-]?\d+)?` */
const scanNumber = (text: string, at: number): number => {
  let i = scanDigits(text, text[at] === '-' ? at + 1 : at);
  if (i >= 0 && text[i] === '.') i = scanDigits(text, i + 1);
  if (i < 0 || (text[i] !== 'e' && text[i] !== 'E')) return i;
  const sign = text[i + 1] === '+' || text[i + 1] === '-' ? 1 : 0;
  return scanDigits(text, i + 1 + sign);
};

/** `'...'`，内部 `''` 转义；NUL 不允许出现（备份端用 CAST 形式转储含 NUL 的文本）。 */
const scanText = (text: string, at: number): number => {
  let i = at + 1;
  for (;;) {
    const quote = text.indexOf("'", i);
    if (quote < 0) return -1;
    if (text.slice(i, quote).includes('\u0000')) return -1;
    if (text[quote + 1] !== "'") return quote + 1;
    i = quote + 2;
  }
};

/** 偶数位 hex 直到 `'`，返回 `'` 之后的位置。 */
const scanHexBody = (text: string, at: number): number => {
  let i = at;
  while (i < text.length && isHexDigit(text.charCodeAt(i))) i++;
  if (text[i] !== "'" || (i - at) % 2 !== 0) return -1;
  return i + 1;
};

const scanCast = (text: string, at: number): number => {
  if (!text.startsWith(CAST_PREFIX, at)) return -1;
  const end = scanHexBody(text, at + CAST_PREFIX.length);
  if (end < 0 || !text.startsWith(CAST_SUFFIX, end - 1)) return -1;
  return end - 1 + CAST_SUFFIX.length;
};

/** 读一个字面量，返回之后的位置；不合法返回 -1。 */
const scanLiteral = (text: string, at: number): number => {
  const head = text[at];
  if (head === "'") return scanText(text, at);
  if (head === 'N') return text.startsWith('NULL', at) ? at + 4 : -1;
  if (head === 'X') return text[at + 1] === "'" ? scanHexBody(text, at + 2) : -1;
  if (head === 'C') return scanCast(text, at);
  return scanNumber(text, at);
};

/** 读一行 `(lit,…)`，返回之后的位置；不合法或列数不符返回 -1。 */
const scanRow = (text: string, at: number, arity: number): number => {
  if (text[at] !== '(') return -1;
  let i = at + 1;
  for (let column = 0; column < arity; column++) {
    if (column > 0 && text[i++] !== ',') return -1;
    i = scanLiteral(text, i);
    if (i < 0) return -1;
  }
  return text[i] === ')' ? i + 1 : -1;
};

/**
 * 校验一个行条目的文本并返回行数。
 *
 * @remarks
 * 文法：`row (',' row)*`，`row := '(' lit (',' lit){arity-1} ')'`，字面量只能是 `quote()` 的产出：
 * `NULL`、整数、实数（含 `9.0e+999` 这类无穷大写法）、`'text'`、`X'hex'`，以及备份端给含 NUL 的
 * 文本用的 `CAST(X'hex' AS TEXT)`。不允许任何空白。
 *
 * @param text - 条目文本
 * @param arity - 每行的列数，至少为 1
 * @returns 行数
 * @throws RxDBBackupError `corrupt_archive`
 */
export const countSqliteRowLiterals = (text: string, arity: number): number => {
  let rows = 0;
  let i = 0;
  while (arity > 0) {
    i = scanRow(text, i, arity);
    if (i < 0) break;
    rows++;
    if (i === text.length) return rows;
    if (text[i++] !== ',') break;
  }
  throw corrupt('Backup row entry is not a list of SQLite literals');
};

// ─── 结构 SQL ────────────────────────────────────────────────────────────────

const QUOTE_CLOSERS: Readonly<Record<string, string>> = { "'": "'", '"': '"', '`': '`', '[': ']' };

/** 跳过一段引号内容，返回之后的位置；未闭合返回 -1。`[]` 没有转义，其余三种用重复引号转义。 */
const skipQuoted = (sql: string, at: number): number => {
  const closer = QUOTE_CLOSERS[sql[at]];
  let i = at + 1;
  for (;;) {
    const end = sql.indexOf(closer, i);
    if (end < 0) return -1;
    if (closer === ']' || sql[end + 1] !== closer) return end + 1;
    i = end + 2;
  }
};

const skipComment = (sql: string, at: number): number => {
  if (sql.startsWith('--', at)) {
    const end = sql.indexOf('\n', at);
    return end < 0 ? sql.length : end + 1;
  }
  const end = sql.indexOf('*/', at + 2);
  return end < 0 ? -1 : end + 2;
};

/**
 * 去掉字符串、带引号的标识符与注释，各替换成一个空格。
 *
 * @returns 只剩关键字、裸标识符、数字与标点的文本；有未闭合的引号或注释时为 `null`
 */
const stripSqlNoise = (sql: string): string | null => {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    const isComment = sql.startsWith('--', i) || sql.startsWith('/*', i);
    if (!isComment && QUOTE_CLOSERS[char] === undefined) {
      out += char;
      i++;
      continue;
    }
    i = isComment ? skipComment(sql, i) : skipQuoted(sql, i);
    if (i < 0) return null;
    out += ' ';
  }
  return out;
};

const HEADERS: Readonly<Record<SqliteSchemaSqlType, RegExp>> = {
  table: /^\s*CREATE\s+(VIRTUAL\s+)?TABLE\s/i,
  index: /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s/i,
  view: /^\s*CREATE\s+VIEW\s/i,
  trigger: /^\s*CREATE\s+TRIGGER\s/i
};

/** 触发器体里 SQLite 允许的语句开头。 */
const TRIGGER_COMMAND = /^\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i;

/**
 * 触发器体必须是 `BEGIN (cmd ;)+ END`，并且 END 就是全文结尾。
 *
 * @remarks
 * SQLite 以「分号之后紧跟的 END」结束触发器。每个分号之后的片段都必须以 DML 关键字开头，
 * 所以唯一一个紧跟分号的 END 就是最后那个，结尾之后不可能再藏第二条语句。表达式里的
 * `CASE … END` 不紧跟分号，不受影响。头部出现名为 begin 的裸标识符会被误切，结果是拒绝而不是放行。
 */
const isSingleTrigger = (stripped: string): boolean => {
  const begin = /\bBEGIN\b/i.exec(stripped);
  if (!begin || stripped.slice(0, begin.index).includes(';')) return false;
  const segments = stripped.slice(begin.index + begin[0].length).split(';');
  const last = segments.pop();
  if (segments.length === 0 || last?.trim().toUpperCase() !== 'END') return false;
  return segments.every(segment => TRIGGER_COMMAND.test(segment));
};

/**
 * 确认一段结构 SQL 是且仅是一条指定类型的 `CREATE` 语句。
 *
 * @remarks
 * 只允许在 main 库里建对象（拒绝 `TEMP`）。去掉字符串、标识符与注释后，非触发器语句不得出现分号；
 * 触发器按 {@link isSingleTrigger} 的规则核对。NUL 一律拒绝：C 接口会在 NUL 处截断语句。
 *
 * @param sql - `sqlite_schema.sql` 原文
 * @param type - 期望的对象类型
 * @throws RxDBBackupError `corrupt_archive`
 */
export const assertSqliteSchemaSql = (sql: string, type: SqliteSchemaSqlType): void => {
  const stripped = sql.includes('\u0000') ? null : stripSqlNoise(sql);
  const valid =
    stripped !== null &&
    HEADERS[type].test(stripped) &&
    (type === 'trigger' ? isSingleTrigger(stripped) : !stripped.includes(';'));
  if (!valid) throw corrupt(`Backup schema contains an invalid ${type} statement`, 'sql', sql);
};

/**
 * 取虚表建表语句里的模块名（小写）。
 *
 * @remarks
 * 先去掉字符串、带引号的标识符与注释再找 `USING`，表名或模块参数里的同名单词不会被误认。
 *
 * @param sql - `CREATE VIRTUAL TABLE` 原文
 * @returns 模块名；不是虚表语句或引号未闭合时为 `null`
 */
export const sqliteVirtualTableModule = (sql: string): string | null => {
  const stripped = stripSqlNoise(sql);
  if (stripped === null || !HEADERS.table.test(stripped)) return null;
  const match = /\bUSING\s+(\w+)/i.exec(stripped);
  return match ? match[1].toLowerCase() : null;
};

// ─── schema.json / summary.json ──────────────────────────────────────────────

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;
const INTEGER_TEXT = /^-?\d{1,19}$/;

const objectOf = (value: unknown, field: string): Json => {
  if (!isObject(value)) throw corrupt(`Backup schema field "${field}" is invalid`, field, value);
  return value;
};

const arrayAt = (node: Json, key: string, field: string): unknown[] => {
  const value = node[key];
  if (!Array.isArray(value)) throw corrupt(`Backup schema field "${field}" is invalid`, field, value);
  return value;
};

const int32At = (node: Json, key: string, field: string): number => {
  const value = node[key];
  if (!Number.isInteger(value) || (value as number) < INT32_MIN || (value as number) > INT32_MAX) {
    throw corrupt(`Backup schema field "${field}" is invalid`, field, value);
  }
  return value as number;
};

const nameAt = (node: Json, key: string, field: string): string => {
  const value = node[key];
  const valid =
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\u0000') &&
    !value.toLowerCase().startsWith('sqlite_') &&
    value.toLowerCase() !== SQLITE_RESTORE_MARKER_TABLE;
  if (!valid) throw corrupt(`Backup schema field "${field}" is invalid`, field, value);
  return value;
};

const oneOf = <T extends string>(node: Json, key: string, field: string, allowed: readonly T[]): T => {
  const value = node[key];
  if (!allowed.includes(value as T)) throw corrupt(`Backup schema field "${field}" is invalid`, field, value);
  return value as T;
};

const columnsAt = (node: Json, field: string): string[] => {
  const columns = arrayAt(node, 'columns', field);
  const seen = new Set<string>();
  for (const column of columns) {
    const valid = typeof column === 'string' && column.length > 0 && !column.includes('\u0000');
    const key = valid ? column.toLowerCase() : '';
    if (!valid || seen.has(key)) throw corrupt(`Backup schema field "${field}" is invalid`, field, column);
    seen.add(key);
  }
  return columns as string[];
};

const parseTable = (raw: unknown, index: number): SqliteBackupTable => {
  const field = `tables[${index}]`;
  const node = objectOf(raw, field);
  const kind = oneOf(node, 'kind', `${field}.kind`, ['normal', 'virtual', 'shadow'] as const);
  const columns = columnsAt(node, `${field}.columns`);
  const rowid = node['rowid'] === null ? null : oneOf(node, 'rowid', `${field}.rowid`, SQLITE_ROWID_KEYWORDS);
  const virtual = kind === 'virtual';
  const shadowed = rowid !== null && columns.some(column => column.toLowerCase() === rowid);
  if (virtual !== (columns.length === 0) || (virtual && rowid !== null) || shadowed) {
    throw corrupt(`Backup schema table "${field}" has an invalid column layout`, field, node);
  }
  const sql = node['sql'];
  if (typeof sql !== 'string') throw corrupt(`Backup schema field "${field}.sql" is invalid`, `${field}.sql`, sql);
  return { name: nameAt(node, 'name', `${field}.name`), kind, sql, columns: [...columns], rowid };
};

const parseObject = (raw: unknown, index: number): SqliteBackupObject => {
  const field = `objects[${index}]`;
  const node = objectOf(raw, field);
  const sql = node['sql'];
  if (typeof sql !== 'string') throw corrupt(`Backup schema field "${field}.sql" is invalid`, `${field}.sql`, sql);
  return {
    type: oneOf(node, 'type', `${field}.type`, ['index', 'view', 'trigger'] as const),
    name: nameAt(node, 'name', `${field}.name`),
    tblName: nameAt(node, 'tblName', `${field}.tblName`),
    sql
  };
};

const parseSequence = (raw: unknown, index: number, tables: ReadonlySet<string>): SqliteBackupSequence => {
  const field = `sequences[${index}]`;
  const node = objectOf(raw, field);
  const { name, seq } = node;
  if (typeof name !== 'string' || !tables.has(name) || typeof seq !== 'string' || !INTEGER_TEXT.test(seq)) {
    throw corrupt(`Backup schema field "${field}" is invalid`, field, node);
  }
  return { name, seq };
};

const assertUniqueNames = (names: readonly string[]): void => {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw corrupt(`Backup schema declares "${name}" twice`, 'name', name);
    seen.add(key);
  }
};

/**
 * 校验并规范化 `sqlite/schema.json`。
 *
 * @remarks
 * 这里只核对结构；结构语句本身由 {@link assertSqliteSchemaSql} 在执行前逐条核对。
 * 对象名（表、索引、视图、触发器共用一个命名空间）大小写不敏感地唯一，不能以 `sqlite_` 开头，
 * 也不能与恢复标记表同名。返回值是新对象，不引用输入。
 *
 * @param value - `JSON.parse` 的结果
 * @returns 结构合格的 schema
 * @throws RxDBBackupError `corrupt_archive`
 */
export const parseSqliteBackupSchema = (value: unknown): SqliteBackupSchema => {
  const root = objectOf(value, 'schema');
  if (root['version'] !== SQLITE_BACKUP_SCHEMA_VERSION) {
    throw corrupt('Backup schema version is not supported', 'version', root['version']);
  }
  const tables = arrayAt(root, 'tables', 'tables').map(parseTable);
  const objects = arrayAt(root, 'objects', 'objects').map(parseObject);
  assertUniqueNames([...tables.map(table => table.name), ...objects.map(object => object.name)]);
  const normalTables = new Set(tables.filter(table => table.kind === 'normal').map(table => table.name));
  return {
    version: SQLITE_BACKUP_SCHEMA_VERSION,
    userVersion: int32At(root, 'userVersion', 'userVersion'),
    applicationId: int32At(root, 'applicationId', 'applicationId'),
    tables,
    objects,
    sequences: arrayAt(root, 'sequences', 'sequences').map((raw, index) => parseSequence(raw, index, normalTables))
  };
};

/**
 * 校验 `sqlite/summary.json`。
 *
 * @param value - `JSON.parse` 的结果
 * @param tableCount - schema 里的表数
 * @returns 每张表的行数
 * @throws RxDBBackupError `corrupt_archive`
 */
export const parseSqliteBackupSummary = (value: unknown, tableCount: number): SqliteBackupSummary => {
  const rows = isObject(value) ? value['rows'] : undefined;
  const valid =
    Array.isArray(rows) &&
    rows.length === tableCount &&
    rows.every(count => Number.isSafeInteger(count) && (count as number) >= 0);
  if (!valid) throw corrupt('Backup summary is invalid', 'summary', value);
  return { rows: [...(rows as number[])] };
};
