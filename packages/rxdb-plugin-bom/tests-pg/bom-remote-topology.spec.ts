import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cycleConstraintDdlForRemotePg } from '../src/resolve/cycle-constraint-ddl.js';

const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);

describe('远端部署保护整条拓扑归属链', () => {
  let pg: PGlite;
  beforeAll(() => {
    pg = new PGlite();
  });
  afterAll(async () => {
    await pg.close();
  });
  beforeEach(async () => {
    await pg.exec(`
      DROP SCHEMA IF EXISTS bom CASCADE;
      CREATE SCHEMA bom;
      CREATE TABLE bom.item (id uuid PRIMARY KEY);
      CREATE TABLE bom.item_revision (id uuid PRIMARY KEY, "itemId" uuid NOT NULL REFERENCES bom.item);
      CREATE TABLE bom.bom_header (id uuid PRIMARY KEY, "parentRevisionId" uuid NOT NULL REFERENCES bom.item_revision,
        "bomType" text NOT NULL, "orgId" text NOT NULL);
      CREATE TABLE bom.bom_line (id uuid PRIMARY KEY, "headerId" uuid NOT NULL REFERENCES bom.bom_header);
      CREATE TABLE bom.bom_line_occurrence (id uuid PRIMARY KEY, "lineId" uuid NOT NULL REFERENCES bom.bom_line,
        "childItemId" uuid NOT NULL REFERENCES bom.item, "flowDirection" text NOT NULL DEFAULT 'consume');
    `);
    await pg.query('INSERT INTO bom.item VALUES ($1), ($2)', ids.slice(0, 2));
    await pg.query('INSERT INTO bom.item_revision VALUES ($1, $2), ($3, $4)', [ids[2], ids[0], ids[3], ids[1]]);
    await pg.query(`INSERT INTO bom.bom_header VALUES ($1, $2, 'ebom', 'X'), ($3, $4, 'ebom', 'X')`, [
      ids[4],
      ids[2],
      ids[5],
      ids[3]
    ]);
    await pg.query('INSERT INTO bom.bom_line VALUES ($1, $2), ($3, $4)', [ids[6], ids[4], ids[7], ids[5]]);
    await pg.exec(cycleConstraintDdlForRemotePg());
    await pg.query('INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId") VALUES ($1, $2, $3)', [
      ids[8],
      ids[6],
      ids[1]
    ]);
  });

  it.each([
    ['bom_line_occurrence', 'lineId', ids[8], ids[7]],
    ['bom_line', 'headerId', ids[6], ids[5]],
    ['bom_header', 'parentRevisionId', ids[4], ids[3]],
    ['bom_header', 'bomType', ids[4], 'mbom'],
    ['bom_header', 'orgId', ids[4], 'Y'],
    ['item_revision', 'itemId', ids[2], ids[1]]
  ])('%s.%s 拒绝改指且闭包保持一致', async (table, column, id, replacement) => {
    await expect(pg.query(`UPDATE bom.${table} SET "${column}" = $1 WHERE id = $2`, [replacement, id])).rejects.toThrow(
      `rxdb:bom_write_protocol:${column}:`
    );
    const edges = await pg.query(`SELECT r."itemId" AS parent, o."childItemId" AS child
      FROM bom.bom_line_occurrence o JOIN bom.bom_line l ON l.id = o."lineId"
      JOIN bom.bom_header h ON h.id = l."headerId" JOIN bom.item_revision r ON r.id = h."parentRevisionId"`);
    expect(edges.rows).toEqual([{ parent: ids[0], child: ids[1] }]);
    const reach = await pg.query('SELECT "ancestorItemId", "descendantItemId" FROM bom.bom_reach');
    expect(reach.rows).toEqual([{ ancestorItemId: ids[0], descendantItemId: ids[1] }]);
  });

  it('重复部署后同值更新放行，子件与方向更新仍维护闭包', async () => {
    await pg.exec(cycleConstraintDdlForRemotePg());
    await pg.exec('UPDATE bom.bom_line_occurrence SET "lineId" = "lineId"');
    await pg.exec(`UPDATE bom.bom_line_occurrence SET "flowDirection" = 'by_product'`);
    expect((await pg.query('SELECT * FROM bom.bom_reach')).rows).toEqual([]);
    await pg.exec(`UPDATE bom.bom_line_occurrence SET "flowDirection" = 'consume'`);
    expect((await pg.query('SELECT * FROM bom.bom_reach')).rows).toHaveLength(1);
  });
});
