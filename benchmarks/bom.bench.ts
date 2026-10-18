/**
 * @fileoverview 已连接、预热后的 BOM API 耗时测量；活视图执行查询 16ms、保存与快照更新 100ms 预算门禁。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';

import { RxDB, SyncType, type AdapterRepositoryConstructor } from '@aiao/rxdb';
import { PGliteRepository, RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import {
  BOM_ENTITIES,
  BomHeader,
  BomInstanceNode,
  BomItem,
  BomLine,
  BomLineOccurrence,
  rxDBPluginBom,
  type BomViewSnapshot
} from '@aiao/rxdb-plugin-bom';
import { loadBomViewFixture } from '@aiao/rxdb-plugin-bom/testing';
import { filter, firstValueFrom, map, ReplaySubject, timeout } from 'rxjs';
import { summarise } from './bench-stats.ts';

const WARMUP = 5;
const SAMPLES = 20;
const READ_LINES = 100;
const INSTANCE_NODES = 100;
const VIEW_NODES = 100;
const IMPORT_LINES = 498;
const QUERY_BUDGET_MS = 16;
const SINGLE_SAVE_BUDGET_MS = 100;
const AS_OF = new Date('2026-06-01T00:00:00.000Z');
const ORG_ID = 'bom-benchmark';

interface Measurement {
  name: string;
  samples: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  rawSamplesMs: number[];
  referenceBudgetMs: number;
  p95ToBudgetRatio: number;
  withinReferenceBudget: boolean;
}

const measurement = (name: string, budgetMs: number, samples: number[]): Measurement => {
  const stats = summarise(samples);
  return {
    name,
    samples: samples.length,
    p50Ms: stats.p50,
    p95Ms: stats.p95,
    maxMs: stats.max,
    rawSamplesMs: samples,
    referenceBudgetMs: budgetMs,
    p95ToBudgetRatio: stats.p95 / budgetMs,
    withinReferenceBudget: stats.p95 <= budgetMs
  };
};

const measure = async <T>(
  name: string,
  budgetMs: number,
  prepare: (iteration: number) => (() => Promise<T>) | Promise<() => Promise<T>>,
  verify: (result: T) => void
): Promise<Measurement> => {
  const samples: number[] = [];
  for (let iteration = 0; iteration < WARMUP + SAMPLES; iteration += 1) {
    const operation = await prepare(iteration);
    const start = performance.now();
    const result = await operation();
    const elapsed = performance.now() - start;
    verify(result);
    if (iteration >= WARMUP) samples.push(elapsed);
  }
  return measurement(name, budgetMs, samples);
};

const createDatabase = async (): Promise<RxDB> => {
  const rxdb = new RxDB({
    dbName: `bom-benchmark-${crypto.randomUUID()}`,
    context: { userId: '00000000-0000-7000-8000-000000000001' },
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginBom);
  rxdb.adapter(
    'pglite',
    db =>
      new RxDBAdapterPGlite(db, {
        store: 'memory',
        repositories: {
          BomRepository: PGliteRepository as unknown as AdapterRepositoryConstructor<RxDBAdapterPGlite>
        }
      })
  );
  await rxdb.connect('pglite');
  return rxdb;
};

const seedReadFixture = async (rxdb: RxDB) => {
  const parent = new BomItem();
  parent.itemNo = 'BENCH-PARENT';
  await parent.save();
  const child = new BomItem();
  child.itemNo = 'BENCH-CHILD';
  await child.save();
  const revisionId = crypto.randomUUID();
  await rxdb.bom.loadHistory({
    batchNo: 'bom-benchmark-seed',
    revisions: [{ id: revisionId, itemId: parent.id, revisionNo: 'A', effectiveFrom: AS_OF }],
    headers: [
      {
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: ORG_ID,
        lines: Array.from({ length: READ_LINES }, (_, index) => ({
          lineNo: index + 1,
          occurrences: [{ childItemId: child.id, qty: '1', effectiveFrom: AS_OF }]
        }))
      }
    ]
  });
  return { parent, child, revisionId };
};

const importPayload = (prefix: string, lines: number): Record<string, unknown>[] => {
  const parent = `${prefix}-PARENT`;
  const child = `${prefix}-CHILD`;
  const identity = { itemNo: parent, revisionNo: 'A', bomType: 'ebom', orgId: ORG_ID, alternativeNo: 1 };
  const records: Record<string, unknown>[] = [
    { kind: 'item', source_ref: `${prefix}-parent`, itemNo: parent },
    { kind: 'item', source_ref: `${prefix}-child`, itemNo: child },
    {
      kind: 'revision',
      source_ref: `${prefix}-revision`,
      itemNo: parent,
      revisionNo: 'A',
      effectiveFrom: AS_OF.toISOString()
    },
    { kind: 'header', source_ref: `${prefix}-header`, ...identity }
  ];
  for (let index = 0; index < lines; index += 1) {
    const lineNo = index + 1;
    records.push({ kind: 'line', source_ref: `${prefix}-line-${lineNo}`, ...identity, lineNo });
    records.push({
      kind: 'occurrence',
      source_ref: `${prefix}-occurrence-${lineNo}`,
      ...identity,
      lineNo,
      childItemNo: child,
      effectiveFrom: AS_OF.toISOString(),
      qty: '1',
      uom: 'pcs'
    });
  }
  return records;
};

const assertImported = (result: Awaited<ReturnType<RxDB['bom']['importBomDraft']>>): void => {
  if (!result.committed || result.diagnostics.length > 0 || result.headerIds.length !== 1) {
    throw new Error(`BOM 导入基准失败：${JSON.stringify(result)}`);
  }
};

const measureInstances = async (
  rxdb: RxDB,
  fixture: Awaited<ReturnType<typeof seedReadFixture>>
): Promise<Measurement[]> => {
  const childRevisionId = crypto.randomUUID();
  await rxdb.bom.loadHistory({
    batchNo: 'bom-benchmark-instance-revision',
    revisions: [{ id: childRevisionId, itemId: fixture.child.id, revisionNo: 'A', effectiveFrom: AS_OF }],
    headers: []
  });
  const resolved = await rxdb.bom.resolve(
    { bomType: 'ebom', orgId: ORG_ID, asOfDate: AS_OF },
    { parentItemId: fixture.parent.id }
  );
  const root = new BomInstanceNode();
  root.itemRevisionId = fixture.revisionId;
  root.serialNumber = 'BENCH-INSTANCE';
  root.installedAt = AS_OF;
  await root.save();
  const createPart = (serialNumber: string, sourceOccurrenceId: string): BomInstanceNode => {
    const node = new BomInstanceNode();
    node.itemRevisionId = childRevisionId;
    node.parentInstanceId = root.id;
    node.sourceOccurrenceId = sourceOccurrenceId;
    node.serialNumber = serialNumber;
    node.lotCode = 'BENCH-INSTANCE-LOT';
    node.installedAt = AS_OF;
    return node;
  };
  for (let index = 0; index < INSTANCE_NODES - 1; index += 1) {
    await createPart(`BENCH-INSTANCE-PART-${index}`, resolved.occurrences[index].occurrenceId).save();
  }
  const expand = await measure(
    'expandInstance',
    QUERY_BUDGET_MS,
    () => () => rxdb.bom.expandInstance(root.id, { asOfDate: AS_OF }),
    result => {
      if (result.nodes.length !== INSTANCE_NODES || result.truncated) throw new Error('实例展开基准结构不完整');
    }
  );
  const trace = await measure(
    'whereUsedInstance',
    QUERY_BUDGET_MS,
    () => () => rxdb.bom.whereUsedInstance({ serialNumber: 'BENCH-INSTANCE-PART-0' }, { asOfDate: AS_OF }),
    result => {
      if (result.matches.length !== 1 || result.matches[0].path.length !== 2 || result.truncated) {
        throw new Error('实例序列号反查未命中唯一整机路径');
      }
    }
  );
  const save = await measure(
    'saveInstance',
    SINGLE_SAVE_BUDGET_MS,
    iteration => {
      const node = createPart(`BENCH-INSTANCE-SAVE-${iteration}`, resolved.occurrences[0].occurrenceId);
      return () => node.save();
    },
    result => {
      if (!result.id) throw new Error('实例保存未返回安装记录标识');
    }
  );
  return [expand, trace, save];
};

const assertViewSnapshot = (snapshot: BomViewSnapshot): void => {
  if (
    snapshot.refreshing ||
    snapshot.expansion.nodes.length !== VIEW_NODES ||
    snapshot.expansion.truncated !== null ||
    (snapshot.expansion.unresolved?.length ?? 0) > 0 ||
    snapshot.quantityError !== null ||
    snapshot.explosion === null ||
    snapshot.explosion.requirementLines.length !== VIEW_NODES - 1 ||
    snapshot.explosion.truncated !== null ||
    snapshot.explosion.unresolved.length > 0 ||
    snapshot.explosion.manifest.unresolved.length > 0
  ) {
    throw new Error('活视图基准必须返回完整的根与 99 个叶子及其数量快照');
  }
};

const measureViewWrites = async (rxdb: RxDB, fixture: Awaited<ReturnType<typeof loadBomViewFixture>>) => {
  const input = fixture.inputFor('performance');
  const changes = new ReplaySubject<BomViewSnapshot>(1);
  const subscription = rxdb.bom.watchView(input).subscribe({
    next: snapshot => changes.next(snapshot),
    error: (failure: unknown) => changes.error(failure)
  });
  const saves: number[] = [];
  const refreshes: number[] = [];
  const snapshotRelativeToSaveMs: number[] = [];
  try {
    assertViewSnapshot(
      await firstValueFrom(
        changes.pipe(
          filter(snapshot => !snapshot.refreshing),
          timeout(10_000)
        )
      )
    );
    const repository = rxdb.entityManager.getRepository(BomItem);
    const item = await firstValueFrom(repository.get(fixture.ids.items.performance));
    for (let iteration = 0; iteration < WARMUP + SAMPLES; iteration += 1) {
      const description = `BOM 活视图性能样本 ${iteration}`;
      const observed = firstValueFrom(
        changes.pipe(
          filter(
            snapshot =>
              !snapshot.refreshing &&
              snapshot.items.some(value => value.id === item.id && value.description === description)
          ),
          map(snapshot => ({ snapshot, receivedAt: performance.now() })),
          timeout(10_000)
        )
      );
      const start = performance.now();
      const [savedAt, result] = await Promise.all([
        repository.update(item, { description }).then(() => performance.now()),
        observed
      ]);
      assertViewSnapshot(result.snapshot);
      if (iteration < WARMUP) continue;
      saves.push(savedAt - start);
      const relative = result.receivedAt - savedAt;
      snapshotRelativeToSaveMs.push(relative);
      refreshes.push(Math.max(0, relative));
    }
    return {
      metrics: [
        measurement('saveViewItemDescription', SINGLE_SAVE_BUDGET_MS, saves),
        measurement('viewSnapshotAfterSave', SINGLE_SAVE_BUDGET_MS, refreshes)
      ],
      rawSnapshotRelativeToSaveMs: snapshotRelativeToSaveMs,
      snapshotBeforeSaveCompletionCount: snapshotRelativeToSaveMs.filter(value => value < 0).length
    };
  } finally {
    subscription.unsubscribe();
    changes.complete();
  }
};

const measureView = async () => {
  const rxdb = await createDatabase();
  try {
    const fixture = await loadBomViewFixture(rxdb);
    const input = fixture.inputFor('performance');
    const query = await measure(
      'watchViewRecreatedTask',
      QUERY_BUDGET_MS,
      () => () =>
        firstValueFrom(
          rxdb.bom.watchView(input).pipe(
            filter(snapshot => !snapshot.refreshing),
            timeout(10_000)
          )
        ),
      assertViewSnapshot
    );
    const writes = await measureViewWrites(rxdb, fixture);
    return {
      fixture: {
        source: 'loadBomViewFixture(db).inputFor(performance)',
        isolatedDatabase: true,
        nodes: VIEW_NODES,
        leaves: VIEW_NODES - 1,
        plannedQty: input.plannedQty,
        asOfDate: input.context.asOfDate.toISOString()
      },
      measurement: {
        queryBoundary: 'new watchView task subscription to first complete non-refreshing snapshot',
        queryTaskLifetime: 'last subscription released after every sample; task recreated for next sample',
        saveBoundary: 'BomItem repository.update Promise resolve',
        refreshBoundary: 'save Promise completion to first non-refreshing snapshot containing the written description',
        snapshotAlreadyVisibleAtSaveCompletionMs: 0,
        rawSnapshotRelativeToSaveMs: writes.rawSnapshotRelativeToSaveMs,
        snapshotBeforeSaveCompletionCount: writes.snapshotBeforeSaveCompletionCount,
        warmup: WARMUP,
        samples: SAMPLES,
        percentile: 'nearest rank',
        startupIncluded: false,
        fixturePreparationIncluded: false,
        enforced: true
      },
      metrics: [query, ...writes.metrics],
      budgets: {
        queryMs: QUERY_BUDGET_MS,
        singleSaveMs: SINGLE_SAVE_BUDGET_MS,
        saveCompletionToSnapshotMs: SINGLE_SAVE_BUDGET_MS,
        criterion: 'p95 <= budget',
        enforced: true
      }
    };
  } finally {
    await rxdb.disconnectAll();
  }
};

const run = async () => {
  const rxdb = await createDatabase();
  try {
    const fixture = await seedReadFixture(rxdb);
    const context = { bomType: 'ebom' as const, orgId: ORG_ID, asOfDate: AS_OF, alternativeNo: 1 };
    const target = { parentItemId: fixture.parent.id };
    const explosionOptions = { plannedQty: { value: '1', uom: 'pcs' } };
    const resolveMetric = await measure(
      'resolve',
      QUERY_BUDGET_MS,
      () => () => rxdb.bom.resolve(context, target),
      result => {
        if (result.occurrences.length !== READ_LINES || result.manifest.unresolved.length > 0)
          throw new Error('解析基准的发生项计数或完整性不符');
      }
    );
    const explodeMetric = await measure(
      'explode',
      QUERY_BUDGET_MS,
      () => () => rxdb.bom.explodeBom(context, target, explosionOptions),
      result => {
        if (
          result.requirementLines.length !== READ_LINES ||
          result.truncated !== null ||
          result.manifest.unresolved.length > 0
        )
          throw new Error('数量展开基准的需求计数或完整性不符');
      }
    );
    const exportMetric = await measure(
      'export',
      QUERY_BUDGET_MS,
      () => () => rxdb.bom.exportBom(context, target, explosionOptions),
      result => {
        if (result.occurrences.length !== READ_LINES) throw new Error('导出基准的发生项计数不符');
      }
    );

    const draftHeader = new BomHeader();
    draftHeader.parentRevisionId = fixture.revisionId;
    draftHeader.bomType = 'ebom';
    draftHeader.orgId = ORG_ID;
    draftHeader.alternativeNo = 2;
    await draftHeader.save();
    const saveMetric = await measure(
      'saveOccurrence',
      SINGLE_SAVE_BUDGET_MS,
      async iteration => {
        const line = new BomLine();
        line.headerId = draftHeader.id;
        line.lineNo = iteration + 1;
        await line.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = fixture.child.id;
        occurrence.qty = '1';
        occurrence.effectiveFrom = AS_OF;
        occurrence.unitFrom = 137;
        occurrence.unitTo = 200;
        occurrence.lotCodes = '["BENCH"]';
        return () => occurrence.save();
      },
      result => {
        if (!result.id) throw new Error('单条发生项保存没有返回实体标识');
      }
    );

    const instanceMetrics = await measureInstances(rxdb, fixture);

    for (let iteration = 0; iteration < WARMUP; iteration += 1) {
      assertImported(await rxdb.bom.importBomDraft(importPayload(`WARMUP-${iteration}`, 1)));
    }
    const payload = importPayload('THOUSAND', IMPORT_LINES);
    const importStart = performance.now();
    const imported = await rxdb.bom.importBomDraft(payload);
    const importMs = performance.now() - importStart;
    assertImported(imported);
    const view = await measureView();
    return {
      createdAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: cpus()[0]?.model,
        backend: 'pglite',
        storage: 'memory'
      },
      measurement: {
        boundary: 'API Promise resolve',
        warmup: WARMUP,
        samples: SAMPLES,
        percentile: 'nearest rank',
        startupIncluded: false,
        fixturePreparationIncluded: false,
        enforced: false
      },
      fixture: {
        rootItems: 1,
        leafItems: 1,
        releasedHeaders: 1,
        releasedLines: READ_LINES,
        releasedOccurrences: READ_LINES,
        instanceNodes: INSTANCE_NODES,
        shape: 'single level, repeated child on distinct logical lines'
      },
      metrics: [resolveMetric, explodeMetric, exportMetric, saveMetric, ...instanceMetrics],
      view,
      import: {
        samples: 1,
        warmupBatches: WARMUP,
        warmupRecordsPerBatch: 6,
        records: payload.length,
        logicalLines: IMPORT_LINES,
        totalMs: importMs,
        recordsPerSecond: payload.length / (importMs / 1000),
        committed: imported.committed,
        draftHeaders: imported.headerIds.length
      },
      referenceBudgets: {
        queryMs: QUERY_BUDGET_MS,
        singleSaveMs: SINGLE_SAVE_BUDGET_MS,
        enforced: false,
        sources: ['benchmarks/README.md', '.specify/memory/constitution.md']
      }
    };
  } finally {
    await rxdb.disconnectAll();
  }
};

const report = await run();
const reportPath = resolve(import.meta.dirname, 'reports/bom-latest.json');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log(`BOM benchmark report: ${reportPath}`);
const failedViewMetrics = report.view.metrics.filter(metric => !metric.withinReferenceBudget);
if (failedViewMetrics.length > 0) {
  console.error(
    `BOM 活视图性能预算未达标：${failedViewMetrics
      .map(metric => `${metric.name} p95=${metric.p95Ms.toFixed(3)}ms > ${metric.referenceBudgetMs}ms`)
      .join('；')}`
  );
  process.exitCode = 1;
}
