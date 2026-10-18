import type { TransactionExecutor } from '@aiao/rxdb';
import type { BomSqlDialect } from './resolve/bom-sql.js';
import type { ExpansionResult } from './resolve/expansion.js';
import type { UnresolvedAlternative } from './resolve/resolution.js';

interface Header {
  id: string;
  revisionId: string;
  itemId: string;
  alternativeNo: number;
}

const readHeaders = async (
  executor: TransactionExecutor,
  dialect: BomSqlDialect,
  expansion: ExpansionResult
): Promise<Header[]> => {
  const revisions = [...new Set(expansion.nodes.flatMap(node => (node.revisionId === null ? [] : [node.revisionId])))];
  const headers: Header[] = [];
  for (let offset = 0; offset < revisions.length; offset += 200) {
    const params = [expansion.context.bomType, expansion.context.orgId, ...revisions.slice(offset, offset + 200)];
    const result = await executor.query(
      `SELECT h."id", h."parentRevisionId", h."alternativeNo", r."itemId" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE h."state" = 'released' AND h."bomType" = ${dialect.placeholder(0)} AND h."orgId" = ${dialect.placeholder(1)} AND h."parentRevisionId" IN (${params
        .slice(2)
        .map((_, index) => dialect.placeholder(index + 2))
        .join(', ')}) ORDER BY h."alternativeNo"`,
      params
    );
    const indexOf = (column: string) => result.columns.indexOf(column);
    headers.push(
      ...result.rows.map(row => ({
        id: String(row[indexOf('id')]),
        revisionId: String(row[indexOf('parentRevisionId')]),
        itemId: String(row[indexOf('itemId')]),
        alternativeNo: Number(row[indexOf('alternativeNo')])
      }))
    );
  }
  return headers;
};

const allowedOccurrences = async (
  executor: TransactionExecutor,
  dialect: BomSqlDialect,
  expansion: ExpansionResult,
  headers: ReadonlySet<string>
): Promise<Set<string>> => {
  const ids = [...new Set(expansion.nodes.flatMap(node => (node.occurrenceId === null ? [] : [node.occurrenceId])))];
  const allowed = new Set<string>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200);
    const result = await executor.query(
      `SELECT occ."id", l."headerId" FROM ${dialect.table('bom_line_occurrence')} occ JOIN ${dialect.table('bom_line')} l ON l."id" = occ."lineId" WHERE occ."id" IN (${chunk.map((_, index) => dialect.placeholder(index)).join(', ')})`,
      chunk
    );
    const idIndex = result.columns.indexOf('id');
    const headerIndex = result.columns.indexOf('headerId');
    for (const row of result.rows) if (headers.has(String(row[headerIndex]))) allowed.add(String(row[idIndex]));
  }
  return allowed;
};

export const resolveViewAlternatives = async (
  executor: TransactionExecutor,
  dialect: BomSqlDialect,
  expansion: ExpansionResult
): Promise<ExpansionResult> => {
  const byRevision = new Map<string, Header[]>();
  for (const header of await readHeaders(executor, dialect, expansion)) {
    const siblings = byRevision.get(header.revisionId) ?? [];
    siblings.push(header);
    byRevision.set(header.revisionId, siblings);
  }
  const allowedHeaders = new Set<string>();
  const unresolved: UnresolvedAlternative[] = [];
  for (const headers of byRevision.values()) {
    const selected =
      expansion.context.alternativeNo === undefined ?
        headers
      : headers.filter(header => header.alternativeNo === expansion.context.alternativeNo);
    if (selected.length > 1) {
      unresolved.push({
        parentItemId: selected[0].itemId,
        parentRevisionId: selected[0].revisionId,
        candidates: selected.map(header => ({ headerId: header.id, alternativeNo: header.alternativeNo }))
      });
    } else selected.forEach(header => allowedHeaders.add(header.id));
  }
  const allowed = await allowedOccurrences(executor, dialect, expansion, allowedHeaders);
  const nodes = expansion.nodes.filter(node => node.path.every(id => allowed.has(id)));
  const visibleRevisions = new Set(nodes.map(node => node.revisionId));
  return {
    ...expansion,
    nodes,
    unresolved: [...unresolved, ...(expansion.unresolved ?? [])].filter(group =>
      visibleRevisions.has(group.parentRevisionId)
    )
  };
};
