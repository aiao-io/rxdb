import {
  RxDB,
  SyncType,
  type AdapterRepositoryConstructor,
  type RxDBSystemContribution,
  type TransactionFun
} from '@aiao/rxdb';
import { PGliteRepository, RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import {
  BOM_ENTITIES,
  BomHeader,
  BomItem,
  BomLine,
  BomLineOccurrence,
  RxDBPluginBom,
  loadHistory,
  rxDBPluginBom,
  whereUsed,
  type BomType,
  type ExpansionResult,
  type HistoryHeaderInput,
  type ResolutionContext
} from '@aiao/rxdb-plugin-bom';
import { deterministicId } from '@aiao/rxdb-plugin-bom/testing';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { summarise } from './bench-stats.ts';

const WARMUP = 5;
const SAMPLES = 20;
const QUERY_BUDGET_MS = 16;
const WRITE_BUDGET_MS = 100;
const DATE = '2026-01-01T00:00:00.000Z';
const BUDGETS = { depth: 50, expansions: 100_000, paths: 10_000 };
const PROTOTYPE = process.argv.includes('--reach-prototype');

function assertGarbageCollector(value: unknown): asserts value is () => void {
  if (typeof value !== 'function') throw new Error('BOM Reach基准必须通过 --expose-gc 启动');
}

const collectGarbage = (() => {
  const candidate: unknown = Reflect.get(globalThis, 'gc');
  assertGarbageCollector(candidate);
  return candidate;
})();

interface EdgeInput {
  parent: string;
  child: string;
  bomType: BomType;
  orgId: string;
}

interface GraphInput {
  name: string;
  items: string[];
  edges: EdgeInput[];
  target: string;
  unused?: string;
  diamond: boolean;
}

interface Edge {
  parentId: string;
  childId: string;
  parentRevisionId: string;
  occurrenceId: string;
  lineNo: number;
  qty: string;
  bomType: BomType;
  orgId: string;
}

interface Fixture {
  input: GraphInput;
  context: ResolutionContext;
  itemIds: Map<string, string>;
  edges: Edge[];
}

interface SqlCall {
  sql: string;
  params: unknown[];
}

interface Sample {
  phase: string;
  scenario: string;
  materialCount: number;
  edgeCount: number;
  resultNodes: number;
  maximumReturnedDepth: number;
  truncated: ExpansionResult['truncated'];
  warmup: number;
  samples: number;
  rawSamplesMs: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  queryBudgetMs: number;
  withinQueryBudget: boolean;
  sqlCalls: number;
  queryPlans: { sql: string; params: unknown[]; parameterCount: number; plan: unknown }[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const requireMapValue = <K, V>(map: ReadonlyMap<K, V>, key: K): V => {
  const value = map.get(key);
  assert(value !== undefined, `基准fixture缺少映射：${String(key)}`);
  return value;
};

const id = (key: string): string => deterministicId(`bom-reach-benchmark:${key}`);

const components = (size: number): GraphInput => {
  assert(size % 10 === 0, '组件图规模必须是10的倍数');
  const items = Array.from({ length: size }, (_, index) => `component-${Math.floor(index / 10)}-item-${index % 10}`);
  const edges: EdgeInput[] = [];
  const directions = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
    [0, 3],
    [0, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9]
  ];
  const types: BomType[] = ['ebom', 'mbom', 'sales'];
  for (let component = 0; component < size / 10; component += 1) {
    const scope = { bomType: types[component % types.length], orgId: `reach-org-${component % 2}` };
    for (const [parent, child] of directions) {
      edges.push({ parent: items[component * 10 + parent], child: items[component * 10 + child], ...scope });
    }
  }
  return { name: `materials-${size}`, items, edges, target: items[9], unused: items[0], diamond: false };
};

const diamonds = (): GraphInput => {
  const items = ['diamond-root'];
  const edges: EdgeInput[] = [];
  let parent = items[0];
  for (let index = 0; index < 20; index += 1) {
    const left = `diamond-${index}-left`;
    const right = `diamond-${index}-right`;
    const bottom = `diamond-${index}-bottom`;
    items.push(left, right, bottom);
    for (const [from, to] of [
      [parent, left],
      [parent, right],
      [left, bottom],
      [right, bottom]
    ]) {
      edges.push({ parent: from, child: to, bomType: 'ebom', orgId: 'reach-org-0' });
    }
    parent = bottom;
  }
  return { name: 'diamonds-20', items, edges, target: parent, diamond: true };
};

const createDatabase = async (
  legacy = false
): Promise<{ db: RxDB; adapter: RxDBAdapterPGlite; legacySystem?: RxDBSystemContribution }> => {
  const db = new RxDB({
    dbName: `bom-reach-benchmark-${crypto.randomUUID()}`,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  const legacySystem = legacy ? new RxDBPluginBom(db).system : undefined;
  if (!legacy) db.use(rxDBPluginBom);
  let local: RxDBAdapterPGlite | undefined;
  db.adapter('pglite', owner => {
    local = new RxDBAdapterPGlite(owner, {
      store: 'memory',
      repositories: { BomRepository: PGliteRepository as unknown as AdapterRepositoryConstructor<RxDBAdapterPGlite> }
    });
    return local;
  });
  await db.connect('pglite');
  if (local === undefined) throw new Error('PGlite benchmark适配器没有建立');
  return { db, adapter: local, legacySystem };
};

const seed = async (db: RxDB, adapter: RxDBAdapterPGlite, input: GraphInput): Promise<Fixture> => {
  const itemIds = new Map(input.items.map(key => [key, id(`${input.name}:item:${key}`)]));
  await adapter.transaction(async executor => {
    for (const key of input.items) {
      const item = db.entityManager.instantiate(BomItem, {
        id: deterministicId(`bom-reach-benchmark:${input.name}:item:${key}`),
        itemNo: `REACH-${input.name}-${key}`,
        createdAt: new Date(DATE),
        updatedAt: new Date(DATE)
      });
      await executor.getRepository(BomItem).create(item);
    }
  }, false);
  const headers = new Map<string, HistoryHeaderInput>();
  const edges: Edge[] = [];
  const itemIndexes = new Map(input.items.map((key, index) => [key, index]));
  for (const [index, edge] of input.edges.entries()) {
    const headerKey = `${edge.bomType}:${edge.orgId}:${edge.parent}`;
    let header = headers.get(headerKey);
    if (header === undefined) {
      header = {
        id: id(`${input.name}:header:${headerKey}`),
        revisionIndex: requireMapValue(itemIndexes, edge.parent),
        bomType: edge.bomType,
        orgId: edge.orgId,
        createdAt: new Date(DATE),
        updatedAt: new Date(DATE),
        lines: []
      };
      headers.set(headerKey, header);
    }
    const occurrenceId = id(`${input.name}:occurrence:${index}`);
    const lineNo = header.lines.length + 1;
    header.lines.push({
      id: id(`${input.name}:line:${index}`),
      lineNo,
      createdAt: new Date(DATE),
      updatedAt: new Date(DATE),
      occurrences: [
        {
          id: occurrenceId,
          childItemId: requireMapValue(itemIds, edge.child),
          qty: '1',
          effectiveFrom: new Date(DATE),
          createdAt: new Date(DATE),
          updatedAt: new Date(DATE)
        }
      ]
    });
    edges.push({
      parentId: requireMapValue(itemIds, edge.parent),
      childId: requireMapValue(itemIds, edge.child),
      parentRevisionId: id(`${input.name}:revision:${edge.parent}`),
      occurrenceId,
      lineNo,
      qty: '1',
      bomType: edge.bomType,
      orgId: edge.orgId
    });
  }
  await loadHistory(adapter, {
    batchNo: `bom-reach-${input.name}`,
    id: id(`${input.name}:batch`),
    createdAt: new Date(DATE),
    updatedAt: new Date(DATE),
    revisions: input.items.map(key => ({
      id: id(`${input.name}:revision:${key}`),
      itemId: requireMapValue(itemIds, key),
      revisionNo: 'A',
      effectiveFrom: new Date(DATE),
      createdAt: new Date(DATE),
      updatedAt: new Date(DATE)
    })),
    headers: [...headers.values()]
  });
  return {
    input,
    itemIds,
    edges,
    context: { bomType: 'ebom', orgId: 'reach-org-0', asOfDate: new Date(DATE), alternativeNo: 1 }
  };
};

const edgeOrder = (left: Edge, right: Edge): number =>
  left.lineNo - right.lineNo ||
  (left.occurrenceId < right.occurrenceId ? -1
  : left.occurrenceId === right.occurrenceId ? 0
  : 1);

const oraclePaths = (fixture: Fixture, target: string): { paths: string[][]; truncated: boolean } => {
  const matching = fixture.edges.filter(
    edge => edge.bomType === fixture.context.bomType && edge.orgId === fixture.context.orgId
  );
  const parents = new Map<string, Edge[]>();
  for (const edge of matching) parents.set(edge.childId, [...(parents.get(edge.childId) ?? []), edge]);
  for (const entries of parents.values()) entries.sort(edgeOrder);
  const queue: { itemId: string; path: string[] }[] = [{ itemId: target, path: [] }];
  const paths: string[][] = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const edge of parents.get(current.itemId) ?? []) {
      if (paths.length === BUDGETS.paths) return { paths, truncated: true };
      const path = [edge.occurrenceId, ...current.path];
      assert(path.length <= BUDGETS.depth, 'benchmark oracle意外先碰到深度限制');
      paths.push(path);
      queue.push({ itemId: edge.parentId, path });
    }
  }
  return { paths, truncated: false };
};

const verifier = (fixture: Fixture, target: string) => {
  const expected = oraclePaths(fixture, target);
  const edgeById = new Map(fixture.edges.map(edge => [edge.occurrenceId, edge]));
  const expectedPaths = JSON.stringify(expected.paths);
  return (result: ExpansionResult): void => {
    assert(
      result.context.bomType === fixture.context.bomType && result.context.orgId === fixture.context.orgId,
      '反查作用域漂移'
    );
    assert(result.context.asOfDate.getTime() === fixture.context.asOfDate.getTime(), '反查评估日漂移');
    assert(result.context.alternativeNo === fixture.context.alternativeNo, '反查备选上下文漂移');
    assert((result.unresolved?.length ?? 0) === 0, '已裁决benchmark出现候选');
    assert(
      JSON.stringify(result.nodes.map(node => node.path)) === expectedPaths,
      '反查路径内容或BFS顺序与独立oracle不同'
    );
    assert(
      JSON.stringify(result.truncated) === JSON.stringify(expected.truncated ? { reason: 'paths' } : null),
      '反查预算结果或截断原因错误'
    );
    for (const node of result.nodes) {
      assert(node.depth === node.path.length && node.path.length > 0, '反查层级或空路径错误');
      const first = edgeById.get(node.path[0]);
      assert(
        first !== undefined && first.parentId === node.itemId && first.parentRevisionId === node.revisionId,
        '反查父件/修订错误'
      );
      assert(first?.occurrenceId === node.occurrenceId && first.qty === node.qty, '反查发生项身份或用量错误');
      assert(
        node.lineNo === first.lineNo && node.effectiveFrom?.toISOString() === DATE && node.effectiveTo === null,
        '反查逻辑行或生效期错误'
      );
      let current = node.itemId;
      for (const occurrenceId of node.path) {
        const edge = edgeById.get(occurrenceId);
        assert(edge !== undefined && edge.parentId === current, '反查路径不是连续的真实发生项');
        current = edge.childId;
      }
      assert(current === target, '反查路径未到达目标物料');
    }
  };
};

const captureSql = async <T>(
  adapter: RxDBAdapterPGlite,
  operation: () => Promise<T>
): Promise<{ result: T; calls: SqlCall[] }> => {
  const original = adapter.transaction;
  const execute = original.bind(adapter);
  const calls: SqlCall[] = [];
  adapter.transaction = async <Fun extends TransactionFun>(
    fun: Fun,
    transactionLog?: boolean
  ): Promise<Awaited<ReturnType<Fun>>> =>
    (await execute(async executor => {
      const originalQuery = executor.query;
      const query = originalQuery.bind(executor);
      executor.query = async (sql, params) => {
        calls.push({ sql, params: [...(params ?? [])] });
        return query(sql, params);
      };
      try {
        return await fun(executor);
      } finally {
        executor.query = originalQuery;
      }
    }, transactionLog)) as Awaited<ReturnType<Fun>>;
  try {
    return { result: await operation(), calls };
  } finally {
    adapter.transaction = original;
  }
};

const readIndexes = async (adapter: RxDBAdapterPGlite) =>
  adapter.transaction(async executor => {
    const result = await executor.query(
      'SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = $1 ORDER BY tablename, indexname',
      ['bom']
    );
    return result.rows.map(row => ({ table: String(row[0]), name: String(row[1]), definition: String(row[2]) }));
  }, false);

const plansFor = async (adapter: RxDBAdapterPGlite, calls: SqlCall[]) =>
  adapter.transaction(async executor => {
    const selects = calls.filter(call => /^\s*SELECT\b/i.test(call.sql));
    const selected = selects.length > 1 ? [selects[0], selects[selects.length - 1]] : selects;
    const plans: Sample['queryPlans'] = [];
    for (const call of selected) {
      const result = await executor.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${call.sql}`, call.params);
      plans.push({ sql: call.sql, params: call.params, parameterCount: call.params.length, plan: result.rows[0][0] });
    }
    return plans;
  }, false);

interface PreparedSample {
  phase: string;
  operation: () => Promise<ExpansionResult>;
  verify: (result: ExpansionResult) => void;
  queryPlans: Sample['queryPlans'];
  sqlCalls: number;
  latest: Pick<Sample, 'resultNodes' | 'maximumReturnedDepth' | 'truncated'>;
  rawSamplesMs: number[];
}

const resultSummary = (result: ExpansionResult) => ({
  resultNodes: result.nodes.length,
  maximumReturnedDepth: Math.max(0, ...result.nodes.map(node => node.depth)),
  truncated: result.truncated
});

const prototypeOperation = (adapter: RxDBAdapterPGlite, fixture: Fixture, target: string, prune: boolean) =>
  adapter.transaction(async executor => {
    if (prune) {
      const candidates = await executor.query(
        'SELECT 1 FROM "bom"."bom_reach" WHERE "bomType" = $1 AND "orgId" = $2 AND "descendantItemId" = $3 LIMIT 1',
        [fixture.context.bomType, fixture.context.orgId, target]
      );
      if (candidates.rows.length === 0)
        return { context: fixture.context, nodes: [], truncated: null } satisfies ExpansionResult;
    }
    const scoped = {
      name: adapter.name,
      transaction: async <Fun extends TransactionFun>(fun: Fun): Promise<Awaited<ReturnType<Fun>>> =>
        (await fun(executor)) as Awaited<ReturnType<Fun>>
    };
    return whereUsed(scoped, fixture.context, { childItemId: target }, { budgets: BUDGETS });
  }, false);

const prepareSample = async (
  db: RxDB,
  adapter: RxDBAdapterPGlite,
  fixture: Fixture,
  phase: string,
  targetKey: string
): Promise<PreparedSample> => {
  const target = requireMapValue(fixture.itemIds, targetKey);
  const verify = verifier(fixture, target);
  const operation =
    PROTOTYPE ?
      () => prototypeOperation(adapter, fixture, target, phase === 'reach-prune')
    : () => db.bom.whereUsed(fixture.context, { childItemId: target }, { budgets: BUDGETS });
  const captured = await captureSql(adapter, operation);
  verify(captured.result);
  return {
    phase,
    operation,
    verify,
    queryPlans: await plansFor(adapter, captured.calls),
    sqlCalls: captured.calls.length,
    latest: resultSummary(captured.result),
    rawSamplesMs: []
  };
};

const takeSample = async (sample: PreparedSample, record: boolean): Promise<void> => {
  collectGarbage();
  const start = performance.now();
  const result = await sample.operation();
  const elapsed = performance.now() - start;
  sample.verify(result);
  sample.latest = resultSummary(result);
  if (record) sample.rawSamplesMs.push(elapsed);
};

const finishSample = (fixture: Fixture, targetKey: string, sample: PreparedSample): Sample => {
  const stats = summarise(sample.rawSamplesMs);
  return {
    phase: sample.phase,
    scenario: `${fixture.input.name}:${
      targetKey === fixture.input.unused ? 'unused-root'
      : fixture.input.diamond ? 'budgeted-diamond'
      : 'used-leaf'
    }`,
    materialCount: fixture.input.items.length,
    edgeCount: fixture.edges.length,
    ...sample.latest,
    warmup: WARMUP,
    samples: SAMPLES,
    rawSamplesMs: sample.rawSamplesMs,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    maxMs: stats.max,
    queryBudgetMs: QUERY_BUDGET_MS,
    withinQueryBudget: stats.p95 < QUERY_BUDGET_MS,
    sqlCalls: sample.sqlCalls,
    queryPlans: sample.queryPlans
  };
};

const measure = async (
  db: RxDB,
  adapter: RxDBAdapterPGlite,
  fixture: Fixture,
  phase: string,
  targetKey: string
): Promise<Sample> => {
  const sample = await prepareSample(db, adapter, fixture, phase, targetKey);
  for (let iteration = 0; iteration < WARMUP + SAMPLES; iteration += 1) await takeSample(sample, iteration >= WARMUP);
  return finishSample(fixture, targetKey, sample);
};

const measureInterleaved = async (
  db: RxDB,
  adapter: RxDBAdapterPGlite,
  fixture: Fixture,
  targetKey: string
): Promise<Sample[]> => {
  const samples: PreparedSample[] = [];
  for (const phase of ['indexed', 'reach-prune'])
    samples.push(await prepareSample(db, adapter, fixture, phase, targetKey));
  for (let iteration = 0; iteration < WARMUP + SAMPLES; iteration += 1) {
    const ordered = iteration % 2 === 0 ? samples : [...samples].reverse();
    for (const sample of ordered) await takeSample(sample, iteration >= WARMUP);
  }
  return samples.map(sample => finishSample(fixture, targetKey, sample));
};

const analyse = async (adapter: RxDBAdapterPGlite): Promise<void> =>
  adapter.transaction(async executor => {
    await executor.query('ANALYZE "bom"."bom_line_occurrence"');
    await executor.query('ANALYZE "bom"."bom_header"');
    await executor.query('ANALYZE "bom"."bom_line"');
    await executor.query('ANALYZE "bom"."item_revision"');
  }, false);

const phaseIndexes = async (adapter: RxDBAdapterPGlite, phase: string): Promise<void> => {
  await adapter.transaction(async executor => {
    if (phase === 'child-item')
      await executor.query(
        'CREATE INDEX "__benchmark_reach_child_item" ON "bom"."bom_line_occurrence" ("childItemId")'
      );
    if (phase === 'child-item-and-scope')
      await executor.query(
        'CREATE INDEX "__benchmark_reach_header_scope" ON "bom"."bom_header" ("bomType", "orgId", "state")'
      );
  }, false);
  await analyse(adapter);
};

const reachRows = async (adapter: RxDBAdapterPGlite): Promise<number> =>
  adapter.transaction(
    async executor => Number((await executor.query('SELECT COUNT(*) FROM "bom"."bom_reach"')).rows[0][0]),
    false
  );

const childItemIndexes = (indexes: Awaited<ReturnType<typeof readIndexes>>) =>
  indexes.filter(
    index => index.table === 'bom_line_occurrence' && /USING btree \(\s*"childItemId"\s*\)$/.test(index.definition)
  );

const quotedIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const writeCosts = async (db: RxDB, adapter: RxDBAdapterPGlite, fixture: Fixture) => {
  const key = `${fixture.input.name}:write`;
  const items: BomItem[] = [];
  for (const role of ['parent', 'first', 'second']) {
    const item = db.entityManager.instantiate(BomItem, {
      id: deterministicId(`${key}:${role}`),
      itemNo: `WRITE-${fixture.input.name}-${role}`
    });
    items.push(await db.entityManager.getRepository(BomItem).create(item));
  }
  const revisions = items.map((item, index) => ({
    id: id(`${key}:revision:${index}`),
    itemId: item.id,
    revisionNo: 'A',
    effectiveFrom: new Date(DATE)
  }));
  await loadHistory(adapter, { batchNo: `${key}:history`, revisions, headers: [] });
  const header = await db.entityManager.getRepository(BomHeader).create(
    db.entityManager.instantiate(BomHeader, {
      parentRevisionId: revisions[0].id,
      bomType: 'ebom',
      orgId: fixture.context.orgId
    })
  );
  const lines: BomLine[] = [];
  for (const lineNo of [10, 20])
    lines.push(
      await db.entityManager
        .getRepository(BomLine)
        .create(db.entityManager.instantiate(BomLine, { headerId: header.id, lineNo }))
    );
  const repository = db.entityManager.getRepository(BomLineOccurrence);
  const quantity = await repository.create(
    db.entityManager.instantiate(BomLineOccurrence, {
      lineId: lines[0].id,
      childItemId: items[1].id,
      qty: '1',
      effectiveFrom: new Date(DATE)
    })
  );
  const baselineRows = await reachRows(adapter);
  const raw: Record<'createConsume' | 'removeConsume' | 'saveQuantity', number[]> = {
    createConsume: [],
    removeConsume: [],
    saveQuantity: []
  };
  const timed = async <T>(operation: () => Promise<T>): Promise<{ result: T; elapsed: number }> => {
    collectGarbage();
    const start = performance.now();
    const result = await operation();
    return { result, elapsed: performance.now() - start };
  };
  for (let iteration = 0; iteration < WARMUP + SAMPLES; iteration += 1) {
    const created = await timed(() =>
      repository.create(
        db.entityManager.instantiate(BomLineOccurrence, {
          lineId: lines[1].id,
          childItemId: items[2].id,
          qty: '1',
          effectiveFrom: new Date(DATE)
        })
      )
    );
    assert((await reachRows(adapter)) === baselineRows + 1, '新增consume未建立且只建立目标可达对');
    const removed = await timed(() => repository.remove(created.result));
    assert((await reachRows(adapter)) === baselineRows, '删除consume未恢复原闭包');
    const saved = await timed(async () => {
      quantity.qty = String(iteration + 2);
      await quantity.save();
    });
    assert((await reachRows(adapter)) === baselineRows, '非拓扑qty保存改变闭包行数');
    const stored = await adapter.transaction(
      executor => executor.query('SELECT "qty" FROM "bom"."bom_line_occurrence" WHERE "id" = $1', [quantity.id]),
      false
    );
    assert(stored.rows[0][0] === String(iteration + 2), 'qty保存未真实落库');
    if (iteration >= WARMUP) {
      raw.createConsume.push(created.elapsed);
      raw.removeConsume.push(removed.elapsed);
      raw.saveQuantity.push(saved.elapsed);
    }
  }
  return {
    backgroundMaterials: fixture.input.items.length,
    backgroundEdges: fixture.edges.length,
    representativeAddedMaterials: 3,
    scope: { bomType: 'ebom', orgId: fixture.context.orgId },
    reachRowsBeforeEachRound: baselineRows,
    warmup: WARMUP,
    samples: SAMPLES,
    metrics: Object.entries(raw).map(([operation, rawSamplesMs]) => {
      const stats = summarise(rawSamplesMs);
      const metric = {
        operation,
        rawSamplesMs,
        p50Ms: stats.p50,
        p95Ms: stats.p95,
        maxMs: stats.max,
        budgetMs: WRITE_BUDGET_MS,
        withinBudget: stats.p95 <= WRITE_BUDGET_MS
      };
      console.info('BOM_REACH_WRITE', JSON.stringify({ graph: fixture.input.name, ...metric }));
      return metric;
    })
  };
};

const migrationCost = async () => {
  const input = components(100);
  const { db, adapter, legacySystem } = await createDatabase(true);
  try {
    assert(legacySystem !== undefined, '旧图fixture缺少真实系统迁移定义');
    const seedStarted = performance.now();
    await seed(db, adapter, input);
    const seedMs = performance.now() - seedStarted;
    const nativeIndexes = await readIndexes(adapter);
    const table = legacySystem.entities[0];
    assert(!(await adapter.isTableExisted(table)), '旧图fixture已含Reach，不能冒充回填');
    collectGarbage();
    const createStarted = performance.now();
    await adapter.createTables([...legacySystem.entities]);
    const createTableMs = performance.now() - createStarted;
    const migrations = legacySystem.createMigrations(db.entityManager);
    assert(migrations.length === 1, '旧图fixture必须测真实Reach迁移');
    collectGarbage();
    const migrationStarted = performance.now();
    await adapter.transaction(executor => migrations[0].up(executor), false);
    const migrationUpMs = performance.now() - migrationStarted;
    const totalReachRows = await reachRows(adapter);
    assert(totalReachRows > input.edges.length, '回填没有产生传递可达对');
    return {
      materials: input.items.length,
      edges: input.edges.length,
      totalReachRows,
      seedMs,
      createTableMs,
      nativeIndexes,
      legacyFixture: '无Reach系统贡献的BOM业务表，经真实loadHistory装载，保留当前业务索引',
      migration: migrations[0].name,
      migrationUpMs,
      samples: 1,
      boundary:
        '真实system migration.up事务，含闭包回填/完整性验证/维护DDL，不含完整连接引导与水位认领；单次100物料不可外推大库'
    };
  } finally {
    await db.destroy();
  }
};

const runGraph = async (input: GraphInput) => {
  const { db, adapter } = await createDatabase();
  try {
    console.info(`BOM 主数据反查基准装载：${input.name}，${input.items.length}物料/${input.edges.length}边`);
    const seedStarted = performance.now();
    const fixture = await seed(db, adapter, input);
    const seedMs = performance.now() - seedStarted;
    const seedReachRows = await reachRows(adapter);
    collectGarbage();
    const productionIndexes = await readIndexes(adapter);
    const removedForBaseline = PROTOTYPE ? [] : childItemIndexes(productionIndexes);
    assert(childItemIndexes(productionIndexes).length > 0, '当前生产schema缺少childItemId索引，不能标为indexed');
    if (!PROTOTYPE)
      await adapter.transaction(async executor => {
        for (const index of removedForBaseline)
          await executor.query(`DROP INDEX "bom".${quotedIdentifier(index.name)}`);
      }, false);
    const existingIndexes = await readIndexes(adapter);
    const results: Sample[] = [];
    const indexes: { phase: string; definitions: Awaited<ReturnType<typeof readIndexes>> }[] = [];
    const targets = [input.target, ...(input.unused === undefined ? [] : [input.unused])];
    if (PROTOTYPE) {
      await analyse(adapter);
      for (const phase of ['indexed', 'reach-prune']) indexes.push({ phase, definitions: await readIndexes(adapter) });
      for (const target of targets) results.push(...(await measureInterleaved(db, adapter, fixture, target)));
    } else {
      for (const phase of ['existing', 'child-item', 'child-item-and-scope']) {
        await phaseIndexes(adapter, phase);
        indexes.push({ phase, definitions: await readIndexes(adapter) });
        for (const target of targets) results.push(await measure(db, adapter, fixture, phase, target));
      }
    }
    for (const result of results)
      console.info(
        JSON.stringify({
          scenario: result.scenario,
          phase: result.phase,
          p50Ms: result.p50Ms,
          p95Ms: result.p95Ms,
          maxMs: result.maxMs,
          nodes: result.resultNodes,
          truncated: result.truncated
        })
      );
    const maintenance = PROTOTYPE ? await writeCosts(db, adapter, fixture) : undefined;
    return {
      graph: input.name,
      seed: { materialCount: input.items.length, edgeCount: input.edges.length, seedMs, totalReachRows: seedReachRows },
      productionIndexes,
      removedForBaseline,
      existingIndexes,
      indexes,
      results,
      maintenance
    };
  } finally {
    await db.destroy();
  }
};

const comparisons = (samples: Sample[]) =>
  samples
    .filter(sample => sample.phase === (PROTOTYPE ? 'indexed' : 'existing'))
    .map(baseline => {
      const variants = samples.filter(
        sample => sample.scenario === baseline.scenario && sample.phase !== baseline.phase
      );
      const best = [...variants].sort((left, right) => left.p95Ms - right.p95Ms)[0];
      const gainPercent = ((baseline.p95Ms - best.p95Ms) / baseline.p95Ms) * 100;
      const boundedPathEmission = baseline.truncated !== null;
      let trigger = '当前样本未证明主数据where-used超过16ms，不据此宣称需要物化';
      if (boundedPathEmission) trigger = '本场景受路径输出预算约束；路径枚举成本不能证明物料闭包必然更快';
      else if (!baseline.withinQueryBudget && best.withinQueryBudget)
        trigger = '已有热路径被最小索引方案解决；应先评估索引，物化必要性尚未证明';
      else if (!baseline.withinQueryBudget)
        trigger = '最小索引后仍超过查询预算，具备进一步测量可达候选物化的触发依据，但物化收益尚未测量';
      const pruningApplicable = baseline.resultNodes === 0 && baseline.truncated === null;
      if (PROTOTYPE && !pruningApplicable)
        trigger = '非空路径只增加可达点查，观察到的正收益不能归因于剪枝，不声明非空加速';
      else if (PROTOTYPE)
        trigger =
          gainPercent <= 0 ? '可达空使用方剪枝原型没有改善此场景，不启用默认读取'
          : baseline.withinQueryBudget ? '原型有局部正收益，但索引路径已在预算内，不据此改变默认读取'
          : '原型改善仍需结合已裁决工作负载和写入成本复核；此次不自动启用';
      return {
        scenario: baseline.scenario,
        baselineP95Ms: baseline.p95Ms,
        bestComparedPhase: best.phase,
        bestIndexP95Ms: best.p95Ms,
        p95GainPercent: gainPercent,
        regression: gainPercent < 0,
        materializationMeasured: PROTOTYPE,
        pruningApplicable,
        materializationGainProven: PROTOTYPE && pruningApplicable && gainPercent >= 20,
        defaultPruningEnabled: false,
        trigger,
        variants: variants.map(value => ({
          phase: value.phase,
          p95Ms: value.p95Ms,
          p95GainPercent: ((baseline.p95Ms - value.p95Ms) / baseline.p95Ms) * 100
        }))
      };
    });

const run = async (): Promise<void> => {
  const migration = PROTOTYPE ? await migrationCost() : undefined;
  const graphs: Awaited<ReturnType<typeof runGraph>>[] = [];
  for (const size of PROTOTYPE ? [10_000] : [100, 1000, 10_000]) graphs.push(await runGraph(components(size)));
  graphs.push(await runGraph(diamonds()));
  const samples = graphs.flatMap(graph => graph.results);
  const report = {
    generatedAt: new Date().toISOString(),
    api: PROTOTYPE ? 'public whereUsed with one shared TransactionExecutor boundary' : 'RxDB.bom.whereUsed',
    backend: 'pglite',
    isolatedInMemoryDatabases: true,
    materializationMeasured: PROTOTYPE,
    defaultPruningEnabled: false,
    productionSchemaModified: false,
    environment: {
      node: process.version,
      execArgv: process.execArgv,
      platform: process.platform,
      arch: process.arch,
      cpu: [...new Set(cpus().map(cpu => cpu.model))],
      totalMemoryBytes: totalmem(),
      rssBytes: process.memoryUsage().rss
    },
    context: { bomType: 'ebom', orgId: 'reach-org-0', asOfDate: DATE, alternativeNo: 1 },
    budgets: BUDGETS,
    warmup: WARMUP,
    samples: SAMPLES,
    sampling: {
      explicitExposeGc: true,
      gcAfterSeed: true,
      gcBeforeEachIteration: true,
      pairedInterleaving: PROTOTYPE,
      reverseOrderEveryOtherRound: PROTOTYPE,
      phaseOrder:
        PROTOTYPE ?
          Array.from({ length: WARMUP + SAMPLES }, (_, round) => ({
            round,
            warmup: round < WARMUP,
            phases: round % 2 === 0 ? ['indexed', 'reach-prune'] : ['reach-prune', 'indexed']
          }))
        : undefined,
      cpuIsolation: '调用方必须独占Nx/构建CPU；GC与正确性验证都不计入查询/保存计时'
    },
    migration,
    verification: '每轮对照独立发生项路径oracle、BFS顺序、作用域、候选、深度和截断；计时不包含验证与EXPLAIN',
    graphs,
    comparisons: comparisons(samples)
  };
  const directory = resolve(import.meta.dirname, 'reports');
  await mkdir(directory, { recursive: true });
  if (PROTOTYPE) {
    await writeFile(resolve(directory, 'bom-reach-pruning-prototype.json'), JSON.stringify(report, null, 2));
  } else {
    await writeFile(
      resolve(directory, 'bom-reach-baseline.json'),
      JSON.stringify(
        {
          ...report,
          graphs: graphs.map(graph => ({
            ...graph,
            results: graph.results.filter(result => result.phase === 'existing')
          }))
        },
        null,
        2
      )
    );
    await writeFile(resolve(directory, 'bom-reach-comparison.json'), JSON.stringify(report, null, 2));
  }
  console.info(JSON.stringify(report.comparisons, null, 2));
  if (graphs.some(graph => graph.maintenance?.metrics.some(metric => !metric.withinBudget))) process.exitCode = 1;
};

await run();
