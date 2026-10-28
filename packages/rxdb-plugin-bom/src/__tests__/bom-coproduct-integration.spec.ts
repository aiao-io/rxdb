import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomItemRevision } from '../entities.js';
import { rollupCost } from '../quantity/cost.js';
import { EXPORT_CONTRACT_VERSION, EXPORT_TABLE_COLUMNS, type BomExportPayload } from '../resolve/export-contract.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomImportContractError } from '../resolve/import-contract.js';
import { exportBom, importBomDraft } from '../resolve/integration.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const at = new Date('2099-01-01T00:00:00.000Z');
const context = { bomType: 'ebom' as const, orgId: 'joint-export-org', asOfDate: new Date('2099-01-02T00:00:00.000Z') };
type JointPayload = BomExportPayload & { dependencies?: { items: unknown[]; revisions: unknown[] } };

const seed = async (adapter: BomTestAdapter, joint = true) => {
  const marker = crypto.randomUUID();
  const keys = joint ? ['MAIN', 'RAW', 'CO'] : ['MAIN', 'RAW'];
  const items = keys.map(key =>
    adapter.rxdb.entityManager.instantiate(BomItem, {
      id: deterministicId(`${marker}:item:${key}`),
      itemNo: `V2-${marker}-${key}`,
      stockUom: 'kg',
      uomDecimals: 9,
      unitPrice: key === 'RAW' ? '2' : null,
      priceUom: 'kg',
      priceCurrency: 'CNY'
    })
  );
  for (const item of items) await item.save();
  const revisions = keys.map(key => deterministicId(`${marker}:revision:${key}`));
  await loadHistory(adapter, {
    batchNo: `joint-export-${marker}`,
    revisions: items.map((item, index) => ({
      id: revisions[index],
      itemId: item.id,
      revisionNo: 'A',
      effectiveFrom: at
    })),
    headers: [
      {
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: context.orgId,
        baseUom: 'kg',
        baseQty: '100',
        costLotQty: '100',
        jointCostShare: joint ? '0.6' : null,
        lines: [
          { lineNo: 10, occurrences: [{ childItemId: items[1].id, qty: '110', uom: 'kg', effectiveFrom: at }] },
          ...(joint ?
            [
              {
                lineNo: 20,
                occurrences: [
                  {
                    childItemId: items[2].id,
                    childRevisionId: revisions[2],
                    qty: '50',
                    uom: 'kg',
                    effectiveFrom: at,
                    flowDirection: 'produce' as const,
                    jointCostShare: '0.4'
                  }
                ]
              }
            ]
          : [])
        ]
      }
    ]
  });
  return { items, revisions, target: { parentRevisionId: revisions[0] } };
};

const publishedDependency = async (
  adapter: BomTestAdapter,
  itemNo: string,
  options: { released?: boolean; stockUom?: string } = {}
) => {
  const item = adapter.rxdb.entityManager.instantiate(BomItem, {
    itemNo,
    stockUom: options.stockUom ?? 'kg',
    uomDecimals: 9,
    priceUom: 'kg',
    priceCurrency: 'CNY'
  });
  await item.save();
  const revision = adapter.rxdb.entityManager.instantiate(BomItemRevision, {
    itemId: item.id,
    revisionNo: 'A',
    effectiveFrom: at
  });
  await revision.save();
  if (options.released !== false) {
    revision.state = 'released';
    await revision.save();
  }
  return { item, revision };
};

const count = async (adapter: BomTestAdapter, Entity: typeof BomItem | typeof BomHeader | typeof BomItemRevision) =>
  (await adapter.getRepository(Entity).find({ where: { combinator: 'and', rules: [] } })).length;

const dependencyRows = (adapter: BomTestAdapter) =>
  adapter.transaction(
    async executor => ({
      items: (await executor.query(`SELECT * FROM ${executor.tableRef(BomItem)} ORDER BY "id"`)).rows,
      revisions: (await executor.query(`SELECT * FROM ${executor.tableRef(BomItemRevision)} ORDER BY "id"`)).rows
    }),
    false
  );

for (const backend of ['wa-sqlite', 'pglite'] satisfies BomTestBackend[]) {
  describe(`联产v2导出与显式发布依赖 [${backend}]`, () => {
    let source: BomTestAdapter;
    beforeAll(async () => {
      source = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(source);
    });

    it('联产使用v2追加份额列，输出主数据明确放入dependencies且字节稳定', async () => {
      const fixture = await seed(source);
      const payload = (await exportBom(source, context, fixture.target, {
        plannedQty: { value: '100', uom: 'kg' }
      })) as JointPayload;
      expect(payload.version).toBe('2');
      expect(EXPORT_CONTRACT_VERSION).toBe('1');
      expect((payload.headers[0] as unknown[]).slice(-1)).toEqual(['0.6']);
      expect(payload.headers[0] as unknown[]).toHaveLength(15);
      const output = (payload.occurrences as unknown[][]).find(row => row[25] === 'produce');
      expect(output).toHaveLength(38);
      expect(output?.at(-1)).toBe('0.4');
      expect(payload.dependencies?.items).toHaveLength(1);
      expect(payload.dependencies?.revisions).toHaveLength(1);
      expect((payload.dependencies?.items[0] as unknown[])[0]).toBe(fixture.items[2].itemNo);
      expect((payload.dependencies?.revisions[0] as unknown[]).slice(0, 3)).toEqual([
        fixture.items[2].itemNo,
        'A',
        'released'
      ]);
      expect((payload.items as unknown[][]).some(row => row[0] === fixture.items[2].itemNo)).toBe(false);
      expect((payload.revisions as unknown[][]).some(row => row[0] === fixture.items[2].itemNo)).toBe(false);
      expect(
        JSON.stringify(await exportBom(source, context, fixture.target, { plannedQty: { value: '100', uom: 'kg' } }))
      ).toBe(JSON.stringify(payload));
    });

    it('目标库显式发布输出依赖后，v2草稿导入与用户发布保持132/88成本', async () => {
      const fixture = await seed(source);
      const payload = await exportBom(source, context, fixture.target, { plannedQty: { value: '100', uom: 'kg' } });
      const destination = await createBomTestAdapter(backend);
      try {
        const dependency = await publishedDependency(destination, fixture.items[2].itemNo);
        const imported = await importBomDraft(destination, payload);
        expect(imported).toMatchObject({ committed: true, diagnostics: [] });
        expect(imported.headerIds).toHaveLength(1);
        const headers = await destination.getRepository(BomHeader).find({ where: { combinator: 'and', rules: [] } });
        expect(headers[0].state).toBe('draft');
        expect(headers[0].jointCostShare).toBe('0.6');
        const revisions = await destination
          .getRepository(BomItemRevision)
          .find({ where: { combinator: 'and', rules: [] } });
        expect(revisions.find(revision => revision.id === dependency.revision.id)?.state).toBe('released');
        for (const revision of revisions.filter(row => row.state === 'draft'))
          await destination.getRepository(BomItemRevision).update(revision, { state: 'released' });
        await destination.getRepository(BomHeader).update(headers[0], { state: 'released' });
        const result = await rollupCost(
          destination,
          { ...context, currency: 'CNY', rateDate: context.asOfDate },
          { parentRevisionId: headers[0].parentRevisionId }
        );
        expect(result.root.jointCost?.outputs.map(output => output.batchCost)).toEqual(['132', '88']);
        expect(await count(destination, BomItem)).toBe(3);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });

    it('v2导入空库明确诊断已发布依赖缺失，整批零残留', async () => {
      const fixture = await seed(source);
      const payload = await exportBom(source, context, fixture.target);
      const destination = await createBomTestAdapter(backend);
      try {
        const result = await importBomDraft(destination, payload);
        expect(result.committed).toBe(false);
        expect(result.diagnostics.some(row => /已发布.*依赖|依赖.*已发布/.test(row.message))).toBe(true);
        expect(await count(destination, BomItem)).toBe(0);
        expect(await count(destination, BomItemRevision)).toBe(0);
        expect(await count(destination, BomHeader)).toBe(0);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });

    it.each(['draft', 'units'] as const)('v2依赖%s不匹配时不改依赖，也不留下任何新草稿', async mismatch => {
      const fixture = await seed(source);
      const payload = await exportBom(source, context, fixture.target);
      const destination = await createBomTestAdapter(backend);
      try {
        await publishedDependency(destination, fixture.items[2].itemNo, {
          released: mismatch !== 'draft',
          stockUom: mismatch === 'units' ? 'pcs' : 'kg'
        });
        const before = await dependencyRows(destination);
        const result = await importBomDraft(destination, payload);
        expect(result.committed).toBe(false);
        expect(
          result.diagnostics.some(row => (mismatch === 'draft' ? /已发布/ : /单位|stockUom/).test(row.message))
        ).toBe(true);
        expect(await count(destination, BomItem)).toBe(1);
        expect(await count(destination, BomItemRevision)).toBe(1);
        expect(await count(destination, BomHeader)).toBe(0);
        expect(await dependencyRows(destination)).toEqual(before);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });

    it('旧单产仍输出原v1字段宽度，导入不自动发布任何修订', async () => {
      const fixture = await seed(source, false);
      const payload = await exportBom(source, context, fixture.target);
      expect(payload.version).toBe('1');
      expect(EXPORT_TABLE_COLUMNS.header).toHaveLength(14);
      expect(EXPORT_TABLE_COLUMNS.occurrence).toHaveLength(37);
      expect(payload.headers[0]).toHaveLength(14);
      expect(payload.occurrences[0]).toHaveLength(37);
      expect(Object.hasOwn(payload, 'dependencies')).toBe(false);
      expect(JSON.stringify(await exportBom(source, context, fixture.target))).toBe(JSON.stringify(payload));
      const destination = await createBomTestAdapter(backend);
      try {
        expect(await importBomDraft(destination, payload)).toMatchObject({ committed: true, diagnostics: [] });
        const revisions = await destination
          .getRepository(BomItemRevision)
          .find({ where: { combinator: 'and', rules: [] } });
        expect(revisions.every(revision => revision.state === 'draft')).toBe(true);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });

    it('把produce强塞进v1不能静默丢份额，未知版本也明确拒绝', async () => {
      const fixture = await seed(source);
      const payload = await exportBom(source, context, fixture.target);
      const legacy = {
        ...payload,
        version: '1',
        headers: (payload.headers as unknown[][]).map(row => row.slice(0, 14)),
        occurrences: (payload.occurrences as unknown[][]).map(row => row.slice(0, 37))
      };
      const destination = await createBomTestAdapter(backend);
      try {
        await expect(importBomDraft(destination, legacy)).rejects.toThrow(/v1.*produce|produce.*v2/);
        await expect(importBomDraft(destination, { ...payload, version: '999' })).rejects.toBeInstanceOf(
          BomImportContractError
        );
        expect(await count(destination, BomItem)).toBe(0);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });

    it('v2份额收到JSON number时拒绝，输出依赖不能借伪造版本自动发布', async () => {
      const fixture = await seed(source);
      const payload = await exportBom(source, context, fixture.target);
      const corrupt = structuredClone(payload);
      (corrupt.headers[0] as unknown[])[14] = 0.6;
      const destination = await createBomTestAdapter(backend);
      try {
        const dependency = await publishedDependency(destination, fixture.items[2].itemNo);
        const result = await importBomDraft(destination, corrupt);
        expect(result.committed).toBe(false);
        expect(result.diagnostics.some(row => /jointCostShare.*字符串/.test(row.message))).toBe(true);
        expect(dependency.revision.state).toBe('released');
        expect(await count(destination, BomHeader)).toBe(0);
      } finally {
        await disposeBomTestAdapter(destination);
      }
    });
  });
}
