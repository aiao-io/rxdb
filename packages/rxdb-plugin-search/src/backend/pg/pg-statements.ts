/**
 * PostgreSQL 多语句拆分。
 *
 * 为什么需要：`@aiao/rxdb-adapter-pglite` 的 `fts/` 模块（已进 API 基线，签名不动）
 * 把 DDL 以 `;` 拼接成一段返回，而插件手里只有 {@link RuntimeSqlExecutor.rawQuery}，
 * 它落到 PGlite 的 `query()` 上走的是 **extended query protocol**——一次只接受一条语句，
 * 多条会直接报 `cannot insert multiple commands into a prepared statement`。
 *
 * 为什么不能用 `sql.split(';')`：trigger 函数体是 `$$ ... $$` 美元引用，内部含多个 `;`
 * （`RETURN NEW;`、`END;`），裸切会把一条 `CREATE FUNCTION` 撕成语法垃圾。
 *
 * 与 SQLite 侧的对比：SQLite 适配器的 `rawQuery` 本身接受多语句批，所以 FTS5 安装器
 * 才能把「清空 + 回填 + 建 trigger」压在同一次调用里保证原子性。PG 没有这个便利，
 * 但也不需要——PG 的 trigger 是 `BEFORE ... FOR EACH ROW` 直接算列值，不存在
 * FTS5 外部内容虚拟表那种「trigger 早于回填 = 索引损坏」的时序陷阱。
 *
 * @packageDocumentation
 */

/** 美元引用起始标记：`$$` 或 `$tag$` */
const DOLLAR_TAG_RE = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/;

/**
 * 按语句边界拆分一段 PostgreSQL SQL。
 *
 * 能正确跳过下列结构内部的 `;`：
 *  - 单引号字符串（含 `''` 转义）
 *  - 双引号标识符（含 `""` 转义）
 *  - 美元引用块（`$$ ... $$` / `$tag$ ... $tag$`）
 *  - 行注释与块注释（块注释按 PostgreSQL 语义支持嵌套）
 *
 * @param sql - 一段可能含多条语句的 SQL
 * @returns 去掉尾分号并 trim 后的语句列表；空语句被丢弃
 * @internal
 */
export const splitPgStatements = (sql: string): readonly string[] => {
  const statements: string[] = [];
  let start = 0;
  let index = 0;
  const push = (end: number): void => {
    const statement = sql.slice(start, end).trim();
    if (statement.length > 0) statements.push(statement);
    start = end + 1;
  };

  while (index < sql.length) {
    const char = sql[index];
    if (char === ';') {
      push(index);
      index += 1;
      continue;
    }
    index = skipOpaqueRegion(sql, index);
  }
  push(sql.length);
  return statements;
};

/**
 * 若 `index` 处是一段「内部 `;` 不算语句边界」的区域，跳到它之后；否则前进一个字符。
 *
 * 抽成独立函数是为了让 {@link splitPgStatements} 的主循环保持单层：
 * 五种区域各自的扫描逻辑塞进 while 里会立刻超过三层嵌套。
 */
const skipOpaqueRegion = (sql: string, index: number): number => {
  const char = sql[index];
  if (char === "'" || char === '"') return skipQuoted(sql, index, char);
  if (char === '$') {
    const tag = DOLLAR_TAG_RE.exec(sql.slice(index))?.[0];
    if (tag) {
      const end = sql.indexOf(tag, index + tag.length);
      return end < 0 ? sql.length : end + tag.length;
    }
  }
  if (char === '-' && sql[index + 1] === '-') {
    const end = sql.indexOf('\n', index);
    return end < 0 ? sql.length : end + 1;
  }
  if (char === '/' && sql[index + 1] === '*') return skipBlockComment(sql, index);
  return index + 1;
};

/** 跳过引号包裹的区间；`''` / `""` 视为区间内的转义而非结束。 */
const skipQuoted = (sql: string, index: number, quote: string): number => {
  let cursor = index + 1;
  while (cursor < sql.length) {
    if (sql[cursor] !== quote) {
      cursor += 1;
      continue;
    }
    if (sql[cursor + 1] === quote) {
      cursor += 2;
      continue;
    }
    return cursor + 1;
  }
  return sql.length;
};

/** 跳过块注释；PostgreSQL 的块注释可嵌套。 */
const skipBlockComment = (sql: string, index: number): number => {
  let depth = 0;
  let cursor = index;
  while (cursor < sql.length) {
    if (sql[cursor] === '/' && sql[cursor + 1] === '*') {
      depth += 1;
      cursor += 2;
      continue;
    }
    if (sql[cursor] === '*' && sql[cursor + 1] === '/') {
      depth -= 1;
      cursor += 2;
      if (depth === 0) return cursor;
      continue;
    }
    cursor += 1;
  }
  return sql.length;
};
