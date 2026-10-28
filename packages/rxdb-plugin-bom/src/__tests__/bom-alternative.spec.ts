/**
 * @fileoverview 备选头（alternativeNo）四引擎同口径（US-508 AC#3/#11 × US-510 / US-511 / US-514）
 *
 * `alternativeNo` 只裁决根修订的备选头：指定且命中用它、指定但零匹配显式拒绝（不返回空结果）、
 * 未指定且多备选时解析 / 展开标 unresolved（不展开、不合并任何备选）而数量 / 成本拒绝；
 * 子装配修订有多个已发布备选头时展开对该子节点标 unresolved 不下钻，数量 / 成本拒绝并说明
 * 「alternativeNo 只裁决根头」。双后端同断言。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { BomCostError, rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { expandBom, type ExpansionResult } from '../resolve/expansion.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BomResolutionError, type ResolutionContext } from '../resolve/resolution.js';
import { resolveBom } from '../resolve/resolver.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const context = (alternativeNo?: number): ResolutionContext => ({
  bomType: 'ebom',
  orgId: 'org-x',
  asOfDate: day('2026-06-01'),
  ...(alternativeNo === undefined ? {} : { alternativeNo })
});

const costContext = (alternativeNo?: number) => ({
  ...context(alternativeNo),
  currency: 'CNY',
  rateDate: day('2026-06-01')
});

const PLANNED = { plannedQty: { value: '1', uom: 'pcs' } };

/** 结构：R（备选 1 → S、备选 2 → L2）、S（备选 1 → A、备选 2 → B）、R2（单头 → S）、R3（单头 → C）。 */
interface AlternativeFixture {
  items: Record<'r' | 's' | 'l2' | 'a' | 'b' | 'r2' | 'r3' | 'c', BomItem>;
  revisions: Record<'r' | 's' | 'r2' | 'r3', string>;
  occurrences: Record<'rToS' | 'rToL2' | 'r2ToS' | 'r3ToC', string>;
}

const buildFixture = async (adapter: BomTestAdapter): Promise<AlternativeFixture> => {
  const keys = ['r', 's', 'l2', 'a', 'b', 'r2', 'r3', 'c'] as const;
  const items = {} as AlternativeFixture['items'];
  for (const key of keys) {
    const item = new BomItem();
    item.itemNo = `alt-${key}-${Math.random().toString(36).slice(2, 8)}`;
    item.unitPrice = ['l2', 'a', 'b', 'c'].includes(key) ? '1' : null;
    item.priceCurrency = item.unitPrice === null ? null : 'CNY';
    await item.save();
    items[key] = item;
  }
  const revisionIds = keys.map(() => crypto.randomUUID());
  const index = (key: (typeof keys)[number]): number => keys.indexOf(key);
  const occurrences = {
    rToS: crypto.randomUUID(),
    rToL2: crypto.randomUUID(),
    r2ToS: crypto.randomUUID(),
    r3ToC: crypto.randomUUID()
  };
  const header = (
    key: (typeof keys)[number],
    alternativeNo: number,
    child: (typeof keys)[number],
    occurrenceId: string = crypto.randomUUID()
  ) => ({
    revisionIndex: index(key),
    bomType: 'ebom' as const,
    orgId: 'org-x',
    alternativeNo,
    costLotQty: '1',
    lines: [
      {
        lineNo: 10,
        occurrences: [{ id: occurrenceId, childItemId: items[child].id, qty: '1', effectiveFrom: day('2026-01-01') }]
      }
    ]
  });
  await loadHistory(adapter, {
    batchNo: `alt-${Math.random().toString(36).slice(2, 10)}`,
    revisions: keys.map((key, position) => ({
      id: revisionIds[position],
      itemId: items[key].id,
      revisionNo: 'A',
      effectiveFrom: day('2026-01-01')
    })),
    headers: [
      header('r', 1, 's', occurrences.rToS),
      header('r', 2, 'l2', occurrences.rToL2),
      header('s', 1, 'a'),
      header('s', 2, 'b'),
      header('r2', 1, 's', occurrences.r2ToS),
      header('r3', 1, 'c', occurrences.r3ToC)
    ]
  });
  return {
    items,
    revisions: {
      r: revisionIds[index('r')],
      s: revisionIds[index('s')],
      r2: revisionIds[index('r2')],
      r3: revisionIds[index('r3')]
    },
    occurrences
  };
};

const pathsOf = (result: ExpansionResult): [string, string[]][] => result.nodes.map(node => [node.itemId, node.path]);

const alternativesOf = (result: ExpansionResult): [string, number[]][] =>
  (result.unresolved ?? []).map(group => [group.parentRevisionId, group.candidates.map(entry => entry.alternativeNo)]);

const settle = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error
  );

for (const backend of BACKENDS) {
  describe(`备选头四引擎同口径 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    let fixture: AlternativeFixture;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
      fixture = await buildFixture(adapter);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    it('根多备选未指定：解析与展开都标 unresolved 且不展开任何备选；数量与成本拒绝', async () => {
      const target = { parentRevisionId: fixture.revisions.r };
      const resolved = await resolveBom(adapter, context(), target);
      expect(resolved.occurrences).toEqual([]);
      expect(resolved.manifest.unresolved.map(group => group.candidates.map(entry => entry.alternativeNo))).toEqual([
        [1, 2]
      ]);
      const expanded = await expandBom(adapter, context(), target);
      expect(pathsOf(expanded)).toEqual([[fixture.items.r.id, []]]);
      expect(alternativesOf(expanded)).toEqual([[fixture.revisions.r, [1, 2]]]);
      const quantity = await settle(explodeBom(adapter, context(), target, PLANNED));
      expect(quantity).toBeInstanceOf(BomResolutionError);
      expect((quantity as BomResolutionError).field).toBe('alternativeNo');
      const cost = await settle(rollupCost(adapter, costContext(), target));
      expect(cost).toBeInstanceOf(BomCostError);
      expect(String((cost as Error).message)).toContain('alternativeNo');
    });

    it('根指定且命中：四引擎都只取该备选（展开不再合并另一备选的发生项）', async () => {
      const target = { parentRevisionId: fixture.revisions.r };
      const resolved = await resolveBom(adapter, context(2), target);
      expect(resolved.occurrences.map(row => row.occurrenceId)).toEqual([fixture.occurrences.rToL2]);
      const expanded = await expandBom(adapter, context(2), target);
      expect(pathsOf(expanded)).toEqual([
        [fixture.items.r.id, []],
        [fixture.items.l2.id, [fixture.occurrences.rToL2]]
      ]);
      expect(expanded.unresolved).toBeUndefined();
      const quantity = await explodeBom(adapter, context(2), target, PLANNED);
      expect(quantity.requirementLines.map(line => [line.itemId, line.qty])).toEqual([[fixture.items.l2.id, '1']]);
      const cost = await rollupCost(adapter, costContext(2), target);
      expect(cost.root.batchCost).toBe('1');
    });

    it('根指定但零匹配：四引擎都显式拒绝并点名 alternativeNo，不返回空结果', async () => {
      const target = { parentRevisionId: fixture.revisions.r3 };
      for (const attempt of [
        () => resolveBom(adapter, context(2), target),
        () => expandBom(adapter, context(2), target),
        () => explodeBom(adapter, context(2), target, PLANNED)
      ]) {
        const error = await settle(attempt());
        expect(error).toBeInstanceOf(BomResolutionError);
        expect((error as BomResolutionError).field).toBe('alternativeNo');
        expect(String((error as Error).message)).toContain('备选 2');
      }
      const cost = await settle(rollupCost(adapter, costContext(2), target));
      expect(cost).toBeInstanceOf(BomCostError);
      expect(String((cost as Error).message)).toContain('备选 2');
    });

    it('子装配多备选：展开对该子节点标 unresolved 不下钻；alternativeNo 不裁决子头，数量与成本拒绝并说明', async () => {
      for (const [root, alternativeNo, occurrence] of [
        [fixture.revisions.r, 1, fixture.occurrences.rToS],
        [fixture.revisions.r2, undefined, fixture.occurrences.r2ToS],
        [fixture.revisions.r2, 1, fixture.occurrences.r2ToS]
      ] as const) {
        const target = { parentRevisionId: root };
        const expanded = await expandBom(adapter, context(alternativeNo), target);
        expect(pathsOf(expanded).map(([itemId, path]) => [itemId, path.length])).toEqual([
          [expanded.nodes[0].itemId, 0],
          [fixture.items.s.id, 1]
        ]);
        expect(expanded.nodes[1].occurrenceId).toBe(occurrence);
        expect(alternativesOf(expanded)).toEqual([[fixture.revisions.s, [1, 2]]]);
        expect(expanded.unresolved?.[0].parentItemId).toBe(fixture.items.s.id);
        const quantity = await settle(explodeBom(adapter, context(alternativeNo), target, PLANNED));
        expect(quantity).toBeInstanceOf(BomResolutionError);
        expect(String((quantity as Error).message)).toContain('alternativeNo 只裁决根头');
        const cost = await settle(rollupCost(adapter, costContext(alternativeNo), target));
        expect(cost).toBeInstanceOf(BomCostError);
        expect((cost as Error).cause).toBeInstanceOf(BomResolutionError);
        expect(String((cost as Error).message)).toContain('alternativeNo 只裁决根头');
      }
    });
  });
}
