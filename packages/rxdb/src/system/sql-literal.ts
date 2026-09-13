/**
 * @fileoverview 六个后端共用同一条语句时的 SQL 字面量与标识符拼装。
 *
 * @remarks
 * 只服务一类语句：**必须是单条、且不能带占位符**的条件写入（CAS）。epic-006 里有两处
 * 这样的语句——能力启用（`commit/commit-capability.ts`）与 HEAD 推进
 * （`commit/write-commit.ts`）——它们共用同一个约束：判据与写入必须落在同一条语句里，
 * 否则「命中 0 行」就不再是幂等与冲突的判据，而只是一个事后观察到的数字。
 *
 * 为什么不走占位符：`?`（SQLite 家族）与 `$1`（PGlite）方言不同，而这两条语句在 6 个
 * 后端上是**同一个字符串**。一旦引入占位符，这里就得按后端分叉，判据也跟着分叉成 6 份。
 * 代价是值必须自己转义，所以本文件的每个函数都**拒绝**它转不动的输入，而不是尽力而为：
 * 拼 SQL 的地方一旦开始「尽力而为」，转义失败就会变成一条语法正确、语义错误的语句。
 *
 * **不要**把它当通用查询构造器用。普通读写一律走 `IRepository` / `TransactionExecutor`
 * 的参数化路径；那里方言差异由适配器负责，不需要任何一方自己拼字符串。
 */

import { RxDBError } from '../RxDBError.js';

/** PostgreSQL 的 text/varchar 不接受 NUL，SQLite 则会在 NUL 处截断——两边都不能放行。 */
const NUL = '\u0000';

/**
 * 把标识符（表名、列名）包成双引号形式。
 *
 * @param identifier - 标识符原文，通常取自实体元数据的 `tableName` / `columnName`
 * @returns 双引号包裹、内部双引号已按 SQL 标准加倍的标识符
 *
 * @remarks
 * 双引号是 SQL 标准的定界标识符语法，PostgreSQL 与 SQLite 家族都认。加引号不只是防注入：
 * 不加引号时两边都会折叠大小写（PostgreSQL 折成小写），而本仓的列名是 `enabledAt` 这类
 * 驼峰——不加引号的 CAS 会在 PGlite 上找不到列。
 *
 * @throws {@link RxDBError} 标识符为空或含 NUL 时
 */
export const quoteSqlIdentifier = (identifier: string): string => {
  if (identifier.length === 0 || identifier.includes(NUL)) {
    throw new RxDBError(`不能作为 SQL 标识符：${JSON.stringify(identifier)}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
};

/**
 * 把字符串拼成 SQL 字符串字面量。
 *
 * @param value - 字符串原文（可能来自调用方，如分支 ID）
 * @returns 单引号包裹、内部单引号已加倍的字面量
 *
 * @remarks
 * 单引号加倍是 SQL 标准转义，对 PostgreSQL（`standard_conforming_strings` 自 9.1 起默认为
 * `on`，反斜杠不再是转义符）与 SQLite（反斜杠从来就不是转义符）都完备——两边都不需要，
 * 也**不应该**再对反斜杠做任何处理。
 *
 * @throws {@link RxDBError} 值含 NUL 时：PostgreSQL 会拒绝整条语句，SQLite 会静默截断，
 *   两种结果都比抛错难排查
 */
export const sqlStringLiteral = (value: string): string => {
  if (value.includes(NUL)) {
    throw new RxDBError('SQL 字符串字面量不能包含 NUL（\\u0000）');
  }
  return `'${value.replaceAll("'", "''")}'`;
};

/**
 * 把整数拼成 SQL 数值字面量。
 *
 * @param value - 整数值（分支 generation、headRevision 等）
 * @returns 十进制字面量
 *
 * @remarks
 * 只收安全整数。`NaN` / `Infinity` 会拼出标识符而不是数字（在 PostgreSQL 上还恰好是合法的
 * 浮点输入），`1e21` 会拼出指数形式——三者都能通过语法检查，然后比较出错误的结果。
 *
 * @throws {@link RxDBError} 值不是安全整数时
 */
export const sqlIntegerLiteral = (value: number): string => {
  if (!Number.isSafeInteger(value)) {
    throw new RxDBError(`不是安全整数，不能内联进 SQL：${String(value)}`);
  }
  return String(value);
};

/**
 * 把布尔值拼成 SQL 布尔字面量。
 *
 * @param value - 布尔值
 * @returns `'true'` 或 `'false'`
 *
 * @remarks
 * PostgreSQL 有原生 `boolean`；SQLite 自 3.23 起认 `TRUE` / `FALSE` 关键字并求值为 1 / 0，
 * 恰好等于本仓 `PropertyType.boolean` 在 SQLite 上的存储形态（INTEGER 0/1）。
 * 因此同一个字面量在两边都对，不需要按后端分叉成 `1` / `0`。
 */
export const sqlBooleanLiteral = (value: boolean): string => (value ? 'true' : 'false');

/**
 * 把时刻拼成 SQL 字符串字面量（ISO 8601，UTC）。
 *
 * @param value - 时刻
 * @returns ISO 8601 字符串字面量
 *
 * @remarks
 * 与两边的日期列存储形态一致：PGlite 的 `timestamptz` 接受 ISO 文本的赋值转换，
 * SQLite 家族本就把 `PropertyType.date` 存成 ISO TEXT。
 *
 * @throws {@link RxDBError} 值是 Invalid Date 时——它会拼出 `'Invalid Date'` 这个字符串，
 *   在 SQLite 上安静落库，在 PGlite 上要到执行时才炸
 */
export const sqlTimestampLiteral = (value: Date): string => {
  if (Number.isNaN(value.getTime())) {
    throw new RxDBError('Invalid Date 不能内联进 SQL');
  }
  return sqlStringLiteral(value.toISOString());
};
