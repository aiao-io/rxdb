import type { Results } from '@electric-sql/pglite';

import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const STATEMENT_SEPARATOR = '---STATEMENT_SEPARATOR---';

type ResultRow = Record<string, unknown>;

export const splitSwitchStatements = (sql: string): string[] =>
  sql
    .split(STATEMENT_SEPARATOR)
    .map(statement => statement.trim())
    .filter(Boolean);

export const executeSwitchStatements = async (
  adapter: RxDBAdapterPGlite,
  sql: string,
  params: unknown[] = []
): Promise<Results<ResultRow>> => {
  const statements = splitSwitchStatements(sql);
  if (params.length > 0) {
    if (statements.length !== 1) {
      throw new TypeError('Parameterized switch SQL must contain exactly one statement');
    }
    return adapter.query<ResultRow>(statements[0], params);
  }

  const combined: Results<ResultRow> = { rows: [], affectedRows: 0, fields: [] };
  for (const statement of statements) {
    const result = await adapter.query<ResultRow>(statement);
    combined.rows.push(...result.rows);
    combined.affectedRows = (combined.affectedRows ?? 0) + (result.affectedRows ?? result.rows.length);
    combined.fields = result.fields;
  }
  return combined;
};
