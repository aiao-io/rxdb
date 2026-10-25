import {
  getEntityMetadata,
  type EntityType,
  type RxDB,
  type TransactionExecutor,
  type TransactionFun
} from '@aiao/rxdb';
import {
  BomEcn,
  BomError,
  BomExtAttrError,
  BomHeader,
  BomInstanceNode,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomSubstituteGroup,
  ecnDiff,
  ecnImpact,
  explodeBom,
  rollupCost,
  type CostRollupResult,
  type ExplosionResult,
  type RequirementLine
} from '@aiao/rxdb-plugin-bom';
import { deterministicId, goldenItemId } from '@aiao/rxdb-plugin-bom/testing';
import { TestBed } from '@angular/core/testing';
import { DatabaseSync } from 'node:sqlite';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService, connectDevTools } from './bom-demo.service';
import type { BomWorkspaceContext } from './bom-workspace-state';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>()),
  rollupCost: vi.fn(),
  explodeBom: vi.fn(),
  ecnDiff: vi.fn(),
  ecnImpact: vi.fn()
}));

const { initDevTools } = vi.hoisted(() => ({ initDevTools: vi.fn() }));
vi.mock('@aiao/rxdb-devtools', () => ({
  getDevToolsConnector: vi.fn(() => ({ init: initDevTools }))
}));

type Stored = Record<string, unknown> & { id: string };
type FindOptions = { where: { combinator?: 'and' | 'or'; rules: { field: string; value: unknown }[] } };

const restoreStatics: (() => void)[] = [];

const installFind = (entityType: EntityType, find: (options: FindOptions) => unknown): void => {
  const descriptor = Object.getOwnPropertyDescriptor(entityType, 'find');
  Object.defineProperty(entityType, 'find', { configurable: true, value: find });
  restoreStatics.push(() => {
    if (descriptor) Object.defineProperty(entityType, 'find', descriptor);
    else Reflect.deleteProperty(entityType, 'find');
  });
};

/** 模拟事务提交边界，故障后只回滚执行器内的写入，裸保存会暴露部分提交。 */
const transactionHarness = (
  initial: [EntityType, Stored[]][],
  fail: (entity: EntityType, row: Stored) => boolean,
  failure: () => unknown = () => new Error('故障注入：后续写入失败')
) => {
  const tables = new Map(
    initial.map(([entity, rows]) => [entity, new Map(rows.map(row => [row.id, structuredClone(row)]))])
  );
  const rows = (entity: EntityType): Map<string, Stored> => {
    const found = tables.get(entity);
    if (found) return found;
    const created = new Map<string, Stored>();
    tables.set(entity, created);
    return created;
  };
  const persist = (entity: EntityType, row: Stored): void => {
    if (fail(entity, row)) throw failure();
    rows(entity).set(
      row.id,
      structuredClone(
        Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value !== 'function'))
      ) as Stored
    );
  };
  const legacySave = vi.fn((entity: EntityType, row: Stored) => persist(entity, row));
  const materialize = (entity: EntityType, row: Stored): Stored => {
    const value = structuredClone(row);
    return Object.assign(value, { save: async () => legacySave(entity, value) });
  };
  const matching = (entity: EntityType, options: FindOptions): Stored[] =>
    [...rows(entity).values()]
      .filter(row =>
        options.where.combinator === 'or' ?
          options.where.rules.some(rule => row[rule.field] === rule.value)
        : options.where.rules.every(rule => row[rule.field] === rule.value)
      )
      .map(row => materialize(entity, row));
  const repository = (entity: EntityType) => ({
    find: vi.fn(async (options: FindOptions) => matching(entity, options)),
    update: vi.fn(async (row: Stored, patch: Partial<Stored>) => {
      const updated = { ...row, ...patch };
      persist(entity, updated);
      return updated;
    }),
    create: vi.fn(async (row: Stored) => {
      persist(entity, row);
      return row;
    })
  });
  const query = vi.fn<
    (
      sql: string,
      params?: readonly unknown[]
    ) => Promise<{ rows: unknown[][]; columns: string[]; rowsAffected: number }>
  >(async () => ({ rows: [[20]], columns: [], rowsAffected: 1 }));
  const executor = {
    getRepository: vi.fn(repository),
    query,
    tableRef: () => '"bom$table"',
    run: vi.fn(async (work: TransactionFun): Promise<unknown> => work(executor as unknown as TransactionExecutor))
  };
  const adapter = {
    name: 'wa-sqlite',
    rawQuery: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn<
      (work: (value: typeof executor) => Promise<unknown>, transactionLog?: boolean) => Promise<unknown>
    >(async work => {
      const before = new Map([...tables].map(([entity, values]) => [entity, structuredClone(values)]));
      try {
        return await work(executor);
      } catch (error) {
        tables.clear();
        for (const entry of before) tables.set(...entry);
        throw error;
      }
    })
  };
  let instantiated = 0;
  const rxdb = {
    bom: { explodeBom: vi.fn(), exportBom: vi.fn().mockResolvedValue({ manifest: {} }), importBomDraft: vi.fn() },
    entityManager: {
      instantiate: (entity: EntityType) => materialize(entity, { id: `created-instance-${++instantiated}` })
    }
  };
  for (const [entity] of initial) installFind(entity, (options: FindOptions) => of(matching(entity, options)));
  const service = TestBed.inject(BomDemoService);
  Object.assign(service, { adapter, rxdb });
  service.ready.set(true);
  return { service, adapter, rxdb, rows, legacySave, query, executor };
};

const reviewContext: BomWorkspaceContext = {
  rootKey: 'SC-100',
  asOfDate: '2030-01-01',
  plannedQty: '10',
  plannedUom: 'box',
  unit: 137,
  lot: 'LOT-A',
  alternativeNo: 2,
  configSelection: { 颜色: ['红'] },
  substituteSelections: { battery: { memberKey: 'B' } }
};
const reviewExplosion = (): ExplosionResult => ({
  manifest: {
    context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-01-01T00:00:00.000Z') },
    parentItemId: 'root-id',
    parentRevisionId: 'root-A',
    headerIds: [],
    occurrenceIds: [],
    conversions: [],
    formulaGrammarVersion: 'test',
    algorithmVersion: 'test',
    unresolved: []
  },
  requirementLines: [],
  outputs: [],
  penetrations: [],
  unresolved: [],
  truncated: null
});
const reviewCost = (batchCost: string): CostRollupResult => ({
  context: {
    bomType: 'ebom',
    orgId: 'org-x',
    asOfDate: new Date('2026-01-01T00:00:00.000Z'),
    currency: 'CNY',
    rateDate: new Date('2026-01-01T00:00:00.000Z')
  },
  root: {
    headerId: 'h',
    itemId: 'root-id',
    batchQty: '10',
    baseUom: 'box',
    costLotQty: '1',
    batchCost,
    unitCost: batchCost,
    material: [],
    processing: [],
    overhead: '0',
    overheadReason: '无路线',
    credits: [],
    children: []
  }
});
const reviewRequirement = (revisionId: string | null, itemId = 'leaf-id', qty = '10'): RequirementLine => ({
  itemId,
  revisionId,
  path: [`${itemId}-occurrence`],
  qty,
  uom: 'pcs',
  steps: {
    planned: { value: qty, uom: 'pcs' },
    assemblyScrapped: { value: qty, uom: 'pcs' },
    gross: { value: qty, uom: 'pcs' },
    componentScrapped: { value: qty, uom: 'pcs' },
    operationScrapped: null,
    converted: { value: qty, uom: 'pcs' },
    phantom: { value: false, source: 'revision', revisionId }
  }
});
const changeReviewHarness = (state = 'released') => {
  const fixture = transactionHarness(
    [
      [BomEcn, [{ id: 'ecn-id', ecnNo: 'ECN-REAL', state, effectiveDate: new Date('2026-03-01T00:00:00.000Z') }]],
      [
        BomItemRevision,
        [
          {
            id: 'root-A',
            itemId: 'root-id',
            revisionNo: 'Z.12',
            state: 'released',
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      ]
    ],
    () => false
  );
  fixture.service.itemNos.set(new Map([['root-id', 'SC-100']]));
  fixture.service.ecns.set(new Map([['ecn-id', { ecnNo: 'STALE', state: 'draft', effectiveDate: '2027-01-01' }]]));
  vi.mocked(explodeBom).mockReset().mockResolvedValue(reviewExplosion());
  vi.mocked(rollupCost)
    .mockReset()
    .mockResolvedValueOnce(reviewCost('9007199254740993.1'))
    .mockResolvedValueOnce(reviewCost('9007199254740993.3'));
  vi.mocked(ecnImpact)
    .mockReset()
    .mockResolvedValue({
      ecnId: 'ecn-id',
      ecnNo: 'ECN-REAL',
      state,
      effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
      affectedItemIds: [],
      topItems: []
    });
  vi.mocked(ecnDiff)
    .mockReset()
    .mockResolvedValue({
      ecnId: 'ecn-id',
      ecnNo: 'ECN-REAL',
      effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
      headers: []
    });
  return fixture;
};

describe('BomDemoService', () => {
  afterEach(() => {
    for (const restore of restoreStatics.splice(0)) restore();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(rollupCost).mockReset();
    vi.mocked(explodeBom).mockReset();
    vi.mocked(ecnImpact).mockReset();
    vi.mocked(ecnDiff).mockReset();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('构造后可读种子常量与空状态（冒烟）', () => {
    const service = TestBed.inject(BomDemoService);
    expect(service.ready()).toBe(false);
    expect(service.seedBatchNo).toBe('scooter-seed-a');
    expect(service.seedTimestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(service.itemCount()).toBe(0);
  });

  it('改版核对从真实 ECN 日期建立同一只读快照，沿用计划单位与所有筛选条件', async () => {
    const { service, adapter, executor, rxdb } = changeReviewHarness();
    vi.mocked(explodeBom).mockImplementation(async scoped =>
      scoped.transaction(async active => {
        expect(active).toBe(executor);
        await scoped.rawQuery?.('SELECT snapshot');
        return reviewExplosion();
      })
    );

    const result = await service.reviewChange('ecn-id', reviewContext);

    expect(adapter.transaction).toHaveBeenCalledOnce();
    expect(adapter.transaction.mock.calls[0][1]).toBe(false);
    expect(adapter.rawQuery).not.toHaveBeenCalled();
    expect(executor.query).toHaveBeenCalledTimes(2);
    expect(rxdb.bom.explodeBom).not.toHaveBeenCalled();
    expect(explodeBom).toHaveBeenCalledTimes(2);
    expect(explodeBom).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'wa-sqlite' }),
      expect.objectContaining({
        asOfDate: new Date('2026-02-28T00:00:00.000Z'),
        unit: 137,
        lot: 'LOT-A',
        alternativeNo: 2,
        configSelection: reviewContext.configSelection,
        substituteSelections: reviewContext.substituteSelections
      }),
      { parentItemId: 'root-id' },
      { plannedQty: { value: '10', uom: 'box' } }
    );
    expect(rollupCost).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({
        asOfDate: new Date('2026-03-01T00:00:00.000Z'),
        rateDate: new Date('2026-03-01T00:00:00.000Z'),
        currency: 'CNY'
      }),
      { parentItemId: 'root-id' },
      { value: '10', uom: 'box' }
    );
    const snapshot = vi.mocked(explodeBom).mock.calls[0][0];
    expect(vi.mocked(rollupCost).mock.calls[0][0]).toBe(snapshot);
    expect(ecnImpact).toHaveBeenCalledWith(snapshot, 'ecn-id');
    expect(ecnDiff).toHaveBeenCalledWith(snapshot, 'ecn-id');
    expect(result).toMatchObject({
      ecnNo: 'ECN-REAL',
      beforeDate: '2026-02-28',
      afterDate: '2026-03-01',
      costDelta: '0.2',
      context: { ...reviewContext, asOfDate: '2026-03-01' }
    });
    expect(service.dataRevision()).toBe(0);
  });

  it.each(['draft', 'cancelled'])('未生效的 %s ECN 不能给出改版结论', async state => {
    const { service } = changeReviewHarness(state);
    await expect(service.reviewChange('ecn-id', reviewContext)).rejects.toThrow('已发布');
    expect(explodeBom).not.toHaveBeenCalled();
  });

  it('不存在的 ECN 不能回退到页面缓存', async () => {
    const { service, rows } = changeReviewHarness();
    rows(BomEcn).clear();
    await expect(service.reviewChange('ecn-id', reviewContext)).rejects.toThrow('不存在');
    expect(explodeBom).not.toHaveBeenCalled();
  });

  it.each(['truncated', 'substitute', 'alternative'])('不完整的 %s 展开拒绝生成结论', async reason => {
    const { service } = changeReviewHarness();
    const partial = reviewExplosion();
    if (reason === 'truncated') partial.truncated = { reason: 'depth' };
    if (reason === 'substitute')
      partial.unresolved = [{ groupId: 'battery-group', groupCode: 'battery', candidates: [] }];
    if (reason === 'alternative')
      partial.manifest.unresolved = [{ parentItemId: 'x', parentRevisionId: 'r', candidates: [] }];
    vi.mocked(explodeBom).mockResolvedValue(partial);
    await expect(service.reviewChange('ecn-id', reviewContext)).rejects.toThrow('不完整');
  });

  it('成本缺价直接保留失败，不用零成本补齐', async () => {
    const { service } = changeReviewHarness();
    vi.mocked(rollupCost).mockReset().mockRejectedValue(new Error('缺少采购价格'));
    await expect(service.reviewChange('ecn-id', reviewContext)).rejects.toThrow('缺少采购价格');
  });

  it('同量换修订保留前后根与需求的真实修订号和日期，未限定修订不伪造版本', async () => {
    const { service, adapter, rows, executor } = changeReviewHarness();
    rows(BomItemRevision).set('root-B', {
      id: 'root-B',
      itemId: 'root-id',
      revisionNo: 'Z.13',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z')
    });
    rows(BomItemRevision).set('leaf-A', {
      id: 'leaf-A',
      itemId: 'leaf-id',
      revisionNo: 'BAT-01',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    });
    rows(BomItemRevision).set('leaf-B', {
      id: 'leaf-B',
      itemId: 'leaf-id',
      revisionNo: 'BAT-02',
      effectiveFrom: new Date('2026-03-01T00:00:00.000Z')
    });
    const before = reviewExplosion();
    before.requirementLines = [reviewRequirement('leaf-A'), reviewRequirement(null, 'unversioned')];
    const after = reviewExplosion();
    after.manifest.parentRevisionId = 'root-B';
    after.requirementLines = [reviewRequirement('leaf-B'), reviewRequirement(null, 'unversioned')];
    vi.mocked(explodeBom).mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await service.reviewChange('ecn-id', reviewContext);

    expect(result.revisions).toEqual({
      'root-A': { revisionNo: 'Z.12', effectiveFrom: '2026-01-01T00:00:00.000Z' },
      'root-B': { revisionNo: 'Z.13', effectiveFrom: '2026-03-01T00:00:00.000Z' },
      'leaf-A': { revisionNo: 'BAT-01', effectiveFrom: '2026-01-01T00:00:00.000Z' },
      'leaf-B': { revisionNo: 'BAT-02', effectiveFrom: '2026-03-01T00:00:00.000Z' }
    });
    expect(result.changes).toEqual([
      expect.objectContaining({ itemId: 'leaf-id', beforeQty: '10', afterQty: '10', delta: '0', kind: 'changed' })
    ]);
    expect(executor.getRepository).toHaveBeenCalledWith(BomItemRevision);
    expect(adapter.transaction).toHaveBeenCalledOnce();
    expect(adapter.rawQuery).not.toHaveBeenCalled();
  });

  it('同量多修订的用量分配变化进入真实核对结果，保留完整前后依据', async () => {
    const { service, rows } = changeReviewHarness();
    for (const revisionId of ['leaf-A', 'leaf-B']) {
      rows(BomItemRevision).set(revisionId, {
        id: revisionId,
        itemId: 'leaf-id',
        revisionNo: revisionId,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      });
    }
    const before = reviewExplosion();
    before.requirementLines = [
      { ...reviewRequirement('leaf-A', 'leaf-id', '2'), path: ['branch-a'] },
      { ...reviewRequirement('leaf-B', 'leaf-id', '8'), path: ['branch-b'] }
    ];
    const after = reviewExplosion();
    after.requirementLines = [
      { ...reviewRequirement('leaf-A', 'leaf-id', '8'), path: ['branch-a'] },
      { ...reviewRequirement('leaf-B', 'leaf-id', '2'), path: ['branch-b'] }
    ];
    vi.mocked(explodeBom).mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await service.reviewChange('ecn-id', reviewContext);

    expect(result.changes).toEqual([
      expect.objectContaining({
        itemId: 'leaf-id',
        beforeQty: '10',
        afterQty: '10',
        delta: '0',
        kind: 'changed',
        beforeLines: before.requirementLines,
        afterLines: after.requirementLines
      })
    ]);
    expect(result.revisions).toHaveProperty('leaf-A.revisionNo', 'leaf-A');
    expect(result.revisions).toHaveProperty('leaf-B.revisionNo', 'leaf-B');
  });

  it('解析修订元数据消失时核对失败，不从ID或种子推测修订号', async () => {
    const { service, rows } = changeReviewHarness();
    rows(BomItemRevision).delete('root-A');
    await expect(service.reviewChange('ecn-id', reviewContext)).rejects.toThrow('修订元数据');
  });

  it('导入发布后续头失败时，前面的修订与头全部保持草稿', async () => {
    const fixture = transactionHarness(
      [
        [
          BomHeader,
          [
            { id: 'h1', parentRevisionId: 'r1', state: 'draft' },
            { id: 'h2', parentRevisionId: 'r2', state: 'draft' }
          ]
        ],
        [
          BomItemRevision,
          [
            { id: 'r1', state: 'draft' },
            { id: 'r2', state: 'draft' }
          ]
        ]
      ],
      (entity, row) => entity === BomHeader && row.id === 'h2' && row['state'] === 'released'
    );

    await expect(fixture.service.publishImported(['h1', 'h2'], '2099-01-01')).rejects.toThrow('故障注入');

    expect([...fixture.rows(BomHeader).values()].map(row => row['state'])).toEqual(['draft', 'draft']);
    expect([...fixture.rows(BomItemRevision).values()].map(row => row['state'])).toEqual(['draft', 'draft']);
    expect(fixture.adapter.transaction).toHaveBeenCalledOnce();
    expect(fixture.legacySave).not.toHaveBeenCalled();
    expect(fixture.service.dataRevision()).toBe(0);
  });

  it('新电池安装写入失败时，旧安装不会留下拆卸日期', async () => {
    const oldId = deterministicId('instance:BATT:PACK-001');
    const fixture = transactionHarness(
      [
        [
          BomInstanceNode,
          [
            {
              id: oldId,
              itemRevisionId: 'battery-a',
              parentInstanceId: 'scooter',
              sourceOccurrenceId: 'source',
              installedAt: new Date('2026-01-01'),
              removedAt: null,
              serialNumber: 'PACK-001'
            }
          ]
        ]
      ],
      (entity, row) => entity === BomInstanceNode && row['serialNumber'] === 'PACK-003'
    );

    await expect(fixture.service.replaceDemoInstance('2026-11-01')).rejects.toThrow('故障注入');

    expect(fixture.rows(BomInstanceNode).get(oldId)?.['removedAt']).toBeNull();
    expect(fixture.rows(BomInstanceNode).size).toBe(1);
    expect(fixture.adapter.transaction).toHaveBeenCalledOnce();
    expect(fixture.legacySave).not.toHaveBeenCalled();
    expect(fixture.service.dataRevision()).toBe(0);
  });

  it('在已发布父修订下发布草稿头，保留父修订原生效日', async () => {
    const originalDate = new Date('2026-09-22T00:00:00.000Z');
    const fixture = transactionHarness(
      [
        [BomHeader, [{ id: 'h1', parentRevisionId: 'r1', state: 'draft' }]],
        [BomItemRevision, [{ id: 'r1', state: 'released', effectiveFrom: originalDate }]]
      ],
      () => false
    );

    await fixture.service.publishImported(['h1'], '2099-01-01');

    expect(fixture.rows(BomHeader).get('h1')?.['state']).toBe('released');
    expect(fixture.rows(BomItemRevision).get('r1')?.['effectiveFrom']).toEqual(originalDate);
  });

  it('展开、导出和成本使用同一份完整解析条件及显式计划量', async () => {
    const { service, rxdb, adapter } = transactionHarness([], () => false);
    service.itemNos.set(new Map([['root-id', 'ROOT']]));
    const options = {
      bomType: 'sales' as const,
      orgId: 'org-y',
      unit: 136,
      lot: 'LOT-A',
      alternativeNo: 2,
      configSelection: { 颜色: ['蓝'] },
      substituteSelections: { G1: { memberKey: 'member-a' } },
      substituteAvailabilities: { 'member-a': { value: '9', uom: 'pcs' } }
    };
    await service.explode('2026-10-17', '7', 'ROOT', options);
    await service.exportBom('2026-10-17', 'ROOT', '7', options);
    await service.rollup('ROOT', '2026-10-17', { ...options, plannedQty: { value: '7', uom: 'pcs' } });

    const context = expect.objectContaining({ ...options, asOfDate: new Date('2026-10-17T00:00:00.000Z') });
    expect(rxdb.bom.explodeBom).toHaveBeenCalledWith(
      context,
      { parentItemId: 'root-id' },
      { plannedQty: { value: '7', uom: 'pcs' } }
    );
    expect(rxdb.bom.exportBom).toHaveBeenCalledWith(
      context,
      { parentItemId: 'root-id' },
      { plannedQty: { value: '7', uom: 'pcs' } }
    );
    expect(rollupCost).toHaveBeenCalledWith(adapter, context, { parentItemId: 'root-id' }, { value: '7', uom: 'pcs' });
  });

  it('恢复真实草稿清单，保留物料、修订、组织与行数用于发布核对', async () => {
    const { service, adapter } = transactionHarness([], () => false);
    adapter.rawQuery.mockResolvedValue({ rows: [['import-header', 'IMPORTED', 'A', 'ebom', 'org-x', 3]] });

    await service.refreshImportedDrafts();

    expect(service.importedDrafts()).toEqual([
      {
        headerId: 'import-header',
        itemNo: 'IMPORTED',
        revisionNo: 'A',
        bomType: 'ebom',
        orgId: 'org-x',
        lineCount: 3
      }
    ]);
  });

  it('内部演示使用的物料和修订号不隐藏其他组织、类型或备选的合法草稿', async () => {
    const { service, adapter } = transactionHarness([], () => false);
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE "bom$item" ("id" TEXT PRIMARY KEY, "itemNo" TEXT);
        CREATE TABLE "bom$item_revision" ("id" TEXT PRIMARY KEY, "itemId" TEXT, "revisionNo" TEXT);
        CREATE TABLE "bom$bom_header" ("id" TEXT PRIMARY KEY, "parentRevisionId" TEXT, "bomType" TEXT, "orgId" TEXT, "alternativeNo" INTEGER, "state" TEXT);
        CREATE TABLE "bom$bom_line" ("id" TEXT PRIMARY KEY, "headerId" TEXT);
        INSERT INTO "bom$item" VALUES ('pcba', 'PCBA'), ('cover', 'COVER-ASSY'), ('battery', 'BATT');
        INSERT INTO "bom$item_revision" VALUES ('pcba-e', 'pcba', 'E'), ('cover-e', 'cover', 'E'), ('battery-f', 'battery', 'F');
        INSERT INTO "bom$bom_header" VALUES
          ('legal-pcba-org', 'pcba-e', 'ebom', 'org-y', 0, 'draft'),
          ('legal-pcba-type', 'pcba-e', 'sales', 'org-x', 0, 'draft'),
          ('legal-pcba-alternative', 'pcba-e', 'ebom', 'org-x', 2, 'draft'),
          ('legal-cover-org', 'cover-e', 'mbom', 'org-z', 0, 'draft'),
          ('released-pcba', 'pcba-e', 'ebom', 'org-x', 1, 'released');
        INSERT INTO "bom$bom_line" VALUES ('line-a', 'legal-pcba-org'), ('line-b', 'legal-pcba-org');
      `);
      database
        .prepare('INSERT INTO "bom$bom_header" VALUES (?, ?, ?, ?, ?, ?)')
        .run(deterministicId('header:BATT:F'), 'battery-f', 'ebom', 'org-x', 0, 'draft');
      adapter.rawQuery.mockImplementation(async (sql: string, params: string[] = []) => {
        const statement = database.prepare(sql);
        const columns = statement.columns().map(column => column.name);
        return { rows: statement.all(...params).map(row => columns.map(column => row[column])) };
      });

      await service.refreshImportedDrafts();

      expect(
        service
          .importedDrafts()
          .map(draft => draft.headerId)
          .sort()
      ).toEqual(['legal-cover-org', 'legal-pcba-alternative', 'legal-pcba-org', 'legal-pcba-type']);
      expect(service.importedDrafts()).toContainEqual({
        headerId: 'legal-pcba-org',
        itemNo: 'PCBA',
        revisionNo: 'E',
        bomType: 'ebom',
        orgId: 'org-y',
        lineCount: 2
      });
    } finally {
      database.close();
    }
  });

  it('计划单位进入数量合同，不混入结构解析上下文', async () => {
    const { service, rxdb } = transactionHarness([], () => false);
    service.itemNos.set(new Map([['root-id', 'ROOT']]));
    await service.explode('2026-10-17', '2', 'ROOT', { plannedUom: 'box', unit: 136 });
    const exported = await service.exportBom('2026-10-17', 'ROOT', '2', { plannedUom: 'box', unit: 136 });
    expect(JSON.parse(exported).manifest.plannedQty).toEqual({ value: '2', uom: 'box' });

    for (const operation of [rxdb.bom.explodeBom, rxdb.bom.exportBom]) {
      expect(operation).toHaveBeenCalledWith(
        expect.not.objectContaining({ plannedUom: 'box' }),
        { parentItemId: 'root-id' },
        { plannedQty: { value: '2', uom: 'box' } }
      );
    }
  });

  it('双图展开同一物料（SHEET-ASSY）的设计与制造两张清单，只换清单类型', async () => {
    const { service, rxdb } = transactionHarness([], () => false);
    rxdb.bom.explodeBom.mockResolvedValueOnce('设计清单展开').mockResolvedValueOnce('制造清单展开');

    const view = await service.dualExplode('2026-10-15');

    const context = { orgId: 'org-x', asOfDate: new Date('2026-10-15T00:00:00.000Z') };
    const root = { parentItemId: goldenItemId('SHEET-ASSY') };
    const quantity = { plannedQty: { value: '1', uom: 'pcs' } };
    expect(rxdb.bom.explodeBom.mock.calls).toEqual([
      [{ ...context, bomType: 'ebom' }, root, quantity],
      [{ ...context, bomType: 'mbom' }, root, quantity]
    ]);
    expect(view).toEqual({ ebom: '设计清单展开', mbom: '制造清单展开' });
  });

  it('映射路径标签区分同一物料的设计与制造清单，同行号不混淆', async () => {
    const { service, adapter } = transactionHarness([], () => false);
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
        CREATE TABLE "bom$item" ("id" TEXT PRIMARY KEY, "itemNo" TEXT);
        CREATE TABLE "bom$item_revision" ("id" TEXT PRIMARY KEY, "itemId" TEXT);
        CREATE TABLE "bom$bom_header" ("id" TEXT PRIMARY KEY, "parentRevisionId" TEXT, "bomType" TEXT);
        CREATE TABLE "bom$bom_line" ("id" TEXT PRIMARY KEY, "headerId" TEXT, "lineNo" INTEGER);
        CREATE TABLE "bom$bom_line_occurrence" ("id" TEXT PRIMARY KEY, "lineId" TEXT, "childItemId" TEXT, "effectiveFrom" TEXT);
        INSERT INTO "bom$item" VALUES ('assy', 'SHEET-ASSY'), ('sheet', 'SHEET'), ('bend', 'WIP-BEND');
        INSERT INTO "bom$item_revision" VALUES ('assy-a', 'assy');
        INSERT INTO "bom$bom_header" VALUES ('design', 'assy-a', 'ebom'), ('manufacturing', 'assy-a', 'mbom');
        INSERT INTO "bom$bom_line" VALUES ('design-10', 'design', 10), ('manufacturing-10', 'manufacturing', 10), ('manufacturing-20', 'manufacturing', 20);
        INSERT INTO "bom$bom_line_occurrence" VALUES
          ('design-10-a', 'design-10', 'sheet', '2026-01-01'),
          ('manufacturing-10-a', 'manufacturing-10', 'sheet', '2026-01-01'),
          ('manufacturing-20-a', 'manufacturing-20', 'bend', '2026-01-01');
      `);
      adapter.rawQuery.mockImplementation(async (sql: string) => {
        const statement = database.prepare(sql);
        statement.setReturnArrays(true);
        return { rows: statement.all() };
      });

      const labels = await service.mappingLabels();

      expect(Object.fromEntries(labels)).toEqual({
        'design-10': 'SHEET-ASSY 设计清单 · 行 10',
        'design-10-a': 'SHEET-ASSY 设计清单 · 行 10 · SHEET',
        'manufacturing-10': 'SHEET-ASSY 制造清单 · 行 10',
        'manufacturing-10-a': 'SHEET-ASSY 制造清单 · 行 10 · SHEET',
        'manufacturing-20': 'SHEET-ASSY 制造清单 · 行 20',
        'manufacturing-20-a': 'SHEET-ASSY 制造清单 · 行 20 · WIP-BEND'
      });
    } finally {
      database.close();
    }
  });

  it('RoHS局部修改保留其他属性，故意缺必填演示继续完整替换', async () => {
    const fixture = transactionHarness(
      [[BomItem, [{ id: 'b01', itemNo: 'B-01', ext: '{"rohs":"yes","custom":"保留"}' }]]],
      () => false
    );

    await fixture.service.extPatch('B-01', { rohs: 'no' });

    expect(JSON.parse(String(fixture.rows(BomItem).get('b01')?.['ext']))).toEqual({ rohs: 'no', custom: '保留' });
    await fixture.service.extWrite('B-01', {});
    expect(JSON.parse(String(fixture.rows(BomItem).get('b01')?.['ext']))).toEqual({});
  });

  it('并发重置共享操作，开始时立即失效旧查询并公开重置状态', () => {
    const service = TestBed.inject(BomDemoService);
    Object.assign(service, { connectPromise: new Promise<void>(() => undefined) });
    const first = service.resetAndSeed();
    const second = service.resetAndSeed();

    expect(second).toBe(first);
    expect(service.resetting()).toBe(true);
    expect(service.dataEpoch()).toBe(1);
    expect(service.ready()).toBe(false);
  });

  it('取消变更：成功递增数据版本但保持代际，存储层拒绝进判别结果，找不到单据照常抛错', async () => {
    const refusal = new Error(
      'SQLITE_CONSTRAINT: rxdb:bom_write_protocol: ecn 已生效的 ECN 不可取消，改走更正 ECN（AC#7）'
    );
    const { service } = transactionHarness(
      [
        [
          BomEcn,
          [
            { id: 'live-ecn', state: 'released' },
            { id: 'effective-ecn', state: 'released' }
          ]
        ]
      ],
      (_, row) => row.id === 'effective-ecn' && row['state'] === 'cancelled',
      () => refusal
    );

    expect(await service.cancelEcn('live-ecn')).toEqual({ ok: true });
    expect(service.dataRevision()).toBe(1);
    expect(service.dataEpoch()).toBe(0);
    expect(await service.cancelEcn('effective-ecn')).toEqual({ ok: false, error: refusal });
    await expect(service.cancelEcn('missing-ecn')).rejects.toThrow('不存在');
    expect(service.dataRevision()).toBe(1);
  });

  it('直连删除来源：存储层拒绝保留原始错误，落空删除与意外错误照常抛出', async () => {
    const { service, adapter } = transactionHarness([], () => false);
    const refusal = new Error(
      `SQLITE_CONSTRAINT: rxdb:bom_instance: 发生项 ${service.protectedInstanceSourceId} 被 1 个实例引用，禁止删除来源`
    );
    adapter.rawQuery.mockRejectedValueOnce(refusal);
    expect(await service.deleteDemoInstanceSource()).toEqual({ ok: false, error: refusal });
    expect(adapter.rawQuery).toHaveBeenLastCalledWith(expect.stringContaining('DELETE'), [
      service.protectedInstanceSourceId
    ]);

    adapter.rawQuery.mockRejectedValueOnce(new Error('disk I/O error'));
    await expect(service.deleteDemoInstanceSource()).rejects.toThrow('disk I/O error');
    adapter.rawQuery.mockResolvedValueOnce({ rows: [], columns: [], rowsAffected: 0 });
    await expect(service.deleteDemoInstanceSource()).rejects.toThrow('来源发生项不存在');
    adapter.rawQuery.mockResolvedValueOnce({ rows: [], columns: [], rowsAffected: 1 });
    expect(await service.deleteDemoInstanceSource()).toEqual({ ok: true });
  });

  it('直连成环：只有成环那条写入的存储层拒绝进结果，前置建行失败照常抛出', async () => {
    const { service, adapter } = transactionHarness([], () => false);
    Object.assign(service, { demoHeaderId: 'demo-header' });
    const cycle = new Error('SQLITE_CONSTRAINT: rxdb:bom_cycle:a>b>a');
    adapter.rawQuery.mockResolvedValueOnce({ rows: [], columns: [], rowsAffected: 1 }).mockRejectedValueOnce(cycle);

    expect(await service.rawCycleInsert()).toEqual({ ok: false, error: cycle });
    adapter.rawQuery.mockRejectedValueOnce(new Error('UNIQUE constraint failed: bom$bom_line.id'));
    await expect(service.rawCycleInsert()).rejects.toThrow('UNIQUE');
  });

  it('扩展属性校验拒绝保留原始错误且不推进数据版本，物料缺失照常抛错', async () => {
    const refusal = new BomExtAttrError('rohs', '值 "maybe" 不在枚举 [yes, no] 中');
    const fixture = transactionHarness(
      [[BomItem, [{ id: 'b01', itemNo: 'B-01', ext: '{"rohs":"yes"}' }]]],
      (_, row) => String(row['ext']).includes('maybe'),
      () => refusal
    );

    expect(await fixture.service.extPatch('B-01', { rohs: 'maybe' })).toEqual({ ok: false, error: refusal });
    expect(JSON.parse(String(fixture.rows(BomItem).get('b01')?.['ext']))).toEqual({ rohs: 'yes' });
    expect(fixture.service.dataRevision()).toBe(0);
    expect(await fixture.service.extPatch('B-01', { rohs: 'no' })).toEqual({ ok: true });
    expect(fixture.service.dataRevision()).toBe(1);
    await expect(fixture.service.extPatch('MISSING', { rohs: 'yes' })).rejects.toThrow('物料不存在');
  });

  it('现场 ECN 在同一事务内写完并发布，返回新单据标识', async () => {
    const fixture = transactionHarness(
      [
        [BomEcn, []],
        [BomItem, []],
        [BomLine, []],
        [BomLineOccurrence, []]
      ],
      () => false
    );

    const outcome = await fixture.service.demoCreateAndReleaseEcn();

    const [ecn] = [...fixture.rows(BomEcn).values()];
    expect(outcome).toEqual({ ok: true, ecnId: ecn.id });
    expect(ecn['state']).toBe('released');
    expect(fixture.adapter.transaction).toHaveBeenCalledOnce();
    expect(fixture.legacySave).not.toHaveBeenCalled();
    expect(fixture.rows(BomItem).get(deterministicId('item:SEAT-LIVE'))?.['itemNo']).toBe('SEAT-LIVE');
    expect([...fixture.rows(BomLineOccurrence).values()].map(row => row['qty'])).toEqual(['1', '4', '11']);
    for (const seed of ['occurrence:SC-100:A:2', 'occurrence:PCBA:A:2', 'occurrence:BATT:A:0'])
      expect(fixture.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [
        ecn.id,
        expect.any(String),
        deterministicId(seed)
      ]);
    expect(fixture.service.dataRevision()).toBe(1);
  });

  it('现场 ECN 取消后重做复用已建的 SEAT-LIVE 物料，不撞固定主键', async () => {
    const seatId = deterministicId('item:SEAT-LIVE');
    const fixture = transactionHarness(
      [
        [BomEcn, []],
        [BomItem, [{ id: seatId, itemNo: 'SEAT-LIVE' }]],
        [BomLine, []],
        [BomLineOccurrence, []]
      ],
      (entity, row) => entity === BomItem && row.id === seatId
    );

    const outcome = await fixture.service.demoCreateAndReleaseEcn();

    expect(outcome.ok).toBe(true);
    expect(fixture.rows(BomItem).size).toBe(1);
    expect([...fixture.rows(BomLineOccurrence).values()].map(row => row['childItemId'])).toContain(seatId);
  });

  it('位号不足的发布演示只建一次草稿，重复点击复用它并得到同一拒绝', async () => {
    const refusal = new BomError('位号数 39 与用量 100 不一致');
    const headerId = 'demo-header';
    const fixture = transactionHarness(
      [
        [BomHeader, [{ id: headerId, state: 'draft' }]],
        [BomLine, []],
        [BomLineOccurrence, []],
        [BomLineDesignator, []]
      ],
      (entity, row) => entity === BomHeader && row['state'] === 'released',
      () => refusal
    );
    Object.assign(fixture.service, { demoHeaderId: headerId });

    expect(await fixture.service.publishDemoHeader()).toEqual({ ok: false, error: refusal });
    expect(await fixture.service.publishDemoHeader()).toEqual({ ok: false, error: refusal });

    expect(fixture.rows(BomLine).size).toBe(1);
    expect(fixture.rows(BomLineOccurrence).size).toBe(1);
    expect(fixture.rows(BomLineDesignator).size).toBe(39);
    expect(fixture.rows(BomHeader).get(headerId)?.['state']).toBe('draft');
  });

  it('替代组发布拒绝演示整笔回滚，重复点击不堆积草稿修订、头与组', async () => {
    const refusal = new BomError('替代组概率合计 0.8，必须为 1');
    const draftTables = [BomItemRevision, BomHeader, BomSubstituteGroup, BomLine, BomLineOccurrence];
    const fixture = transactionHarness(
      draftTables.map(entity => [entity, []]),
      (entity, row) => entity === BomHeader && row['state'] === 'released',
      () => refusal
    );

    expect(await fixture.service.demoSubstitutePublishRejection()).toEqual({ ok: false, error: refusal });
    expect(await fixture.service.demoSubstitutePublishRejection()).toEqual({ ok: false, error: refusal });

    for (const entity of draftTables) expect(fixture.rows(entity).size).toBe(0);
    expect(fixture.legacySave).not.toHaveBeenCalled();
  });

  it('现场 ECN 的种子发生项落空时整体回滚，不留半张变更单也不伪装成发布结果', async () => {
    const fixture = transactionHarness(
      [
        [BomEcn, []],
        [BomItem, []],
        [BomLine, []],
        [BomLineOccurrence, []]
      ],
      () => false
    );
    const missing = deterministicId('occurrence:PCBA:A:2');
    fixture.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => ({
      rows: [[20]],
      columns: [],
      rowsAffected: sql.startsWith('UPDATE') && params?.[2] === missing ? 0 : 1
    }));

    await expect(fixture.service.demoCreateAndReleaseEcn()).rejects.toThrow('occurrence:PCBA:A:2');

    expect(fixture.rows(BomEcn).size).toBe(0);
    expect(fixture.rows(BomItem).size).toBe(0);
    expect(fixture.rows(BomLineOccurrence).size).toBe(0);
    expect(fixture.service.dataRevision()).toBe(0);
  });

  it('重置等待已开始的写入结束，阻塞删除保持互斥且失败不伪装成功', async () => {
    const { service, rxdb } = transactionHarness([], () => false);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    Object.assign(rxdb, { disconnectAll: disconnect });
    let finishImport: ((result: { committed: boolean; diagnostics: []; headerIds: string[] }) => void) | undefined;
    rxdb.bom.importBomDraft.mockImplementation(
      () =>
        new Promise(resolve => {
          finishImport = resolve;
        })
    );
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
      error: new Error('删除失败')
    };
    vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn(() => request) });
    const importing = service.importBom({});
    const resetting = service.resetAndSeed();
    await Promise.resolve();
    expect(disconnect).not.toHaveBeenCalled();
    await expect(service.extWrite('B-01', {})).rejects.toThrow('正在重置');

    finishImport?.({ committed: false, diagnostics: [], headerIds: [] });
    await importing;
    await vi.waitFor(() => expect(request.onblocked).toBeTypeOf('function'));
    request.onblocked?.();
    expect(service.resetting()).toBe(true);
    expect(service.resetStatus()).toContain('其他页面');
    expect(service.resetAndSeed()).toBe(resetting);

    request.onerror?.();
    await expect(resetting).rejects.toThrow('删除失败');
    expect(disconnect).toHaveBeenCalledOnce();
    expect(service.ready()).toBe(false);
    expect(service.resetting()).toBe(false);
  });
});

describe('connectDevTools', () => {
  it('把 RxDB 实例挂到 DevTools 连接器并传入实体元数据读取函数', async () => {
    const instance = { rxdb: true } as unknown as RxDB;

    connectDevTools(instance);

    await vi.waitFor(() => expect(initDevTools).toHaveBeenCalledOnce());
    expect(initDevTools).toHaveBeenCalledWith(instance, getEntityMetadata);
  });

  it('连接器加载或初始化失败时报告错误，不留未处理的拒绝', async () => {
    const failure = new Error('chunk 加载失败');
    initDevTools.mockImplementationOnce(() => {
      throw failure;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      connectDevTools({ rxdb: true } as unknown as RxDB);

      await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure));
    } finally {
      consoleError.mockRestore();
    }
  });
});
