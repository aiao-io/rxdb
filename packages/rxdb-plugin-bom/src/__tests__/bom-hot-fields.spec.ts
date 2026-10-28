import {
  advancedIndexStatements,
  compileAdvancedIndex,
  compileGeneratedColumn,
  getEntityMetadata,
  getEntityStorageMetadata,
  quoteSqlIdentifier,
  type EntityStorageOverride,
  type EntityType,
  type TransactionExecutor,
  type TransactionFun,
  type UUID
} from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BOM_ENTITIES, BomAttrDef, BomHeader, BomItem, BomLine, BomLineOccurrence } from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { BomExtAttrError, filterByAttr, type ExtAttrQueryFilter, type ExtAttrScope } from '../resolve/ext-attr.js';
import { loadHistory } from '../resolve/history-loader.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const scopes = [
  ['item', BomItem],
  ['bom_header', BomHeader],
  ['bom_line_occurrence', BomLineOccurrence]
] as const;
const fields = [
  ['rohs_status', 'string'],
  ['lead_days', 'number'],
  ['active', 'boolean']
] as const;
const specialCode = `literal.key'"[x]`;
const profile = (): EntityStorageOverride[] =>
  scopes.map(([, entity]) => ({
    entity,
    generatedColumns: fields.map(([key, dataType]) => ({
      name: `hot_${key}`,
      expression: { kind: 'jsonScalar', property: 'ext', key, dataType, jsonText: true }
    })),
    indexes: [
      ...fields.map(([key]) => ({ name: `lookup_${key}` as const, properties: [`hot_${key}`] })),
      {
        name: 'ext_gin',
        expression: { kind: 'jsonDocument', property: 'ext', jsonText: true },
        method: 'gin',
        dialects: ['postgres']
      }
    ]
  }));
const instant = new Date('2026-01-01T00:00:00.000Z');
const id = (key: string) => deterministicId(`023:${key}`);
const create = async <T extends EntityType>(
  adapter: BomTestAdapter,
  entity: T,
  key: string,
  data: Partial<InstanceType<T>>
) => {
  const row = adapter.rxdb.entityManager.instantiate(entity, {
    ...data,
    id: id(key),
    createdAt: instant,
    updatedAt: instant
  } as Partial<InstanceType<T>>);
  return adapter.rxdb.entityManager.getRepository(entity).create(row);
};
const seedDefinitions = async (adapter: BomTestAdapter): Promise<void> => {
  for (const [scope] of scopes) {
    for (const [code, dataType] of [
      ...fields,
      ['cold', 'string'],
      [specialCode, 'string'],
      ['date', 'date']
    ] as const) {
      await create(adapter, BomAttrDef, `def:${scope}:${code}`, { code, dataType, appliesTo: scope });
    }
  }
};
const documents = [
  {
    rohs_status: 'yes',
    lead_days: 3,
    active: true,
    cold: 'rare',
    [specialCode]: 'quoted',
    date: '2026-01-01T00:00:00+08:00'
  },
  {
    rohs_status: 'no',
    lead_days: 8,
    active: false,
    cold: 'common',
    [specialCode]: 'other',
    date: '2026-01-01T00:00:00Z'
  },
  { rohs_status: null, lead_days: null, active: null, cold: null },
  {}
];
const seed = async (adapter: BomTestAdapter): Promise<void> => {
  await seedDefinitions(adapter);
  const root = await create(adapter, BomItem, 'root', { itemNo: 'root' });
  await loadHistory(adapter, {
    batchNo: '023-root',
    revisions: [
      {
        id: id('root-rev'),
        itemId: root.id,
        revisionNo: 'A',
        effectiveFrom: instant
      }
    ],
    headers: []
  });
  for (const [index, document] of documents.entries()) {
    const ext = JSON.stringify(document);
    const item = await create(adapter, BomItem, `item:${index}`, { itemNo: `item-${index}`, ext });
    const header = await create(adapter, BomHeader, `header:${index}`, {
      parentRevisionId: id('root-rev'),
      bomType: 'ebom',
      orgId: 'test',
      alternativeNo: index + 1,
      ext
    });
    const line = await create(adapter, BomLine, `line:${index}`, { headerId: header.id, lineNo: 10 });
    await create(adapter, BomLineOccurrence, `occ:${index}`, {
      lineId: line.id,
      childItemId: item.id,
      qty: '1',
      effectiveFrom: instant,
      ext
    });
  }
};
const withAdapter = async (
  backend: BomTestBackend,
  hot: boolean,
  run: (adapter: BomTestAdapter) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend, BOM_ENTITIES, { entityStorage: hot ? profile() : undefined });
  try {
    await run(adapter);
  } finally {
    vi.restoreAllMocks();
    await disposeBomTestAdapter(adapter);
  }
};
interface CapturedQuery {
  sql: string;
  params: readonly unknown[];
}
const capture = (adapter: BomTestAdapter): { adapter: BomLocalAdapter; queries: CapturedQuery[] } => {
  const queries: CapturedQuery[] = [];
  const facade: BomLocalAdapter = {
    name: adapter.name,
    rxdb: adapter.rxdb,
    transaction: <T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>> =>
      adapter.transaction(
        (async (executor: TransactionExecutor) =>
          fun(
            new Proxy(executor, {
              get(target, key) {
                if (key !== 'query') return Reflect.get(target, key, target);
                return async (sql: string, params: readonly unknown[] = []) => {
                  queries.push({ sql, params });
                  return target.query(sql, params);
                };
              }
            })
          )) as T,
        transactionLog
      )
  };
  return { adapter: facade, queries };
};
const actualQuery = (queries: CapturedQuery[], scope: ExtAttrScope): CapturedQuery => {
  const query = queries.find(
    query => query.sql.includes(`ORDER BY "id"`) && query.sql.includes(scope === 'item' ? 'item"' : `${scope}"`)
  );
  if (query === undefined) throw new Error(`未捕获 ${scope} 的实际 filterByAttr 查询`);
  return query;
};
const matrix: ExtAttrQueryFilter[][] = [
  [{ code: 'rohs_status', op: 'eq', value: 'yes' }],
  [{ code: 'rohs_status', op: 'ne', value: 'yes' }],
  [{ code: 'rohs_status', op: 'in', value: ['yes', 'no'] }],
  [{ code: 'rohs_status', op: 'in', value: [] }],
  [{ code: 'lead_days', op: 'gte', value: 4 }],
  [{ code: 'active', op: 'eq', value: false }],
  [{ code: 'active', op: 'exists' }],
  [{ code: specialCode, op: 'eq', value: 'quoted' }],
  [{ code: 'date', op: 'eq', value: '2025-12-31T16:00:00Z' }]
];

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`US-519 热字段透明查询 [${backend}]`, () => {
    it('三层作用域所有旧查询语义与公开结果形状保持一致，实际热查询使用生成列', async () => {
      const baseline = new Map<string, Record<string, unknown>[]>();
      await withAdapter(backend, false, async adapter => {
        await seed(adapter);
        for (const [scope] of scopes) {
          for (const [index, filters] of matrix.entries())
            baseline.set(`${scope}:${index}`, await filterByAttr(adapter, scope, filters));
        }
      });
      await withAdapter(backend, true, async adapter => {
        await seed(adapter);
        const traced = capture(adapter);
        for (const [scope] of scopes) {
          for (const [index, filters] of matrix.entries()) {
            const result = await filterByAttr(traced.adapter, scope, filters);
            expect(result).toEqual(baseline.get(`${scope}:${index}`));
            expect(result.every(row => Object.keys(row).every(key => !key.startsWith('gc_')))).toBe(true);
          }
        }
        expect(actualQuery(traced.queries, 'item').sql).toContain('gc_hot_rohs_status_');
        await expect(
          filterByAttr(adapter, 'item', [{ code: 'lead_days', op: 'eq', value: '3' }])
        ).rejects.toBeInstanceOf(BomExtAttrError);
        await expect(filterByAttr(adapter, 'item', [{ code: 'unknown', op: 'exists' }])).rejects.toThrow(/unknown/);
        await expect(filterByAttr(adapter, 'unknown' as ExtAttrScope, [])).rejects.toThrow(/作用域/);
      });
    }, 60_000);

    it('生成列不进入实体映射，读取和保存不警告', async () => {
      await withAdapter(backend, true, async adapter => {
        await seed(adapter);
        const warning = vi.spyOn(console, 'warn');
        const repository = adapter.rxdb.entityManager.getRepository(BomItem);
        const row = await firstValueFrom(repository.get(id('item:0')));
        await repository.update(row, { ext: JSON.stringify({ rohs_status: 'no', lead_days: 6, active: false }) });
        expect(Object.keys(row).some(key => key.startsWith('gc_'))).toBe(false);
        expect(warning.mock.calls.flat().join(' ')).not.toMatch(/gc_hot_/);
        const matches = await filterByAttr(adapter, 'item', [{ code: 'lead_days', op: 'eq', value: 6 }]);
        expect(matches.map(value => value['id'])).toEqual([row.id]);
      });
    }, 60_000);

    it('属性字典与生成列类型失配时拒绝查询与字典改型，不能静默改变匹配结果', async () => {
      await withAdapter(backend, true, async adapter => {
        const table = bomSqlDialectFor(backend).table('attr_def');
        await adapter.transaction(
          executor =>
            executor.query(
              `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "code", "dataType", "appliesTo") VALUES ('${id('wrong-type')}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'rohs_status', 'number', 'item')`
            ),
          false
        );
        const definition = await firstValueFrom(
          adapter.rxdb.entityManager.getRepository(BomAttrDef).get(id('wrong-type'))
        );
        await expect(filterByAttr(adapter, 'item', [{ code: 'rohs_status', op: 'eq', value: 3 }])).rejects.toThrow(
          /rohs_status.*类型|类型.*rohs_status/
        );
        await adapter.rxdb.entityManager.getRepository(BomAttrDef).update(definition, { dataType: 'string' });
        await expect(
          adapter.rxdb.entityManager.getRepository(BomAttrDef).update(definition, { dataType: 'number' })
        ).rejects.toThrow(/rohs_status.*类型|类型.*rohs_status/);
      });
    });

    it('10000 行正常规划器对实际 API SQL 使用热 Btree，PG 未提升键使用 GIN @>，记录原始计划', async () => {
      await withAdapter(backend, true, async adapter => {
        await seedDefinitions(adapter);
        const table = bomSqlDialectFor(backend).table('item');
        const series =
          backend === 'pglite' ?
            'SELECT generate_series(0, 9999) AS n'
          : 'WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < 9999) SELECT n FROM seq';
        const prefix = '00000000-0000-4000-8000-';
        const uuid =
          backend === 'pglite' ? `('${prefix}' || lpad(n::text, 12, '0'))::uuid` : `'${prefix}' || printf('%012d', n)`;
        const document =
          backend === 'pglite' ?
            `json_build_object('rohs_status', CASE WHEN n < 50 THEN 'rare' ELSE 'common' END, 'cold', CASE WHEN n < 50 THEN 'rare' ELSE 'common' END)::text`
          : `json_object('rohs_status', CASE WHEN n < 50 THEN 'rare' ELSE 'common' END, 'cold', CASE WHEN n < 50 THEN 'rare' ELSE 'common' END)`;
        await adapter.transaction(
          executor =>
            executor.query(
              `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "itemNo", "ext") SELECT ${uuid}, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'plan-' || n, ${document} FROM (${series}) s`
            ),
          false
        );
        const metadata = getEntityStorageMetadata(adapter.rxdb, BomItem);
        if (backend === 'pglite') {
          const gin = compileAdvancedIndex(metadata, metadata.indexMap.get('ext_gin')!, 'postgres')!;
          const maintenance = await adapter.transaction(
            executor =>
              executor.query('SELECT gin_clean_pending_list($1::regclass)', [`"bom".${quoteSqlIdentifier(gin.name)}`]),
            false
          );
          console.info(
            'BOM_GIN_MAINTENANCE',
            JSON.stringify({ backend, index: gin.name, cleanedPages: String(maintenance.rows[0]?.[0]) })
          );
        }
        await adapter.transaction(executor => executor.query(`ANALYZE ${table}`), false);
        const traced = capture(adapter);
        const hot = await filterByAttr(traced.adapter, 'item', [{ code: 'rohs_status', op: 'eq', value: 'rare' }]);
        expect(hot).toHaveLength(50);
        const query = actualQuery(traced.queries, 'item');
        const column = compileGeneratedColumn(
          metadata,
          metadata.generatedColumnMap.get('hot_rohs_status')!,
          backend === 'pglite' ? 'postgres' : 'sqlite'
        );
        const index = compileAdvancedIndex(
          metadata,
          metadata.indexMap.get('lookup_rohs_status')!,
          backend === 'pglite' ? 'postgres' : 'sqlite'
        )!;
        expect(query.sql).toContain(quoteSqlIdentifier(column.columnName));
        const explain = async (query: CapturedQuery) =>
          adapter.transaction(
            executor =>
              executor.query(
                `${backend === 'pglite' ? 'EXPLAIN (FORMAT JSON)' : 'EXPLAIN QUERY PLAN'} ${query.sql}`,
                query.params
              ),
            false
          );
        const plan = await explain(query);
        const serialized = JSON.stringify(plan.rows);
        expect(serialized).toContain(index.name);
        expect(serialized).toMatch(backend === 'pglite' ? /Index Scan|Bitmap Index Scan/ : /SEARCH/);
        console.info('BOM_HOT_EXPLAIN', JSON.stringify({ backend, rows: 10000, matches: 50, query, plan }));
        if (backend === 'pglite') {
          traced.queries.length = 0;
          const cold = await filterByAttr(traced.adapter, 'item', [{ code: 'cold', op: 'eq', value: 'rare' }]);
          expect(cold).toEqual(hot);
          const ginQuery = actualQuery(traced.queries, 'item');
          expect(ginQuery.sql).toContain('@>');
          const gin = compileAdvancedIndex(metadata, metadata.indexMap.get('ext_gin')!, 'postgres')!;
          const ginPlan = await explain(ginQuery);
          expect(JSON.stringify(ginPlan.rows)).toContain(gin.name);
          expect(JSON.stringify(ginPlan.rows)).toMatch(/Index Scan|Bitmap Index Scan/);
          console.info('BOM_GIN_EXPLAIN', JSON.stringify({ backend, query: ginQuery, plan: ginPlan }));
          await adapter.transaction(
            executor => executor.query(`DROP INDEX "bom".${quoteSqlIdentifier(gin.name)}`),
            false
          );
          expect(await filterByAttr(adapter, 'item', [{ code: 'cold', op: 'eq', value: 'rare' }])).toEqual(cold);
          const restoreGin = advancedIndexStatements(metadata, 'postgres', table).find(sql =>
            sql.includes(quoteSqlIdentifier(gin.name))
          )!;
          await adapter.transaction(executor => executor.query(restoreGin), false);
          await expect(adapter.checkEntityConstraints([BomItem])).resolves.toBeUndefined();
          expect(getEntityMetadata(BomItem).generatedColumnMap.size).toBe(0);
        }
        const measure = async (metric: string, run: () => Promise<unknown>, budgetMs: number): Promise<void> => {
          for (let index = 0; index < 5; index += 1) await run();
          const samples: number[] = [];
          for (let index = 0; index < 20; index += 1) {
            const start = performance.now();
            await run();
            samples.push(performance.now() - start);
          }
          const sorted = [...samples].sort((left, right) => left - right);
          const result = {
            backend,
            metric,
            rows: 10000,
            warmup: 5,
            samples,
            host: navigator.userAgent,
            recordedAt: new Date().toISOString(),
            runtime: backend === 'pglite' ? { store: 'memory' } : { worker: false, vfs: 'MemoryAsyncVFS' },
            storage: profile().find(declaration => declaration.entity === BomItem),
            p50: sorted[9],
            p95: sorted[18],
            max: sorted[19],
            budgetMs
          };
          console.info('BOM_HOT_PERFORMANCE', JSON.stringify(result));
          expect(result.p95).toBeLessThanOrEqual(budgetMs);
        };
        await measure(
          'filterByAttr',
          () => filterByAttr(adapter, 'item', [{ code: 'rohs_status', op: 'eq', value: 'rare' }]),
          16
        );
        const repository = adapter.rxdb.entityManager.getRepository(BomItem);
        const row = await firstValueFrom(repository.get(hot[0]['id'] as UUID));
        let saved = 0;
        await measure(
          'saveExt',
          () =>
            repository.update(row, {
              ext: JSON.stringify({ rohs_status: 'rare', cold: 'rare', lead_days: ++saved })
            }),
          100
        );
      });
    }, 120_000);
  });
}
