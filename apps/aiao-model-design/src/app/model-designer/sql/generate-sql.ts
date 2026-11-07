/**
 * SqlSchema → CREATE SQL
 */
import { quoteIdent, trackEscaped } from './quote';
import type { GenerateSqlResult, SqlColumn, SqlSchema, SqlTable } from './types';

function formatDefault(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const trimmed = value.trim();
  if (/^(true|false|null)$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed;
  return `'${trimmed.replaceAll("'", "''")}'`;
}

function columnLine(table: string, col: SqlColumn, escaped: Set<string>): string {
  trackEscaped(escaped, `${table}.${col.name}`, col.name);
  const parts = [quoteIdent(col.name), col.type];
  if (col.primaryKey) parts.push('PRIMARY KEY');
  if (!col.nullable && !col.primaryKey) parts.push('NOT NULL');
  if (col.unique && !col.primaryKey) parts.push('UNIQUE');
  const def = formatDefault(col.defaultValue);
  if (def != null) parts.push(`DEFAULT ${def}`);
  if (col.check) parts.push(`CHECK (${col.check})`);
  return `  ${parts.join(' ')}`;
}

function createTableSql(table: SqlTable, escaped: Set<string>): string {
  trackEscaped(escaped, table.name, table.name);
  const lines = table.columns.map(c => columnLine(table.name, c, escaped));
  return `CREATE TABLE ${quoteIdent(table.name)} (\n${lines.join(',\n')}\n);`;
}

function createForeignKeySql(table: SqlTable, escaped: Set<string>): string[] {
  return table.foreignKeys.map(fk => {
    trackEscaped(escaped, `${table.name}.${fk.column}`, fk.column);
    trackEscaped(escaped, fk.refTable, fk.refTable);
    const onDel = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
    const onUpd = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
    return `ALTER TABLE ${quoteIdent(table.name)} ADD CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.refTable)} (${quoteIdent(fk.refColumn)})${onDel}${onUpd};`;
  });
}

function createIndexSql(table: SqlTable, escaped: Set<string>): string[] {
  return table.indexes.map(idx => {
    trackEscaped(escaped, idx.name, idx.name);
    const cols = idx.columns.map(c => {
      trackEscaped(escaped, `${table.name}.${c}`, c);
      return quoteIdent(c);
    });
    const unique = idx.unique ? 'UNIQUE ' : '';
    return `CREATE ${unique}INDEX ${quoteIdent(idx.name)} ON ${quoteIdent(table.name)} (${cols.join(', ')});`;
  });
}

/**
 * 从 SqlSchema 生成完整 CREATE DDL
 */
export function generateCreateSql(schema: SqlSchema): GenerateSqlResult {
  const escaped = new Set<string>();
  const statements: string[] = [];
  for (const table of schema.tables) {
    statements.push(createTableSql(table, escaped));
    statements.push(...createIndexSql(table, escaped));
  }
  for (const table of schema.tables) statements.push(...createForeignKeySql(table, escaped));
  const header = escaped.size > 0 ? `-- escaped: ${[...escaped].sort().join(', ')}\n` : '';
  return {
    sql: header + statements.join('\n\n'),
    escapedIdentifiers: [...escaped].sort()
  };
}

/**
 * 检测 SQL 是否含破坏性语句
 */
export function isDestructiveSql(sql: string): boolean {
  return /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT)\b/i.test(sql);
}
