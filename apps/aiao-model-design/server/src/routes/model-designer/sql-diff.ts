/**
 * SqlSchema diff（API 侧纯函数副本，避免 api 依赖 Angular 包）
 * 规则与 packages/rxdb-model-designer/src/sql/diff-schema 对齐
 */

export interface SqlColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string | null;
  check?: string | null;
}

export interface SqlForeignKey {
  name: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: string | null;
  onUpdate?: string | null;
}

export interface SqlIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface SqlTable {
  name: string;
  columns: SqlColumn[];
  foreignKeys: SqlForeignKey[];
  indexes: SqlIndex[];
}

export interface SqlSchema {
  tables: SqlTable[];
}

function quoteIdent(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name;
  return `"${name.replaceAll('"', '""')}"`;
}

function columnsEqual(a: SqlColumn, b: SqlColumn): boolean {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    !!a.primaryKey === !!b.primaryKey &&
    !!a.unique === !!b.unique &&
    (a.defaultValue ?? null) === (b.defaultValue ?? null) &&
    (a.check ?? null) === (b.check ?? null)
  );
}

function createTableSql(table: SqlTable): string {
  const lines = table.columns.map(col => {
    const parts = [quoteIdent(col.name), col.type];
    if (col.primaryKey) parts.push('PRIMARY KEY');
    if (!col.nullable && !col.primaryKey) parts.push('NOT NULL');
    if (col.unique && !col.primaryKey) parts.push('UNIQUE');
    return `  ${parts.join(' ')}`;
  });
  for (const fk of table.foreignKeys) {
    const onDel = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
    const onUpd = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
    lines.push(
      `  CONSTRAINT ${quoteIdent(fk.name)} FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.refTable)} (${quoteIdent(fk.refColumn)})${onDel}${onUpd}`
    );
  }
  const stmts = [`CREATE TABLE ${quoteIdent(table.name)} (\n${lines.join(',\n')}\n);`];
  for (const idx of table.indexes) {
    const cols = idx.columns.map(c => quoteIdent(c)).join(', ');
    const unique = idx.unique ? 'UNIQUE ' : '';
    stmts.push(`CREATE ${unique}INDEX ${quoteIdent(idx.name)} ON ${quoteIdent(table.name)} (${cols});`);
  }
  return stmts.join('\n');
}

/**
 * desired vs remote → diff SQL
 */
export function diffSqlSchema(desired: SqlSchema, remote: SqlSchema): string {
  const statements: string[] = [];
  const desiredMap = new Map(desired.tables.map(t => [t.name, t]));
  const remoteMap = new Map(remote.tables.map(t => [t.name, t]));

  for (const name of remoteMap.keys()) {
    if (!desiredMap.has(name)) statements.push(`DROP TABLE ${quoteIdent(name)};`);
  }

  for (const [name, table] of desiredMap) {
    if (!remoteMap.has(name)) statements.push(createTableSql(table));
  }

  for (const [name, desiredTable] of desiredMap) {
    const remoteTable = remoteMap.get(name);
    if (!remoteTable) continue;
    const dCols = new Map(desiredTable.columns.map(c => [c.name, c]));
    const rCols = new Map(remoteTable.columns.map(c => [c.name, c]));

    for (const colName of rCols.keys()) {
      if (!dCols.has(colName)) {
        statements.push(`ALTER TABLE ${quoteIdent(name)} DROP COLUMN ${quoteIdent(colName)};`);
      }
    }
    for (const [colName, dCol] of dCols) {
      const rCol = rCols.get(colName);
      if (!rCol) {
        const nullSql = dCol.nullable ? '' : ' NOT NULL';
        const uniqueSql = dCol.unique ? ' UNIQUE' : '';
        statements.push(
          `ALTER TABLE ${quoteIdent(name)} ADD COLUMN ${quoteIdent(colName)} ${dCol.type}${nullSql}${uniqueSql};`
        );
        continue;
      }
      if (columnsEqual(dCol, rCol)) continue;
      if (dCol.type !== rCol.type) {
        statements.push(`ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} TYPE ${dCol.type};`);
      }
      if (dCol.nullable !== rCol.nullable) {
        statements.push(
          dCol.nullable ?
            `ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} DROP NOT NULL;`
          : `ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} SET NOT NULL;`
        );
      }
    }

    const dIdx = new Map(desiredTable.indexes.map(i => [i.name, i]));
    const rIdx = new Map(remoteTable.indexes.map(i => [i.name, i]));
    for (const idxName of rIdx.keys()) {
      if (!dIdx.has(idxName)) statements.push(`DROP INDEX ${quoteIdent(idxName)};`);
    }
    for (const [idxName, idx] of dIdx) {
      if (rIdx.has(idxName)) continue;
      const cols = idx.columns.map(c => quoteIdent(c)).join(', ');
      const unique = idx.unique ? 'UNIQUE ' : '';
      statements.push(`CREATE ${unique}INDEX ${quoteIdent(idxName)} ON ${quoteIdent(name)} (${cols});`);
    }

    const dFk = new Map(desiredTable.foreignKeys.map(f => [f.name, f]));
    const rFk = new Map(remoteTable.foreignKeys.map(f => [f.name, f]));
    for (const fkName of rFk.keys()) {
      if (!dFk.has(fkName)) {
        statements.push(`ALTER TABLE ${quoteIdent(name)} DROP CONSTRAINT ${quoteIdent(fkName)};`);
      }
    }
    for (const [fkName, fk] of dFk) {
      if (rFk.has(fkName)) continue;
      const onDel = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      const onUpd = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
      statements.push(
        `ALTER TABLE ${quoteIdent(name)} ADD CONSTRAINT ${quoteIdent(fkName)} FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.refTable)} (${quoteIdent(fk.refColumn)})${onDel}${onUpd};`
      );
    }
  }

  return statements.join('\n');
}
