/**
 * SQL 方言抽象
 * 处理不同数据库之间的 SQL 语法差异
 *
 * T006-T007: PostgreSQL 方言实现
 */

/**
 * SQL 方言接口
 * 定义数据库特定的 SQL 语法转换方法
 */
export interface ISqlDialect {
  /**
   * 获取自增主键的 RETURNING 子句
   * @returns RETURNING 子句字符串
   */
  getReturningClause(): string;

  /**
   * 获取参数占位符
   * @param index - 参数索引（从 1 开始）
   * @returns 占位符字符串
   */
  getParameterPlaceholder(index: number): string;

  /**
   * 转义标识符（表名、列名等）
   * @param identifier - 标识符
   * @returns 转义后的标识符
   */
  escapeIdentifier(identifier: string): string;

  /**
   * 获取 JSON 提取操作符
   * @returns JSON 提取操作符
   */
  getJsonExtractOperator(): string;

  /**
   * 获取字符串连接操作符
   * @returns 字符串连接操作符
   */
  getConcatOperator(): string;
}

/**
 * PostgreSQL 方言实现
 *
 * 关键差异：
 * - 参数占位符：$1, $2, $3（而不是 SQLite 的 ?）
 * - RETURNING 子句：支持返回插入/更新的行
 * - 标识符转义：双引号
 * - JSON 操作符：->> 和 ->
 * - 字符串连接：||
 */
export class PostgreSQLDialect implements ISqlDialect {
  getReturningClause(): string {
    return 'RETURNING *';
  }

  getParameterPlaceholder(index: number): string {
    return `$${index}`;
  }

  escapeIdentifier(identifier: string): string {
    // PostgreSQL 使用双引号转义标识符
    // 需要将内部的双引号加倍
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  getJsonExtractOperator(): string {
    // ->> 提取为文本，-> 提取为 JSON
    return '->>';
  }

  getConcatOperator(): string {
    return '||';
  }

  /**
   * 生成批量插入 SQL（带 RETURNING）
   * @param tableName - 表名
   * @param columns - 列名数组
   * @param rowCount - 行数
   * @returns SQL 语句
   */
  generateBatchInsert(tableName: string, columns: string[], rowCount: number): string {
    const escapedTable = this.escapeIdentifier(tableName);
    const escapedColumns = columns.map(c => this.escapeIdentifier(c)).join(', ');

    const valueSets: string[] = [];
    let paramIndex = 1;

    for (let i = 0; i < rowCount; i++) {
      const placeholders = columns.map(() => this.getParameterPlaceholder(paramIndex++)).join(', ');
      valueSets.push(`(${placeholders})`);
    }

    return `INSERT INTO ${escapedTable} (${escapedColumns}) VALUES ${valueSets.join(', ')} ${this.getReturningClause()}`;
  }

  /**
   * 生成批量更新 SQL（使用 UPDATE ... FROM 模式）
   *
   * 每行占 `1 + updateColumns.length` 个参数，顺序是「主键, ...更新列」。
   *
   * 原实现固定生成 `FROM (VALUES ($1))`，别名列表却声明 1+N 列，
   * 且更新列名未转义 —— 送进 PG 是 42P10
   * (`table "temp" has 1 columns available but N columns specified`)，
   * 而三条既有用例把这个形态 `toContain` 成了正确期望（PGL-014）。
   *
   * `VALUES` 里的参数在 PG 眼里是 text。目标列不是文本类型时，必须通过
   * `columnTypes` 给出目标类型，否则 PG 报
   * `column "age" is of type integer but expression is of type text` ——
   * 本方法拿不到实体 metadata，类型只能由调用方提供。
   *
   * @param tableName - 表名
   * @param pkColumn - 主键列名
   * @param updateColumns - 更新列名数组
   * @param rowCount - 批量行数，默认 1
   * @param columnTypes - 列名 → PostgreSQL 类型，用于生成 `::type` 转换；未给出的列按 text 处理
   * @returns SQL 模板
   * @throws {Error} `rowCount` 小于 1 或 `updateColumns` 为空
   */
  generateBatchUpdate(
    tableName: string,
    pkColumn: string,
    updateColumns: string[],
    rowCount = 1,
    columnTypes: Readonly<Record<string, string>> = {}
  ): string {
    if (updateColumns.length === 0) {
      throw new Error('generateBatchUpdate: updateColumns must not be empty');
    }
    if (!Number.isInteger(rowCount) || rowCount < 1) {
      throw new Error(`generateBatchUpdate: rowCount must be a positive integer, received ${String(rowCount)}`);
    }

    const escapedTable = this.escapeIdentifier(tableName);
    const escapedPk = this.escapeIdentifier(pkColumn);
    const escapedUpdateColumns = updateColumns.map(col => this.escapeIdentifier(col));
    const castFor = (column: string): string => {
      const type = columnTypes[column];
      if (type === undefined) return '';
      // 类型名会**原样拼进 SQL**，只放行标识符 + 可选数组后缀（`int`、`double precision`、`text[]`）
      if (!/^[A-Za-z_][A-Za-z0-9_ ]*(\[\])*$/.test(type)) {
        throw new Error(`generateBatchUpdate: invalid column type ${JSON.stringify(type)}`);
      }
      return `::${type}`;
    };
    const setClause = updateColumns
      .map((col, index) => `${escapedUpdateColumns[index]} = temp.${escapedUpdateColumns[index]}${castFor(col)}`)
      .join(', ');

    // PostgreSQL 支持 UPDATE ... FROM 语法，使用 VALUES 作为临时表
    const columnsPerRow = 1 + updateColumns.length;
    let paramIndex = 1;
    const valueSets: string[] = [];
    for (let row = 0; row < rowCount; row++) {
      const placeholders = Array.from({ length: columnsPerRow }, () => this.getParameterPlaceholder(paramIndex++));
      valueSets.push(`(${placeholders.join(', ')})`);
    }

    return `UPDATE ${escapedTable} SET ${setClause} FROM (VALUES ${valueSets.join(', ')}) AS temp(${escapedPk}, ${escapedUpdateColumns.join(', ')}) WHERE ${escapedTable}.${escapedPk} = temp.${escapedPk} ${this.getReturningClause()}`;
  }
}

/**
 * 默认导出 PostgreSQL 方言实例
 */
export const pgDialect = new PostgreSQLDialect();
