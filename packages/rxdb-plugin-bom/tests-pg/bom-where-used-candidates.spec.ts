import type { TransactionExecutor, TransactionFun } from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BomLocalAdapter } from '../src/resolve/bom-adapter.js';
import { bomSqlDialectFor, buildParentsOfItemsSql } from '../src/resolve/bom-sql.js';
import { whereUsed } from '../src/resolve/expansion.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';

const child = deterministicId('usage-frontier-child');
const parent = (index: number) => deterministicId(`usage-frontier-parent:${index}`);
const context = { bomType: 'ebom' as const, orgId: 'X', asOfDate: new Date('2026-06-01T00:00:00Z') };

describe('反查同行候选的分块与日期边界', () => {
  let pg: PGlite;
  let adapter: BomLocalAdapter;
  beforeAll(() => {
    pg = new PGlite();
    adapter = {
      name: 'pglite',
      transaction: async <T extends TransactionFun>(fun: T): Promise<Awaited<ReturnType<T>>> => {
        const result = await pg.transaction(async tx => {
          const executor = {
            query: async (sql: string, params?: readonly unknown[]) => {
              const result = await tx.query<Record<string, unknown>>(
                sql,
                params === undefined ? undefined : [...params]
              );
              const columns = result.fields.map(field => field.name);
              return { columns, rows: result.rows.map(row => columns.map(column => row[column])) };
            }
          } as TransactionExecutor;
          return fun(executor);
        });
        return result as Awaited<ReturnType<T>>;
      }
    };
  });
  afterAll(async () => {
    await pg.close();
  });
  beforeEach(async () => {
    await pg.exec(`
      DROP SCHEMA IF EXISTS bom CASCADE;
      CREATE SCHEMA bom;
      CREATE TABLE bom.item_revision (id uuid PRIMARY KEY, "itemId" uuid NOT NULL);
      CREATE TABLE bom.bom_header (id uuid PRIMARY KEY, "parentRevisionId" uuid NOT NULL,
        "bomType" text DEFAULT 'ebom', "orgId" text DEFAULT 'X', state text DEFAULT 'released', "alternativeNo" integer DEFAULT 1);
      CREATE TABLE bom.bom_line (id uuid PRIMARY KEY, "headerId" uuid NOT NULL, "lineNo" integer NOT NULL);
      CREATE TABLE bom.bom_line_occurrence (id uuid PRIMARY KEY, "lineId" uuid NOT NULL, "childItemId" uuid NOT NULL,
        qty text DEFAULT '1', "effectiveFrom" timestamptz DEFAULT '2026-01-01', "effectiveTo" timestamptz,
        "unitFrom" integer, "unitTo" integer, "lotCodes" text, "selectionConditionId" uuid, "ecnInId" uuid, "ecnOutId" uuid);
      CREATE TABLE bom.ecn (id uuid PRIMARY KEY, state text);
    `);
    const ids = Array.from({ length: 202 }, (_, index) => parent(index));
    await pg.query('INSERT INTO bom.item_revision SELECT id, id FROM unnest($1::uuid[]) id', [ids]);
    await pg.exec(`
      INSERT INTO bom.bom_header (id, "parentRevisionId") SELECT id, id FROM bom.item_revision;
      INSERT INTO bom.bom_line SELECT id, id, row_number() OVER (ORDER BY id) FROM bom.item_revision;
    `);
  });

  it('201 个使用方跨两块命中同一逻辑行，只报告一次完整歧义', async () => {
    await pg.query(
      `INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId")
      SELECT id, id, $1 FROM bom.item_revision WHERE id <> $2`,
      [child, parent(0)]
    );
    const frontier = await pg.query<{ id: string }>('SELECT id FROM bom.bom_line WHERE id <> $1 ORDER BY "lineNo"', [
      parent(0)
    ]);
    const first = frontier.rows[0].id;
    const last = frontier.rows[200].id;
    await pg.query(
      `INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId", "unitFrom", "unitTo")
      VALUES ($1, $2, $3, 1, 136), ($4, $2, $5, 137, NULL)`,
      [deterministicId('usage-candidate-first'), parent(0), first, deterministicId('usage-candidate-last'), last]
    );
    const result = await whereUsed(adapter, context, { childItemId: child });
    expect(result.nodes).toHaveLength(201);
    expect(result.unresolved).toEqual([
      expect.objectContaining({
        lineId: parent(0),
        reason: 'unit',
        candidates: expect.arrayContaining([
          expect.objectContaining({ childItemId: first }),
          expect.objectContaining({ childItemId: last })
        ])
      })
    ]);
    const selected = await whereUsed(adapter, { ...context, unit: 136 }, { childItemId: child });
    expect(selected.nodes).toHaveLength(202);
    expect(selected.nodes.filter(node => node.itemId === parent(0))).toHaveLength(1);
    expect(selected.unresolved).toBeUndefined();
  });

  it('目标发生项已过期时，不引入同行其他子件的歧义', async () => {
    await pg.query(
      `INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId", "effectiveTo", "lotCodes")
      VALUES ($1, $2, $3, '2026-02-01', NULL), ($4, $2, $5, NULL, '["B1"]'), ($6, $2, $7, NULL, '["B2"]')`,
      [
        deterministicId('usage-expired'),
        parent(0),
        child,
        deterministicId('usage-live-b1'),
        parent(1),
        deterministicId('usage-live-b2'),
        parent(2)
      ]
    );
    const result = await whereUsed(adapter, context, { childItemId: child });
    expect(result.nodes).toEqual([]);
    expect(result.unresolved).toBeUndefined();
  });

  it('目标经序列过滤排除后，不报告仅涉及其他子件的批次歧义；普通反查 SQL 仍只返回目标', async () => {
    await pg.query(
      `INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId", "unitFrom", "unitTo", "lotCodes")
      VALUES ($1, $2, $3, 1, 136, NULL), ($4, $2, $5, 137, NULL, '["B1"]'), ($6, $2, $7, 137, NULL, '["B2"]')`,
      [
        deterministicId('usage-unit-old'),
        parent(0),
        child,
        deterministicId('usage-unit-b1'),
        parent(1),
        deterministicId('usage-unit-b2'),
        parent(2)
      ]
    );
    const result = await whereUsed(adapter, { ...context, unit: 137 }, { childItemId: child });
    expect(result.nodes).toEqual([]);
    expect(result.unresolved).toBeUndefined();
    const built = buildParentsOfItemsSql(bomSqlDialectFor('pglite'), { ...context, itemIds: [child] });
    expect((await pg.query(built.sql, built.params)).rows).toEqual([expect.objectContaining({ childItemId: child })]);
  });
});
