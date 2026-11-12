/**
 * SqlSchema diff → ALTER / CREATE / DROP 语句
 */
import { generateCreateSql } from './generate-sql';
import { quoteIdent, trackEscaped } from './quote';
import type { GenerateSqlResult, SqlColumn, SqlSchema, SqlTable } from './types';

function tableMap(schema: SqlSchema): Map<string, SqlTable> {
  return new Map(schema.tables.map(t => [t.name, t]));
}

function colMap(table: SqlTable): Map<string, SqlColumn> {
  return new Map(table.columns.map(c => [c.name, c]));
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

/**
 * 比较 desired vs remote，生成 diff SQL（未变更表不出现）
 */
export function diffSqlSchema(desired: SqlSchema, remote: SqlSchema): GenerateSqlResult {
  const escaped = new Set<string>();
  const statements: string[] = [];
  const desiredMap = tableMap(desired);
  const remoteMap = tableMap(remote);

  // DROP tables only in remote
  for (const [name, remoteTable] of remoteMap) {
    if (!desiredMap.has(name)) {
      trackEscaped(escaped, name, name);
      statements.push(`DROP TABLE ${quoteIdent(name)};`);
      void remoteTable;
    }
  }

  // CREATE tables only in desired
  for (const [name, table] of desiredMap) {
    if (!remoteMap.has(name)) {
      const created = generateCreateSql({ tables: [table] });
      for (const id of created.escapedIdentifiers) escaped.add(id);
      statements.push(created.sql.replace(/^-- escaped:.*\n/, ''));
    }
  }

  // ALTER common tables
  for (const [name, desiredTable] of desiredMap) {
    const remoteTable = remoteMap.get(name);
    if (!remoteTable) continue;

    const dCols = colMap(desiredTable);
    const rCols = colMap(remoteTable);
    const tableStatements: string[] = [];

    for (const [colName, rCol] of rCols) {
      if (!dCols.has(colName)) {
        trackEscaped(escaped, `${name}.${colName}`, colName);
        tableStatements.push(`ALTER TABLE ${quoteIdent(name)} DROP COLUMN ${quoteIdent(colName)};`);
        void rCol;
      }
    }

    for (const [colName, dCol] of dCols) {
      const rCol = rCols.get(colName);
      trackEscaped(escaped, `${name}.${colName}`, colName);
      if (!rCol) {
        const nullSql = dCol.nullable ? '' : ' NOT NULL';
        const uniqueSql = dCol.unique ? ' UNIQUE' : '';
        tableStatements.push(
          `ALTER TABLE ${quoteIdent(name)} ADD COLUMN ${quoteIdent(colName)} ${dCol.type}${nullSql}${uniqueSql};`
        );
        continue;
      }
      if (columnsEqual(dCol, rCol)) continue;
      if (dCol.type !== rCol.type) {
        tableStatements.push(`ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} TYPE ${dCol.type};`);
      }
      if (dCol.nullable !== rCol.nullable) {
        tableStatements.push(
          dCol.nullable ?
            `ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} DROP NOT NULL;`
          : `ALTER TABLE ${quoteIdent(name)} ALTER COLUMN ${quoteIdent(colName)} SET NOT NULL;`
        );
      }
    }

    // indexes: drop remote-only, create desired-only (by name)
    const dIdx = new Map(desiredTable.indexes.map(i => [i.name, i]));
    const rIdx = new Map(remoteTable.indexes.map(i => [i.name, i]));
    for (const [idxName] of rIdx) {
      if (!dIdx.has(idxName)) {
        trackEscaped(escaped, idxName, idxName);
        tableStatements.push(`DROP INDEX ${quoteIdent(idxName)};`);
      }
    }
    for (const [idxName, idx] of dIdx) {
      if (rIdx.has(idxName)) continue;
      trackEscaped(escaped, idxName, idxName);
      const cols = idx.columns.map(c => quoteIdent(c)).join(', ');
      const unique = idx.unique ? 'UNIQUE ' : '';
      tableStatements.push(`CREATE ${unique}INDEX ${quoteIdent(idxName)} ON ${quoteIdent(name)} (${cols});`);
    }

    // FKs by name
    const dFk = new Map(desiredTable.foreignKeys.map(f => [f.name, f]));
    const rFk = new Map(remoteTable.foreignKeys.map(f => [f.name, f]));
    for (const [fkName] of rFk) {
      if (!dFk.has(fkName)) {
        trackEscaped(escaped, fkName, fkName);
        tableStatements.push(`ALTER TABLE ${quoteIdent(name)} DROP CONSTRAINT ${quoteIdent(fkName)};`);
      }
    }
    for (const [fkName, fk] of dFk) {
      if (rFk.has(fkName)) continue;
      trackEscaped(escaped, fkName, fkName);
      const onDel = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      const onUpd = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
      tableStatements.push(
        `ALTER TABLE ${quoteIdent(name)} ADD CONSTRAINT ${quoteIdent(fkName)} FOREIGN KEY (${quoteIdent(fk.column)}) REFERENCES ${quoteIdent(fk.refTable)} (${quoteIdent(fk.refColumn)})${onDel}${onUpd};`
      );
    }

    if (tableStatements.length > 0) {
      trackEscaped(escaped, name, name);
      statements.push(...tableStatements);
    }
  }

  const header = escaped.size > 0 ? `-- escaped: ${[...escaped].sort().join(', ')}\n` : '';
  return {
    sql: statements.length === 0 ? '' : header + statements.join('\n'),
    escapedIdentifiers: [...escaped].sort()
  };
}
