/** @fileoverview US-522 活视图真实存储验证：ECN、时点、新修订与数量额外依赖。 */

import { describe, expect, it, vi } from 'vitest';
import { BomEcn, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import type { ExplosionResult } from '../quantity/explosion.js';
import type { ExpansionResult } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z');
const EVALUATION_DATE = new Date('2099-01-01T00:00:00.000Z');
const NEXT_DATE = new Date('2099-01-02T00:00:00.000Z');

interface LiveSnapshot {
  expansion: ExpansionResult;
  explosion: ExplosionResult | null;
  quantityError: unknown | null;
}

interface LiveFixture {
  adapter: BomTestAdapter;
  root: BomItem;
  assembly: BomItem;
  leaf: BomItem;
  extra: BomItem;
  rootHeaderId: string;
  rootOccurrenceId: string;
  assemblyRevisionId: string;
}

const withFixture = async (
  backend: BomTestBackend,
  options: { futureRow?: boolean; lengthLeaf?: boolean },
  run: (fixture: LiveFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    const items: BomItem[] = [];
    for (const itemNo of ['LIVE-ROOT', 'LIVE-ASSEMBLY', 'LIVE-LEAF', 'LIVE-EXTRA']) {
      const item = new BomItem();
      item.itemNo = itemNo;
      if (itemNo === 'LIVE-LEAF' && options.lengthLeaf) {
        item.stockUom = 'm';
        item.uomDecimals = 2;
        item.uomConversion = '2';
      }
      await item.save();
      items.push(item);
    }
    const revisionIds = items.map(() => crypto.randomUUID());
    const rootHeaderId = crypto.randomUUID();
    const rootOccurrenceId = crypto.randomUUID();
    await loadHistory(adapter, {
      batchNo: 'bom-view-live-master',
      revisions: items.map((item, index) => ({
        id: revisionIds[index],
        itemId: item.id,
        revisionNo: index === 1 ? 'D' : 'A',
        effectiveFrom: BASE_DATE
      })),
      headers: [
        {
          id: rootHeaderId,
          revisionIndex: 0,
          bomType: 'ebom',
          orgId: 'live-org',
          lines: [
            {
              lineNo: 10,
              occurrences: [{ id: rootOccurrenceId, childItemId: items[1].id, qty: '1', effectiveFrom: BASE_DATE }]
            },
            ...(options.futureRow ?
              [{ lineNo: 20, occurrences: [{ childItemId: items[3].id, qty: '3', effectiveFrom: NEXT_DATE }] }]
            : [])
          ]
        },
        {
          revisionIndex: 1,
          bomType: 'ebom',
          orgId: 'live-org',
          lines: [{ lineNo: 10, occurrences: [{ childItemId: items[2].id, qty: '2', effectiveFrom: BASE_DATE }] }]
        }
      ]
    });
    await run({
      adapter,
      root: items[0],
      assembly: items[1],
      leaf: items[2],
      extra: items[3],
      rootHeaderId,
      rootOccurrenceId,
      assemblyRevisionId: revisionIds[1]
    });
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const input = (fixture: LiveFixture, asOfDate = EVALUATION_DATE) => ({
  context: { bomType: 'ebom' as const, orgId: 'live-org', asOfDate },
  target: { parentItemId: fixture.root.id },
  plannedQty: { value: '1', uom: 'pcs' }
});

const observe = (fixture: LiveFixture, asOfDate = EVALUATION_DATE) => {
  const values: LiveSnapshot[] = [];
  const errors: unknown[] = [];
  const subscription = fixture.adapter.rxdb.bom.watchView(input(fixture, asOfDate)).subscribe({
    next: (value: LiveSnapshot) => values.push(value),
    error: (cause: unknown) => errors.push(cause)
  });
  return { values, errors, stop: () => subscription.unsubscribe() };
};

type RecordedView = ReturnType<typeof observe>;

const waitForView = (recorded: RecordedView, assertion: (snapshot: LiveSnapshot) => void): Promise<LiveSnapshot> =>
  vi.waitFor(
    () => {
      if (recorded.errors.length > 0) throw recorded.errors[0];
      const latest = recorded.values.at(-1);
      if (latest === undefined) throw new Error('活视图尚未产生首个快照');
      assertion(latest);
      return latest;
    },
    { timeout: 5000, interval: 20 }
  );

const quantities = (snapshot: LiveSnapshot, itemId: string): string[] => {
  expect(snapshot.quantityError).toBeNull();
  if (snapshot.explosion === null) throw new Error('活视图没有数量快照', { cause: snapshot.quantityError });
  return snapshot.explosion.requirementLines.filter(line => line.itemId === itemId).map(line => line.qty);
};

const prepareRevisionE = async (
  fixture: LiveFixture,
  child: BomItem,
  qty: string,
  phantom = false
): Promise<BomItemRevision> => {
  const revision = new BomItemRevision();
  revision.itemId = fixture.assembly.id;
  revision.revisionNo = 'E';
  revision.effectiveFrom = EVALUATION_DATE;
  revision.defaultPhantom = phantom;
  await revision.save();
  const header = new BomHeader();
  header.parentRevisionId = revision.id;
  header.bomType = 'ebom';
  header.orgId = 'live-org';
  await header.save();
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10;
  await line.save();
  const occurrence = new BomLineOccurrence();
  occurrence.lineId = line.id;
  occurrence.childItemId = child.id;
  occurrence.qty = qty;
  occurrence.effectiveFrom = BASE_DATE;
  await occurrence.save();
  header.state = 'released';
  await header.save();
  return revision;
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 活视图真实刷新 [${backend}]`, () => {
    it('AC#6：发布 draft ECN 后，原结果未引用的新行进入结构与数量同一快照', async () => {
      await withFixture(backend, {}, async fixture => {
        const recorded = observe(fixture);
        try {
          await waitForView(recorded, snapshot => expect(quantities(snapshot, fixture.leaf.id)).toEqual(['2']));
          const ecn = new BomEcn();
          ecn.ecnNo = 'LIVE-ECN';
          ecn.effectiveDate = EVALUATION_DATE;
          await ecn.save();
          const line = new BomLine();
          line.headerId = fixture.rootHeaderId;
          line.lineNo = 20;
          line.ecnInId = ecn.id;
          await line.save();
          const occurrence = new BomLineOccurrence();
          occurrence.lineId = line.id;
          occurrence.childItemId = fixture.extra.id;
          occurrence.qty = '3';
          occurrence.effectiveFrom = EVALUATION_DATE;
          occurrence.ecnInId = ecn.id;
          await occurrence.save();
          expect(recorded.values.every(snapshot => quantities(snapshot, fixture.extra.id).length === 0)).toBe(true);
          ecn.state = 'released';
          await ecn.save();
          await waitForView(recorded, snapshot => {
            expect(snapshot.expansion.nodes.some(node => node.occurrenceId === occurrence.id)).toBe(true);
            expect(quantities(snapshot, fixture.extra.id)).toEqual(['3']);
          });
          for (const snapshot of recorded.values) {
            expect(snapshot.expansion.nodes.some(node => node.itemId === fixture.extra.id)).toBe(
              quantities(snapshot, fixture.extra.id).length > 0
            );
          }
        } finally {
          recorded.stop();
        }
      });
    });

    it('AC#7：推进 context 日期重新订阅，尚未生效的行进入结果且旧上下文不被改写', async () => {
      await withFixture(backend, { futureRow: true }, async fixture => {
        const early = observe(fixture);
        let late: RecordedView | undefined;
        try {
          const before = await waitForView(early, snapshot =>
            expect(quantities(snapshot, fixture.extra.id)).toEqual([])
          );
          early.stop();
          late = observe(fixture, NEXT_DATE);
          const after = await waitForView(late, snapshot => {
            expect(snapshot.expansion.nodes.some(node => node.itemId === fixture.extra.id)).toBe(true);
            expect(quantities(snapshot, fixture.extra.id)).toEqual(['3']);
          });
          expect(before.expansion.context.asOfDate).toEqual(EVALUATION_DATE);
          expect(after.expansion.context.asOfDate).toEqual(NEXT_DATE);
          expect(after.explosion?.manifest.context.asOfDate).toEqual(NEXT_DATE);
        } finally {
          early.stop();
          late?.stop();
        }
      });
    });

    it('AC#8：imprecise 子件发布 E 修订，长期订阅切到新修订结构与数量', async () => {
      await withFixture(backend, {}, async fixture => {
        const recorded = observe(fixture);
        try {
          await waitForView(recorded, snapshot => {
            expect(
              snapshot.expansion.nodes.find(node => node.occurrenceId === fixture.rootOccurrenceId)?.revisionId
            ).toBe(fixture.assemblyRevisionId);
            expect(quantities(snapshot, fixture.leaf.id)).toEqual(['2']);
          });
          const nextRevision = await prepareRevisionE(fixture, fixture.extra, '4');
          nextRevision.state = 'released';
          await nextRevision.save();
          await waitForView(recorded, snapshot => {
            expect(
              snapshot.expansion.nodes.find(node => node.occurrenceId === fixture.rootOccurrenceId)?.revisionId
            ).toBe(nextRevision.id);
            expect(quantities(snapshot, fixture.leaf.id)).toEqual([]);
            expect(quantities(snapshot, fixture.extra.id)).toEqual(['4']);
          });
        } finally {
          recorded.stop();
        }
      });
    });

    it('AC#9：新修订改变 phantom 与物料换算率变化都刷新，不依赖 bom_line 更新', async () => {
      await withFixture(backend, { lengthLeaf: true }, async fixture => {
        const recorded = observe(fixture);
        try {
          await waitForView(recorded, snapshot => {
            expect(quantities(snapshot, fixture.assembly.id)).toEqual(['1']);
            expect(quantities(snapshot, fixture.leaf.id)).toEqual(['1']);
          });
          const phantom = await prepareRevisionE(fixture, fixture.leaf, '2', true);
          phantom.state = 'released';
          await phantom.save();
          await waitForView(recorded, snapshot => {
            expect(snapshot.expansion.nodes.find(node => node.itemId === fixture.assembly.id)?.revisionId).toBe(
              phantom.id
            );
            expect(quantities(snapshot, fixture.assembly.id)).toEqual([]);
            expect(quantities(snapshot, fixture.leaf.id)).toEqual(['1']);
            expect(snapshot.explosion?.penetrations.some(node => node.childItemId === fixture.assembly.id)).toBe(true);
          });
          fixture.leaf.uomConversion = '4';
          await fixture.leaf.save();
          await waitForView(recorded, snapshot => {
            expect(quantities(snapshot, fixture.leaf.id)).toEqual(['0.5']);
            expect(snapshot.explosion?.requirementLines.find(line => line.itemId === fixture.leaf.id)?.uom).toBe('m');
          });
        } finally {
          recorded.stop();
        }
      });
    });
  });
}
