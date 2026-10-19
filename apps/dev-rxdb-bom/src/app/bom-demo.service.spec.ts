import type { EntityType } from '@aiao/rxdb';
import { BomEcn, BomHeader, BomInstanceNode, BomItem, BomItemRevision, rollupCost } from '@aiao/rxdb-plugin-bom';
import { deterministicId } from '@aiao/rxdb-plugin-bom/testing';
import { TestBed } from '@angular/core/testing';
import { DatabaseSync } from 'node:sqlite';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from './bom-demo.service';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>()),
  rollupCost: vi.fn()
}));

type Stored = Record<string, unknown> & { id: string };

const restoreStatics: (() => void)[] = [];

const installFind = (entityType: EntityType, find: () => unknown): void => {
  const descriptor = Object.getOwnPropertyDescriptor(entityType, 'find');
  Object.defineProperty(entityType, 'find', { configurable: true, value: find });
  restoreStatics.push(() => {
    if (descriptor) Object.defineProperty(entityType, 'find', descriptor);
    else Reflect.deleteProperty(entityType, 'find');
  });
};

/** 模拟事务提交边界，故障后只回滚执行器内的写入，裸保存会暴露部分提交。 */
const transactionHarness = (initial: [EntityType, Stored[]][], fail: (entity: EntityType, row: Stored) => boolean) => {
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
    if (fail(entity, row)) throw new Error('故障注入：后续写入失败');
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
  const repository = (entity: EntityType) => ({
    find: vi.fn(async (options: { where: { rules: { field: string; value: unknown }[] } }) =>
      [...rows(entity).values()]
        .filter(row => options.where.rules.every(rule => row[rule.field] === rule.value))
        .map(row => materialize(entity, row))
    ),
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
  const executor = { getRepository: vi.fn(repository) };
  const adapter = {
    rawQuery: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(async (work: (value: typeof executor) => Promise<unknown>) => {
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
  const rxdb = {
    bom: { explodeBom: vi.fn(), exportBom: vi.fn().mockResolvedValue({ manifest: {} }), importBomDraft: vi.fn() },
    entityManager: { instantiate: (entity: EntityType) => materialize(entity, { id: 'created-instance' }) }
  };
  for (const [entity] of initial)
    installFind(entity, () => of([...rows(entity).values()].map(row => materialize(entity, row))));
  const service = TestBed.inject(BomDemoService);
  Object.assign(service, { adapter, rxdb });
  service.ready.set(true);
  return { service, adapter, rxdb, rows, legacySave };
};

describe('BomDemoService', () => {
  afterEach(() => {
    for (const restore of restoreStatics.splice(0)) restore();
    vi.restoreAllMocks();
    vi.clearAllMocks();
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

  it('成功取消变更递增数据版本但保持代际，失败写入不失效成功反馈', async () => {
    const { service } = transactionHarness([[BomEcn, [{ id: 'live-ecn', state: 'released' }]]], () => false);
    expect(await service.cancelEcn('live-ecn')).toBe('');
    expect(service.dataRevision()).toBe(1);
    expect(service.dataEpoch()).toBe(0);
    expect(await service.cancelEcn('missing-ecn')).toContain('不存在');
    expect(service.dataRevision()).toBe(1);
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
