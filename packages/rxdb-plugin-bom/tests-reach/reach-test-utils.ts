import { expect } from 'vitest';
import {
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestAdapter,
  type BomTestBackend
} from '../src/__tests__/test-utils.js';
import { BomHeader, BomItem, BomLine, BomLineOccurrence } from '../src/entities.js';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';

const DATE = '2026-01-01T00:00:00.000Z';
export const ITEM_KEYS = ['A', 'B', 'C', 'D', 'E', 'X'] as const;
export type ItemKey = (typeof ITEM_KEYS)[number];

export interface ReachFixture {
  adapter: BomTestAdapter;
  ids: Record<ItemKey, string>;
  add(
    parent: ItemKey,
    child: ItemKey,
    options?: { bomType?: 'ebom' | 'mbom'; orgId?: string; direction?: 'consume' | 'by_product' }
  ): Promise<BomLineOccurrence>;
}

export const withReachFixture = async (
  backend: BomTestBackend,
  run: (fixture: ReachFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    const db = adapter.rxdb;
    const ids = Object.fromEntries(ITEM_KEYS.map(key => [key, deterministicId(`reach-test:item:${key}`)])) as Record<
      ItemKey,
      string
    >;
    for (const key of ITEM_KEYS) {
      await db.entityManager
        .instantiate(BomItem, { id: deterministicId(`reach-test:item:${key}`), itemNo: `REACH-${key}` })
        .save();
    }
    await db.bom.loadHistory({
      batchNo: 'reach-test-revisions',
      revisions: ITEM_KEYS.map(key => ({
        id: deterministicId(`reach-test:revision:${key}`),
        itemId: ids[key],
        revisionNo: 'A',
        effectiveFrom: new Date(DATE)
      })),
      headers: []
    });
    const headers = new Map<string, BomHeader>();
    let lineNo = 0;
    const add: ReachFixture['add'] = async (parent, child, options = {}) => {
      const bomType = options.bomType ?? 'ebom';
      const orgId = options.orgId ?? 'reach-org';
      const key = `${bomType}:${orgId}:${parent}`;
      let header = headers.get(key);
      if (header === undefined) {
        header = db.entityManager.instantiate(BomHeader, {
          parentRevisionId: deterministicId(`reach-test:revision:${parent}`),
          bomType,
          orgId
        });
        await header.save();
        headers.set(key, header);
      }
      lineNo += 1;
      const line = db.entityManager.instantiate(BomLine, { headerId: header.id, lineNo });
      await line.save();
      const occurrence = db.entityManager.instantiate(BomLineOccurrence, {
        lineId: line.id,
        childItemId: ids[child],
        qty: '1',
        effectiveFrom: new Date(DATE),
        flowDirection: options.direction ?? 'consume'
      });
      await occurrence.save();
      return occurrence;
    };
    await run({ adapter, ids, add });
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

export const readReachRows = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const table = bomSqlDialectFor(adapter.name).table('bom_reach');
    return executor.query(`SELECT * FROM ${table} ORDER BY "bomType", "orgId", "ancestorItemId", "descendantItemId"`);
  }, false);

export const readReachPairs = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const table = bomSqlDialectFor(adapter.name).table('bom_reach');
    const result = await executor.query(
      `SELECT "bomType", "orgId", "ancestorItemId", "descendantItemId" FROM ${table} ORDER BY 1, 2, 3, 4`
    );
    return result.rows.map(row => row.map(String));
  }, false);

export const recursiveOracle = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const dialect = bomSqlDialectFor(adapter.name);
    const sql = `WITH RECURSIVE edges AS (
    SELECT DISTINCT h."bomType" AS t, h."orgId" AS o, r."itemId" AS a, occ."childItemId" AS d
    FROM ${dialect.table('bom_line_occurrence')} occ
    JOIN ${dialect.table('bom_line')} l ON l."id" = occ."lineId"
    JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId"
    JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"
    WHERE occ."flowDirection" = 'consume'
  ), closure(t, o, a, d) AS (
    SELECT t, o, a, d FROM edges
    UNION
    SELECT c.t, c.o, c.a, e.d FROM closure c JOIN edges e ON e.t = c.t AND e.o = c.o AND e.a = c.d
  ) SELECT t, o, a, d FROM closure ORDER BY 1, 2, 3, 4`;
    const result = await executor.query(sql);
    return result.rows.map(row => row.map(String));
  }, false);

export const expectReachMatches = async (adapter: BomTestAdapter): Promise<void> => {
  expect(await readReachPairs(adapter)).toEqual(await recursiveOracle(adapter));
};

export const installReachDmlAudit = async (adapter: BomTestAdapter): Promise<void> => {
  await adapter.transaction(async executor => {
    const table = bomSqlDialectFor(adapter.name).table('bom_reach');
    await executor.query('CREATE TEMP TABLE reach_dml_audit (kind TEXT NOT NULL)');
    if (adapter.name === 'pglite') {
      await executor.query(
        `CREATE FUNCTION pg_temp.audit_bom_reach() RETURNS trigger AS $$ BEGIN INSERT INTO reach_dml_audit (kind) VALUES (TG_OP); IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`
      );
      await executor.query(
        `CREATE TRIGGER __reach_test_audit AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION pg_temp.audit_bom_reach()`
      );
      return;
    }
    for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
      await executor.query(
        `CREATE TEMP TRIGGER __reach_test_audit_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN INSERT INTO reach_dml_audit (kind) VALUES ('${operation}'); END`
      );
    }
  }, false);
};

export const readReachDmlCount = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    const result = await executor.query('SELECT COUNT(*) FROM reach_dml_audit');
    return Number(result.rows[0][0]);
  }, false);

export const clearReachDmlAudit = (adapter: BomTestAdapter) =>
  adapter.transaction(async executor => {
    await executor.query('DELETE FROM reach_dml_audit');
  }, false);
